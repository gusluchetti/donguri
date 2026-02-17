/**
 * Pass 2: Parse and import media entities from subset NDJSON into Postgres.
 *
 * Uses COPY → temp table → upsert merge for bulk performance.
 *
 * Usage:
 *   bun run src/import/index.ts media-subset.ndjson                     # Test mode (100)
 *   bun run src/import/index.ts media-subset.ndjson --full              # Full import
 *   bun run src/import/index.ts media-subset.ndjson --full --limit=1000 # Limited
 *   bun run src/import/index.ts media-subset.ndjson --full --resumeFrom=Q123
 *   bun run src/import/index.ts media-subset.ndjson --resume            # Auto-resume last run
 *   bun run src/import/index.ts media-subset.ndjson --batch=1000        # Custom batch size
 *   bun run src/import/index.ts media-subset.ndjson --clean             # Clean DB first
 */

import fs from "node:fs";
import readline from "node:readline";
import { Writable } from "node:stream";
import zlib from "node:zlib";
import { eq, inArray, sql } from "drizzle-orm";
import { ulid } from "ulid";
import { createImportDb } from "../db";
import { TRGM_SETUP_SQL } from "../db/fts";
import {
  genres,
  importProgress,
  media,
  mediaGenres,
  mediaPlatforms,
  platforms,
} from "../db/schema";
import { shouldImportEntity } from "./_filters";
import { parseMediaEntity } from "./_parser";
import { formatDuration, withRetry } from "./_retry";
import type { ParsedMedia, WikidataEntity } from "./_types";

const DEFAULT_BATCH_SIZE = 5_000;
const PROGRESS_LOG_INTERVAL = 1_000;

/** Indexes to drop before --clean imports and recreate after. */
const DROPPABLE_INDEXES = [
  "idx_media_type",
  "idx_media_sitelinks",
  "idx_media_start_year",
  "idx_media_imdb",
  "idx_media_mal",
  "idx_media_igdb",
  "idx_media_tmdb",
  "idx_media_tvmaze",
  "idx_media_popularity",
  "idx_media_title_trgm",
  "idx_media_original_title_trgm",
];

/** SQL to recreate the schema-defined indexes (matching schema.ts). */
const RECREATE_INDEX_SQL = [
  `CREATE INDEX IF NOT EXISTS idx_media_type ON media (media_type)`,
  `CREATE INDEX IF NOT EXISTS idx_media_sitelinks ON media (sitelinks_count)`,
  `CREATE INDEX IF NOT EXISTS idx_media_start_year ON media (start_year)`,
  `CREATE INDEX IF NOT EXISTS idx_media_imdb ON media (imdb_id)`,
  `CREATE INDEX IF NOT EXISTS idx_media_mal ON media (mal_id)`,
  `CREATE INDEX IF NOT EXISTS idx_media_igdb ON media (igdb_id)`,
  `CREATE INDEX IF NOT EXISTS idx_media_tmdb ON media (tmdb_id)`,
  `CREATE INDEX IF NOT EXISTS idx_media_tvmaze ON media (tvmaze_id)`,
  `CREATE INDEX IF NOT EXISTS idx_media_popularity ON media (popularity_score)`,
];

// ─── Staging table columns (matches media table layout) ─────────────────────

const STAGING_COLUMNS = [
  "id",
  "wikidata_id",
  "media_type",
  "title",
  "original_title",
  "original_language",
  "description",
  "start_year",
  "end_year",
  "runtime_minutes",
  "season_count",
  "episode_count",
  "sitelinks_count",
  "country_of_origin",
  "imdb_id",
  "tmdb_id",
  "mal_id",
  "anilist_id",
  "anidb_id",
  "igdb_id",
  "ann_id",
  "tvdb_id",
  "tvmaze_id",
  "search_title",
] as const;

interface ImportStats {
  entitiesProcessed: number;
  entitiesImported: number;
  errors: number;
  genresFound: number;
  platformsFound: number;
  byType: Record<string, number>;
}

function parseJsonLine(line: string): WikidataEntity | null {
  let cleanLine = line.trim();
  if (cleanLine.endsWith(",")) cleanLine = cleanLine.slice(0, -1);
  if (cleanLine === "[" || cleanLine === "]" || !cleanLine) return null;
  try {
    return JSON.parse(cleanLine);
  } catch {
    return null;
  }
}

// ─── TSV escaping for COPY ──────────────────────────────────────────────────

