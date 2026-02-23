/**
 * Server-side in-memory cache of the top 2k media per type.
 *
 * Non-logged users get served from this cache (zero DB queries).
 * Logged-in users bypass the cache and hit Postgres directly.
 */

import { asc, desc, eq, sql } from "drizzle-orm";
import { getDb } from "~/db";
import { type Media, media } from "~/db/schema";

type MediaType = "movie" | "tv_series" | "anime" | "game";
const MEDIA_TYPES: MediaType[] = ["movie", "tv_series", "anime", "game"];
const ITEMS_PER_TYPE = 2000;
const TTL_MS = 60 * 60 * 1000; // 1 hour

// ─── Cache state ────────────────────────────────────────────────────────────

let byType: Record<MediaType, Media[]> = {
  movie: [],
  tv_series: [],
  anime: [],
  game: [],
};
let all: Media[] = [];
let stats = { total: 0, byType: {} as Record<string, number> };
let warmedAt = 0;
let warmingPromise: Promise<void> | null = null;

// ─── Warm ───────────────────────────────────────────────────────────────────

async function warmCache(): Promise<void> {
  const db = getDb();

  const results = await Promise.all(
    MEDIA_TYPES.map((type) =>
      db
        .select()
        .from(media)
        .where(eq(media.mediaType, type))
        .orderBy(
          sql`${media.popularityScore} ASC NULLS LAST`,
          desc(media.sitelinksCount),
          asc(media.id),
        )
        .limit(ITEMS_PER_TYPE),
    ),
  );

  const newByType = {} as Record<MediaType, Media[]>;
  const newStats = { total: 0, byType: {} as Record<string, number> };

  for (let i = 0; i < MEDIA_TYPES.length; i++) {
    const type = MEDIA_TYPES[i];
    newByType[type] = results[i];
    newStats.byType[type] = results[i].length;
    newStats.total += results[i].length;
  }

  // Merge all types, re-sort by same order
  const newAll = MEDIA_TYPES.flatMap((t) => newByType[t]);
  newAll.sort((a, b) => {
    const pa = a.popularityScore == null ? Number.POSITIVE_INFINITY : Number(a.popularityScore);
    const pb = b.popularityScore == null ? Number.POSITIVE_INFINITY : Number(b.popularityScore);
    if (pa !== pb) return pa - pb;
    const sa = b.sitelinksCount ?? 0;
    const sb = a.sitelinksCount ?? 0;
    if (sa !== sb) return sa - sb;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  byType = newByType;
  all = newAll;
  stats = newStats;
  warmedAt = Date.now();
}

async function ensureWarmed(): Promise<void> {
  const stale = Date.now() - warmedAt > TTL_MS;

  if (warmedAt === 0) {
    // Cold start — block until warm
    if (!warmingPromise) {
      warmingPromise = warmCache().finally(() => {
        warmingPromise = null;
      });
    }
    return warmingPromise;
  }

  if (stale) {
    // Stale-while-revalidate — serve old data, refresh in background
    if (!warmingPromise) {
      warmingPromise = warmCache().finally(() => {
        warmingPromise = null;
      });
    }
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

export async function getPopularPage(
  mediaType: MediaType | undefined,
  cursor: string | undefined,
  limit: number,
): Promise<{ items: Media[]; nextCursor: string | null }> {
  await ensureWarmed();

  const source = mediaType ? byType[mediaType] : all;
  const offset = cursor ? Number.parseInt(cursor, 10) : 0;
  const page = source.slice(offset, offset + limit);
  const hasMore = offset + limit < source.length;

  return {
    items: page,
    nextCursor: hasMore ? String(offset + limit) : null,
  };
}

export async function searchPopular(
  search: string,
  mediaType: MediaType | undefined,
  cursor: string | undefined,
  limit: number,
): Promise<{ items: Media[]; nextCursor: string | null }> {
  await ensureWarmed();

  const source = mediaType ? byType[mediaType] : all;
  const lower = search.toLowerCase();

  // Score and filter
  const scored: { item: Media; score: number }[] = [];
  for (const item of source) {
    const titleLower = item.title.toLowerCase();
    const origLower = item.originalTitle?.toLowerCase() ?? "";

    if (titleLower === lower || origLower === lower) {
      scored.push({ item, score: 3 });
    } else if (titleLower.startsWith(lower) || origLower.startsWith(lower)) {
      scored.push({ item, score: 2 });
    } else if (titleLower.includes(lower) || origLower.includes(lower)) {
      scored.push({ item, score: 1 });
    }
  }

  // Sort by score desc, then original popularity order (already sorted in source)
  scored.sort((a, b) => b.score - a.score);

  const offset = cursor ? Number.parseInt(cursor, 10) : 0;
  const page = scored.slice(offset, offset + limit).map((s) => s.item);
  const hasMore = offset + limit < scored.length;

  return {
    items: page,
    nextCursor: hasMore ? String(offset + limit) : null,
  };
}

export async function getPopularStats(): Promise<{
  total: number;
  byType: Record<string, number>;
}> {
  await ensureWarmed();
  return stats;
}
