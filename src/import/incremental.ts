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

    const data = await withRetry(async () => {
      const response = await fetch(url, { headers: { "User-Agent": "donguri-import-bot/1.0" } });
      if (!response.ok) {
        // Handle rate limiting with Retry-After header
        if (response.status === 429) {
          const retryAfter = response.headers.get("retry-after");
          const delaySeconds = retryAfter ? parseInt(retryAfter, 10) : 5;
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
        throw new Error(`RecentChanges API error: ${JSON.stringify(json.error)}`);
      }
      return json;
    }, `RecentChanges page ${pageCount}`);

    const changes = data.query?.recentchanges ?? [];
    totalReturned += changes.length;

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
      break;
    }

    // Inter‑page delay to stay within rate limits
    await new Promise((r) => setTimeout(r, 100));
  }

  console.info(
    `[incremental] recentchanges summary: returned=${totalReturned}, matched=${totalMatched}, already-updated=${totalAlreadyUpdated}`,
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

  for (let i = 0; i < qids.length; i += BatchSize) {
    const batch = qids.slice(i, i + BatchSize);
    const batchNum = Math.floor(i / BatchSize) + 1;
    const _totalBatches = Math.ceil(qids.length / BatchSize);

    const params = new URLSearchParams({
      action: "wbgetentities",
      ids: batch.join("|"),
      format: "json",
      props: "labels|descriptions|aliases|claims|sitelinks",
    });

    const response = await withRetry(
      () =>
        fetch(`${WIKIDATA_API}?${params}`, {
          headers: { "User-Agent": "donguri-import-bot/1.0" },
        }),
      `Wikidata API batch ${batchNum}`,
    );

    if (!response.ok) {
      throw new Error(`Wikidata API failed: HTTP ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as {
      entities?: Record<string, WikidataEntity>;
    };

    if (data.entities) {
      for (const entity of Object.values(data.entities)) {
        if (entity.id) entities.push(entity);
      }
    }
  }

  return entities;
}

/**
 * Main incremental update function.
 * Returns true if full dump is needed (gap too large), false otherwise.
 */
export async function runIncremental(db: DbType, _config: ImportConfig): Promise<boolean> {
  const startTime = Date.now();
  for (const stmt of TRGM_SETUP_SQL) {
    await db.execute(sql.raw(stmt));
  }

  // Determine since date
  let since = getLastIncrementalAt();
  if (!since) {
    // Never run incremental before — fall back to last full dump timestamp
    // (which exists because we always do full before incremental)
    since = getLastFullDumpAt();
    if (!since) {
      // Should never happen — but as final fallback, 24 hours ago
      since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    } else {
    }
  }

  const daysSince = (Date.now() - since.getTime()) / (1000 * 60 * 60 * 24);

  // Gap too large — signal to full pipeline
  if (daysSince > 30) {
    return true;
  }

  // Fetch modified Q-IDs via recentchanges API
  const changes = await queryRecentChanges(db, since);

  if (changes.length === 0) {
    setLastIncrementalAt(new Date());
    return false;
  }

  // Fetch full entities
  const qids = changes.map((c) => `Q${c.qid}`);
  const entities = await fetchEntitiesFromWikidata(qids);
  const parsed: ParsedMedia[] = [];
  let parseErrors = 0;

  for (const entity of entities) {
    try {
      if (!shouldImportEntity(entity)) continue;
      const m = parseMediaEntity(entity);
      if (!m) continue;
      parsed.push(m);
    } catch {
      parseErrors++;
    }
  }

  if (parseErrors > 0) console.warn(`[incremental] ${parseErrors} parse errors`);

  if (parsed.length === 0) {
    setLastIncrementalAt(new Date());
    return false;
  }
  const [progressRecord] = await db
    .insert(importProgress)
    .values({
      sourceFile: "incremental-recentchanges",
      status: "running",
      startedAt: new Date(),
    })
    .returning({ id: importProgress.id });

  await seedCanonicalMappings(db);
  const { genreLookup, platformLookup } = await loadCanonicalLookups(db);
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

  const totalTime = formatDuration(Date.now() - startTime);
  console.info(`[incremental] done in ${totalTime}`, stats.byType);

  return false;
}
