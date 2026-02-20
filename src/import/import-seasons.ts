/**
 * Import season data from 3 sources into the `seasons` table.
 *
 * Usage:
 *   bun run src/import/import-seasons.ts tvmaze [--limit=N]
 *   bun run src/import/import-seasons.ts anime-offline <file.jsonl> [--limit=N]
 *   bun run src/import/import-seasons.ts wikidata <file.ndjson> [--limit=N]
 *
 * All inserts use ON CONFLICT (media_id, season_number) DO NOTHING — first source wins.
 */

import fs from "node:fs";
import readline from "node:readline";
import { inArray, sql } from "drizzle-orm";
import { createImportDb } from "../db";
import { media, seasons } from "../db/schema";
import { formatDuration, withRetry } from "./_retry";
import type { ParsedSeason, WikibaseEntityIdValue, WikidataEntity } from "./_types";
import { WikidataProperties } from "./_types";

const BATCH_SIZE = 200;
const LOOKUP_BATCH = 500;

type DbType = ReturnType<typeof createImportDb>["db"];

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

async function insertSeasonBatch(
  db: DbType,
  batch: {
    mediaId: string;
    seasonNumber: number;
    episodeCount: number | null;
    title: string | null;
    dataSource: "wikidata" | "tvmaze" | "anime_offline_db";
  }[],
): Promise<number> {
  if (batch.length === 0) return 0;
  // Dedupe within batch — last occurrence wins (same key can appear multiple times in Wikidata)
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
    .returning({ id: seasons.id });
  return result.length;
}

// ─── Wikidata import ────────────────────────────────────────────────────────

function parseSeasonEntity(entity: WikidataEntity): ParsedSeason | null {
  const P = WikidataProperties;

  // Get parent series via P179
  const seriesClaims = entity.claims?.[P.PART_OF_SERIES];
  if (!seriesClaims || seriesClaims.length === 0) return null;

  const seriesClaim = seriesClaims[0];
  if (
    seriesClaim.mainsnak.snaktype !== "value" ||
    seriesClaim.mainsnak.datavalue?.type !== "wikibase-entityid"
  )
    return null;
  const seriesWikidataId = (seriesClaim.mainsnak.datavalue as WikibaseEntityIdValue).value.id;

  // Get season ordinal from P1545 qualifier on P179
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

  // Get episode count from P1113
  let episodeCount: number | null = null;
  const epClaims = entity.claims?.[P.EPISODE_COUNT];
  if (epClaims && epClaims.length > 0) {
    const ep = epClaims[0];
    if (ep.mainsnak.snaktype === "value" && ep.mainsnak.datavalue?.type === "quantity") {
      const amount = Number.parseFloat(ep.mainsnak.datavalue.value.amount);
      if (!Number.isNaN(amount)) episodeCount = Math.round(amount);
    }
  }

  // Get title
  const title = entity.labels?.en?.value ?? null;

  return { seriesWikidataId, seasonNumber, episodeCount, title };
}

/** Batch-resolve wikidataIds to media IDs, populating the cache. */
async function flushWikidataLookups(
  db: DbType,
  pendingLookups: Set<string>,
  cache: Map<string, string>,
): Promise<void> {
  if (pendingLookups.size === 0) return;
  const ids = [...pendingLookups];
  // Query in chunks of LOOKUP_BATCH to avoid overly large IN clauses
  for (let i = 0; i < ids.length; i += LOOKUP_BATCH) {
    const chunk = ids.slice(i, i + LOOKUP_BATCH);
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

async function importWikidata(db: DbType, filePath: string, limit: number) {
  console.log(`\nImporting Wikidata seasons from: ${filePath}`);

  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  const startTime = Date.now();
  let processed = 0;
  let inserted = 0;
  let skipped = 0;
  const errors = 0;

  // Build a lookup cache: wikidataId → mediaId
  const wikidataToMediaId = new Map<string, string>();
  // Batch-miss buffer: collect unknown wikidataIds, resolve in bulk
  const pendingLookups = new Set<string>();
  // Hold parsed seasons until their series lookup is resolved
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

    // Insert any full batches
    while (batch.length >= BATCH_SIZE) {
      const chunk = batch.splice(0, BATCH_SIZE);
      inserted += await withRetry(() => insertSeasonBatch(db, chunk), "wikidata season batch");
    }
  }

  for await (const line of rl) {
    if (inserted >= limit) break;

    const entity = parseJsonLine(line);
    if (!entity) continue;

    processed++;

    if (processed % 1000 === 0) {
      console.log(
        `[${formatDuration(Date.now() - startTime)}] Processed: ${processed}, Inserted: ${inserted}, Skipped: ${skipped}`,
      );
    }

    const parsed = parseSeasonEntity(entity);
    if (!parsed) {
      skipped++;
      continue;
    }

    // If already cached, add directly to batch
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
      // Queue for batch lookup
      pendingLookups.add(parsed.seriesWikidataId);
      pendingSeasons.push(parsed);
    }

    // When we've accumulated enough pending lookups, flush them
    if (pendingLookups.size >= LOOKUP_BATCH) {
      await drainPendingSeasons();
    }

    // Insert full batches
    if (batch.length >= BATCH_SIZE) {
      inserted += await withRetry(() => insertSeasonBatch(db, batch), "wikidata season batch");
      batch = [];
    }
  }

  // Flush remaining pending lookups and seasons
  await drainPendingSeasons();

  if (batch.length > 0) {
    inserted += await withRetry(() => insertSeasonBatch(db, batch), "wikidata season batch");
  }

  console.log(`\nWikidata seasons done in ${formatDuration(Date.now() - startTime)}`);
  console.log(
    `  Processed: ${processed}, Inserted: ${inserted}, Skipped: ${skipped}, Errors: ${errors}`,
  );
}

