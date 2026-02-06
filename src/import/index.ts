/**
 * Pass 2: Parse and import media entities from subset NDJSON into Turso.
 *
 * Usage:
 *   bun run src/import/index.ts media-subset.ndjson                     # Test mode (100)
 *   bun run src/import/index.ts media-subset.ndjson --full              # Full import
 *   bun run src/import/index.ts media-subset.ndjson --full --limit=1000 # Limited
 *   bun run src/import/index.ts media-subset.ndjson --full --resumeFrom=Q123
 *   bun run src/import/index.ts media-subset.ndjson --clean             # Clean DB first
 */

import fs from "node:fs";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import split2 from "split2";
import { eq, sql } from "drizzle-orm";
import { createDb } from "../db";
import {
  media,
  genres,
  mediaGenres,
  platforms,
  mediaPlatforms,
  importProgress,
} from "../db/schema";
import { FTS_SETUP_SQL, FTS_REBUILD_SQL } from "../db/fts";
import { shouldImportEntity } from "./filters";
import { parseMediaEntity } from "./parser";
import type { WikidataEntity, ParsedMedia } from "./types";

const BATCH_SIZE = 500;
const PROGRESS_LOG_INTERVAL = 10_000;

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

interface GenreCache {
  [wikidataId: string]: string;
}

