/**
 * Incremental updates via RecentChanges API.
 *
 * Process page‑by‑page: fetch a page of recent changes, load any matching items,
 * upsert them, and advance the last‑incremental timestamp to the newest timestamp
 * seen in that page (even if none of those items are in our DB).
 *
 * This ensures each run moves the time window forward, preventing repeated 429s
 * for the same page on retry.
 */

import { eq, sql } from "drizzle-orm";
import { fetch } from "undici";
import { TRGM_SETUP_SQL } from "~/db/fts";
import { importProgress, media } from "~/db/schema";
import { log } from "~/lib/logger";
import { parseMediaEntity, shouldImportEntity } from "./_filters";
import { loadCanonicalLookups, seedCanonicalMappings } from "./_mappings";
import { formatDuration, withRetry } from "./_retry";
import type { ParsedMedia, WikidataEntity } from "./_types";
import { type DbType, type ImportStats, processSuperBatch } from "./_upsert";
import type { ImportConfig } from "./config";
import { getLastFullDumpAt, getLastIncrementalAt, setLastIncrementalAt } from "./state";

const WIKIDATA_API = "https://www.wikidata.org/w/api.php";

interface RecentChangesResult {
  qid: string;
  modified: Date;
}

/**
 * Query recent changes API for all edits to items in the Wikidata namespace (0)
 * since `since`. Returns only items that are already in our media table.
 */
async function queryRecentChanges(db: DbType, since: Date): Promise<RecentChangesResult[]> {
  const sinceIso = since.toISOString();
  const results: RecentChangesResult[] = [];

  log.info("incremental", `querying recent changes since=${sinceIso}`);

  // Load our existing Wikidata IDs into a Set for fast lookup
  const existingRows = await db
    .select({ wikidataId: media.wikidataId, updatedAt: media.updatedAt })
    .from(media);
  const existingQids = new Set<string>();
  const updatedAtMap = new Map<string, Date>();
  for (const row of existingRows) {
    const qid = row.wikidataId.replace(/^Q/, "");
    existingQids.add(qid);
    if (row.updatedAt) updatedAtMap.set(qid, row.updatedAt);
  }

  log.info("incremental", `loaded ${existingQids.size} existing Q-IDs from database`);

  let continueCursor: string | null = null;
  let pageCount = 0;
  let totalReturned = 0;
  let totalMatched = 0;
  let totalAlreadyUpdated = 0;

  while (true) {
    pageCount++;

    const params = new URLSearchParams({
      action: "query",
      list: "recentchanges",
      rcstart: sinceIso,
      rcdir: "newer",
      rcnamespace: "0", // item namespace only
      rctype: "edit|new",
      rcprop: "title|timestamp",
      rclimit: "500", // max per page
      format: "json",
    });
    if (continueCursor) {
      params.set("rccontinue", continueCursor);
    }

    const url = `${WIKIDATA_API}?${params}`;
    log.debug(
      "incremental",
      `fetching recentchanges page=${pageCount} url=${url.replace(/rccontinue=[^&]+/, "rccontinue=***")}`,
    );

    const data = await withRetry(async () => {
      const response = await fetch(url, { headers: { "User-Agent": "donguri-import-bot/1.0" } });
      if (!response.ok) {
        // Handle rate limiting with Retry-After header
        if (response.status === 429) {
          const retryAfter = response.headers.get("retry-after");
          const delaySeconds = retryAfter ? parseInt(retryAfter, 10) : 5;
          log.warn(
            "incremental",
            `rate limited (429), waiting ${delaySeconds}s per retry-after header`,
          );
          await new Promise((r) => setTimeout(r, delaySeconds * 1000));
        }
        throw new Error(`RecentChanges API failed: HTTP ${response.status} ${response.statusText}`);
      }
      const json = (await response.json()) as {
        query?: { recentchanges?: Array<{ title: string; timestamp: string }> };
        continue?: { rccontinue?: string };
        error?: unknown;
      };
      if (json.error) {
        log.error("incremental", `RecentChanges API error`, json.error);
        throw new Error(`RecentChanges API error: ${JSON.stringify(json.error)}`);
      }
      return json;
    }, `RecentChanges page ${pageCount}`);

    const changes = data.query?.recentchanges ?? [];
    totalReturned += changes.length;

    log.debug("incremental", `page ${pageCount}: returned ${changes.length} changes`);

    for (const rc of changes) {
      const qid = rc.title.replace(/^Q/, "");
      if (!existingQids.has(qid)) {
        // Not in our DB — skip
        continue;
      }

      const modified = new Date(rc.timestamp);
      const ourUpdatedAt = updatedAtMap.get(qid);
      if (ourUpdatedAt && modified <= ourUpdatedAt) {
        // Wikidata's timestamp is not newer than our record — skip
        totalAlreadyUpdated++;
        continue;
      }

      results.push({ qid, modified });
      totalMatched++;
    }

    continueCursor = data.continue?.rccontinue ?? null;
    if (!continueCursor) {
      log.debug("incremental", `last page reached, total pages=${pageCount}`);
      break;
    }

    // Inter‑page delay to stay within rate limits
    await new Promise((r) => setTimeout(r, 100));
  }

  log.info(
    "incremental",
    `recentchanges summary: pages=${pageCount} returned=${totalReturned} matched=${totalMatched} already-updated=${totalAlreadyUpdated}`,
  );
  return results;
}

