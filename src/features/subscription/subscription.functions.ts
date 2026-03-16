import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "~/db";
import { subscriptions } from "~/db/schema";
import { requireAuth } from "~/features/auth/auth.session";
import { getProvider } from "~/features/subscription/subscription.provider";
import { getPppTier } from "~/features/subscription/subscription.regions";

async function getUserSubscription(userId: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1);
  return row ?? null;
}

export const getSubscription = createServerFn({ method: "GET" }).handler(async () => {
  const auth = await requireAuth();
  return getUserSubscription(auth.userId);
});

export const createCheckoutUrl = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      plan: z.enum(["monthly", "annual", "lifetime"]),
      countryCode: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    const { plan, countryCode } = data;

    const pppTier = getPppTier(countryCode);
    const discountCode =
      pppTier === "ppp60" ? (process.env.LEMONSQUEEZY_DISCOUNT_PPP_60 ?? undefined) : undefined;

    const provider = getProvider();
    const url = await provider.createCheckoutUrl({
      userId: auth.userId,
      plan,
      discountCode,
    });

    return { url };
  });

export const getCustomerPortalUrl = createServerFn({ method: "GET" }).handler(async () => {
  const auth = await requireAuth();
  const db = getDb();
  const [sub] = await db
    .select({ providerCustomerId: subscriptions.providerCustomerId })
    .from(subscriptions)
    .where(eq(subscriptions.userId, auth.userId))
    .limit(1);

  if (!sub?.providerCustomerId) throw new Error("No subscription found");

  const provider = getProvider();
  const url = await provider.getCustomerPortalUrl(sub.providerCustomerId);
  return { url };
});

export const cancelCurrentSubscription = createServerFn({ method: "POST" }).handler(async () => {
  const auth = await requireAuth();
  const sub = await getUserSubscription(auth.userId);

  if (!sub) throw new Error("No subscription found");
  if (!sub.providerSubscriptionId) throw new Error("No provider subscription ID");
  if (sub.plan === "lifetime") throw new Error("Lifetime subscriptions cannot be canceled");
  if (sub.status !== "active" && sub.status !== "past_due")
    throw new Error("Subscription is not active");

  const provider = getProvider();
  await provider.cancelSubscription(sub.providerSubscriptionId);

  await getDb()
    .update(subscriptions)
    .set({ status: "canceled", canceledAt: new Date(), updatedAt: new Date() })
    .where(eq(subscriptions.userId, auth.userId));

  return { success: true };
});

export const switchSubscriptionPlan = createServerFn({ method: "POST" })
  .inputValidator(z.object({ plan: z.enum(["monthly", "annual"]) }))
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    const sub = await getUserSubscription(auth.userId);

    if (!sub) throw new Error("No subscription found");
    if (!sub.providerSubscriptionId) throw new Error("No provider subscription ID");
    if (sub.status !== "active") throw new Error("Subscription must be active to switch plans");
    if (sub.plan === "lifetime") throw new Error("Lifetime subscriptions cannot be switched");
    if (sub.plan === data.plan) throw new Error("Already on this plan");

    const provider = getProvider();
    await provider.updateSubscriptionPlan(sub.providerSubscriptionId, data.plan);

    await getDb()
      .update(subscriptions)
      .set({ plan: data.plan, canceledAt: null, updatedAt: new Date() })
      .where(eq(subscriptions.userId, auth.userId));

    return { success: true, plan: data.plan };
  });