interface PlatformCache {
  [wikidataId: string]: string;
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

type DbType = ReturnType<typeof createDb>;

async function getOrCreateGenreIds(
  db: DbType,
  genreWikidataIds: string[],
  cache: GenreCache,
): Promise<string[]> {
  const result: string[] = [];

  for (const wikidataId of genreWikidataIds) {
    if (cache[wikidataId]) {
      result.push(cache[wikidataId]);
      continue;
    }

    const existing = await db
      .select({ id: genres.id })
      .from(genres)
      .where(eq(genres.wikidataId, wikidataId))
      .limit(1);

    if (existing.length > 0) {
      cache[wikidataId] = existing[0].id;
      result.push(existing[0].id);
      continue;
    }

    // Insert with a placeholder name (genre names resolved later or from Wikidata labels)
    const inserted = await db
      .insert(genres)
      .values({ wikidataId, name: wikidataId })
      .onConflictDoNothing()
      .returning({ id: genres.id });

    if (inserted.length > 0) {
      cache[wikidataId] = inserted[0].id;
      result.push(inserted[0].id);
    } else {
      const refetch = await db
        .select({ id: genres.id })
        .from(genres)
        .where(eq(genres.wikidataId, wikidataId))
        .limit(1);
      if (refetch.length > 0) {
        cache[wikidataId] = refetch[0].id;
        result.push(refetch[0].id);
      }
    }
  }

  return result;
}

async function getOrCreatePlatformIds(
  db: DbType,
  platformWikidataIds: string[],
  cache: PlatformCache,
): Promise<string[]> {
  const result: string[] = [];

  for (const wikidataId of platformWikidataIds) {
    if (cache[wikidataId]) {
      result.push(cache[wikidataId]);
      continue;
    }

    const existing = await db
      .select({ id: platforms.id })
      .from(platforms)
      .where(eq(platforms.wikidataId, wikidataId))
      .limit(1);

    if (existing.length > 0) {
      cache[wikidataId] = existing[0].id;
      result.push(existing[0].id);
      continue;
    }

    const inserted = await db
      .insert(platforms)
      .values({ wikidataId, name: wikidataId })
      .onConflictDoNothing()
      .returning({ id: platforms.id });

    if (inserted.length > 0) {
      cache[wikidataId] = inserted[0].id;
      result.push(inserted[0].id);
    } else {
      const refetch = await db
        .select({ id: platforms.id })
        .from(platforms)
        .where(eq(platforms.wikidataId, wikidataId))
        .limit(1);
      if (refetch.length > 0) {
        cache[wikidataId] = refetch[0].id;
        result.push(refetch[0].id);
      }
    }
  }

  return result;
}

async function insertBatch(
  db: DbType,
  batch: ParsedMedia[],
  genreCache: GenreCache,
  platformCache: PlatformCache,
  stats: ImportStats,
): Promise<void> {
  if (batch.length === 0) return;

  try {
    const mediaValues = batch.map((item) => ({
      wikidataId: item.wikidataId,
      mediaType: item.mediaType as
        | "movie"
        | "tv_series"
        | "anime"
        | "game",
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
      searchTitle: item.searchTitle,
    }));

    const inserted = await db
      .insert(media)
      .values(mediaValues)
      .onConflictDoNothing()
      .returning({ id: media.id, wikidataId: media.wikidataId });

    stats.entitiesImported += inserted.length;

    const wikidataToDbId = new Map(
      inserted.map((r) => [r.wikidataId, r.id]),
    );

    // Genre relationships
    const genreRelations: { mediaId: string; genreId: string }[] = [];
    for (const item of batch) {
      const mediaId = wikidataToDbId.get(item.wikidataId);
      if (!mediaId || item.genreIds.length === 0) continue;

      const genreDbIds = await getOrCreateGenreIds(
        db,
        item.genreIds,
        genreCache,
      );
      stats.genresFound += genreDbIds.length;

      for (const genreId of genreDbIds) {
        genreRelations.push({ mediaId, genreId });
      }
    }

    if (genreRelations.length > 0) {
      await db.insert(mediaGenres).values(genreRelations).onConflictDoNothing();
    }

    // Platform relationships (games)
    const platformRelations: { mediaId: string; platformId: string }[] = [];
    for (const item of batch) {
      const mediaId = wikidataToDbId.get(item.wikidataId);
      if (!mediaId || item.platformIds.length === 0) continue;

      const platformDbIds = await getOrCreatePlatformIds(
        db,
        item.platformIds,
        platformCache,
      );
      stats.platformsFound += platformDbIds.length;

      for (const platformId of platformDbIds) {
        platformRelations.push({ mediaId, platformId });
      }
    }

    if (platformRelations.length > 0) {
      await db
        .insert(mediaPlatforms)
        .values(platformRelations)
        .onConflictDoNothing();
    }
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

  const url = process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) {
    console.error("TURSO_DATABASE_URL or DATABASE_URL required");
    process.exit(1);
  }

  const db = createDb(url, process.env.TURSO_AUTH_TOKEN);

  // Push schema
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

  // Set up FTS
  console.log("Setting up FTS5...");
  for (const stmt of FTS_SETUP_SQL.split(";").filter((s) => s.trim())) {
    await db.run(sql.raw(stmt));
  }

  console.log(`\nImporting from: ${filePath}`);
  console.log(`Mode: ${isFullMode ? "full" : "test"}, Limit: ${limit === Infinity ? "none" : limit}`);
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
      startedAt: new Date().toISOString(),
    })
    .returning({ id: importProgress.id });

  const genreCache: GenreCache = {};
  const platformCache: PlatformCache = {};
  let batch: ParsedMedia[] = [];
  let skipping = resumeFrom !== null;
  const startTime = Date.now();

  const processStream = new Transform({
    objectMode: true,
    async transform(
      line: string,
      _encoding: string,
      callback: (error?: Error | null) => void,
    ) {
      if (stats.entitiesImported >= limit) return callback();

      const entity = parseJsonLine(line);
      if (!entity) return callback();

      // Resume support
      if (skipping) {
        if (entity.id === resumeFrom) {
          skipping = false;
          console.log(`Found resume point: ${resumeFrom}`);
        }
        return callback();
      }

      stats.entitiesProcessed++;

      if (stats.entitiesProcessed % PROGRESS_LOG_INTERVAL === 0) {
        const elapsed = formatDuration(Date.now() - startTime);
        const rate = (
          stats.entitiesProcessed /
          ((Date.now() - startTime) / 1000)
        ).toFixed(0);
        console.log(
          `[${elapsed}] Processed: ${stats.entitiesProcessed.toLocaleString()}, ` +
            `Imported: ${stats.entitiesImported.toLocaleString()}, ` +
            `Errors: ${stats.errors}, Rate: ${rate}/s`,
        );

        // Update progress
        await db
          .update(importProgress)
          .set({
            entitiesProcessed: stats.entitiesProcessed,
            entitiesImported: stats.entitiesImported,
            lastEntityId: entity.id,
          })
          .where(eq(importProgress.id, progressRecord.id));
      }

      if (!shouldImportEntity(entity)) return callback();

      const parsed = parseMediaEntity(entity);
      if (!parsed) return callback();

      stats.byType[parsed.mediaType] =
        (stats.byType[parsed.mediaType] || 0) + 1;
      batch.push(parsed);

      if (batch.length >= BATCH_SIZE) {
        await insertBatch(db, batch, genreCache, platformCache, stats);
        batch = [];
      }

      callback();
    },
    async flush(callback: (error?: Error | null) => void) {
      // Insert remaining batch
      if (batch.length > 0) {
        await insertBatch(db, batch, genreCache, platformCache, stats);
      }
      callback();
    },
  });

  await pipeline(
    fs.createReadStream(filePath, { encoding: "utf-8" }),
    split2(),
    processStream,
  );

  // Rebuild FTS index after bulk import
  console.log("\nRebuilding FTS index...");
  await db.run(sql.raw(FTS_REBUILD_SQL));

  // Update progress
  await db
    .update(importProgress)
    .set({
      entitiesProcessed: stats.entitiesProcessed,
      entitiesImported: stats.entitiesImported,
      status: "completed",
      completedAt: new Date().toISOString(),
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
