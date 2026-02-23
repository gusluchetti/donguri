import { queryOptions } from "@tanstack/react-query";
import { getMedia, getMediaStats } from "~/features/media/media.functions";
import { DATA_VERSION, idbPersister } from "~/lib/query";

const persister = idbPersister?.persisterFn;

export function mediaDetailOptions(wikidataId: string) {
  return queryOptions({
    queryKey: ["media", DATA_VERSION, wikidataId],
    queryFn: () => getMedia({ data: { wikidataId } }),
    staleTime: 5 * 60 * 1000,
    persister,
  });
}
