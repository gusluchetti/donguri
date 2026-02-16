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

import { eq, sql } from "drizzle-orm";
import { cleanEnv, createImportDb } from "../db";
import { media } from "../db/schema";
import { formatDuration } from "./_retry";

const BATCH_SIZE = 50;

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

async function resolveUrl(
  item: {
    mediaType: string;
    tmdbId: string | null;
    anilistId: string | null;
    igdbId: string | null;
  },
  tmdbApiKey: string,
): Promise<string | null> {
  // Try TMDB first (movies, TV, anime)
  if (item.tmdbId && item.mediaType !== "game") {
    const url = await fetchTmdbPoster(item.tmdbId, item.mediaType, tmdbApiKey);
    if (url) {
      await sleep(250); // TMDB: ~40 req/10s
      return url;
    }
  }

  // AniList fallback for anime
  if (item.anilistId && item.mediaType === "anime") {
    const url = await fetchAniListCover(item.anilistId);
    if (url) {
      await sleep(670); // AniList: ~90 req/min
      return url;
    }
  }

  // IGDB for games
  if (item.igdbId && item.mediaType === "game") {
    const url = await fetchIgdbCover(item.igdbId);
    if (url) {
      await sleep(250); // IGDB: 4 req/s
      return url;
    }
  }

  return null;
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

  const { db } = createImportDb(url);

  console.log("Fetching media without cover art...");

  let processed = 0;
  let resolved = 0;
  let skipped = 0;
  let offset = 0;
  const startTime = Date.now();

  while (processed < limit) {
    const batchLimit = Math.min(BATCH_SIZE, limit - processed);
    const typeCondition = filterType ? sql`${media.mediaType} = ${filterType}` : sql`1=1`;

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
        sql`${media.posterUrl} IS NULL AND (${media.tmdbId} IS NOT NULL OR ${media.anilistId} IS NOT NULL OR ${media.igdbId} IS NOT NULL) AND ${typeCondition}`,
      )
      .orderBy(sql`${media.sitelinksCount} DESC NULLS LAST`)
      .limit(batchLimit)
      .offset(offset);

    if (candidates.length === 0) break;

    for (const item of candidates) {
      if (processed >= limit) break;
      processed++;

      const posterUrl = await resolveUrl(item, tmdbApiKey);
      if (posterUrl) {
        await db.update(media).set({ posterUrl }).where(eq(media.id, item.id));
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

    offset += candidates.length;
  }

  console.log(`\nCover art URL resolution done in ${formatDuration(Date.now() - startTime)}`);
  console.log(`  Processed: ${processed}, Resolved: ${resolved}, Skipped: ${skipped}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
