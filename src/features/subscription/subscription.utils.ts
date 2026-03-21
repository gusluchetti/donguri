import type { Subscription } from "~/db/schema";

export type SubscriptionTier = "ranger_pass";

export function getActiveTier(sub: Subscription | null | undefined): SubscriptionTier | null {
  if (!sub) return null;
  if (sub.status === "lifetime") return sub.tier as SubscriptionTier;
  if (!["active", "canceled", "past_due"].includes(sub.status)) return null;
  if (sub.currentPeriodEnd && sub.currentPeriodEnd <= new Date()) return null;
  return sub.tier as SubscriptionTier;
}

export function hasPaidTier(sub: Subscription | null | undefined): boolean {
  return getActiveTier(sub) !== null;
}

export function isSubscriptionActive<T extends { status: string }>(
  sub: T | null | undefined,
): sub is T {
  if (!sub) return false;
  return ["active", "canceled", "past_due", "lifetime"].includes(sub.status);
}
