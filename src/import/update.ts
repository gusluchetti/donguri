/**
 * Unified import pipeline: interactive menu or non-interactive --all.
 *
 * Usage:
 *   bun run import:update                    # Interactive menu
 *   bun run import:update --all              # Non-interactive, all steps
 *   bun run import:update --all --reset      # Wipe + full reimport
 *   bun run import:update --all --qrank=data/qrank.csv.gz
 *   bun run import:update --all --subset=data/subset.ndjson
 *   bun run import:update --all --anime-offline=data/anime-offline-database.jsonl
 *   bun run import:update --all --limit=1000
 */

import fs from "node:fs";
import readline from "node:readline";
import zlib from "node:zlib";
import * as clack from "@clack/prompts";
import { eq, inArray, sql } from "drizzle-orm";
import { cleanEnv, getDb } from "../db";
import { TRGM_SETUP_SQL } from "../db/fts";
import {
  genres,
  importProgress,
  media,
  mediaGenres,
  mediaPlatforms,
  platforms,
  seasons,
} from "../db/schema";
import { parseMediaEntity, shouldImportEntity } from "./_filters";
import { formatDuration, withRetry } from "./_retry";
import type { ParsedMedia, ParsedSeason, WikibaseEntityIdValue, WikidataEntity } from "./_types";
import { WikidataProperties } from "./_types";
import { type DbType, type ImportStats, processSuperBatch } from "./_upsert";

// ═══ Constants ══════════════════════════════════════════════════════════════

const DEFAULT_BATCH_SIZE = 5_000;
const PROGRESS_LOG_INTERVAL = 1_000;
const SEASON_BATCH_SIZE = 200;
const SEASON_LOOKUP_BATCH = 500;
const COVER_BATCH_SIZE = 200;
const COVER_CONCURRENCY_TMDB = 6;
const COVER_CONCURRENCY_ANILIST = 1;
const COVER_CONCURRENCY_IGDB = 2;

type Feature = "media" | "percentiles" | "seasons" | "covers";

const FEATURE_LABELS: Record<Feature, string> = {
  media: "Media entities (Wikidata subset → DB)",
  percentiles: "Percentiles (QRank + sitelinks)",
  seasons: "Seasons (Wikidata + TVMaze + anime-offline)",
  covers: "Cover art",
};

// Auto-detect paths from ./data/
const AUTO_PATHS = {
  qrank: ["data/qrank.csv.gz", "data/qrank.csv"],
  animeOffline: ["data/anime-offline-database.jsonl"],
  subset: ["data/subset.ndjson"],
};

