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

/**
 * Like swrLoad but on network error, falls back to any cached data (even stale).
 */
export async function swrLoadWithFallback<T>(
  fetcher: () => Promise<T>,
  { key, maxAgeMs }: SwrOptions,
): Promise<SwrResult<T>> {
  // SSR: just fetch
  if (typeof window === "undefined") {
    const data = await fetcher();
    return { data, fromCache: false };
  }

  const cached = await cacheGet<T>(key);

  if (cached && !isStale(cached.timestamp, maxAgeMs)) {
    return { data: cached.data, fromCache: true };
  }

  // Try network (even if we have stale cache)
  try {
    const data = await fetcher();
    cacheSet(key, data).catch(() => {});
    return { data, fromCache: false };
  } catch {
    // Network failed — return any cached data
    if (cached) {
      return { data: cached.data, fromCache: true };
    }
    throw new Error("Network error and no cached data available");
  }
}
