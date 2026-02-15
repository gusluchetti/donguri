/**
 * Import season data from 3 sources into the `seasons` table.
 *
 * Usage:
 *   bun run src/import/import-seasons.ts tvmaze [--limit=N]
 *   bun run src/import/import-seasons.ts anime-offline <file.json> [--limit=N]
 *   bun run src/import/import-seasons.ts wikidata <file.ndjson> [--limit=N]
 *
 * All inserts use ON CONFLICT (media_id, season_number) DO NOTHING — first source wins.
 */

import fs from "node:fs";
import readline from "node:readline";
import { eq, sql } from "drizzle-orm";
import { createDb } from "../db";
import { media, seasons } from "../db/schema";
import type { ParsedSeason, WikibaseEntityIdValue, WikidataEntity } from "./_types";
import { WikidataProperties } from "./_types";

const BATCH_SIZE = 200;

type DbType = ReturnType<typeof createDb>;

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000) % 60;
  const minutes = Math.floor(ms / 60000) % 60;
  const hours = Math.floor(ms / 3600000);
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
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
  const result = await db
    .insert(seasons)
    .values(batch)
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
  let errors = 0;

  // Build a lookup cache: wikidataId → mediaId
  const wikidataToMediaId = new Map<string, string>();

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

    // Resolve series wikidataId → media.id
    let mediaId = wikidataToMediaId.get(parsed.seriesWikidataId);
    if (!mediaId) {
      const [row] = await db
        .select({ id: media.id })
        .from(media)
        .where(eq(media.wikidataId, parsed.seriesWikidataId))
        .limit(1);
      if (!row) {
        skipped++;
        continue;
      }
      mediaId = row.id;
      wikidataToMediaId.set(parsed.seriesWikidataId, mediaId);
    }

    batch.push({
      mediaId,
      seasonNumber: parsed.seasonNumber,
      episodeCount: parsed.episodeCount,
      title: parsed.title,
      dataSource: "wikidata",
    });

    if (batch.length >= BATCH_SIZE) {
      try {
        inserted += await insertSeasonBatch(db, batch);
      } catch (err) {
        errors++;
        console.error("Batch error:", err);
      }
      batch = [];
    }
  }

  if (batch.length > 0) {
    try {
      inserted += await insertSeasonBatch(db, batch);
    } catch (err) {
      errors++;
      console.error("Batch error:", err);
    }
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
  return insertSeasonBatch(db, batch);
}

// ─── anime-offline-database import ──────────────────────────────────────────

interface AnimeOfflineEntry {
  sources: string[];
  title: string;
  type: string;
  episodes: number;
  status: string;
}

interface AnimeOfflineData {
  data: AnimeOfflineEntry[];
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
  const raw = fs.readFileSync(filePath, "utf-8");
  const data: AnimeOfflineData = JSON.parse(raw);
  console.log(`Loaded ${data.data.length} entries from anime-offline-database`);

  let processed = 0;
  let inserted = 0;
  let skipped = 0;
  let errors = 0;

  let batch: {
    mediaId: string;
    seasonNumber: number;
    episodeCount: number | null;
    title: string | null;
    dataSource: "anime_offline_db";
  }[] = [];

  for (const entry of data.data) {
    if (inserted >= limit) break;

    processed++;

    if (processed % 5000 === 0) {
      console.log(
        `[${formatDuration(Date.now() - startTime)}] Processed: ${processed}/${data.data.length}, Inserted: ${inserted}`,
      );
    }

    if (!entry.episodes || entry.episodes <= 0) {
      skipped++;
      continue;
    }

    // Extract MAL and AniList IDs from sources
    const malId = extractIdFromSource(entry.sources, /myanimelist\.net\/anime\/(\d+)/);
    const anilistId = extractIdFromSource(entry.sources, /anilist\.co\/anime\/(\d+)/);

    if (!malId && !anilistId) {
      skipped++;
      continue;
    }

    // Find matching media row
    let mediaRow: { id: string } | undefined;

    if (malId) {
      [mediaRow] = await db
        .select({ id: media.id })
        .from(media)
        .where(
          sql`${media.malId} = ${malId} AND NOT EXISTS (
						SELECT 1 FROM ${seasons} WHERE ${seasons.mediaId} = ${media.id}
					)`,
        )
        .limit(1);
    }

    if (!mediaRow && anilistId) {
      [mediaRow] = await db
        .select({ id: media.id })
        .from(media)
        .where(
          sql`${media.anilistId} = ${anilistId} AND NOT EXISTS (
						SELECT 1 FROM ${seasons} WHERE ${seasons.mediaId} = ${media.id}
					)`,
        )
        .limit(1);
    }

    if (!mediaRow) {
      skipped++;
      continue;
    }

    batch.push({
      mediaId: mediaRow.id,
      seasonNumber: 1,
      episodeCount: entry.episodes,
      title: null,
      dataSource: "anime_offline_db",
    });

    if (batch.length >= BATCH_SIZE) {
      try {
        inserted += await insertSeasonBatch(db, batch);
      } catch (err) {
        errors++;
        console.error("Batch error:", err);
      }
      batch = [];
    }
  }

  if (batch.length > 0) {
    try {
      inserted += await insertSeasonBatch(db, batch);
    } catch (err) {
      errors++;
      console.error("Batch error:", err);
    }
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
        "  bun run src/import/import-seasons.ts anime-offline <file.json> [--limit=N]",
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

  const db = createDb(url);

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
        console.error("Usage: bun run src/import/import-seasons.ts anime-offline <file.json>");
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