function autoDetect(candidates: string[]): string | null {
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

// ═══ Helpers ════════════════════════════════════════════════════════════════

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

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function escapePostgresLiteral(str: string): string {
  return `'${str.replace(/'/g, "''")}'`;
}

/** Indexes to drop before --reset imports and recreate after. */
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

async function dropIndexes(db: DbType): Promise<void> {
  console.log("Dropping non-essential indexes for faster import...");
  for (const idx of DROPPABLE_INDEXES) {
    await db.execute(sql.raw(`DROP INDEX IF EXISTS ${idx}`));
  }
}

async function recreateIndexes(db: DbType): Promise<void> {
  console.log("Recreating indexes...");
  for (const stmt of RECREATE_INDEX_SQL) {
    await db.execute(sql.raw(stmt));
  }
  for (const stmt of TRGM_SETUP_SQL) {
    await db.execute(sql.raw(stmt));
  }
  console.log("Indexes recreated.");
}

// ═══ Feature: Media Import ══════════════════════════════════════════════════

interface MediaImportOpts {
  subsetPath: string;
  reset: boolean;
  limit: number;
  batchSize: number;
  qrankPath: string | null;
}

async function runMediaImport(db: DbType, opts: MediaImportOpts): Promise<void> {
  const { subsetPath, reset, limit, batchSize, qrankPath } = opts;
  const startTime = Date.now();

  if (reset) {
    console.log("Cleaning database (--reset)...");
    await db.delete(mediaGenres);
    await db.delete(mediaPlatforms);
    await db.delete(media);
    await db.delete(genres);
    await db.delete(platforms);
    await db.delete(importProgress);
    await dropIndexes(db);
  } else {
    console.log("Setting up trigram indexes...");
    for (const stmt of TRGM_SETUP_SQL) {
      await db.execute(sql.raw(stmt));
    }
  }

  if (qrankPath && !fs.existsSync(qrankPath)) {
    console.error(`QRank file not found: ${qrankPath}`);
    return;
  }

  console.log(`\nImporting from: ${subsetPath}`);
  console.log(
    `Mode: ${reset ? "reset" : "upsert"}, Limit: ${limit === Infinity ? "none" : limit}, Batch: ${batchSize}`,
  );

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

  const [progressRecord] = await db
    .insert(importProgress)
    .values({ sourceFile: subsetPath, status: "running", startedAt: new Date() })
    .returning({ id: importProgress.id });

  const genreCache: Record<string, string> = {};
  const platformCache: Record<string, string> = {};
  let batch: ParsedMedia[] = [];

  try {
    const rl = readline.createInterface({
      input: fs.createReadStream(subsetPath, { encoding: "utf-8" }),
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      if (stats.entitiesImported >= limit) break;

      const entity = parseJsonLine(line);
      if (!entity) continue;

      stats.entitiesProcessed++;

      if (stats.entitiesProcessed % PROGRESS_LOG_INTERVAL === 0) {
        const elapsed = formatDuration(Date.now() - startTime);
        const rate = (stats.entitiesProcessed / ((Date.now() - startTime) / 1000)).toFixed(0);
        console.log(
          `[${elapsed}] Processed: ${stats.entitiesProcessed.toLocaleString()}, ` +
            `Imported: ${stats.entitiesImported.toLocaleString()}, ` +
            `Errors: ${stats.errors}, Rate: ${rate}/s`,
        );

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
        await processSuperBatch(db, batch, genreCache, platformCache, stats);
        batch = [];
      }
    }

    if (batch.length > 0) {
      await processSuperBatch(db, batch, genreCache, platformCache, stats);
    }

    if (reset) {
      await recreateIndexes(db);
    }

    if (qrankPath) {
      await applyQRank(db, qrankPath);
    }

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
      /* best-effort */
    }
    throw err;
  }

  const totalTime = formatDuration(Date.now() - startTime);
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Media import completed in ${totalTime}`);
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

// ═══ Feature: Percentiles ═══════════════════════════════════════════════════

async function applyQRank(db: DbType, filePath: string): Promise<void> {
  console.log(`\nApplying QRank from: ${filePath} (in-memory percentiles)`);
  const startTime = Date.now();

  // Load all media wikidata IDs into a Set for fast lookups
  const mediaIds = new Set<string>();
  const rows = await db.execute(sql.raw(`SELECT wikidata_id FROM media`));
  for (const row of rows) mediaIds.add((row as { wikidata_id: string }).wikidata_id);
  console.log(`  Loaded ${mediaIds.size.toLocaleString()} media IDs`);

  // Stream CSV, filter to matching IDs only
  const stream = fs.createReadStream(filePath);
  const input = filePath.endsWith(".gz") ? stream.pipe(zlib.createGunzip()) : stream;
  const rl = readline.createInterface({ input, crlfDelay: Infinity });

  const matched: { wikidataId: string; score: number }[] = [];
  let scanned = 0;
  let isHeader = true;

  for await (const line of rl) {
    if (isHeader) {
      isHeader = false;
      continue;
    }
    scanned++;

    if (scanned % 1_000_000 === 0) {
      const elapsed = formatDuration(Date.now() - startTime);
      const rate = (scanned / ((Date.now() - startTime) / 1000)).toFixed(0);
      console.log(
        `  [${elapsed}] Scanned: ${(scanned / 1_000_000).toFixed(0)}M, Matched: ${matched.length.toLocaleString()}, Rate: ${rate}/s`,
      );
    }

    // QRank CSV format: "Entity,QRank" e.g. "Q42,12345"
    const comma = line.indexOf(",");
    if (comma === -1) continue;
    const entity = line.slice(0, comma);
    if (!mediaIds.has(entity)) continue;

    const score = Number.parseInt(line.slice(comma + 1), 10);
    if (Number.isNaN(score)) continue;
    matched.push({ wikidataId: entity, score });
  }

  const scanElapsed = formatDuration(Date.now() - startTime);
  console.log(
    `  Scan complete in ${scanElapsed}: ${scanned.toLocaleString()} rows → ${matched.length.toLocaleString()} matched`,
  );

  // Compute PERCENT_RANK in JS — no temp table needed
  matched.sort((a, b) => b.score - a.score); // DESC
  const n = matched.length;
  const ranked: { wikidataId: string; pct: string }[] = [];
  for (let i = 0; i < n; i++) {
    // PERCENT_RANK: (rank - 1) / (n - 1), where ties share the same rank
    const rank =
      i > 0 && matched[i].score === matched[i - 1].score
        ? ranked[i - 1].pct
        : n > 1
          ? ((i / (n - 1)) * 100).toFixed(2)
          : "0.00";
    ranked.push({ wikidataId: matched[i].wikidataId, pct: typeof rank === "string" ? rank : rank });
  }

  const [{ count: prevScored }] = (await db.execute(
    sql.raw(`SELECT COUNT(*)::int AS count FROM media WHERE qrank_pct IS NOT NULL`),
  )) as unknown as [{ count: number }];

  // Batch UPDATE directly — no temp table, no extra storage
  const UPDATE_BATCH = 5_000;
  let totalUpdated = 0;
  for (let i = 0; i < ranked.length; i += UPDATE_BATCH) {
    const chunk = ranked.slice(i, i + UPDATE_BATCH);
    const values = chunk
      .map((r) => `(${escapePostgresLiteral(r.wikidataId)}, ${r.pct})`)
      .join(", ");
    const result = await db.execute(
      sql.raw(`
      UPDATE media SET qrank_pct = v.pct::numeric(5,2)
      FROM (VALUES ${values}) AS v(wikidata_id, pct)
      WHERE media.wikidata_id = v.wikidata_id
    `),
    );
    totalUpdated += Number(result.count);
  }

  const newlyScored = totalUpdated - Number(prevScored);
  const elapsed = formatDuration(Date.now() - startTime);
  console.log(
    `  QRank: ${totalUpdated} scored in ${elapsed} (${newlyScored} new, ${Number(prevScored)} re-scored)`,
  );
}

async function runPercentiles(db: DbType, qrankPath: string | null): Promise<void> {
  const startTime = Date.now();

  if (qrankPath) {
    if (!fs.existsSync(qrankPath)) {
      console.error(`QRank file not found: ${qrankPath}`);
      return;
    }
    await applyQRank(db, qrankPath);
  }

  console.log("\nComputing sitelinks percentiles...");
  const slResult = await db.execute(
    sql.raw(`
    WITH ranked AS (
      SELECT id, PERCENT_RANK() OVER (ORDER BY sitelinks_count DESC) * 100 AS pct
      FROM media
    )
    UPDATE media SET sitelinks_pct = ranked.pct FROM ranked WHERE media.id = ranked.id
  `),
  );
  console.log(
    `  Sitelinks: ${slResult.count} rows updated (popularity_score auto-updated via generated column)`,
  );
  console.log(`  Percentiles done in ${formatDuration(Date.now() - startTime)}`);
}

// ═══ Feature: Seasons ═══════════════════════════════════════════════════════

const P = WikidataProperties;

interface SeasonBatchResult {
  inserted: number;
  updated: number;
}

async function insertSeasonBatch(
  db: DbType,
  batch: {
    mediaId: string;
    seasonNumber: number;
    episodeCount: number | null;
    title: string | null;
    dataSource: "wikidata" | "tvmaze" | "anime_offline_db";
  }[],
): Promise<SeasonBatchResult> {
  if (batch.length === 0) return { inserted: 0, updated: 0 };
  const deduped = [
    ...new Map(batch.map((row) => [`${row.mediaId}:${row.seasonNumber}`, row])).values(),
  ];
  const result = await db
    .insert(seasons)
    .values(deduped)
    .onConflictDoUpdate({
      target: [seasons.mediaId, seasons.seasonNumber],
      set: {
        episodeCount: sql`COALESCE(EXCLUDED.episode_count, ${seasons.episodeCount})`,
        title: sql`COALESCE(EXCLUDED.title, ${seasons.title})`,
        updatedAt: sql`now()`,
      },
    })
    .returning({ id: seasons.id, isNew: sql<boolean>`xmax = 0` });
  const inserted = result.filter((r) => r.isNew).length;
  return { inserted, updated: result.length - inserted };
}

// --- Wikidata seasons ---

function parseSeasonEntity(entity: WikidataEntity): ParsedSeason | null {
  const seriesClaims = entity.claims?.[P.PART_OF_SERIES];
  if (!seriesClaims || seriesClaims.length === 0) return null;

  const seriesClaim = seriesClaims[0];
  if (
    seriesClaim.mainsnak.snaktype !== "value" ||
    seriesClaim.mainsnak.datavalue?.type !== "wikibase-entityid"
  )
    return null;
  const seriesWikidataId = (seriesClaim.mainsnak.datavalue as WikibaseEntityIdValue).value.id;

  let seasonNumber: number | null = null;
  const qualifiers = seriesClaim.qualifiers?.[P.SERIES_ORDINAL];
  if (qualifiers && qualifiers.length > 0) {
    const q = qualifiers[0];
    if (q.snaktype === "value" && q.datavalue?.type === "string") {
      seasonNumber = Number.parseInt(q.datavalue.value, 10);
      if (Number.isNaN(seasonNumber)) seasonNumber = null;
    }
  }
  if (seasonNumber === null) return null;

  let episodeCount: number | null = null;
  const epClaims = entity.claims?.[P.EPISODE_COUNT];
  if (epClaims && epClaims.length > 0) {
    const ep = epClaims[0];
    if (ep.mainsnak.snaktype === "value" && ep.mainsnak.datavalue?.type === "quantity") {
      const amount = Number.parseFloat(ep.mainsnak.datavalue.value.amount);
      if (!Number.isNaN(amount)) episodeCount = Math.round(amount);
    }
  }

  const title = entity.labels?.en?.value ?? null;
  return { seriesWikidataId, seasonNumber, episodeCount, title };
}

async function flushWikidataLookups(
  db: DbType,
  pendingLookups: Set<string>,
  cache: Map<string, string>,
): Promise<void> {
  if (pendingLookups.size === 0) return;
  const ids = [...pendingLookups];
  for (let i = 0; i < ids.length; i += SEASON_LOOKUP_BATCH) {
    const chunk = ids.slice(i, i + SEASON_LOOKUP_BATCH);
    const rows = await db
      .select({ id: media.id, wikidataId: media.wikidataId })
      .from(media)
      .where(inArray(media.wikidataId, chunk));
    for (const row of rows) {
      cache.set(row.wikidataId, row.id);
    }
  }
  pendingLookups.clear();
}

async function importWikidataSeasons(db: DbType, filePath: string): Promise<void> {
  console.log(`\nImporting Wikidata seasons from: ${filePath}`);
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    return;
  }

  const startTime = Date.now();
  let processed = 0;
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  const wikidataToMediaId = new Map<string, string>();
  const pendingLookups = new Set<string>();
  const pendingSeasons: ParsedSeason[] = [];

  const rl = readline.createInterface({
    input: fs.createReadStream(filePath, { encoding: "utf-8" }),
    crlfDelay: Infinity,
  });

  let batch: {
    mediaId: string;
    seasonNumber: number;
    episodeCount: number | null;
    title: string | null;
    dataSource: "wikidata";
  }[] = [];

  function addResult(r: SeasonBatchResult) {
    inserted += r.inserted;
    updated += r.updated;
  }

  async function drainPendingSeasons() {
    await flushWikidataLookups(db, pendingLookups, wikidataToMediaId);
    for (const parsed of pendingSeasons) {
      const mediaId = wikidataToMediaId.get(parsed.seriesWikidataId);
      if (!mediaId) {
        skipped++;
        continue;
      }
      batch.push({
        mediaId,
        seasonNumber: parsed.seasonNumber,
        episodeCount: parsed.episodeCount,
        title: parsed.title,
        dataSource: "wikidata",
      });
    }
    pendingSeasons.length = 0;

    while (batch.length >= SEASON_BATCH_SIZE) {
      const chunk = batch.splice(0, SEASON_BATCH_SIZE);
      addResult(await withRetry(() => insertSeasonBatch(db, chunk), "wikidata season batch"));
    }
  }

  for await (const line of rl) {
    const entity = parseJsonLine(line);
    if (!entity) continue;

    processed++;

    if (processed % 1000 === 0) {
      console.log(
        `[${formatDuration(Date.now() - startTime)}] Processed: ${processed}, Inserted: ${inserted}, Updated: ${updated}, Skipped: ${skipped}`,
      );
    }

    const parsed = parseSeasonEntity(entity);
    if (!parsed) {
      skipped++;
      continue;
    }

    const cachedMediaId = wikidataToMediaId.get(parsed.seriesWikidataId);
    if (cachedMediaId) {
      batch.push({
        mediaId: cachedMediaId,
        seasonNumber: parsed.seasonNumber,
        episodeCount: parsed.episodeCount,
        title: parsed.title,
        dataSource: "wikidata",
      });
    } else {
      pendingLookups.add(parsed.seriesWikidataId);
      pendingSeasons.push(parsed);
    }

    if (pendingLookups.size >= SEASON_LOOKUP_BATCH) {
      await drainPendingSeasons();
    }

    if (batch.length >= SEASON_BATCH_SIZE) {
      addResult(await withRetry(() => insertSeasonBatch(db, batch), "wikidata season batch"));
      batch = [];
    }
  }

  await drainPendingSeasons();
  if (batch.length > 0) {
    addResult(await withRetry(() => insertSeasonBatch(db, batch), "wikidata season batch"));
  }

  console.log(`\nWikidata seasons done in ${formatDuration(Date.now() - startTime)}`);
  console.log(
    `  Processed: ${processed}, Inserted: ${inserted}, Updated: ${updated}, Skipped: ${skipped}`,
  );
}

// --- TVMaze seasons ---

interface TvmazeSeason {
  number: number | null;
  episodeOrder: number | null;
  name: string;
}

async function processShowSeasons(
  db: DbType,
  mediaId: string,
  apiSeasons: TvmazeSeason[],
): Promise<SeasonBatchResult> {
  const batch = apiSeasons
    .filter((s): s is TvmazeSeason & { number: number } => s.number !== null)
    .map((s) => ({
      mediaId,
      seasonNumber: s.number,
      episodeCount: s.episodeOrder ?? null,
      title: s.name || null,
      dataSource: "tvmaze" as const,
    }));
  if (batch.length === 0) return { inserted: 0, updated: 0 };
  return withRetry(() => insertSeasonBatch(db, batch), "tvmaze season batch");
}

async function importTvmazeSeasons(db: DbType): Promise<void> {
  console.log("\nImporting seasons from TVMaze API...");

  const startTime = Date.now();
  let processed = 0;
  let inserted = 0;
  let updated = 0;
  let errors = 0;
  const failedShows: string[] = [];

  const candidates = await db
    .select({ id: media.id, tvmazeId: media.tvmazeId })
    .from(media)
    .where(
      sql`${media.tvmazeId} IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM ${seasons} WHERE ${seasons.mediaId} = ${media.id}
      )`,
    );

  console.log(`Found ${candidates.length} shows without season data`);

  for (const show of candidates) {
    processed++;

    if (processed % 50 === 0) {
      console.log(
        `[${formatDuration(Date.now() - startTime)}] Processed: ${processed}/${candidates.length}, Inserted: ${inserted}, Updated: ${updated}`,
      );
    }

    try {
      const res = await fetch(`https://api.tvmaze.com/shows/${show.tvmazeId}/seasons`);

      if (res.status === 429) {
        console.warn("[tvmaze] Rate limited, waiting 10s...");
        await sleep(10_000);
        const retry = await fetch(`https://api.tvmaze.com/shows/${show.tvmazeId}/seasons`);
        if (!retry.ok) {
          errors++;
          failedShows.push(String(show.tvmazeId));
          continue;
        }
        const data = await retry.json();
        const r = await processShowSeasons(db, show.id, data);
        inserted += r.inserted;
        updated += r.updated;
        continue;
      }

      if (!res.ok) {
        errors++;
        failedShows.push(String(show.tvmazeId));
        continue;
      }

      const data = await res.json();
      const r = await processShowSeasons(db, show.id, data);
      inserted += r.inserted;
      updated += r.updated;

      await sleep(500); // TVMaze rate limit: 20 req/10s
    } catch (err) {
      errors++;
      failedShows.push(String(show.tvmazeId));
      console.error(`  [tvmaze] Error fetching show ${show.tvmazeId}:`, err);
    }
  }

  console.log(`\nTVMaze seasons done in ${formatDuration(Date.now() - startTime)}`);
  console.log(
    `  Processed: ${processed}, Inserted: ${inserted}, Updated: ${updated}, Errors: ${errors}`,
  );
  if (failedShows.length > 0) {
    console.log(`  Failed show IDs: ${failedShows.join(", ")}`);
  }
}

