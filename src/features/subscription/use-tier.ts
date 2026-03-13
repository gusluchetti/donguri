import { useRouteContext } from "@tanstack/react-router";
import type { SubscriptionTier } from "~/features/subscription/subscription.utils";

export function useTier() {
  const { auth } = useRouteContext({ from: "__root__" });
  const tier = ((auth as { tier?: string } | null)?.tier as SubscriptionTier) ?? null;
  return { tier, isRanger: tier === "ranger_pass" };
}
