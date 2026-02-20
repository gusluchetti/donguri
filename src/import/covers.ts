/**
 * Resolve cover art URLs from TMDB, AniList, and IGDB — hotlink directly.
 *
 * Usage:
 *   bun run src/import/covers.ts [--limit=N] [--type=movie|tv_series|anime|game]
 *
 * Required env vars:
 *   TMDB_API_KEY
 * Optional (for games):
 *   TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET
 */

import { sql } from "drizzle-orm";
import { cleanEnv, createImportDb } from "../db";
import { media } from "../db/schema";
import { formatDuration } from "./_retry";

const BATCH_SIZE = 50;

type ImportDb = ReturnType<typeof createImportDb>;
type RawClient = ImportDb["client"];

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── TMDB ───────────────────────────────────────────────────────────────────

async function fetchTmdbPoster(
  tmdbId: string,
  mediaType: string,
  apiKey: string,
): Promise<string | null> {
  const type = mediaType === "movie" ? "movie" : "tv";
  const res = await fetch(`https://api.themoviedb.org/3/${type}/${tmdbId}?api_key=${apiKey}`);
  if (!res.ok) return null;
  const data = await res.json();
  return data.poster_path ? `https://image.tmdb.org/t/p/w342${data.poster_path}` : null;
}

// ─── AniList ────────────────────────────────────────────────────────────────

async function fetchAniListCover(anilistId: string): Promise<string | null> {
  const query = `query ($id: Int) { Media(id: $id, type: ANIME) { coverImage { large } } }`;
  const res = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { id: Number.parseInt(anilistId, 10) } }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.data?.Media?.coverImage?.large ?? null;
}

// ─── IGDB ───────────────────────────────────────────────────────────────────

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

