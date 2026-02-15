/**
 * Pass 2: Parse and import media entities from subset NDJSON into Postgres.
 *
 * Usage:
 *   bun run src/import/index.ts media-subset.ndjson                     # Test mode (100)
 *   bun run src/import/index.ts media-subset.ndjson --full              # Full import
 *   bun run src/import/index.ts media-subset.ndjson --full --limit=1000 # Limited
 *   bun run src/import/index.ts media-subset.ndjson --full --resumeFrom=Q123
 *   bun run src/import/index.ts media-subset.ndjson --clean             # Clean DB first
 */

import fs from "node:fs";
import readline from "node:readline";
import { eq, inArray, sql } from "drizzle-orm";
import { createDb } from "../db";
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
import type { ParsedMedia, WikidataEntity } from "./_types";

const BATCH_SIZE = 200;
const PROGRESS_LOG_INTERVAL = 1_000;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2_000;

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000) % 60;
  const minutes = Math.floor(ms / 60000) % 60;
  const hours = Math.floor(ms / 3600000);
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

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

// ─── DB helpers ─────────────────────────────────────────────────────────────

async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isConnectionError =
        err instanceof Error &&
        (err.message.includes("CONNECTION_CLOSED") ||
          err.message.includes("CONNECT_TIMEOUT") ||
          err.message.includes("connection") ||
          err.cause?.toString().includes("CONNECTION_CLOSED"));
      if (isConnectionError && attempt < MAX_RETRIES) {
        console.warn(
          `[retry] ${label} failed (attempt ${attempt}/${MAX_RETRIES}), retrying in ${RETRY_DELAY_MS}ms...`,
        );
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        continue;
      }
      throw err;
    }
  }
  throw new Error("unreachable");
}

type DbType = ReturnType<typeof createDb>;

/**
 * Batch-ensure genres exist, returning a map of wikidataId → dbId.
 * Single INSERT ... ON CONFLICT + single SELECT instead of N round trips.
 */
