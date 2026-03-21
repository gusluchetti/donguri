import {
  cancelSubscription,
  createCheckout,
  getCustomer,
  lemonSqueezySetup,
  updateSubscription,
} from "@lemonsqueezy/lemonsqueezy.js";
import type { Subscription } from "~/db/schema";
import { cleanEnv } from "~/lib/env";

export type Plan = Subscription["plan"];
export type SubscriptionStatus = Subscription["status"];

export type SubscriptionUpsertData = {
  provider: string;
  providerCustomerId: string;
  providerSubscriptionId?: string;
  providerOrderId?: string;
  providerPriceId: string;
  plan: Plan;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date | null;
};

export type WebhookResult = { userId: string } & (
  | {
      action: "subscription_created" | "lifetime_created";
      data: SubscriptionUpsertData;
    }
  | {
      action: "subscription_updated";
      data: Partial<SubscriptionUpsertData> & { status?: SubscriptionStatus };
    }
  | { action: "status_change"; status: SubscriptionStatus }
  | { action: "ignored" }
);

export interface PaymentProvider {
  name: string;
  createCheckoutUrl(opts: { userId: string; plan: Plan; discountCode?: string }): Promise<string>;
  getCustomerPortalUrl(providerCustomerId: string): Promise<string>;
  cancelSubscription(providerSubscriptionId: string): Promise<void>;
  updateSubscriptionPlan(providerSubscriptionId: string, newPlan: Plan): Promise<void>;
  handleWebhook(rawBody: string, signature: string): Promise<WebhookResult>;
}

// ─── Lemon Squeezy ──────────────────────────────────────────────────────────

const VARIANT_ENV_MAP = {
  monthly: "LEMONSQUEEZY_RANGER_MONTHLY_VARIANT_ID",
  annual: "LEMONSQUEEZY_RANGER_ANNUAL_VARIANT_ID",
  lifetime: "LEMONSQUEEZY_RANGER_LIFETIME_VARIANT_ID",
} as const;

function resolvePlan(variantId: number): Plan {
  const vid = String(variantId);
  for (const [plan, envKey] of Object.entries(VARIANT_ENV_MAP)) {
    if (vid === cleanEnv(process.env[envKey])) return plan as Plan;
  }
  throw new Error(
    `Unknown variant ID: ${variantId} — check LEMONSQUEEZY_RANGER_*_VARIANT_ID env vars`,
  );
}

async function verifyLsSignature(rawBody: string, signature: string): Promise<boolean> {
  const secret = cleanEnv(process.env.LEMONSQUEEZY_WEBHOOK_SECRET);
  if (!secret) throw new Error("LEMONSQUEEZY_WEBHOOK_SECRET not set");

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const expected = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return expected === signature;
}

type LsWebhookEvent = {
  meta: {
    event_name: string;
    custom_data?: { user_id?: string };
  };
  data: {
    id: string;
    type: string;
    attributes: {
      customer_id: number;
      variant_id: number;
      order_id?: number;
      status: string;
      renews_at?: string | null;
      ends_at?: string | null;
      created_at?: string;
      cancelled?: boolean;
    };
  };
};

let lsInitialized = false;
function ensureLsSetup() {
  if (lsInitialized) return;
  const apiKey = cleanEnv(process.env.LEMONSQUEEZY_API_KEY);
  if (!apiKey) throw new Error("LEMONSQUEEZY_API_KEY not set");
  lemonSqueezySetup({ apiKey });
  lsInitialized = true;
}

export const lemonSqueezy: PaymentProvider = {
  name: "lemonsqueezy",

  async createCheckoutUrl({ userId, plan, discountCode }) {
    ensureLsSetup();

    const variantId = cleanEnv(process.env[VARIANT_ENV_MAP[plan]]);
    if (!variantId) throw new Error("Variant ID not configured for this plan");

    const storeId = cleanEnv(process.env.LEMONSQUEEZY_STORE_ID);
    if (!storeId) throw new Error("LEMONSQUEEZY_STORE_ID not set");

    const { data, error } = await createCheckout(storeId, variantId, {
      checkoutData: {
        custom: { user_id: userId },
        ...(discountCode ? { discountCode } : {}),
      },
    });

    if (error || !data) throw new Error("Failed to create checkout");
    return data.data.attributes.url;
  },

  async getCustomerPortalUrl(providerCustomerId) {
    ensureLsSetup();

    const { data, error } = await getCustomer(providerCustomerId);
    if (error || !data) throw new Error("Failed to fetch customer");

    const portalUrl = data.data.attributes.urls.customer_portal;
    if (!portalUrl) throw new Error("Customer has no portal URL");
    return portalUrl;
  },

  async cancelSubscription(providerSubscriptionId) {
    ensureLsSetup();
    const { error } = await cancelSubscription(providerSubscriptionId);
    if (error) throw new Error("Failed to cancel subscription");
  },

  async updateSubscriptionPlan(providerSubscriptionId, newPlan) {
    ensureLsSetup();
    const variantId = cleanEnv(process.env[VARIANT_ENV_MAP[newPlan]]);
    if (!variantId) throw new Error("Variant ID not configured for this plan");
    const { error } = await updateSubscription(providerSubscriptionId, {
      variantId: Number(variantId),
    });
    if (error) throw new Error("Failed to update subscription");
  },

  async handleWebhook(rawBody, signature): Promise<WebhookResult> {
    const valid = await verifyLsSignature(rawBody, signature);
    if (!valid) throw new Error("Invalid webhook signature");

    const event = JSON.parse(rawBody) as LsWebhookEvent;
    const eventName = event.meta.event_name;
    const userId = event.meta.custom_data?.user_id;
    if (!userId) throw new Error("Missing user_id in custom_data");

    const attrs = event.data.attributes;
    const plan = resolvePlan(attrs.variant_id);

    switch (eventName) {
      case "subscription_created":
        return {
          userId,
          action: "subscription_created",
          data: {
            provider: "lemonsqueezy",
            providerCustomerId: String(attrs.customer_id),
            providerSubscriptionId: event.data.id,
            providerPriceId: String(attrs.variant_id),
            plan,
            currentPeriodStart: new Date(),
            currentPeriodEnd: attrs.renews_at ? new Date(attrs.renews_at) : null,
          },
        };

      case "subscription_updated":
        return {
          userId,
          action: "subscription_updated",
          data: {
            status: attrs.status as SubscriptionStatus,
            currentPeriodEnd: attrs.renews_at ? new Date(attrs.renews_at) : null,
          },
        };

      case "subscription_cancelled":
        return { userId, action: "status_change", status: "canceled" };

      case "subscription_expired":
        return { userId, action: "status_change", status: "expired" };

      case "subscription_payment_failed":
        return { userId, action: "status_change", status: "past_due" };

      case "subscription_resumed":
        return { userId, action: "status_change", status: "active" };

      case "order_created": {
        if (plan !== "lifetime") return { userId, action: "ignored" };
        return {
          userId,
          action: "lifetime_created",
          data: {
            provider: "lemonsqueezy",
            providerCustomerId: String(attrs.customer_id),
            providerOrderId: String(attrs.order_id),
            providerPriceId: String(attrs.variant_id),
            plan: "lifetime",
          },
        };
      }

      default:
        console.log("[webhook:payment] unhandled event:", eventName);
        return { userId, action: "ignored" };
    }
  },
};

export function getProvider(): PaymentProvider {
  return lemonSqueezy;
}
