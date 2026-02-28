import { queryOptions } from "@tanstack/react-query";
import { getProfileData } from "~/features/profile/profile.functions";
import { DATA_VERSION } from "~/lib/query";

export function profileDataOptions() {
  return queryOptions({
    queryKey: ["user", "profile", DATA_VERSION],
    queryFn: () => getProfileData({}),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: true,
  });
}
