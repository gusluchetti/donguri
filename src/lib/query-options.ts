import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";
import { getCatalogEntry, getUserCatalogEntries, getUserTrackedIds } from "./catalog.functions";
import { getMedia, getMediaStats, listMedia } from "./media.functions";
import { DATA_VERSION, idbPersister } from "./query";

const persister = idbPersister?.persisterFn;

export function trackedIdsOptions() {
  return queryOptions({
    queryKey: ["user", "trackedIds"],
    queryFn: () => getUserTrackedIds({}),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
    persister,
  });
}

export function watchlistOptions() {
  return queryOptions({
    queryKey: ["user", "watchlist"],
    queryFn: () => getUserCatalogEntries({}),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
    persister,
  });
}

export function mediaStatsOptions() {
  return queryOptions({
    queryKey: ["catalog", "stats", DATA_VERSION],
    queryFn: () => getMediaStats({}),
    staleTime: 30 * 60 * 1000,
    persister,
  });
}

export function catalogInfiniteOptions(mediaType?: string, search?: string) {
  return infiniteQueryOptions({
    queryKey: ["catalog", "browse", DATA_VERSION, mediaType ?? "all", search ?? ""],
    queryFn: ({ pageParam }) =>
      listMedia({ data: { cursor: pageParam, limit: 50, mediaType, search } }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 5 * 60 * 1000,
  });
}

export function mediaDetailOptions(wikidataId: string) {
  return queryOptions({
    queryKey: ["media", DATA_VERSION, wikidataId],
    queryFn: () => getMedia({ data: { wikidataId } }),
    staleTime: 5 * 60 * 1000,
    persister,
  });
}

export function catalogEntryOptions(wikidataId: string) {
  return queryOptions({
    queryKey: ["user", "entry", wikidataId],
    queryFn: () => getCatalogEntry({ data: { wikidataId } }),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
    persister,
  });
}