/** Escape a string value for tab-delimited COPY format. */
function escapeTsv(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\t/g, "\\t")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r");
}

/** Format a single row as a TSV line for COPY. */
function toTsvRow(item: ParsedMedia, rowId: string): string {
  const fields: string[] = [
    rowId,
    item.wikidataId,
    item.mediaType,
    escapeTsv(item.title),
    item.originalTitle != null ? escapeTsv(item.originalTitle) : "\\N",
    item.originalLanguage ?? "\\N",
    item.description != null ? escapeTsv(item.description) : "\\N",
    item.startYear != null ? String(item.startYear) : "\\N",
    item.endYear != null ? String(item.endYear) : "\\N",
    item.runtimeMinutes != null ? String(item.runtimeMinutes) : "\\N",
    item.seasonCount != null ? String(item.seasonCount) : "\\N",
    item.episodeCount != null ? String(item.episodeCount) : "\\N",
    String(item.sitelinksCount),
    item.countryOfOrigin ?? "\\N",
    item.imdbId ?? "\\N",
    item.tmdbId ?? "\\N",
    item.malId ?? "\\N",
    item.anilistId ?? "\\N",
    item.anidbId ?? "\\N",
    item.igdbId ?? "\\N",
    item.annId ?? "\\N",
    item.tvdbId ?? "\\N",
    item.tvmazeId ?? "\\N",
    escapeTsv(item.searchTitle),
  ];
  return fields.join("\t");
}

// ─── DB helpers ─────────────────────────────────────────────────────────────

type ImportDb = ReturnType<typeof createImportDb>;
type DbType = ImportDb["db"];
type RawClient = ImportDb["client"];

/**
 * Batch-ensure genres exist, returning a map of wikidataId → dbId.
 */
async function ensureGenres(
  db: DbType,
  wikidataIds: string[],
  cache: Record<string, string>,
): Promise<void> {
  const uncached = wikidataIds.filter((id) => !cache[id]);
  if (uncached.length === 0) return;

  const values = uncached.map((wikidataId) => ({ wikidataId, name: wikidataId }));
  await db.insert(genres).values(values).onConflictDoNothing();

  const rows = await db
    .select({ id: genres.id, wikidataId: genres.wikidataId })
    .from(genres)
    .where(inArray(genres.wikidataId, uncached));

  for (const row of rows) {
    cache[row.wikidataId] = row.id;
  }
}

/**
 * Batch-ensure platforms exist, same pattern as genres.
 */
async function ensurePlatforms(
  db: DbType,
  wikidataIds: string[],
  cache: Record<string, string>,
): Promise<void> {
  const uncached = wikidataIds.filter((id) => !cache[id]);
  if (uncached.length === 0) return;

  const values = uncached.map((wikidataId) => ({ wikidataId, name: wikidataId }));
  await db.insert(platforms).values(values).onConflictDoNothing();

  const rows = await db
    .select({ id: platforms.id, wikidataId: platforms.wikidataId })
    .from(platforms)
    .where(inArray(platforms.wikidataId, uncached));

  for (const row of rows) {
    cache[row.wikidataId] = row.id;
  }
}

/**
 * COPY batch into a temp staging table, then merge into media via upsert.
 * Returns the wikidata_id → db id mapping for the batch.
 */
