/**
 * Incremental updates via RecentChanges API: fetch entities edited since last incremental run,
 * then batch-load full Wikidata JSON and upsert.
 */

import { eq, sql } from "drizzle-orm";
import { fetch } from "undici";
import { TRGM_SETUP_SQL } from "~/db/fts";
import { CANONICAL_GENRES, GENRE_MAPPINGS } from "~/db/genre-data";
import { CANONICAL_PLATFORMS, PLATFORM_MAPPINGS } from "~/db/platform-data";
import {
  canonicalGenres,
  canonicalPlatforms,
  genreMappings,
  importProgress,
  media,
  platformMappings,
} from "~/db/schema";
import { parseMediaEntity, shouldImportEntity } from "./_filters";
import { formatDuration, withRetry } from "./_retry";
import type { ParsedMedia, WikidataEntity } from "./_types";
import { type CanonicalLookup, type DbType, type ImportStats, processSuperBatch } from "./_upsert";
import type { ImportConfig } from "./config";
import { getLastFullDumpAt, getLastIncrementalAt, setLastIncrementalAt } from "./state";

const WIKIDATA_API = "https://www.wikidata.org/w/api.php";

interface ParsedIncremental {
  parsed: ParsedMedia[];
  errors: number;
}

async function seedCanonicalMappings(db: DbType): Promise<void> {
  console.log("[mappings] Syncing canonical genres/platforms...");

  const topGenres = CANONICAL_GENRES.filter((g) => g.parentSlug === null);
  for (const g of topGenres) {
    await db
      .insert(canonicalGenres)
      .values({ slug: g.slug, name: g.name, parentId: null, sortOrder: g.sortOrder })
      .onConflictDoNothing({ target: canonicalGenres.slug });
  }
  const allGenres = await db.select().from(canonicalGenres);
  const genreSlugToId = new Map(allGenres.map((g) => [g.slug, g.id]));

  for (const g of CANONICAL_GENRES.filter(
    (g): g is typeof g & { parentSlug: string } => g.parentSlug !== null,
  )) {
    const parentId = genreSlugToId.get(g.parentSlug);
    if (!parentId) continue;
    await db
      .insert(canonicalGenres)
      .values({ slug: g.slug, name: g.name, parentId, sortOrder: g.sortOrder })
      .onConflictDoNothing({ target: canonicalGenres.slug });
  }
  const allGenresNow = await db.select().from(canonicalGenres);
  const genreSlugToIdNow = new Map(allGenresNow.map((g) => [g.slug, g.id]));

  for (const m of GENRE_MAPPINGS) {
    const id = genreSlugToIdNow.get(m.canonicalSlug);
    if (!id) continue;
    await db
      .insert(genreMappings)
      .values({ wikidataId: m.wikidataId, canonicalGenreId: id, source: "manual" })
      .onConflictDoNothing();
  }

  const topPlatforms = CANONICAL_PLATFORMS.filter((p) => p.parentSlug === null);
  for (const p of topPlatforms) {
    await db
      .insert(canonicalPlatforms)
      .values({ slug: p.slug, name: p.name, parentId: null, sortOrder: p.sortOrder })
      .onConflictDoNothing({ target: canonicalPlatforms.slug });
  }
  const allPlatforms = await db.select().from(canonicalPlatforms);
  const platSlugToId = new Map(allPlatforms.map((p) => [p.slug, p.id]));

  for (const p of CANONICAL_PLATFORMS.filter(
    (p): p is typeof p & { parentSlug: string } => p.parentSlug !== null,
  )) {
    const parentId = platSlugToId.get(p.parentSlug);
    if (!parentId) continue;
    await db
      .insert(canonicalPlatforms)
      .values({ slug: p.slug, name: p.name, parentId, sortOrder: p.sortOrder })
      .onConflictDoNothing({ target: canonicalPlatforms.slug });
  }
  const allPlatformsNow = await db.select().from(canonicalPlatforms);
  const platSlugToIdNow = new Map(allPlatformsNow.map((p) => [p.slug, p.id]));

  for (const m of PLATFORM_MAPPINGS) {
    const id = platSlugToIdNow.get(m.canonicalSlug);
    if (!id) continue;
    await db
      .insert(platformMappings)
      .values({ wikidataId: m.wikidataId, canonicalPlatformId: id, source: "manual" })
      .onConflictDoNothing();
  }

  console.log("[mappings] Completed");
}

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

  console.log(`[recentchanges] Querying for edits since ${sinceIso}...`);

  // Load our existing Wikidata IDs into a Set for fast lookup
  const existingRows = await db
    .select({ wikidataId: media.wikidataId, updatedAt: media.updatedAt })
    .from(media);
  const existingQids = new Set<string>();
  const updatedAtMap = new Map<string, Date>();
  for (const row of existingRows) {
    const qid = row.wikidataId.replace(/^Q/, "");
    existingQids.add(qid);
    updatedAtMap.set(qid, row.updatedAt);
  }

  console.log(`[recentchanges] Loaded ${existingQids.size} existing QIDs from DB`);

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
    console.log(`[recentchanges] Page ${pageCount}: ${url}`);

    const data = await withRetry(async () => {
      const response = await fetch(url, { headers: { "User-Agent": "donguri-import-bot/1.0" } });
      if (!response.ok) {
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
    console.log(`[recentchanges] Page ${pageCount}: ${changes.length} edits`);

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

  console.log(
    `[recentchanges] Total: ${totalReturned} edits, ${totalMatched} matched and need update, ${totalAlreadyUpdated} already up‑to‑date`,
  );
  return results;
}

/**
 * Fetch full entity JSON from Wikidata API for a batch of Q-IDs.
 * Max 50 per request.
 */
async function fetchEntitiesFromWikidata(qids: string[]): Promise<WikidataEntity[]> {
  const entities: WikidataEntity[] = [];
  const BATCH_SIZE = 50;

  for (let i = 0; i < qids.length; i += BATCH_SIZE) {
    const batch = qids.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(qids.length / BATCH_SIZE);

    console.log(`[wikidata] Fetching batch ${batchNum}/${totalBatches} (${batch.length} items)...`);

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
 * Parse and filter entities, same as full pipeline.
 */
async function parseEntities(entities: WikidataEntity[]): Promise<ParsedIncremental> {
  console.log(`[parse] Parsing ${entities.length} entities...`);

  const parsed: ParsedMedia[] = [];
  let errors = 0;

  for (const entity of entities) {
    try {
      if (!shouldImportEntity(entity)) continue;
      const media = parseMediaEntity(entity);
      if (!media) continue;
      parsed.push(media);
    } catch {
      errors++;
    }
  }

  console.log(`[parse] Parsed: ${parsed.length}, Errors: ${errors}`);
  return { parsed, errors };
}

/**
 * Main incremental update function.
 * Returns true if full dump is needed (gap too large), false otherwise.
 */
export async function runIncremental(db: DbType, _config: ImportConfig): Promise<boolean> {
  const startTime = Date.now();

  console.log(`\n${"=".repeat(60)}`);
  console.log("INCREMENTAL UPDATE PIPELINE");
  console.log(`${"=".repeat(60)}\n`);

  console.log("[incremental] Setting up trigram indexes...");
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
      console.log(
        `[incremental] No incremental or full dump timestamps found. Defaulting to 24h ago: ${since.toISOString()}`,
      );
    } else {
      console.log(
        `[incremental] No previous incremental record. Using last full dump timestamp: ${since.toISOString()}`,
      );
    }
  }

  const daysSince = (Date.now() - since.getTime()) / (1000 * 60 * 60 * 24);
  console.log(`[incremental] Gap since last update: ${daysSince.toFixed(1)} days`);

  // Gap too large — signal to full pipeline
  if (daysSince > 30) {
    console.log("[incremental] Gap > 30 days — need full dump");
    return true;
  }

  // Fetch modified Q-IDs via recentchanges API
  const changes = await queryRecentChanges(db, since);

  if (changes.length === 0) {
    console.log("[incremental] No changes found — skipping import");
    setLastIncrementalAt(new Date());
    return false;
  }

  // Fetch full entities
  const qids = changes.map((c) => `Q${c.qid}`);
  const entities = await fetchEntitiesFromWikidata(qids);
  console.log(`[incremental] Fetched ${entities.length} full entities`);

  // Parse
  const { parsed } = await parseEntities(entities);

  if (parsed.length === 0) {
    console.log("[incremental] No valid entities to import");
    setLastIncrementalAt(new Date());
    return false;
  }

  // Prepare for upsert
  console.log("[incremental] Preparing import...");
  const [progressRecord] = await db
    .insert(importProgress)
    .values({
      sourceFile: "incremental-recentchanges",
      status: "running",
      startedAt: new Date(),
    })
    .returning({ id: importProgress.id });

  await seedCanonicalMappings(db);

  console.log("[incremental] Loading canonical genre/platform mappings...");
  const genreLookup: CanonicalLookup = {};
  const platformLookup: CanonicalLookup = {};

  const [gmRows, pmRows] = await Promise.all([
    db
      .select({ wikidataId: genreMappings.wikidataId, canonicalId: genreMappings.canonicalGenreId })
      .from(genreMappings),
    db
      .select({
        wikidataId: platformMappings.wikidataId,
        canonicalId: platformMappings.canonicalPlatformId,
      })
      .from(platformMappings),
  ]);
  for (const row of gmRows) {
    if (!genreLookup[row.wikidataId]) genreLookup[row.wikidataId] = [];
    genreLookup[row.wikidataId].push(row.canonicalId);
  }
  for (const row of pmRows) {
    if (!platformLookup[row.wikidataId]) platformLookup[row.wikidataId] = [];
    platformLookup[row.wikidataId].push(row.canonicalId);
  }

  // Upsert in batches
  console.log("[incremental] Upserting entities...");
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

  const BATCH_SIZE = 5_000;
  for (let i = 0; i < parsed.length; i += BATCH_SIZE) {
    const batch = parsed.slice(i, i + BATCH_SIZE);
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
  console.log(`\n[incremental] Completed in ${totalTime}`);
  console.log(
    `  Processed: ${stats.entitiesProcessed}, Imported: ${stats.entitiesImported} ` +
      `(${stats.entitiesNew} new, ${stats.entitiesUpdated} updated)`,
  );

  return false;
}
