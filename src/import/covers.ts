#!/usr/bin/env bun
import { and, isNotNull, isNull, or } from "drizzle-orm";
import { media } from "~/db/schema";
import type { DbType } from "./_upsert";
import type { ImportConfig } from "./config";

export interface CoversStats {
  tmdb: number;
  anilist: number;
  igdb: number;
  updated: number;
  durationMs: number;
}

interface TmdbMovieResponse {
  poster_path: string | null;
}

interface TmdbTvResponse {
  poster_path: string | null;
}

interface AnilistMedia {
  id: number;
  coverImage: {
    medium: string;
  } | null;
}

interface AnilistGraphQLResponse {
  data: {
    Page: {
      media: AnilistMedia[];
    };
  };
}

interface IGDBTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

interface IGDBCover {
  id: number;
  game: number;
  url: string;
}

async function fetchTmdbPosters(
  items: Array<{ id: string; tmdbId: string }>,
): Promise<Map<string, string>> {
  const TmdbApiKey = process.env.TMDB_API_KEY;
  if (!TmdbApiKey) {
    return new Map();
  }

  const results = new Map<string, string>();
  const batchSize = 10;
  const delay = 250; // ms delay between API calls to respect TMDB rate limits (40/s)

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const promises = batch.map(async (item) => {
      const [, type, numericId] = item.tmdbId.match(/^(movie|tv)\/(\d+)$/) || [];
      if (!type || !numericId) {
        return;
      }

      const url = `https://api.themoviedb.org/3/${type}/${numericId}?api_key=${TmdbApiKey}`;
      try {
        const response = await fetch(url);
        if (!response.ok) {
          return;
        }
        const data = (await response.json()) as TmdbMovieResponse | TmdbTvResponse;
        if (data.poster_path) {
          const posterUrl = `https://image.tmdb.org/t/p/w92${data.poster_path}`;
          results.set(item.id, posterUrl);
        } else {
        }
      } catch (error) {
        console.error(`[covers] TMDB fetch failed for ${item.tmdbId}:`, error);
      }
    });

    await Promise.all(promises);
    if (i + batchSize < items.length) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  return results;
}

async function fetchAnilistPosters(
  items: Array<{ id: string; anilistId: string }>,
): Promise<Map<string, string>> {
  if (items.length === 0) return new Map();

  const ids = items.map((item) => Number(item.anilistId));
  const query = `
    query($ids: [Int!]) {
      Page {
        media(id_in: $ids, type: ANIME) {
          id
          coverImage {
            medium
          }
        }
      }
    }
  `;

  try {
    const response = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        query,
        variables: { ids },
      }),
    });

    if (!response.ok) {
      console.error(`[covers] AniList GraphQL error: HTTP ${response.status}`);
      return new Map();
    }

    const data = (await response.json()) as AnilistGraphQLResponse;
    const results = new Map<string, string>();

    for (const media of data.data.Page.media) {
      const matchingItem = items.find((item) => Number(item.anilistId) === media.id);
      if (matchingItem && media.coverImage?.medium) {
        results.set(matchingItem.id, media.coverImage.medium);
      }
    }
    return results;
  } catch (error) {
    console.error("[covers] AniList fetch failed:", error);
    return new Map();
  }
}