/**
 * Fetch full entity JSON from Wikidata API for a batch of Q-IDs.
 * Max 50 per request.
 */
async function fetchEntitiesFromWikidata(qids: string[]): Promise<WikidataEntity[]> {
  const entities: WikidataEntity[] = [];
  const BatchSize = 50;
  const totalBatches = Math.ceil(qids.length / BatchSize);

  log.info("incremental", `fetching ${qids.length} entities in ${totalBatches} batches`);

  for (let i = 0; i < qids.length; i += BatchSize) {
    const batch = qids.slice(i, i + BatchSize);
    const batchNum = Math.floor(i / BatchSize) + 1;

    log.qids(
      "incremental",
      `batch ${batchNum}/${totalBatches}`,
      batch.map((q) => `Q${q}`),
    );

    const params = new URLSearchParams({
      action: "wbgetentities",
      ids: batch.join("|"),
      format: "json",
      props: "labels|descriptions|aliases|claims|sitelinks",
    });

    const url = `${WIKIDATA_API}?${params}`;
    log.debug("incremental", `fetching entities batch ${batchNum}`, { url });

    const response = await withRetry(
      () =>
        fetch(url, {
          headers: { "User-Agent": "donguri-import-bot/1.0" },
        }),
      `Wikidata API batch ${batchNum}`,
    );

    if (!response.ok) {
      log.error(
        "incremental",
        `Wikidata API failed: HTTP ${response.status} ${response.statusText}`,
        { batchSize: batch.length, batchNum },
      );
      throw new Error(`Wikidata API failed: HTTP ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as {
      entities?: Record<string, WikidataEntity>;
    };

    if (data.entities) {
      for (const entity of Object.values(data.entities)) {
        if (entity.id) entities.push(entity);
      }
      log.debug(
        "incremental",
        `batch ${batchNum} returned ${Object.keys(data.entities).length} entities`,
      );
    } else {
      log.warn("incremental", `batch ${batchNum} returned no entities`);
    }
  }

  log.info("incremental", `fetched ${entities.length} entities total`);
  return entities;
}

/**
 * Main incremental update function.
 * Returns true if full dump is needed (gap too large), false otherwise.
 */
export async function runIncremental(db: DbType, _config: ImportConfig): Promise<boolean> {
  const startTime = Date.now();
  log.info("incremental", "starting incremental import");

  for (const stmt of TRGM_SETUP_SQL) {
    await db.execute(sql.raw(stmt));
  }

  // Determine since date
  let since = getLastIncrementalAt();
  let source = "lastIncremental";
  if (!since) {
    // Never run incremental before — fall back to last full dump timestamp
    // (which exists because we always do full before incremental)
    since = getLastFullDumpAt();
    if (!since) {
      // Should never happen — but as final fallback, 24 hours ago
      since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      source = "24hFallback";
      log.warn("incremental", "no previous incremental or full dump timestamp, using 24h fallback");
    } else {
      source = "lastFullDump";
      log.info("incremental", "first incremental run, using last full dump timestamp");
    }
  }

  const daysSince = (Date.now() - since.getTime()) / (1000 * 60 * 60 * 24);
  log.info(
    "incremental",
    `since date: ${since.toISOString()} (source=${source} days=${daysSince.toFixed(1)})`,
  );

  // Gap too large — signal to full pipeline
  if (daysSince > 30) {
    log.info(
      "incremental",
      `gap too large: ${daysSince.toFixed(1)} days > 30 days, recommending full pipeline`,
    );
    return true;
  }

  // Fetch modified Q-IDs via recentchanges API
  const changes = await queryRecentChanges(db, since);
  log.qids(
    "incremental",
    "matched changes",
    changes.map((c) => `Q${c.qid}`),
  );

  if (changes.length === 0) {
    log.info("incremental", "no changes found, updating timestamp and exiting");
    setLastIncrementalAt(new Date());
    return false;
  }

  // Fetch full entities
  const qids = changes.map((c) => `Q${c.qid}`);
  const entities = await fetchEntitiesFromWikidata(qids);
  const parsed: ParsedMedia[] = [];
  let parseErrors = 0;
  const parseErrorSamples: string[] = [];

  for (const entity of entities) {
    try {
      if (!shouldImportEntity(entity)) continue;
      const m = parseMediaEntity(entity);
      if (!m) continue;
      parsed.push(m);
    } catch (_err) {
      parseErrors++;
      if (parseErrorSamples.length < 3) {
        parseErrorSamples.push(entity.id || "unknown");
      }
    }
  }

  if (parseErrors > 0) {
    log.warn("incremental", `${parseErrors} parse errors`, { samples: parseErrorSamples });
  }

  if (parsed.length === 0) {
    log.info("incremental", "no parsable media entities, updating timestamp and exiting");
    setLastIncrementalAt(new Date());
    return false;
  }

  log.qids(
    "incremental",
    "parsed for upsert",
    parsed.map((p) => p.wikidataId),
  );

  const [progressRecord] = await db
    .insert(importProgress)
    .values({
      sourceFile: "incremental-recentchanges",
      status: "running",
      startedAt: new Date(),
    })
    .returning({ id: importProgress.id });

  log.info("incremental", `import progress record created: id=${progressRecord.id}`);

  await seedCanonicalMappings(db);
  const { genreLookup, platformLookup } = await loadCanonicalLookups(db);
  log.info("incremental", "lookups loaded", {
    genreCount: Object.keys(genreLookup).length,
    platformCount: Object.keys(platformLookup).length,
  });

  const stats: ImportStats = {
    entitiesProcessed: parsed.length,
    entitiesImported: 0,
    entitiesNew: 0,
    entitiesUpdated: 0,
    errors: 0,
    genresFound: 0,
    platformsFound: 0,
    byType: {},
  };

  const BatchSize = 5000;
  for (let i = 0; i < parsed.length; i += BatchSize) {
    const batch = parsed.slice(i, i + BatchSize);
    const batchQids = batch.map((p) => p.wikidataId);
    log.qids(
      "incremental",
      `processing batch ${Math.floor(i / BatchSize) + 1}/${Math.ceil(parsed.length / BatchSize)}`,
      batchQids,
    );
    await processSuperBatch(db, batch, genreLookup, platformLookup, stats);
  }

  // Mark complete
  await db
    .update(importProgress)
    .set({
      entitiesProcessed: stats.entitiesProcessed,
      entitiesImported: stats.entitiesImported,
      status: "completed",
      completedAt: new Date(),
    })
    .where(eq(importProgress.id, progressRecord.id));

  setLastIncrementalAt(new Date());

  const totalDuration = Date.now() - startTime;
  log.info("incremental", "incremental import completed", {
    duration: formatDuration(totalDuration),
    entitiesProcessed: stats.entitiesProcessed,
    entitiesImported: stats.entitiesImported,
    entitiesNew: stats.entitiesNew,
    entitiesUpdated: stats.entitiesUpdated,
    errors: stats.errors,
    byType: stats.byType,
    rate: `${(stats.entitiesProcessed / (totalDuration / 1000)).toFixed(1)}/s`,
  });

  return false;
}
