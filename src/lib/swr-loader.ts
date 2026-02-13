import { cacheGet, cacheSet, isStale } from "./idb-cache";

type SwrOptions = {
  key: string;
  maxAgeMs: number;
};

type SwrResult<T> = {
  data: T;
  fromCache: boolean;
};

/**
 * Stale-while-revalidate loader.
 * - Fresh cache → return cached, skip network
 * - Stale cache → return cached, revalidate in background
 * - Miss → await network, cache result
 */
export async function swrLoad<T>(
  fetcher: () => Promise<T>,
  { key, maxAgeMs }: SwrOptions,
): Promise<SwrResult<T>> {
  // SSR: just fetch
  if (typeof window === "undefined") {
    const data = await fetcher();
    return { data, fromCache: false };
  }

  const cached = await cacheGet<T>(key);

  if (cached) {
    if (!isStale(cached.timestamp, maxAgeMs)) {
      // Fresh — return cached, skip network
      return { data: cached.data, fromCache: true };
    }
    // Stale — return cached, revalidate in background
    fetcher()
      .then((fresh) => cacheSet(key, fresh))
      .catch(() => {});
    return { data: cached.data, fromCache: true };
  }

  // Miss — await network
  const data = await fetcher();
  cacheSet(key, data).catch(() => {});
  return { data, fromCache: false };
}
