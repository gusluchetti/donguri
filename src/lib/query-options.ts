import { queryOptions } from "@tanstack/react-query";
import { getCatalogEntry, getUserCatalogEntries, getUserTrackedIds } from "./catalog.functions";
import { getMedia, getMediaStats, listMedia } from "./media.functions";
import { idbPersister } from "./query";

const persister = idbPersister?.persisterFn;

export function trackedIdsOptions() {
  return queryOptions({
    queryKey: ["user", "trackedIds"],
    queryFn: () => getUserTrackedIds({}),
    staleTime: 30_000,
    persister,
  });
}

export function watchlistOptions() {
  return queryOptions({
    queryKey: ["user", "watchlist"],
    queryFn: () => getUserCatalogEntries({}),
    staleTime: 30_000,
    persister,
  });
}

export function mediaStatsOptions() {
  return queryOptions({
    queryKey: ["catalog", "stats"],
    queryFn: () => getMediaStats({}),
    staleTime: 30 * 60 * 1000,
    persister,
  });
}

export function catalogBrowseOptions(mediaType?: string) {
  return queryOptions({
    queryKey: ["catalog", "browse", mediaType ?? "all"],
    queryFn: () => listMedia({ data: { limit: 50, mediaType } }),
    staleTime: 5 * 60 * 1000,
    persister,
  });
}

export function mediaDetailOptions(wikidataId: string) {
  return queryOptions({
    queryKey: ["media", wikidataId],
    queryFn: () => getMedia({ data: { wikidataId } }),
    staleTime: 60 * 60 * 1000,
    persister,
  });
}

export function catalogEntryOptions(wikidataId: string) {
  return queryOptions({
    queryKey: ["user", "entry", wikidataId],
    queryFn: () => getCatalogEntry({ data: { wikidataId } }),
    staleTime: 30_000,
    persister,
  });
}
