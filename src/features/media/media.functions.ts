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

    if (trimmedSearch) {
      return source.search(trimmedSearch, { cursor, limit, mediaType });
    }
    return source.list({ cursor, limit, mediaType });
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
 * Homepage sample: 12 items with posters — one of each type guaranteed,
 * remaining slots filled from the pool. Order is seeded-shuffled by day
 * so results are stable across hard refreshes but rotate daily.
 */
export const getSamplesForHomepage = createServerFn({ method: "GET" }).handler(async () => {
  const { byType } = await getCacheArrays();
  const TOTAL = 12;
  const types = ["movie", "tv_series", "anime", "game"] as const;

  // Simple seeded PRNG (mulberry32) — deterministic per day
  const daySeed = Math.floor(Date.now() / 1_800_000);
  let t = (daySeed | 0) + 0x6d2b79f5;
  function rand() {
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function seededPick<T>(arr: T[], n: number): T[] {
    const copy = arr.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy.slice(0, n);
  }

  // One of each type first
  const samples: Media[] = [];
  const usedIds = new Set<string>();
  for (const type of types) {
    const pick = seededPick(
      byType[type].filter((m) => m.posterUrl),
      1,
    );
    for (const m of pick) {
      samples.push(m);
      usedIds.add(m.id);
    }
  }

  // Fill remaining from the full pool
  const remaining = TOTAL - samples.length;
  if (remaining > 0) {
    const pool = types.flatMap((type) =>
      byType[type].filter((m) => m.posterUrl && !usedIds.has(m.id)),
    );
    samples.push(...seededPick(pool, remaining));
  }

  // Final shuffle for display order
  for (let i = samples.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [samples[i], samples[j]] = [samples[j], samples[i]];
  }

  return samples;
});

/**
 * Get a single media item by Wikidata ID, including genres and platforms.
 */
export const getMedia = createServerFn({ method: "GET" })
  .inputValidator(GetMediaInput)
  .handler(async ({ data }): Promise<MediaDetail | null> => {
    const db = getDb();

    const item = await db
      .select()
      .from(media)
      .where(eq(media.wikidataId, data.wikidataId))
      .limit(1);

    if (item.length === 0) return null;

    // Fetch genres, platforms (both canonical with parent join), and seasons in parallel
    const [itemGenres, itemPlatforms, itemSeasons] = await Promise.all([
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
        .innerJoin(canonicalGenres, eq(mediaGenres.canonicalGenreId, canonicalGenres.id))
        .leftJoin(parentGenres, eq(canonicalGenres.parentId, parentGenres.id))
        .where(eq(mediaGenres.mediaId, item[0].id))
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
        .innerJoin(
          canonicalPlatforms,
          eq(mediaPlatforms.canonicalPlatformId, canonicalPlatforms.id),
        )
        .leftJoin(parentPlatforms, eq(canonicalPlatforms.parentId, parentPlatforms.id))
        .where(eq(mediaPlatforms.mediaId, item[0].id))
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
        .where(eq(seasons.mediaId, item[0].id))
        .orderBy(seasons.seasonNumber),
    ]);

    // TEMP: hide episode tracking for non-consecutive seasons
    const isConsecutive =
      itemSeasons.length === 0 || itemSeasons.every((s, i) => s.seasonNumber === i + 1);

    const result = {
      ...item[0],
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

    return result;
  });
