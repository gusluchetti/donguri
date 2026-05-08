/**
 * Server-side in-memory cache of the top 1k media per type.
 *
 * Non-logged users get served from this cache (zero DB queries).
 * Logged-in users bypass the cache and hit Postgres directly.
 */

import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "~/db";
import { type Media, media } from "~/db/schema";

type FilterType = "movie" | "tv_series" | "anime" | "game";
const FILTER_TYPES: FilterType[] = ["movie", "tv_series", "anime", "game"];
const ITEMS_PER_TYPE = 1000;
const TTL_MS = 30 * 60 * 1000; // 30 minutes

// ─── Cache state ────────────────────────────────────────────────────────────

let byType: Record<FilterType, Media[]> = {
  movie: [],
  tv_series: [],
  anime: [],
  game: [],
};
let all: Media[] = [];
let warmedAt = 0;
let warmingPromise: Promise<void> | null = null;

// ─── Warm ───────────────────────────────────────────────────────────────────

/** Build WHERE clause per filter bucket. Anime = virtual bucket via animationOrigin. */
function bucketCondition(type: FilterType) {
  if (type === "anime") return eq(media.animationOrigin, "anime");
  // Non-anime buckets exclude anime items
  return and(eq(media.mediaType, type), isNull(media.animationOrigin));
}

async function warmCache(): Promise<void> {
  const db = getDb();

  const results = await Promise.all(
    FILTER_TYPES.map((type) =>
      db
        .select()
        .from(media)
        .where(bucketCondition(type))
        .orderBy(
          sql`${media.popularityScore} DESC NULLS LAST`,
          desc(media.sitelinksCount),
          asc(media.id),
        )
        .limit(ITEMS_PER_TYPE),
    ),
  );

  const newByType = {} as Record<FilterType, Media[]>;

  for (let i = 0; i < FILTER_TYPES.length; i++) {
    const type = FILTER_TYPES[i];
    newByType[type] = results[i];
  }

  // Merge all types, re-sort by same order
  const newAll = FILTER_TYPES.flatMap((t) => newByType[t]);
  newAll.sort((a, b) => {
    const pa = a.popularityScore == null ? Number.NEGATIVE_INFINITY : Number(a.popularityScore);
    const pb = b.popularityScore == null ? Number.NEGATIVE_INFINITY : Number(b.popularityScore);
    if (pa !== pb) return pb - pa;
    const sa = b.sitelinksCount ?? 0;
    const sb = a.sitelinksCount ?? 0;
    if (sa !== sb) return sa - sb;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  byType = newByType;
  all = newAll;
  if (newAll.length > 0) warmedAt = Date.now();
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

/** Ensure cache is warm, then return the arrays. */
export async function getCacheArrays(): Promise<{
  byType: Record<FilterType, Media[]>;
  all: Media[];
}> {
  await ensureWarmed();
  return { byType, all };
}
