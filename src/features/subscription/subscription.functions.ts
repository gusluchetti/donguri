import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "~/db";
import { subscriptions } from "~/db/schema";
import { requireAuth } from "~/features/auth/auth.session";
import { getProvider } from "~/features/subscription/subscription.provider";
import { getPppTier } from "~/features/subscription/subscription.regions";

export const getSubscription = createServerFn({ method: "GET" }).handler(async () => {
  const auth = await requireAuth();
  const db = getDb();
  const [row] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, auth.userId))
    .limit(1);
  return row ?? null;
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
