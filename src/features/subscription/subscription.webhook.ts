import { eq } from "drizzle-orm";
import { getDb } from "~/db";
import { subscriptions, users } from "~/db/schema";
import { invalidateUserCache } from "~/features/auth/auth.session";
import type { SubscriptionUpsertData } from "~/features/subscription/subscription.provider";
import { getProvider } from "~/features/subscription/subscription.provider";

async function upsertSubscription(
  userId: string,
  status: "active" | "lifetime",
  data: SubscriptionUpsertData,
) {
  const db = getDb();
  const values = {
    userId,
    tier: "ranger_pass" as const,
    status,
    plan: data.plan,
    provider: data.provider,
    providerCustomerId: data.providerCustomerId,
    providerSubscriptionId: data.providerSubscriptionId,
    providerOrderId: data.providerOrderId,
    providerPriceId: data.providerPriceId,
    currentPeriodStart: data.currentPeriodStart,
    currentPeriodEnd: data.currentPeriodEnd,
  };

  const [sub] = await db
    .insert(subscriptions)
    .values(values)
    .onConflictDoUpdate({
      target: subscriptions.userId,
      set: { ...values, updatedAt: new Date() },
    })
    .returning({ id: subscriptions.id });

  await db.update(users).set({ subscriptionId: sub.id }).where(eq(users.id, userId));
}

export async function handlePaymentWebhook(rawBody: string, signature: string): Promise<void> {
  const provider = getProvider();
  const result = await provider.handleWebhook(rawBody, signature);

  if (result.action === "ignored") return;

  const db = getDb();
  const { userId } = result;

  switch (result.action) {
    case "subscription_created":
      await upsertSubscription(userId, "active", result.data);
      break;

    case "lifetime_created":
      await upsertSubscription(userId, "lifetime", result.data);
      break;

    case "subscription_updated": {
      const set: Partial<typeof subscriptions.$inferInsert> = { updatedAt: new Date() };
      if (result.data.status) set.status = result.data.status;
      if (result.data.currentPeriodEnd !== undefined)
        set.currentPeriodEnd = result.data.currentPeriodEnd;

      await db.update(subscriptions).set(set).where(eq(subscriptions.userId, userId));
      break;
    }

    case "status_change": {
      const statusSet: Partial<typeof subscriptions.$inferInsert> = {
        status: result.status,
        updatedAt: new Date(),
      };
      if (result.status === "canceled") statusSet.canceledAt = new Date();

      await db.update(subscriptions).set(statusSet).where(eq(subscriptions.userId, userId));
      break;
    }
  }

  invalidateUserCache(userId);
}
