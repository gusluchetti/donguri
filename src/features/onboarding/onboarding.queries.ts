import { queryOptions } from "@tanstack/react-query";
import { getOnboardingPicks } from "~/features/onboarding/onboarding.functions";

export function onboardingPicksOptions() {
  return queryOptions({
    queryKey: ["onboarding", "picks"],
    queryFn: () => getOnboardingPicks({}),
    staleTime: 30 * 60 * 1000,
  });
}
