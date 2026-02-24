import { infiniteQueryOptions, keepPreviousData, queryOptions } from "@tanstack/react-query";
import {
  getCatalogEntry,
  getUserCatalogEntries,
  getUserTrackedIds,
} from "~/features/catalog/catalog.functions";
import { getMediaStats, listMedia } from "~/features/media/media.functions";
import { DATA_VERSION, idbPersister } from "~/lib/query";

const persister = idbPersister?.persisterFn;

export function trackedIdsOptions() {
  return queryOptions({
    queryKey: ["user", "trackedIds", DATA_VERSION],
    queryFn: () => getUserTrackedIds({}),
    staleTime: 30 * 60 * 1000,
    gcTime: 2 * 60 * 60 * 1000,
    refetchOnWindowFocus: true,
    persister,
  });
}

export function watchlistOptions() {
  return queryOptions({
    queryKey: ["user", "watchlist", DATA_VERSION],
    queryFn: () => getUserCatalogEntries({}),
    staleTime: 30 * 60 * 1000,
    gcTime: 2 * 60 * 60 * 1000,
    refetchOnWindowFocus: true,
    placeholderData: keepPreviousData,
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

export function catalogInfiniteOptions(
  mediaType?: "movie" | "tv_series" | "anime" | "game",
  search?: string,
) {
  return infiniteQueryOptions({
    queryKey: ["catalog", "browse", DATA_VERSION, mediaType ?? "all", search ?? ""],
    queryFn: ({ pageParam }) =>
      listMedia({ data: { cursor: pageParam, limit: 50, mediaType, search } }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 10 * 60 * 1000,
  });
}

export function catalogEntryOptions(wikidataId: string) {
  return queryOptions({
    queryKey: ["user", "entry", DATA_VERSION, wikidataId],
    queryFn: () => getCatalogEntry({ data: { wikidataId } }),
    staleTime: 0,
    refetchOnWindowFocus: true,
    persister,
  });
}
