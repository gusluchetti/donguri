import { eq } from "drizzle-orm";
import { getDb } from "~/db";
import { subscriptions } from "~/db/schema";
import { getActiveTier } from "~/features/subscription/subscription.utils";

export async function getUserSubscription(userId: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1);
  return row ?? null;
}

export async function getUserSubscriptionTier(userId: string) {
  const sub = await getUserSubscription(userId);
  return getActiveTier(sub);
}
