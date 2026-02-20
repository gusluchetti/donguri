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
import { pipeline } from "node:stream/promises";
import zlib from "node:zlib";
import { eq, sql } from "drizzle-orm";
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
import { formatDuration } from "./_retry";
import type { ParsedMedia, WikidataEntity } from "./_types";
import { type ImportStats, processSuperBatch, type RawClient } from "./_upsert";

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

// ─── QRank loading (Postgres COPY + SQL) ────────────────────────────────

/**
 * Stream QRank CSV into a Postgres temp table, then compute percentiles
 * and update media rows entirely in SQL. Zero JS memory usage.
 */
async function applyQRank(rawClient: RawClient, filePath: string): Promise<void> {
  console.log(`\nApplying QRank from: ${filePath} (streaming via COPY → SQL)`);
  const startTime = Date.now();

  // Use a single connection (not a pool transaction) so the temp table persists
  // across multiple statements. postgres.js `reserve()` gives us that.
  const conn = await rawClient.reserve();
  try {
    // 1. Create temp table
    await conn.unsafe(`CREATE TEMP TABLE _qrank (wikidata_id TEXT, score INT)`);

    // 2. Stream QRank CSV into temp table via COPY
    const writable = await conn
      .unsafe(`COPY _qrank (wikidata_id, score) FROM STDIN WITH (FORMAT csv, HEADER true)`)
      .writable();
    const stream = fs.createReadStream(filePath);
    const input = filePath.endsWith(".gz") ? stream.pipe(zlib.createGunzip()) : stream;
    await pipeline(input, writable);

    const copyElapsed = formatDuration(Date.now() - startTime);
    console.log(`  COPY complete in ${copyElapsed}`);

    // 3. Index for join performance
    await conn.unsafe(`CREATE INDEX ON _qrank (wikidata_id)`);
    console.log("  Index created on _qrank");

    // 4. Count how many already have a QRank score (re-scored vs newly scored)
    const [{ count: prevScored }] = await conn.unsafe(
      `SELECT COUNT(*)::int AS count FROM media WHERE qrank_pct IS NOT NULL`,
    );

    // 5. Compute percentiles + update, entirely in SQL
    const result = await conn.unsafe(`
      WITH matched AS (
        SELECT q.wikidata_id, q.score
        FROM _qrank q
        INNER JOIN media m ON m.wikidata_id = q.wikidata_id
      ),
      ranked AS (
        SELECT wikidata_id,
          (PERCENT_RANK() OVER (ORDER BY score DESC)) * 100 AS pct
        FROM matched
      )
      UPDATE media SET qrank_pct = r.pct::numeric(5,2)
      FROM ranked r
      WHERE media.wikidata_id = r.wikidata_id
    `);

    const totalScored = Number(result.count);
    const newlyScored = totalScored - Number(prevScored);
    const reScored = Number(prevScored);
    const elapsed = formatDuration(Date.now() - startTime);
    console.log(
      `  QRank: ${totalScored} scored in ${elapsed} (${newlyScored} new, ${reScored} re-scored)`,
    );

    // 5. Drop temp table explicitly (also auto-drops on disconnect)
    await conn.unsafe(`DROP TABLE IF EXISTS _qrank`);
  } finally {
    conn.release();
  }
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
    entitiesNew: 0,
    entitiesUpdated: 0,
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
      await applyQRank(rawClient, qrankPath);
    }

    // Compute sitelinks percentile (always, independent of QRank)
    console.log("\nComputing sitelinks percentiles...");
    const slResult = await rawClient.unsafe(`
      WITH ranked AS (
        SELECT id, PERCENT_RANK() OVER (ORDER BY sitelinks_count DESC) * 100 AS pct
        FROM media
      )
      UPDATE media SET sitelinks_pct = ranked.pct FROM ranked WHERE media.id = ranked.id
    `);
    console.log(
      `  Sitelinks: ${slResult.count} rows updated (popularity_score auto-updated via generated column)`,
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
  console.log(`Processed:  ${stats.entitiesProcessed.toLocaleString()}`);
  console.log(
    `Imported:   ${stats.entitiesImported.toLocaleString()} (${stats.entitiesNew.toLocaleString()} new, ${stats.entitiesUpdated.toLocaleString()} updated)`,
  );
  console.log(`Genres:     ${stats.genresFound.toLocaleString()} links`);
  console.log(`Platforms:  ${stats.platformsFound.toLocaleString()} links`);
  console.log(`Errors:     ${stats.errors}`);
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