// ─── TVMaze import ──────────────────────────────────────────────────────────

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function importTvmaze(db: DbType, limit: number) {
  console.log("\nImporting seasons from TVMaze API...");

  const startTime = Date.now();
  let processed = 0;
  let inserted = 0;
  let errors = 0;

  // Find media with tvmazeId that have no season rows yet
  const candidates = await db
    .select({ id: media.id, tvmazeId: media.tvmazeId })
    .from(media)
    .where(
      sql`${media.tvmazeId} IS NOT NULL AND NOT EXISTS (
				SELECT 1 FROM ${seasons} WHERE ${seasons.mediaId} = ${media.id}
			)`,
    )
    .limit(limit);

  console.log(`Found ${candidates.length} shows without season data`);

  for (const show of candidates) {
    processed++;

    if (processed % 50 === 0) {
      console.log(
        `[${formatDuration(Date.now() - startTime)}] Processed: ${processed}/${candidates.length}, Inserted: ${inserted}`,
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
          continue;
        }
        const data = await retry.json();
        await processShowSeasons(db, show.id, data);
        inserted += data.length;
        continue;
      }

      if (!res.ok) {
        errors++;
        continue;
      }

      const data = await res.json();
      const count = await processShowSeasons(db, show.id, data);
      inserted += count;

      // TVMaze rate limit: 20 requests per 10 seconds
      await sleep(500);
    } catch (err) {
      errors++;
      console.error(`Error fetching show ${show.tvmazeId}:`, err);
    }
  }

  console.log(`\nTVMaze seasons done in ${formatDuration(Date.now() - startTime)}`);
  console.log(`  Processed: ${processed}, Inserted: ${inserted}, Errors: ${errors}`);
}

interface TvmazeSeason {
  number: number | null;
  episodeOrder: number | null;
  name: string;
}

async function processShowSeasons(
  db: DbType,
  mediaId: string,
  apiSeasons: TvmazeSeason[],
): Promise<number> {
  const batch = apiSeasons
    .filter((s): s is TvmazeSeason & { number: number } => s.number !== null)
    .map((s) => ({
      mediaId,
      seasonNumber: s.number,
      episodeCount: s.episodeOrder ?? null,
      title: s.name || null,
      dataSource: "tvmaze" as const,
    }));

  if (batch.length === 0) return 0;
  return withRetry(() => insertSeasonBatch(db, batch), "tvmaze season batch");
}

// ─── anime-offline-database import ──────────────────────────────────────────

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