// --- anime-offline-database seasons ---

interface AnimeOfflineEntry {
  sources: string[];
  title: string;
  type: string;
  episodes: number;
  status: string;
}

function extractIdFromSource(sources: string[], pattern: RegExp): string | null {
  for (const src of sources) {
    const match = src.match(pattern);
    if (match) return match[1];
  }
  return null;
}

async function importAnimeOfflineSeasons(db: DbType, filePath: string): Promise<void> {
  console.log(`\nImporting anime seasons from: ${filePath}`);
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    return;
  }

  const startTime = Date.now();

  const entries: AnimeOfflineEntry[] = [];
  const rl = readline.createInterface({
    input: fs.createReadStream(filePath, { encoding: "utf-8" }),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      entries.push(JSON.parse(trimmed));
    } catch {
      /* skip malformed lines */
    }
  }
  console.log(`Loaded ${entries.length} entries from anime-offline-database`);

  let processed = 0;
  let inserted = 0;
  let updated = 0;
  const skipReasons = { noEpisodes: 0, noIds: 0, notInDb: 0, hasSeasons: 0 };

  console.log("Loading existing season media IDs...");
  const existingSeasonRows = await db.selectDistinct({ mediaId: seasons.mediaId }).from(seasons);
  const existingSeasonMediaIds = new Set(existingSeasonRows.map((r) => r.mediaId));
  console.log(`Found ${existingSeasonMediaIds.size} media with existing seasons`);

  console.log("Building malId/anilistId lookup maps...");
  const malIdToMedia = new Map<string, string>();
  const anilistIdToMedia = new Map<string, string>();

  const neededMalIds: string[] = [];
  const neededAnilistIds: string[] = [];
  for (const entry of entries) {
    if (!entry.episodes || entry.episodes <= 0) continue;
    const malId = extractIdFromSource(entry.sources, /myanimelist\.net\/anime\/(\d+)/);
    const anilistId = extractIdFromSource(entry.sources, /anilist\.co\/anime\/(\d+)/);
    if (malId) neededMalIds.push(malId);
    if (anilistId) neededAnilistIds.push(anilistId);
  }

  for (let i = 0; i < neededMalIds.length; i += SEASON_LOOKUP_BATCH) {
    const chunk = neededMalIds.slice(i, i + SEASON_LOOKUP_BATCH);
    const rows = await db
      .select({ id: media.id, malId: media.malId })
      .from(media)
      .where(inArray(media.malId, chunk));
    for (const row of rows) {
      if (row.malId) malIdToMedia.set(row.malId, row.id);
    }
  }
  console.log(`  malId map: ${malIdToMedia.size} entries`);

  for (let i = 0; i < neededAnilistIds.length; i += SEASON_LOOKUP_BATCH) {
    const chunk = neededAnilistIds.slice(i, i + SEASON_LOOKUP_BATCH);
    const rows = await db
      .select({ id: media.id, anilistId: media.anilistId })
      .from(media)
      .where(inArray(media.anilistId, chunk));
    for (const row of rows) {
      if (row.anilistId) anilistIdToMedia.set(row.anilistId, row.id);
    }
  }
  console.log(`  anilistId map: ${anilistIdToMedia.size} entries`);

  let batch: {
    mediaId: string;
    seasonNumber: number;
    episodeCount: number | null;
    title: string | null;
    dataSource: "anime_offline_db";
  }[] = [];

  for (const entry of entries) {
    processed++;

    if (processed % 5000 === 0) {
      console.log(
        `[${formatDuration(Date.now() - startTime)}] Processed: ${processed}/${entries.length}, Inserted: ${inserted}, Updated: ${updated}`,
      );
    }

    if (!entry.episodes || entry.episodes <= 0) {
      skipReasons.noEpisodes++;
      continue;
    }

    const malId = extractIdFromSource(entry.sources, /myanimelist\.net\/anime\/(\d+)/);
    const anilistId = extractIdFromSource(entry.sources, /anilist\.co\/anime\/(\d+)/);

    if (!malId && !anilistId) {
      skipReasons.noIds++;
      continue;
    }

    const mediaId =
      (malId ? malIdToMedia.get(malId) : undefined) ??
      (anilistId ? anilistIdToMedia.get(anilistId) : undefined);

    if (!mediaId) {
      skipReasons.notInDb++;
      continue;
    }

    if (existingSeasonMediaIds.has(mediaId)) {
      skipReasons.hasSeasons++;
      continue;
    }

    batch.push({
      mediaId,
      seasonNumber: 1,
      episodeCount: entry.episodes,
      title: null,
      dataSource: "anime_offline_db",
    });

    existingSeasonMediaIds.add(mediaId);

    if (batch.length >= SEASON_BATCH_SIZE) {
      const r = await withRetry(() => insertSeasonBatch(db, batch), "anime-offline season batch");
      inserted += r.inserted;
      updated += r.updated;
      batch = [];
    }
  }

  if (batch.length > 0) {
    const r = await withRetry(() => insertSeasonBatch(db, batch), "anime-offline season batch");
    inserted += r.inserted;
    updated += r.updated;
  }

  const totalSkipped =
    skipReasons.noEpisodes + skipReasons.noIds + skipReasons.notInDb + skipReasons.hasSeasons;
  console.log(`\nanime-offline-database done in ${formatDuration(Date.now() - startTime)}`);
  console.log(
    `  Processed: ${processed}, Inserted: ${inserted}, Updated: ${updated}, Skipped: ${totalSkipped}`,
  );
  console.log(
    `  Skip reasons: no episodes=${skipReasons.noEpisodes}, no IDs=${skipReasons.noIds}, not in DB=${skipReasons.notInDb}, has seasons=${skipReasons.hasSeasons}`,
  );
}

