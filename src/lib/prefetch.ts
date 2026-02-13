import { cacheGet, cacheSet, isStale } from "./idb-cache";
import { getMediaStats, listMedia } from "./media.functions";

const CATALOG_MAX_AGE = 30 * 60 * 1000; // 30 min
let prefetchScheduled = false;

/**
 * Background-prefetch the first page of each catalog type tab + mediaStats.
 * Uses requestIdleCallback (fallback: setTimeout 2s). Only runs once per session.
 */
export function scheduleCatalogPrefetch(): void {
  if (prefetchScheduled || typeof window === "undefined") return;
  prefetchScheduled = true;

  const schedule =
    typeof requestIdleCallback === "function"
      ? requestIdleCallback
      : (cb: () => void) => setTimeout(cb, 2000);

  schedule(() => {
    runPrefetch().catch(() => {});
  });
}

const TYPE_KEYS: Array<{
  mediaType: "movie" | "tv_series" | "anime" | "game" | undefined;
  cacheKey: string;
}> = [
  { mediaType: undefined, cacheKey: "catalog:all:0" },
  { mediaType: "movie", cacheKey: "catalog:movie:0" },
  { mediaType: "tv_series", cacheKey: "catalog:tv_series:0" },
  { mediaType: "anime", cacheKey: "catalog:anime:0" },
  { mediaType: "game", cacheKey: "catalog:game:0" },
];

async function runPrefetch(): Promise<void> {
  // Prefetch mediaStats if stale
  const statsCached = await cacheGet("mediaStats");
  if (!statsCached || isStale(statsCached.timestamp, CATALOG_MAX_AGE)) {
    try {
      const stats = await getMediaStats({});
      await cacheSet("mediaStats", stats);
    } catch {
      // Non-critical
    }
  }

  for (const { mediaType, cacheKey } of TYPE_KEYS) {
    const cached = await cacheGet(cacheKey);
    if (cached && !isStale(cached.timestamp, CATALOG_MAX_AGE)) continue;

    try {
      const page0 = await listMedia({ data: { limit: 50, mediaType } });
      if (page0.nextCursor) {
        const page1 = await listMedia({
          data: { limit: 50, mediaType, cursor: page0.nextCursor },
        });
        await cacheSet(cacheKey, {
          items: [...page0.items, ...page1.items],
          nextCursor: page1.nextCursor,
        });
      } else {
        await cacheSet(cacheKey, page0);
      }
    } catch {
      // Non-critical
    }

    // Avoid flooding connections
    await new Promise((r) => setTimeout(r, 500));
  }
}