async function importAnimeOffline(db: DbType, filePath: string, limit: number) {
  console.log(`\nImporting anime seasons from: ${filePath}`);

  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  const startTime = Date.now();

  // Stream JSONL (one entry per line)
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
  let skipped = 0;
  const errors = 0;

  // Pre-load set of media IDs that already have season rows (seasons table is small)
  console.log("Loading existing season media IDs...");
  const existingSeasonRows = await db.selectDistinct({ mediaId: seasons.mediaId }).from(seasons);
  const existingSeasonMediaIds = new Set(existingSeasonRows.map((r) => r.mediaId));
  console.log(`Found ${existingSeasonMediaIds.size} media with existing seasons`);

  // Pre-load malId → mediaId and anilistId → mediaId lookup maps via batch queries
  console.log("Building malId/anilistId lookup maps...");
  const malIdToMedia = new Map<string, string>();
  const anilistIdToMedia = new Map<string, string>();

  // Collect all IDs we need to look up
  const neededMalIds: string[] = [];
  const neededAnilistIds: string[] = [];
  for (const entry of entries) {
    if (!entry.episodes || entry.episodes <= 0) continue;
    const malId = extractIdFromSource(entry.sources, /myanimelist\.net\/anime\/(\d+)/);
    const anilistId = extractIdFromSource(entry.sources, /anilist\.co\/anime\/(\d+)/);
    if (malId) neededMalIds.push(malId);
    if (anilistId) neededAnilistIds.push(anilistId);
  }

  // Batch query malIds
  for (let i = 0; i < neededMalIds.length; i += LOOKUP_BATCH) {
    const chunk = neededMalIds.slice(i, i + LOOKUP_BATCH);
    const rows = await db
      .select({ id: media.id, malId: media.malId })
      .from(media)
      .where(inArray(media.malId, chunk));
    for (const row of rows) {
      if (row.malId) malIdToMedia.set(row.malId, row.id);
    }
  }
  console.log(`  malId map: ${malIdToMedia.size} entries`);

  // Batch query anilistIds
  for (let i = 0; i < neededAnilistIds.length; i += LOOKUP_BATCH) {
    const chunk = neededAnilistIds.slice(i, i + LOOKUP_BATCH);
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
    if (inserted >= limit) break;

    processed++;

    if (processed % 5000 === 0) {
      console.log(
        `[${formatDuration(Date.now() - startTime)}] Processed: ${processed}/${entries.length}, Inserted: ${inserted}`,
      );
    }

    if (!entry.episodes || entry.episodes <= 0) {
      skipped++;
      continue;
    }

    const malId = extractIdFromSource(entry.sources, /myanimelist\.net\/anime\/(\d+)/);
    const anilistId = extractIdFromSource(entry.sources, /anilist\.co\/anime\/(\d+)/);

    if (!malId && !anilistId) {
      skipped++;
      continue;
    }

    // Look up media ID from pre-built maps
    const mediaId =
      (malId ? malIdToMedia.get(malId) : undefined) ??
      (anilistId ? anilistIdToMedia.get(anilistId) : undefined);

    if (!mediaId || existingSeasonMediaIds.has(mediaId)) {
      skipped++;
      continue;
    }

    batch.push({
      mediaId,
      seasonNumber: 1,
      episodeCount: entry.episodes,
      title: null,
      dataSource: "anime_offline_db",
    });

    // Mark as having seasons now to avoid duplicates within this run
    existingSeasonMediaIds.add(mediaId);

    if (batch.length >= BATCH_SIZE) {
      inserted += await withRetry(() => insertSeasonBatch(db, batch), "anime-offline season batch");
      batch = [];
    }
  }

  if (batch.length > 0) {
    inserted += await withRetry(() => insertSeasonBatch(db, batch), "anime-offline season batch");
  }

  console.log(`\nanime-offline-database done in ${formatDuration(Date.now() - startTime)}`);
  console.log(
    `  Processed: ${processed}, Inserted: ${inserted}, Skipped: ${skipped}, Errors: ${errors}`,
  );
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const subcommand = args[0];

  if (!subcommand || !["wikidata", "tvmaze", "anime-offline"].includes(subcommand)) {
    console.error(
      "Usage:\n" +
        "  bun run src/import/import-seasons.ts wikidata <file.ndjson> [--limit=N]\n" +
        "  bun run src/import/import-seasons.ts tvmaze [--limit=N]\n" +
        "  bun run src/import/import-seasons.ts anime-offline <file.jsonl> [--limit=N]",
    );
    process.exit(1);
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL required");
    process.exit(1);
  }

  const limitArg = args.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Number.parseInt(limitArg.split("=")[1], 10) : Infinity;

  const { db } = createImportDb(url);

  switch (subcommand) {
    case "wikidata": {
      const filePath = args[1];
      if (!filePath || filePath.startsWith("--")) {
        console.error("Usage: bun run src/import/import-seasons.ts wikidata <file.ndjson>");
        process.exit(1);
      }
      await importWikidata(db, filePath, limit);
      break;
    }
    case "tvmaze":
      await importTvmaze(db, limit);
      break;
    case "anime-offline": {
      const filePath = args[1];
      if (!filePath || filePath.startsWith("--")) {
        console.error("Usage: bun run src/import/import-seasons.ts anime-offline <file.jsonl>");
        process.exit(1);
      }
      await importAnimeOffline(db, filePath, limit);
      break;
    }
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
