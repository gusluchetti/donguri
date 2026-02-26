import { queryOptions } from "@tanstack/react-query";
import { getMedia, getSamplesForHomepage } from "~/features/media/media.functions";
import { DATA_VERSION, idbPersister } from "~/lib/query";

const persister = idbPersister?.persisterFn;

export function mediaDetailOptions(wikidataId: string) {
  return queryOptions({
    queryKey: ["media", DATA_VERSION, wikidataId],
    queryFn: () => getMedia({ data: { wikidataId } }),
    staleTime: 30 * 60 * 1000,
    gcTime: 2 * 60 * 60 * 1000,
    persister,
  });
}

export function homepageSampleOptions() {
  return queryOptions({
    queryKey: ["homepage", "samples", DATA_VERSION],
    queryFn: () => getSamplesForHomepage({}),
    staleTime: 30 * 60 * 1000,
  });
}