async function runSeasons(
  db: DbType,
  subsetPath: string | null,
  animeOfflinePath: string | null,
): Promise<void> {
  if (subsetPath) {
    await importWikidataSeasons(db, subsetPath);
  } else {
    console.log("  Skipping Wikidata seasons (no subset file)");
  }

  await importTvmazeSeasons(db);

  if (animeOfflinePath) {
    await importAnimeOfflineSeasons(db, animeOfflinePath);
  } else {
    console.log("  Skipping anime-offline seasons (no file provided)");
  }
}

// ═══ Feature: Cover Art ═════════════════════════════════════════════════════

interface FetchResult {
  url: string | null;
  status?: number;
}

async function fetchTmdbPoster(
  tmdbId: string,
  mediaType: string,
  apiKey: string,
): Promise<FetchResult> {
  const type = mediaType === "movie" ? "movie" : "tv";
  const res = await fetch(`https://api.themoviedb.org/3/${type}/${tmdbId}?api_key=${apiKey}`);
  if (!res.ok) {
    console.warn(`  [tmdb] ${res.status} for ${tmdbId}`);
    return { url: null, status: res.status };
  }
  const data = await res.json();
  return { url: data.poster_path ? `https://image.tmdb.org/t/p/w342${data.poster_path}` : null };
}