async function ensureGenres(
  db: DbType,
  wikidataIds: string[],
  cache: Record<string, string>,
): Promise<void> {
  const uncached = wikidataIds.filter((id) => !cache[id]);
  if (uncached.length === 0) return;

  // Bulk insert (ignoring conflicts)
  const values = uncached.map((wikidataId) => ({ wikidataId, name: wikidataId }));
  await db.insert(genres).values(values).onConflictDoNothing();

  // Bulk fetch all IDs we need
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

async function insertBatch(
  db: DbType,
  batch: ParsedMedia[],
  genreCache: Record<string, string>,
  platformCache: Record<string, string>,
  stats: ImportStats,
): Promise<void> {
  if (batch.length === 0) return;

  try {
    // Collect all genre/platform IDs we'll need for this batch
    const allGenreIds = new Set<string>();
    const allPlatformIds = new Set<string>();
    for (const item of batch) {
      for (const id of item.genreIds) allGenreIds.add(id);
      for (const id of item.platformIds) allPlatformIds.add(id);
    }

    // Batch-ensure genres and platforms exist (2 round trips instead of N)
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

    // Insert media
    const mediaValues = batch.map((item) => ({
      wikidataId: item.wikidataId,
      mediaType: item.mediaType as "movie" | "tv_series" | "anime" | "game",
      title: item.title,
      originalTitle: item.originalTitle,
      originalLanguage: item.originalLanguage,
      description: item.description,
      startYear: item.startYear,
      endYear: item.endYear,
      runtimeMinutes: item.runtimeMinutes,
      seasonCount: item.seasonCount,
      episodeCount: item.episodeCount,
      sitelinksCount: item.sitelinksCount,
      countryOfOrigin: item.countryOfOrigin,
      imdbId: item.imdbId,
      tmdbId: item.tmdbId,
      malId: item.malId,
      anilistId: item.anilistId,
      anidbId: item.anidbId,
      igdbId: item.igdbId,
      annId: item.annId,
      tvdbId: item.tvdbId,
      tvmazeId: item.tvmazeId,
      searchTitle: item.searchTitle,
    }));

    const upserted = await withRetry(
      () =>
        db
          .insert(media)
          .values(mediaValues)
          .onConflictDoUpdate({
            target: media.wikidataId,
            set: {
              title: sql`COALESCE(EXCLUDED.title, ${media.title})`,
              originalTitle: sql`COALESCE(EXCLUDED.original_title, ${media.originalTitle})`,
              originalLanguage: sql`COALESCE(EXCLUDED.original_language, ${media.originalLanguage})`,
              description: sql`COALESCE(EXCLUDED.description, ${media.description})`,
              startYear: sql`COALESCE(EXCLUDED.start_year, ${media.startYear})`,
              endYear: sql`COALESCE(EXCLUDED.end_year, ${media.endYear})`,
              runtimeMinutes: sql`COALESCE(EXCLUDED.runtime_minutes, ${media.runtimeMinutes})`,
              seasonCount: sql`COALESCE(EXCLUDED.season_count, ${media.seasonCount})`,
              episodeCount: sql`COALESCE(EXCLUDED.episode_count, ${media.episodeCount})`,
              sitelinksCount: sql`GREATEST(EXCLUDED.sitelinks_count, ${media.sitelinksCount})`,
              countryOfOrigin: sql`COALESCE(EXCLUDED.country_of_origin, ${media.countryOfOrigin})`,
              imdbId: sql`COALESCE(EXCLUDED.imdb_id, ${media.imdbId})`,
              tmdbId: sql`COALESCE(EXCLUDED.tmdb_id, ${media.tmdbId})`,
              malId: sql`COALESCE(EXCLUDED.mal_id, ${media.malId})`,
              anilistId: sql`COALESCE(EXCLUDED.anilist_id, ${media.anilistId})`,
              anidbId: sql`COALESCE(EXCLUDED.anidb_id, ${media.anidbId})`,
              igdbId: sql`COALESCE(EXCLUDED.igdb_id, ${media.igdbId})`,
              annId: sql`COALESCE(EXCLUDED.ann_id, ${media.annId})`,
              tvdbId: sql`COALESCE(EXCLUDED.tvdb_id, ${media.tvdbId})`,
              tvmazeId: sql`COALESCE(EXCLUDED.tvmaze_id, ${media.tvmazeId})`,
              searchTitle: sql`COALESCE(EXCLUDED.search_title, ${media.searchTitle})`,
              updatedAt: sql`now()`,
            },
          })
          .returning({ id: media.id, wikidataId: media.wikidataId }),
      "upsert media",
    );

    stats.entitiesImported += upserted.length;

    const wikidataToDbId = new Map(upserted.map((r) => [r.wikidataId, r.id]));

    // Build all genre + platform relations in one pass
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

    // Bulk insert relations (2 more round trips max)
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
    console.error("Batch insert error:", error);
  }
}

// ─── Main import ────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const filePath = args.find((a) => !a.startsWith("--"));

  if (!filePath) {
    console.error(
      "Usage: bun run src/import/index.ts <file.ndjson> [--full] [--limit=N] [--resumeFrom=QID] [--clean]",
    );
    process.exit(1);
  }

  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  const isFullMode = args.includes("--full") || args.includes("--clean");
  const isClean = args.includes("--clean");
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : isFullMode ? Infinity : 100;
  const resumeArg = args.find((a) => a.startsWith("--resumeFrom="));
  const resumeFrom = resumeArg ? resumeArg.split("=")[1] : null;

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL required");
    process.exit(1);
  }

  const db = createDb(url);

  console.log("Ensuring schema...");

  if (isClean) {
    console.log("Cleaning database...");
    await db.delete(mediaGenres);
    await db.delete(mediaPlatforms);
    await db.delete(media);
    await db.delete(genres);
    await db.delete(platforms);
    await db.delete(importProgress);
  }

  // Set up pg_trgm indexes
  console.log("Setting up trigram indexes...");
  for (const stmt of TRGM_SETUP_SQL) {
    await db.execute(sql.raw(stmt));
  }

  console.log(`\nImporting from: ${filePath}`);
  console.log(
    `Mode: ${isFullMode ? "full" : "test"}, Limit: ${limit === Infinity ? "none" : limit}`,
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

    if (batch.length >= BATCH_SIZE) {
      await insertBatch(db, batch, genreCache, platformCache, stats);
      batch = [];
    }
  }

  // Insert remaining batch
  if (batch.length > 0) {
    await insertBatch(db, batch, genreCache, platformCache, stats);
  }

  // Update progress
  await db
    .update(importProgress)
    .set({
      entitiesProcessed: stats.entitiesProcessed,
      entitiesImported: stats.entitiesImported,
      status: "completed",
      completedAt: new Date(),
    })
    .where(eq(importProgress.id, progressRecord.id));

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