async function fetchIgdbPosters(
  items: Array<{ id: string; igdbId: string }>,
): Promise<Map<string, string>> {
  const TwitchClientId = process.env.TWITCH_CLIENT_ID;
  const TwitchClientSecret = process.env.TWITCH_CLIENT_SECRET;
  if (!TwitchClientId || !TwitchClientSecret) {
    return new Map();
  }

  if (items.length === 0) return new Map();

  const tokenResponse = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: TwitchClientId,
      client_secret: TwitchClientSecret,
      grant_type: "client_credentials",
    }),
  });

  if (!tokenResponse.ok) {
    console.error("[covers] Twitch OAuth token fetch failed");
    return new Map();
  }

  const tokenData = (await tokenResponse.json()) as IGDBTokenResponse;
  const accessToken = tokenData.access_token;

  const igdbIds = items.map((item) => Number(item.igdbId));
  const query = `fields url; where game = (${igdbIds.join(",")}); limit ${items.length};`;

  const coverResponse = await fetch("https://api.igdb.com/v4/covers", {
    method: "POST",
    headers: {
      "Client-ID": TwitchClientId,
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
    body: query,
  });

  if (!coverResponse.ok) {
    console.error(`[covers] IGDB API error: HTTP ${coverResponse.status}`);
    return new Map();
  }

  const covers = (await coverResponse.json()) as IGDBCover[];
  const results = new Map<string, string>();

  for (const cover of covers) {
    const matchingItem = items.find((item) => Number(item.igdbId) === cover.game);
    if (matchingItem && cover.url) {
      const url = cover.url.startsWith("//") ? `https:${cover.url}` : cover.url;
      const smallUrl = url.includes("t_cover_big")
        ? url.replace("t_cover_big", "t_cover_small")
        : url;
      results.set(matchingItem.id, smallUrl);
    }
  }
  return results;
}

async function updatePosterUrls(db: DbType, posterMap: Map<string, string>): Promise<number> {
  if (posterMap.size === 0) return 0;

  const batchSize = 500;
  const entries = Array.from(posterMap.entries());
  let totalUpdated = 0;

  for (let i = 0; i < entries.length; i += batchSize) {
    const batch = entries.slice(i, i + batchSize);
    const placeholders = batch.map((_, idx) => `($${idx * 2 + 1}, $${idx * 2 + 2})`).join(",");
    const values = batch.flat();
    await db.$client.unsafe(
      `
			UPDATE media
			SET poster_url = data.url, updated_at = now()
			FROM (VALUES ${placeholders}) AS data(id, url)
			WHERE media.id = data.id
		`,
      values,
    );
    totalUpdated += batch.length;
  }

  return totalUpdated;
}

export async function runCovers(db: DbType, _config: ImportConfig): Promise<CoversStats> {
  const startTime = Date.now();

  try {
    const items = await db
      .select({
        id: media.id,
        tmdbId: media.tmdbId,
        anilistId: media.anilistId,
        igdbId: media.igdbId,
      })
      .from(media)
      .where(
        and(
          isNull(media.posterUrl),
          or(isNotNull(media.tmdbId), isNotNull(media.anilistId), isNotNull(media.igdbId)),
        ),
      );

    const tmdbItems = items
      .filter((item): item is typeof item & { tmdbId: string } => item.tmdbId !== null)
      .map((item) => ({ id: item.id, tmdbId: item.tmdbId }));
    const anilistItems = items
      .filter((item): item is typeof item & { anilistId: string } => item.anilistId !== null)
      .map((item) => ({ id: item.id, anilistId: item.anilistId }));
    const igdbItems = items
      .filter((item): item is typeof item & { igdbId: string } => item.igdbId !== null)
      .map((item) => ({ id: item.id, igdbId: item.igdbId }));

    const [tmdbResults, anilistResults, igdbResults] = await Promise.all([
      fetchTmdbPosters(tmdbItems),
      fetchAnilistPosters(anilistItems),
      fetchIgdbPosters(igdbItems),
    ]);

    const combined = new Map<string, string>();
    for (const coverMap of [tmdbResults, anilistResults, igdbResults]) {
      for (const [id, url] of coverMap) {
        if (!combined.has(id)) combined.set(id, url);
      }
    }

    const updated = await updatePosterUrls(db, combined);
    const durationMs = Date.now() - startTime;
    return {
      tmdb: tmdbResults.size,
      anilist: anilistResults.size,
      igdb: igdbResults.size,
      updated,
      durationMs,
    };
  } catch (error) {
    console.error("[covers] Cover art fetch failed:", error);
    throw error;
  }
}