async function processSuperBatch(
  rawClient: RawClient,
  db: DbType,
  batch: ParsedMedia[],
  genreCache: Record<string, string>,
  platformCache: Record<string, string>,
  stats: ImportStats,
): Promise<void> {
  if (batch.length === 0) return;

  try {
    // 1. Ensure genres and platforms exist (via Drizzle, cached)
    const allGenreIds = new Set<string>();
    const allPlatformIds = new Set<string>();
    for (const item of batch) {
      for (const id of item.genreIds) allGenreIds.add(id);
      for (const id of item.platformIds) allPlatformIds.add(id);
    }

    await withRetry(
      () =>
        Promise.all([
          allGenreIds.size > 0 ? ensureGenres(db, [...allGenreIds], genreCache) : undefined,
          allPlatformIds.size > 0
            ? ensurePlatforms(db, [...allPlatformIds], platformCache)
            : undefined,
        ]),
      "ensure genres/platforms",
    );

    // 2. Pre-generate ULIDs for each row
    const rowIds = batch.map(() => ulid());

    // 3. COPY → temp table → upsert merge, all in one transaction
    const upserted = await withRetry(
      () =>
        rawClient.begin(async (tx) => {
          // Create temp staging table (dropped on commit)
          await tx.unsafe(`
						CREATE TEMP TABLE _media_staging (
							id TEXT NOT NULL,
							wikidata_id TEXT NOT NULL,
							media_type TEXT NOT NULL,
							title TEXT NOT NULL,
							original_title TEXT,
							original_language TEXT,
							description TEXT,
							start_year INTEGER,
							end_year INTEGER,
							runtime_minutes INTEGER,
							season_count INTEGER,
							episode_count INTEGER,
							sitelinks_count INTEGER DEFAULT 0,
							country_of_origin TEXT,
							imdb_id TEXT,
							tmdb_id TEXT,
							mal_id TEXT,
							anilist_id TEXT,
							anidb_id TEXT,
							igdb_id TEXT,
							ann_id TEXT,
							tvdb_id TEXT,
							tvmaze_id TEXT,
							search_title TEXT
						) ON COMMIT DROP
					`);

          // COPY data into staging table
          const writable = await tx
            .unsafe(`COPY _media_staging (${STAGING_COLUMNS.join(", ")}) FROM STDIN`)
            .writable();

          await new Promise<void>((resolve, reject) => {
            // Build all TSV data at once and write it
            const lines: string[] = [];
            for (let i = 0; i < batch.length; i++) {
              lines.push(toTsvRow(batch[i], rowIds[i]));
            }
            const data = `${lines.join("\n")}\n`;

            const passThrough = new Writable({
              write(chunk, _encoding, callback) {
                writable.write(chunk, callback);
              },
              final(callback) {
                writable.end(callback);
              },
            });

            writable.on("error", reject);
            passThrough.on("error", reject);
            writable.on("close", resolve);

            passThrough.end(data);
          });

          // Merge staging → media with upsert
          const result = await tx.unsafe(`
						INSERT INTO media (
							id, wikidata_id, media_type, title, original_title, original_language,
							description, start_year, end_year, runtime_minutes, season_count,
							episode_count, sitelinks_count, country_of_origin,
							imdb_id, tmdb_id, mal_id, anilist_id, anidb_id, igdb_id,
							ann_id, tvdb_id, tvmaze_id, search_title, created_at, updated_at
						)
						SELECT
							s.id, s.wikidata_id, s.media_type, s.title, s.original_title,
							s.original_language, s.description, s.start_year, s.end_year,
							s.runtime_minutes, s.season_count, s.episode_count, s.sitelinks_count,
							s.country_of_origin, s.imdb_id, s.tmdb_id, s.mal_id, s.anilist_id,
							s.anidb_id, s.igdb_id, s.ann_id, s.tvdb_id, s.tvmaze_id,
							s.search_title, now(), now()
						FROM _media_staging s
						ON CONFLICT (wikidata_id) DO UPDATE SET
							title = COALESCE(EXCLUDED.title, media.title),
							original_title = COALESCE(EXCLUDED.original_title, media.original_title),
							original_language = COALESCE(EXCLUDED.original_language, media.original_language),
							description = COALESCE(EXCLUDED.description, media.description),
							start_year = COALESCE(EXCLUDED.start_year, media.start_year),
							end_year = COALESCE(EXCLUDED.end_year, media.end_year),
							runtime_minutes = COALESCE(EXCLUDED.runtime_minutes, media.runtime_minutes),
							season_count = COALESCE(EXCLUDED.season_count, media.season_count),
							episode_count = COALESCE(EXCLUDED.episode_count, media.episode_count),
							sitelinks_count = GREATEST(EXCLUDED.sitelinks_count, media.sitelinks_count),
							country_of_origin = COALESCE(EXCLUDED.country_of_origin, media.country_of_origin),
							imdb_id = COALESCE(EXCLUDED.imdb_id, media.imdb_id),
							tmdb_id = COALESCE(EXCLUDED.tmdb_id, media.tmdb_id),
							mal_id = COALESCE(EXCLUDED.mal_id, media.mal_id),
							anilist_id = COALESCE(EXCLUDED.anilist_id, media.anilist_id),
							anidb_id = COALESCE(EXCLUDED.anidb_id, media.anidb_id),
							igdb_id = COALESCE(EXCLUDED.igdb_id, media.igdb_id),
							ann_id = COALESCE(EXCLUDED.ann_id, media.ann_id),
							tvdb_id = COALESCE(EXCLUDED.tvdb_id, media.tvdb_id),
							tvmaze_id = COALESCE(EXCLUDED.tvmaze_id, media.tvmaze_id),
							search_title = COALESCE(EXCLUDED.search_title, media.search_title),
							updated_at = now()
						RETURNING id, wikidata_id
					`);

          return result as unknown as { id: string; wikidata_id: string }[];
        }),
      "COPY + upsert media",
    );

    stats.entitiesImported += upserted.length;

    // 4. Build genre/platform relations from returned id mapping
    const wikidataToDbId = new Map(upserted.map((r) => [r.wikidata_id, r.id]));

    const genreRelations: { mediaId: string; genreId: string }[] = [];
    const platformRelations: { mediaId: string; platformId: string }[] = [];

    for (const item of batch) {
      const mediaId = wikidataToDbId.get(item.wikidataId);
      if (!mediaId) continue;

      for (const wikidataId of item.genreIds) {
        const genreId = genreCache[wikidataId];
        if (genreId) {
          genreRelations.push({ mediaId, genreId });
          stats.genresFound++;
        }
      }

      for (const wikidataId of item.platformIds) {
        const platformId = platformCache[wikidataId];
        if (platformId) {
          platformRelations.push({ mediaId, platformId });
          stats.platformsFound++;
        }
      }
    }

    // 5. Bulk insert relations via Drizzle (small, COPY overkill)
    await withRetry(
      () =>
        Promise.all([
          genreRelations.length > 0
            ? db.insert(mediaGenres).values(genreRelations).onConflictDoNothing()
            : undefined,
          platformRelations.length > 0
            ? db.insert(mediaPlatforms).values(platformRelations).onConflictDoNothing()
            : undefined,
        ]),
      "insert relations",
    );
  } catch (error) {
    stats.errors += batch.length;
    console.error("Super-batch error:", error);
  }
}