async function fetchIgdbCover(igdbId: string): Promise<string | null> {
  const token = await getTwitchToken();
  const clientId = cleanEnv(process.env.TWITCH_CLIENT_ID);

  const res = await fetch("https://api.igdb.com/v4/covers", {
    method: "POST",
    headers: {
      "Client-ID": clientId,
      Authorization: `Bearer ${token}`,
    },
    body: `fields url; where game = ${igdbId}; limit 1;`,
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data[0]?.url) return null;
  // IGDB returns //images.igdb.com/... — upgrade to https and get larger size
  return data[0].url.replace("t_thumb", "t_cover_big").replace(/^\/\//, "https://");
}

// ─── URL resolution ─────────────────────────────────────────────────────────

type CoverSource = "tmdb" | "anilist" | "igdb";

interface ResolveResult {
  url: string;
  source: CoverSource;
}

async function resolveUrl(
  item: {
    wikidataId: string;
    mediaType: string;
    tmdbId: string | null;
    anilistId: string | null;
    igdbId: string | null;
  },
  tmdbApiKey: string,
  failures: Record<CoverSource, number>,
): Promise<ResolveResult | null> {
  // Try TMDB first (movies, TV, anime)
  if (item.tmdbId && item.mediaType !== "game") {
    const url = await fetchTmdbPoster(item.tmdbId, item.mediaType, tmdbApiKey);
    await sleep(250); // TMDB: ~40 req/10s
    if (url) return { url, source: "tmdb" };
    failures.tmdb++;
    console.warn(`  [tmdb] No poster for ${item.wikidataId} (tmdb:${item.tmdbId})`);
  }

  // AniList fallback for anime
  if (item.anilistId && item.mediaType === "anime") {
    const url = await fetchAniListCover(item.anilistId);
    await sleep(670); // AniList: ~90 req/min
    if (url) return { url, source: "anilist" };
    failures.anilist++;
    console.warn(`  [anilist] No cover for ${item.wikidataId} (anilist:${item.anilistId})`);
  }

  // IGDB for games
  if (item.igdbId && item.mediaType === "game") {
    const url = await fetchIgdbCover(item.igdbId);
    await sleep(250); // IGDB: 4 req/s
    if (url) return { url, source: "igdb" };
    failures.igdb++;
    console.warn(`  [igdb] No cover for ${item.wikidataId} (igdb:${item.igdbId})`);
  }

  return null;
}

// ─── Batch update ────────────────────────────────────────────────────────────

async function batchUpdatePosters(
  rawClient: RawClient,
  updates: { id: string; posterUrl: string }[],
): Promise<void> {
  if (updates.length === 0) return;
  // Build VALUES list with parameterized-style escaping via postgres.js
  const values = updates
    .map((u) => `(${escapePostgresLiteral(u.id)}, ${escapePostgresLiteral(u.posterUrl)})`)
    .join(", ");
  await rawClient.unsafe(
    `UPDATE media SET poster_url = v.url, updated_at = now()
     FROM (VALUES ${values}) AS v(id, url)
     WHERE media.id = v.id`,
  );
}

function escapePostgresLiteral(str: string): string {
  return `'${str.replace(/'/g, "''")}'`;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Number.parseInt(limitArg.split("=")[1], 10) : Infinity;
  const typeArg = args.find((a) => a.startsWith("--type="));
  const filterType = typeArg ? typeArg.split("=")[1] : undefined;

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL required");
    process.exit(1);
  }

  const tmdbApiKey = cleanEnv(process.env.TMDB_API_KEY);
  if (!tmdbApiKey) {
    console.error("TMDB_API_KEY required");
    process.exit(1);
  }

  const { db, client: rawClient } = createImportDb(url);

  console.log("Fetching media without cover art...");

  let processed = 0;
  let resolved = 0;
  let skipped = 0;
  let lastId = ""; // Cursor: fetch rows with id > lastId
  const startTime = Date.now();
  const bySource: Record<CoverSource, number> = { tmdb: 0, anilist: 0, igdb: 0 };
  const failures: Record<CoverSource, number> = { tmdb: 0, anilist: 0, igdb: 0 };

  while (processed < limit) {
    const batchLimit = Math.min(BATCH_SIZE, limit - processed);
    const typeCondition = filterType ? sql`${media.mediaType} = ${filterType}` : sql`1=1`;

    // Cursor pagination: WHERE id > lastId (stable, no offset scan)
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
        sql`${media.posterUrl} IS NULL AND ${media.id} > ${lastId} AND (${media.tmdbId} IS NOT NULL OR ${media.anilistId} IS NOT NULL OR ${media.igdbId} IS NOT NULL) AND ${typeCondition}`,
      )
      .orderBy(sql`${media.id} ASC`)
      .limit(batchLimit);

    if (candidates.length === 0) break;
    lastId = candidates[candidates.length - 1].id;

    // Resolve URLs for this batch, collect updates
    const updates: { id: string; posterUrl: string }[] = [];

    for (const item of candidates) {
      if (processed >= limit) break;
      processed++;

      const result = await resolveUrl(item, tmdbApiKey, failures);
      if (result) {
        updates.push({ id: item.id, posterUrl: result.url });
        bySource[result.source]++;
        resolved++;
      } else {
        skipped++;
      }

      if (processed % 50 === 0) {
        console.log(
          `[${formatDuration(Date.now() - startTime)}] Processed: ${processed}, Resolved: ${resolved}, Skipped: ${skipped}`,
        );
      }
    }

    // Batch update all resolved URLs at once
    if (updates.length > 0) {
      await batchUpdatePosters(rawClient, updates);
    }
  }

  console.log(`\nCover art done in ${formatDuration(Date.now() - startTime)}`);
  console.log(`  Processed: ${processed}, Resolved: ${resolved}, Skipped: ${skipped}`);
  console.log(
    `  By source: TMDB ${bySource.tmdb}, AniList ${bySource.anilist}, IGDB ${bySource.igdb}`,
  );
  console.log(
    `  Failures:  TMDB ${failures.tmdb}, AniList ${failures.anilist}, IGDB ${failures.igdb}`,
  );
  await rawClient.end();
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
