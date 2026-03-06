import { createServerFn } from "@tanstack/react-start";
import { eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { getDb } from "~/db";
import {
  canonicalGenres,
  canonicalPlatforms,
  type Media,
  media,
  mediaGenres,
  mediaPlatforms,
  seasons,
} from "~/db/schema";
import { getSessionData } from "~/features/auth/auth.session";
import { getMediaSource } from "./media-source";
import { getCacheArrays } from "./popular-cache";

export type PosterSize = "small" | "detail";

export function resolveMediaPoster<T extends { posterUrl: string | null }>(
  item: T,
  size: PosterSize,
): T {
  const url = item.posterUrl;
  if (!url || size === "small") return item;

  // TMDB: w92 → w154 (minimum ≥ 152px)
  if (url.includes("/t/p/w92/")) {
    return { ...item, posterUrl: url.replace("/w92/", "/w154/") };
  }
  // AniList: medium → large
  if (url.includes("/cover/medium/")) {
    return { ...item, posterUrl: url.replace("/cover/medium/", "/cover/large/") };
  }
  // IGDB: t_cover_small → t_cover_big (no intermediate size exists)
  if (url.includes("t_cover_small")) {
    return { ...item, posterUrl: url.replace("t_cover_small", "t_cover_big") };
  }
  return item;
}

const parentGenres = alias(canonicalGenres, "parent_genres");
const parentPlatforms = alias(canonicalPlatforms, "parent_platforms");

/** Return type of getMedia (defined explicitly to break circular inference). */
type MediaDetail = Media & {
  genres: {
    id: string;
    slug: string;
    name: string;
    parentId: string | null;
    sortOrder: number | null;
    parentName: string | null;
  }[];
  platforms: {
    id: string;
    slug: string;
    name: string;
    parentId: string | null;
    sortOrder: number | null;
    parentName: string | null;
  }[];
  seasons: {
    id: string;
    seasonNumber: number;
    episodeCount: number | null;
    title: string | null;
    dataSource: string;
  }[];
};

// ─── Input schemas ──────────────────────────────────────────────────────────

const ListMediaInput = z.object({
  cursor: z.string().optional(),
  limit: z.number().min(1).max(100).default(50),
  mediaType: z.enum(["movie", "tv_series", "anime", "game"]).optional(),
  search: z.string().optional(),
});

const GetMediaInput = z.object({
  wikidataId: z.string(),
});

// ─── Server functions ───────────────────────────────────────────────────────

/**
 * List media with cursor-based pagination, optional type filter and search.
 * Browse mode: keyset pagination sorted by popularity.
 * Search mode: fuzzy matching via pg_trgm with offset pagination sorted by relevance.
 */
export const listMedia = createServerFn({ method: "GET" })
  .inputValidator(ListMediaInput)
  .handler(async ({ data }) => {
    const { cursor, limit, mediaType, search } = data;
    const trimmedSearch = search?.trim();

    const session = await getSessionData();
    const source = getMediaSource(session);

    const result = trimmedSearch
      ? await source.search(trimmedSearch, { cursor, limit, mediaType })
      : await source.list({ cursor, limit, mediaType });
    return { ...result, items: result.items.map((m) => resolveMediaPoster(m, "small")) };
  });

/**
 * Get a random media wikidata ID. Works for both logged-in (DB) and logged-out (cache) users.
 */
export const getRandomMediaId = createServerFn({ method: "GET" }).handler(async () => {
  const session = await getSessionData();
  const source = getMediaSource(session);
  return source.randomId();
});

/**
 * Homepage sample: 2 per type = 8 items with posters.
 * Seeded PRNG (rotates every 30 min) keeps selection stable across refreshes.
 * Display order is shuffled client-side.
 */
export const getSamplesForHomepage = createServerFn({ method: "GET" }).handler(async () => {
  const { byType } = await getCacheArrays();
  const PER_TYPE = 25;
  const types = ["movie", "tv_series", "anime", "game"] as const;

  // Seeded PRNG (mulberry32) — deterministic per 30-min window
  const seed = Math.floor(Date.now() / 1_800_000);
  let t = (seed | 0) + 0x6d2b79f5;
  function rand() {
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  const samples: Media[] = [];
  for (const type of types) {
    const withPosters = byType[type].filter((m) => m.posterUrl);
    // Fisher-Yates with seeded rand
    for (let i = withPosters.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [withPosters[i], withPosters[j]] = [withPosters[j], withPosters[i]];
    }
    samples.push(...withPosters.slice(0, PER_TYPE));
  }

  // Final shuffle for mixed display order
  for (let i = samples.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [samples[i], samples[j]] = [samples[j], samples[i]];
  }

  return samples.map((m) => resolveMediaPoster(m, "detail"));
});

// ─── Server-side media detail cache ──────────────────────────────────────────

const mediaDetailCache = new Map<string, { data: MediaDetail; ts: number }>();
const DETAIL_CACHE_TTL = 10 * 60 * 1000; // 10 min
const DETAIL_CACHE_MAX = 5000;

/**
 * Get a single media item by Wikidata ID, including genres and platforms.
 */
export const getMedia = createServerFn({ method: "GET" })
  .inputValidator(GetMediaInput)
  .handler(async ({ data }): Promise<MediaDetail | null> => {
    // Check server-side cache first
    const cached = mediaDetailCache.get(data.wikidataId);
    if (cached && Date.now() - cached.ts < DETAIL_CACHE_TTL) {
      return cached.data;
    }

    const db = getDb();

    // All 4 queries in parallel — JOIN through media by wikidataId (unique/indexed)
    const [items, itemGenres, itemPlatforms, itemSeasons] = await Promise.all([
      db.select().from(media).where(eq(media.wikidataId, data.wikidataId)).limit(1),
      db
        .select({
          id: canonicalGenres.id,
          slug: canonicalGenres.slug,
          name: canonicalGenres.name,
          parentId: canonicalGenres.parentId,
          sortOrder: canonicalGenres.sortOrder,
          parentName: parentGenres.name,
        })
        .from(mediaGenres)
        .innerJoin(media, eq(mediaGenres.mediaId, media.id))
        .innerJoin(canonicalGenres, eq(mediaGenres.canonicalGenreId, canonicalGenres.id))
        .leftJoin(parentGenres, eq(canonicalGenres.parentId, parentGenres.id))
        .where(eq(media.wikidataId, data.wikidataId))
        .orderBy(canonicalGenres.sortOrder),
      db
        .select({
          id: canonicalPlatforms.id,
          slug: canonicalPlatforms.slug,
          name: canonicalPlatforms.name,
          parentId: canonicalPlatforms.parentId,
          sortOrder: canonicalPlatforms.sortOrder,
          parentName: parentPlatforms.name,
        })
        .from(mediaPlatforms)
        .innerJoin(media, eq(mediaPlatforms.mediaId, media.id))
        .innerJoin(
          canonicalPlatforms,
          eq(mediaPlatforms.canonicalPlatformId, canonicalPlatforms.id),
        )
        .leftJoin(parentPlatforms, eq(canonicalPlatforms.parentId, parentPlatforms.id))
        .where(eq(media.wikidataId, data.wikidataId))
        .orderBy(
          sql`COALESCE(${parentPlatforms.sortOrder}, ${canonicalPlatforms.sortOrder})`,
          canonicalPlatforms.sortOrder,
        ),
      db
        .select({
          id: seasons.id,
          seasonNumber: seasons.seasonNumber,
          episodeCount: seasons.episodeCount,
          title: seasons.title,
          dataSource: seasons.dataSource,
        })
        .from(seasons)
        .innerJoin(media, eq(seasons.mediaId, media.id))
        .where(eq(media.wikidataId, data.wikidataId))
        .orderBy(seasons.seasonNumber),
    ]);

    if (items.length === 0) return null;

    // TEMP: hide episode tracking for non-consecutive seasons
    const isConsecutive =
      itemSeasons.length === 0 || itemSeasons.every((s, i) => s.seasonNumber === i + 1);

    const result: MediaDetail = {
      ...resolveMediaPoster(items[0], "detail"),
      genres: itemGenres.map((g) => ({
        id: g.id,
        slug: g.slug,
        name: g.name,
        parentId: g.parentId,
        sortOrder: g.sortOrder,
        parentName: g.parentName ?? null,
      })),
      platforms: itemPlatforms.map((p) => ({
        id: p.id,
        slug: p.slug,
        name: p.name,
        parentId: p.parentId,
        sortOrder: p.sortOrder,
        parentName: p.parentName ?? null,
      })),
      seasons: isConsecutive ? itemSeasons : [],
    };

    // Populate cache (FIFO eviction at max size)
    if (mediaDetailCache.size >= DETAIL_CACHE_MAX) {
      const firstKey = mediaDetailCache.keys().next().value;
      if (firstKey) mediaDetailCache.delete(firstKey);
    }
    mediaDetailCache.set(data.wikidataId, { data: result, ts: Date.now() });

    return result;
  });