// ─── Index management ───────────────────────────────────────────────────────

async function dropIndexes(rawClient: RawClient): Promise<void> {
  console.log("Dropping non-essential indexes for faster import...");
  for (const idx of DROPPABLE_INDEXES) {
    await rawClient.unsafe(`DROP INDEX IF EXISTS ${idx}`);
  }
}

async function recreateIndexes(rawClient: RawClient): Promise<void> {
  console.log("Recreating indexes...");
  for (const stmt of RECREATE_INDEX_SQL) {
    await rawClient.unsafe(stmt);
  }
  for (const stmt of TRGM_SETUP_SQL) {
    await rawClient.unsafe(stmt);
  }
  console.log("Indexes recreated.");
}

// ─── QRank loading ──────────────────────────────────────────────────────

/**
 * Load QRank scores from a CSV file (plain or gzipped), filtered to only
 * entities that exist in our media table. Streams the CSV so memory usage
 * is proportional to our media count (~100k), not the full QRank file (~100M).
 */
async function loadQRank(filePath: string, knownIds: Set<string>): Promise<Map<string, number>> {
  console.log(
    `Loading QRank from: ${filePath} (filtering to ${knownIds.size.toLocaleString()} known entities)`,
  );
  const startTime = Date.now();
  const map = new Map<string, number>();

  const stream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: filePath.endsWith(".gz") ? stream.pipe(zlib.createGunzip()) : stream,
    crlfDelay: Infinity,
  });

  let isHeader = true;
  for await (const line of rl) {
    if (isHeader) {
      isHeader = false;
      continue;
    }
    const commaIdx = line.indexOf(",");
    if (commaIdx === -1) continue;
    const entity = line.slice(0, commaIdx);
    if (!knownIds.has(entity)) continue;
    const score = parseInt(line.slice(commaIdx + 1), 10);
    if (!Number.isNaN(score)) {
      map.set(entity, score);
    }
  }

  const elapsed = formatDuration(Date.now() - startTime);
  console.log(`QRank loaded: ${map.size.toLocaleString()} matches in ${elapsed}`);
  return map;
}