async function fetchAniListCover(anilistId: string): Promise<FetchResult> {
  const query = `query ($id: Int) { Media(id: $id, type: ANIME) { coverImage { large } } }`;
  const res = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { id: Number.parseInt(anilistId, 10) } }),
  });
  if (!res.ok) {
    console.warn(`  [anilist] ${res.status} for ${anilistId}`);
    return { url: null, status: res.status };
  }
  const data = await res.json();
  return { url: data.data?.Media?.coverImage?.large ?? null };
}

let twitchAccessToken: string | null = null;

async function getTwitchToken(): Promise<string> {
  if (twitchAccessToken) return twitchAccessToken;

  const clientId = cleanEnv(process.env.TWITCH_CLIENT_ID);
  const clientSecret = cleanEnv(process.env.TWITCH_CLIENT_SECRET);
  if (!clientId || !clientSecret) {
    throw new Error("TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET required for IGDB covers");
  }

  const res = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`,
    { method: "POST" },
  );
  if (!res.ok) throw new Error(`Twitch auth failed: ${res.status}`);
  const data = await res.json();
  twitchAccessToken = data.access_token as string;
  return twitchAccessToken;
}

async function fetchIgdbCover(igdbSlug: string): Promise<FetchResult> {
  const token = await getTwitchToken();
  const clientId = cleanEnv(process.env.TWITCH_CLIENT_ID);

  const res = await fetch("https://api.igdb.com/v4/games", {
    method: "POST",
    headers: {
      "Client-ID": clientId,
      Authorization: `Bearer ${token}`,
    },
    body: `fields cover.url; where slug = "${igdbSlug}"; limit 1;`,
  });
  if (!res.ok) {
    console.warn(`  [igdb] ${res.status} for ${igdbSlug}`);
    return { url: null, status: res.status };
  }
  const data = await res.json();
  const coverUrl = data[0]?.cover?.url;
  if (!coverUrl) return { url: null };
  return {
    url: coverUrl.replace("t_thumb", "t_cover_big").replace(/^\/\//, "https://"),
  };
}

type CoverSource = "tmdb" | "anilist" | "igdb";

interface CoverCandidate {
  id: string;
  wikidataId: string;
  mediaType: string;
  tmdbId: string | null;
  anilistId: string | null;
  igdbId: string | null;
}

interface CoverResult {
  id: string;
  wikidataId: string;
  posterUrl: string;
  source: CoverSource;
}

/** Process items with bounded concurrency + per-item delay for rate limiting. */
async function mapConcurrent<T, R>(
  items: T[],
  concurrency: number,
  delayMs: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
      if (next < items.length) await sleep(delayMs);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

/** Resolve covers for a batch by splitting into per-source queues and running them in parallel. */
async function resolveBatch(
  items: CoverCandidate[],
  tmdbApiKey: string,
  stats: { bySource: Record<CoverSource, number>; failures: Record<CoverSource, number> },
): Promise<CoverResult[]> {
  // Partition items by primary source
  type WithTmdb = CoverCandidate & { tmdbId: string };
  type WithAnilist = CoverCandidate & { anilistId: string };
  type WithIgdb = CoverCandidate & { igdbId: string };

  const tmdbItems: WithTmdb[] = [];
  const anilistItems: WithAnilist[] = [];
  const igdbItems: WithIgdb[] = [];

  for (const item of items) {
    if (item.tmdbId && item.mediaType !== "game") tmdbItems.push(item as WithTmdb);
    else if (item.anilistId && item.mediaType === "anime") anilistItems.push(item as WithAnilist);
    else if (item.igdbId && item.mediaType === "game") igdbItems.push(item as WithIgdb);
  }

  const unmatched = items.length - tmdbItems.length - anilistItems.length - igdbItems.length;
  console.log(
    `  Queued: TMDB ${tmdbItems.length}, AniList ${anilistItems.length}, IGDB ${igdbItems.length}, unmatched ${unmatched}`,
  );

  const results: CoverResult[] = [];
  const tmdbFailedAnime: WithAnilist[] = [];

  // Run all three source queues in parallel
  const [tmdbResults, anilistResults, igdbResults] = await Promise.all([
    mapConcurrent(tmdbItems, COVER_CONCURRENCY_TMDB, 200, async (item) => {
      const r = await fetchTmdbPoster(item.tmdbId, item.mediaType, tmdbApiKey);
      if (r.url)
        return {
          id: item.id,
          wikidataId: item.wikidataId,
          posterUrl: r.url,
          source: "tmdb" as const,
        };
      stats.failures.tmdb++;
      if (item.anilistId && item.mediaType === "anime") tmdbFailedAnime.push(item as WithAnilist);
      return null;
    }),
    mapConcurrent(anilistItems, COVER_CONCURRENCY_ANILIST, 670, async (item) => {
      const r = await fetchAniListCover(item.anilistId);
      if (r.url)
        return {
          id: item.id,
          wikidataId: item.wikidataId,
          posterUrl: r.url,
          source: "anilist" as const,
        };
      stats.failures.anilist++;
      return null;
    }),
    mapConcurrent(igdbItems, COVER_CONCURRENCY_IGDB, 300, async (item) => {
      const r = await fetchIgdbCover(item.igdbId);
      if (r.url)
        return {
          id: item.id,
          wikidataId: item.wikidataId,
          posterUrl: r.url,
          source: "igdb" as const,
        };
      stats.failures.igdb++;
      return null;
    }),
  ]);

  for (const r of tmdbResults) if (r) results.push(r);
  for (const r of anilistResults) if (r) results.push(r);
  for (const r of igdbResults) if (r) results.push(r);

  // AniList fallback for anime that failed TMDB
  if (tmdbFailedAnime.length > 0) {
    const fallbackResults = await mapConcurrent(
      tmdbFailedAnime,
      COVER_CONCURRENCY_ANILIST,
      670,
      async (item) => {
        const r = await fetchAniListCover(item.anilistId);
        if (r.url)
          return {
            id: item.id,
            wikidataId: item.wikidataId,
            posterUrl: r.url,
            source: "anilist" as const,
          };
        stats.failures.anilist++;
        return null;
      },
    );
    for (const r of fallbackResults) if (r) results.push(r);
  }

  // Track source counts
  for (const r of results) stats.bySource[r.source]++;

  return results;
}

async function batchUpdatePosters(
  db: DbType,
  updates: { id: string; posterUrl: string }[],
): Promise<void> {
  if (updates.length === 0) return;
  const values = updates
    .map((u) => `(${escapePostgresLiteral(u.id)}, ${escapePostgresLiteral(u.posterUrl)})`)
    .join(", ");
  await db.execute(
    sql.raw(
      `UPDATE media SET poster_url = v.url, updated_at = now()
     FROM (VALUES ${values}) AS v(id, url)
     WHERE media.id = v.id`,
    ),
  );
}

async function runCovers(db: DbType): Promise<void> {
  const tmdbApiKey = cleanEnv(process.env.TMDB_API_KEY);
  if (!tmdbApiKey) {
    console.error("TMDB_API_KEY required for cover art — skipping");
    return;
  }

  console.log("\nFetching media without cover art...");

  let processed = 0;
  let resolved = 0;
  let lastId = "";
  const startTime = Date.now();
  const stats = {
    bySource: { tmdb: 0, anilist: 0, igdb: 0 } as Record<CoverSource, number>,
    failures: { tmdb: 0, anilist: 0, igdb: 0 } as Record<CoverSource, number>,
  };

  while (true) {
    const candidates = await db
      .select({
        id: media.id,
        wikidataId: media.wikidataId,
        mediaType: media.mediaType,
        tmdbId: media.tmdbId,
        anilistId: media.anilistId,
        igdbId: media.igdbId,
      })
      .from(media)
      .where(
        sql`${media.posterUrl} IS NULL AND ${media.id} > ${lastId} AND (${media.tmdbId} IS NOT NULL OR ${media.anilistId} IS NOT NULL OR ${media.igdbId} IS NOT NULL)`,
      )
      .orderBy(sql`${media.id} ASC`)
      .limit(COVER_BATCH_SIZE);

    if (candidates.length === 0) break;
    lastId = candidates[candidates.length - 1].id;
    processed += candidates.length;

    const results = await resolveBatch(candidates, tmdbApiKey, stats);
    resolved += results.length;

    if (results.length > 0) {
      await batchUpdatePosters(
        db,
        results.map((r) => ({ id: r.id, posterUrl: r.posterUrl })),
      );
    }

    console.log(
      `[${formatDuration(Date.now() - startTime)}] Processed: ${processed}, Resolved: ${resolved}, No cover: ${processed - resolved} | Failures: TMDB ${stats.failures.tmdb}, AniList ${stats.failures.anilist}, IGDB ${stats.failures.igdb}`,
    );
  }

  console.log(`\nCover art done in ${formatDuration(Date.now() - startTime)}`);
  console.log(
    `  Processed: ${processed}, Resolved: ${resolved}, No cover: ${processed - resolved}`,
  );
  console.log(
    `  By source: TMDB ${stats.bySource.tmdb}, AniList ${stats.bySource.anilist}, IGDB ${stats.bySource.igdb}`,
  );
  console.log(
    `  Failures:  TMDB ${stats.failures.tmdb}, AniList ${stats.failures.anilist}, IGDB ${stats.failures.igdb}`,
  );
}

// ═══ Step Runner + Summary ══════════════════════════════════════════════════

interface StepResult {
  label: string;
  status: "ok" | "skipped" | "failed";
  elapsed: string;
}

function printSummary(results: StepResult[], startTime: number) {
  const totalElapsed = formatDuration(Date.now() - startTime);
  console.log(`\n${"=".repeat(60)}`);
  console.log("  SUMMARY");
  console.log("=".repeat(60));
  for (const r of results) {
    const icon = r.status === "ok" ? "+" : r.status === "skipped" ? "-" : "!";
    const tag = r.status === "ok" ? "OK" : r.status === "skipped" ? "SKIP" : "FAIL";
    console.log(`  [${icon}] ${tag.padEnd(4)} ${r.elapsed.padStart(7)}  ${r.label}`);
  }
  console.log("-".repeat(60));
  console.log(`  Total: ${totalElapsed}`);
  console.log("=".repeat(60));
}

// ═══ CLI + Interactive Menu ═════════════════════════════════════════════════

interface RunConfig {
  features: Feature[];
  subsetPath: string | null;
  qrankPath: string | null;
  animeOfflinePath: string | null;
  reset: boolean;
  limit: number;
  batchSize: number;
}

function parseCliArgs(): RunConfig | "interactive" {
  const args = process.argv.slice(2);

  if (!args.includes("--all")) return "interactive";

  const reset = args.includes("--reset");
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Number.parseInt(limitArg.split("=")[1], 10) : Infinity;
  const batchArg = args.find((a) => a.startsWith("--batch="));
  const batchSize = batchArg ? Number.parseInt(batchArg.split("=")[1], 10) : DEFAULT_BATCH_SIZE;

  const subsetArg = args.find((a) => a.startsWith("--subset="));
  const subsetPath = subsetArg ? subsetArg.split("=")[1] : autoDetect(AUTO_PATHS.subset);
  const qrankArg = args.find((a) => a.startsWith("--qrank="));
  const qrankPath = qrankArg ? qrankArg.split("=")[1] : autoDetect(AUTO_PATHS.qrank);
  const animeArg = args.find((a) => a.startsWith("--anime-offline="));
  const animeOfflinePath = animeArg ? animeArg.split("=")[1] : autoDetect(AUTO_PATHS.animeOffline);

  const features: Feature[] = ["media", "percentiles", "seasons", "covers"];

  // Only include media if subset exists
  if (!subsetPath) {
    const idx = features.indexOf("media");
    if (idx !== -1) features.splice(idx, 1);
  }

  return { features, subsetPath, qrankPath, animeOfflinePath, reset, limit, batchSize };
}

async function interactiveMenu(): Promise<RunConfig> {
  clack.intro("donguri import:update");

  const featuresResult = await clack.multiselect<Feature>({
    message: "What to update?",
    options: [
      {
        value: "media" as const,
        label: FEATURE_LABELS.media,
        hint: autoDetect(AUTO_PATHS.subset) ? "subset.ndjson detected" : "needs subset.ndjson",
      },
      {
        value: "percentiles" as const,
        label: FEATURE_LABELS.percentiles,
        hint: autoDetect(AUTO_PATHS.qrank) ? "qrank detected" : "sitelinks only",
      },
      { value: "seasons" as const, label: FEATURE_LABELS.seasons },
      { value: "covers" as const, label: FEATURE_LABELS.covers },
    ],
    initialValues: ["percentiles", "seasons", "covers"] as Feature[],
    required: true,
  });

  if (clack.isCancel(featuresResult)) {
    clack.cancel("Cancelled.");
    process.exit(0);
  }

  const features = featuresResult as Feature[];
  let subsetPath: string | null = null;
  let qrankPath: string | null = null;
  let animeOfflinePath: string | null = null;

  // Prompt for subset if media or wikidata seasons needed
  if (features.includes("media") || features.includes("seasons")) {
    const detected = autoDetect(AUTO_PATHS.subset);
    const subsetResult = await clack.text({
      message: "Subset NDJSON path (leave empty to skip Wikidata sources)",
      placeholder: detected ?? "data/subset.ndjson",
      defaultValue: detected ?? "",
    });
    if (clack.isCancel(subsetResult)) {
      clack.cancel("Cancelled.");
      process.exit(0);
    }
    subsetPath = (subsetResult as string) || null;
  }

  // Prompt for QRank if percentiles selected
  if (features.includes("percentiles") || features.includes("media")) {
    const detected = autoDetect(AUTO_PATHS.qrank);
    const qrankResult = await clack.text({
      message: "QRank CSV path (leave empty to skip QRank)",
      placeholder: detected ?? "data/qrank.csv.gz",
      defaultValue: detected ?? "",
    });
    if (clack.isCancel(qrankResult)) {
      clack.cancel("Cancelled.");
      process.exit(0);
    }
    qrankPath = (qrankResult as string) || null;
  }

  // Prompt for anime-offline if seasons selected
  if (features.includes("seasons")) {
    const detected = autoDetect(AUTO_PATHS.animeOffline);
    const animeResult = await clack.text({
      message: "anime-offline JSONL path (leave empty to skip)",
      placeholder: detected ?? "data/anime-offline-database.jsonl",
      defaultValue: detected ?? "",
    });
    if (clack.isCancel(animeResult)) {
      clack.cancel("Cancelled.");
      process.exit(0);
    }
    animeOfflinePath = (animeResult as string) || null;
  }

  return {
    features,
    subsetPath,
    qrankPath,
    animeOfflinePath,
    reset: false,
    limit: Infinity,
    batchSize: DEFAULT_BATCH_SIZE,
  };
}

// ═══ Main ═══════════════════════════════════════════════════════════════════

async function main() {
  const cliResult = parseCliArgs();
  const config = cliResult === "interactive" ? await interactiveMenu() : cliResult;

  const db = getDb();
  const results: StepResult[] = [];
  const startTime = Date.now();

  // Validate paths early
  if (config.subsetPath && !fs.existsSync(config.subsetPath)) {
    console.error(`Subset file not found: ${config.subsetPath}`);
    process.exit(1);
  }
  if (config.qrankPath && !fs.existsSync(config.qrankPath)) {
    console.error(`QRank file not found: ${config.qrankPath}`);
    process.exit(1);
  }
  if (config.animeOfflinePath && !fs.existsSync(config.animeOfflinePath)) {
    console.error(`anime-offline file not found: ${config.animeOfflinePath}`);
    process.exit(1);
  }

  console.log(`\nRunning ${config.features.length} step(s): ${config.features.join(", ")}`);

  for (const feature of config.features) {
    const label = FEATURE_LABELS[feature];
    console.log(`\n${"=".repeat(60)}`);
    console.log(label);
    console.log("=".repeat(60));

    const stepStart = Date.now();

    try {
      switch (feature) {
        case "media":
          if (!config.subsetPath) {
            console.log("  No subset file — skipping media import");
            results.push({ label, status: "skipped", elapsed: "-" });
            continue;
          }
          await runMediaImport(db, {
            subsetPath: config.subsetPath,
            reset: config.reset,
            limit: config.limit,
            batchSize: config.batchSize,
            qrankPath: config.qrankPath,
          });
          break;
        case "percentiles":
          await runPercentiles(db, config.qrankPath);
          break;
        case "seasons":
          await runSeasons(db, config.subsetPath, config.animeOfflinePath);
          break;
        case "covers":
          await runCovers(db);
          break;
      }

      const elapsed = formatDuration(Date.now() - stepStart);
      console.log(`\n  -> ${label} completed in ${elapsed}`);
      results.push({ label, status: "ok", elapsed });
    } catch (err) {
      const elapsed = formatDuration(Date.now() - stepStart);
      results.push({ label, status: "failed", elapsed });
      console.error(`\n  "${label}" failed:`, err);
      printSummary(results, startTime);
      await db.$client.end();
      process.exit(1);
    }
  }

  printSummary(results, startTime);
  await db.$client.end();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