// ─── Main import ────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const filePath = args.find((a) => !a.startsWith("--"));

  if (!filePath) {
    console.error(
      "Usage: bun run src/import/index.ts <file.ndjson> [--full] [--limit=N] [--resumeFrom=QID] [--resume] [--batch=N] [--clean] [--qrank=path.csv.gz]",
    );
    process.exit(1);
  }

  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  const isFullMode = args.includes("--full") || args.includes("--clean");
  const isClean = args.includes("--clean");
  const isAutoResume = args.includes("--resume");
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : isFullMode ? Infinity : 100;
  const resumeArg = args.find((a) => a.startsWith("--resumeFrom="));
  const batchArg = args.find((a) => a.startsWith("--batch="));
  const batchSize = batchArg ? parseInt(batchArg.split("=")[1], 10) : DEFAULT_BATCH_SIZE;
  const qrankArg = args.find((a) => a.startsWith("--qrank="));
  const qrankPath = qrankArg ? qrankArg.split("=")[1] : null;

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL required");
    process.exit(1);
  }

  const { db, client: rawClient } = createImportDb(url);

  // Resolve resume point: explicit --resumeFrom=QID takes priority, then --resume (auto)
  let resumeFrom = resumeArg ? resumeArg.split("=")[1] : null;
  if (!resumeFrom && isAutoResume) {
    const [lastRun] = await db
      .select({
        lastEntityId: importProgress.lastEntityId,
        status: importProgress.status,
      })
      .from(importProgress)
      .where(eq(importProgress.sourceFile, filePath))
      .orderBy(sql`${importProgress.startedAt} DESC`)
      .limit(1);
    if (lastRun?.lastEntityId) {
      resumeFrom = lastRun.lastEntityId;
      console.log(
        `Auto-resume: picking up from ${resumeFrom} (last run status: ${lastRun.status})`,
      );
    } else {
      console.log("Auto-resume: no previous run found, starting from beginning");
    }
  }

  console.log("Ensuring schema...");

  if (isClean) {
    console.log("Cleaning database...");
    await db.delete(mediaGenres);
    await db.delete(mediaPlatforms);
    await db.delete(media);
    await db.delete(genres);
    await db.delete(platforms);
    await db.delete(importProgress);

    // Drop non-essential indexes for faster bulk import
    await dropIndexes(rawClient);
  } else {
    // Set up pg_trgm indexes (idempotent)
    console.log("Setting up trigram indexes...");
    for (const stmt of TRGM_SETUP_SQL) {
      await db.execute(sql.raw(stmt));
    }
  }

  // Validate QRank file early but load after import
  if (qrankPath && !fs.existsSync(qrankPath)) {
    console.error(`QRank file not found: ${qrankPath}`);
    process.exit(1);
  }

  console.log(`\nImporting from: ${filePath}`);
  console.log(
    `Mode: ${isFullMode ? "full" : "test"}, Limit: ${limit === Infinity ? "none" : limit}, Batch: ${batchSize}`,
  );
  if (resumeFrom) console.log(`Resuming from: ${resumeFrom}`);

  const stats: ImportStats = {
    entitiesProcessed: 0,
    entitiesImported: 0,
    errors: 0,
    genresFound: 0,
    platformsFound: 0,
    byType: { movie: 0, tv_series: 0, anime: 0, game: 0 },
  };

  // Create progress record
  const [progressRecord] = await db
    .insert(importProgress)
    .values({
      sourceFile: filePath,
      status: "running",
      startedAt: new Date(),
    })
    .returning({ id: importProgress.id });

  const genreCache: Record<string, string> = {};
  const platformCache: Record<string, string> = {};
  let batch: ParsedMedia[] = [];
  let skipping = resumeFrom !== null;
  const startTime = Date.now();

  try {
    const rl = readline.createInterface({
      input: fs.createReadStream(filePath, { encoding: "utf-8" }),
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      if (stats.entitiesImported >= limit) break;

      const entity = parseJsonLine(line);
      if (!entity) continue;

      // Resume support
      if (skipping) {
        if (entity.id === resumeFrom) {
          skipping = false;
          console.log(`Found resume point: ${resumeFrom}`);
        }
        continue;
      }

      stats.entitiesProcessed++;

      if (stats.entitiesProcessed % PROGRESS_LOG_INTERVAL === 0) {
        const elapsed = formatDuration(Date.now() - startTime);
        const rate = (stats.entitiesProcessed / ((Date.now() - startTime) / 1000)).toFixed(0);
        console.log(
          `[${elapsed}] Processed: ${stats.entitiesProcessed.toLocaleString()}, ` +
            `Imported: ${stats.entitiesImported.toLocaleString()}, ` +
            `Errors: ${stats.errors}, Rate: ${rate}/s`,
        );

        // Update progress in DB
        await db
          .update(importProgress)
          .set({
            entitiesProcessed: stats.entitiesProcessed,
            entitiesImported: stats.entitiesImported,
            lastEntityId: entity.id,
          })
          .where(eq(importProgress.id, progressRecord.id));
      }

      if (!shouldImportEntity(entity)) continue;

      const parsed = parseMediaEntity(entity);
      if (!parsed) continue;

      stats.byType[parsed.mediaType] = (stats.byType[parsed.mediaType] || 0) + 1;
      batch.push(parsed);

      if (batch.length >= batchSize) {
        await processSuperBatch(rawClient, db, batch, genreCache, platformCache, stats);
        batch = [];
      }
    }

    // Process remaining batch
    if (batch.length > 0) {
      await processSuperBatch(rawClient, db, batch, genreCache, platformCache, stats);
    }

    // Recreate indexes if they were dropped
    if (isClean) {
      await recreateIndexes(rawClient);
    }

    // Apply QRank percentiles after import (DB now has all media entities)
    if (qrankPath) {
      console.log("\nApplying QRank percentiles...");
      const rows = await db.select({ wid: media.wikidataId }).from(media);
      const knownIds = new Set(rows.map((r) => r.wid));
      console.log(`Found ${knownIds.size.toLocaleString()} media entities in DB`);
      const qrankMap = await loadQRank(qrankPath, knownIds);

      // Sort by raw score descending, compute percentile rank, batch-update
      const sorted = [...qrankMap.entries()].sort((a, b) => b[1] - a[1]);
      const total = sorted.length;
      console.log(`Computing percentiles for ${total.toLocaleString()} scored entities...`);

      const UPDATE_BATCH = 1_000;
      let updated = 0;
      for (let i = 0; i < sorted.length; i += UPDATE_BATCH) {
        const chunk = sorted.slice(i, i + UPDATE_BATCH);
        const values = chunk
          .map(([wid], idx) => {
            const rank = i + idx; // 0-based position in descending order
            const pct = total <= 1 ? 0 : (rank / (total - 1)) * 100;
            return `('${wid}', ${pct.toFixed(2)})`;
          })
          .join(", ");
        await rawClient.unsafe(
          `UPDATE media SET qrank_pct = v.pct::numeric(5,2)
           FROM (VALUES ${values}) AS v(wid, pct)
           WHERE media.wikidata_id = v.wid`,
        );
        updated += chunk.length;
        if (updated % 10_000 === 0 || updated === sorted.length) {
          console.log(`  QRank updated: ${updated.toLocaleString()} / ${total.toLocaleString()}`);
        }
      }
      console.log(
        `QRank: ${updated.toLocaleString()} media entities scored (0.00% = most popular)`,
      );
    }

    // Compute sitelinks percentile (always, independent of QRank)
    console.log("\nComputing sitelinks percentiles...");
    await rawClient.unsafe(`
      WITH ranked AS (
        SELECT id, PERCENT_RANK() OVER (ORDER BY sitelinks_count DESC) * 100 AS pct
        FROM media
      )
      UPDATE media SET sitelinks_pct = ranked.pct FROM ranked WHERE media.id = ranked.id
    `);
    console.log(
      "Sitelinks percentiles computed (popularity_score auto-updated via generated column).",
    );

    // Update progress — completed
    await db
      .update(importProgress)
      .set({
        entitiesProcessed: stats.entitiesProcessed,
        entitiesImported: stats.entitiesImported,
        status: "completed",
        completedAt: new Date(),
      })
      .where(eq(importProgress.id, progressRecord.id));
  } catch (err) {
    // Mark progress as failed on crash so --resume can pick up
    try {
      await db
        .update(importProgress)
        .set({
          entitiesProcessed: stats.entitiesProcessed,
          entitiesImported: stats.entitiesImported,
          status: "failed",
        })
        .where(eq(importProgress.id, progressRecord.id));
    } catch {
      // Best-effort — connection may be dead
    }
    throw err;
  }

  // Clean up raw client
  await rawClient.end();

  const totalTime = formatDuration(Date.now() - startTime);
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Import completed in ${totalTime}`);
  console.log(`Processed: ${stats.entitiesProcessed.toLocaleString()}`);
  console.log(`Imported: ${stats.entitiesImported.toLocaleString()}`);
  console.log(`Genres linked: ${stats.genresFound.toLocaleString()}`);
  console.log(`Platforms linked: ${stats.platformsFound.toLocaleString()}`);
  console.log(`Errors: ${stats.errors}`);
  console.log(`By type:`);
  for (const [type, count] of Object.entries(stats.byType)) {
    if (count > 0) console.log(`  ${type}: ${count.toLocaleString()}`);
  }
  console.log("=".repeat(60));
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
