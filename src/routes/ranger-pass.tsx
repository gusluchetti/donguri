import { Binoculars, MusicNote, Palette, Sparkle, Star, TrendUp } from "@phosphor-icons/react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Button } from "~/components/Button";
import { LinkButton } from "~/components/LinkButton";
import type { Subscription } from "~/db/schema";
import { RangerPassCard } from "~/features/subscription/components/RangerPassCard";
import {
  cancelCurrentSubscription,
  createCheckoutUrl,
  getCustomerPortalUrl,
  getSubscription,
  switchSubscriptionPlan,
} from "~/features/subscription/subscription.functions";
import type { SubscriptionStatus } from "~/features/subscription/subscription.provider";
import { isSubscriptionActive } from "~/features/subscription/subscription.utils";
import { formatDate } from "~/lib/date";
import { ogTags, pageTitle } from "~/lib/og";

const RangerPassCard3D = lazy(() => import("~/features/subscription/components/RangerPassCard3D"));

type Plan = "monthly" | "annual" | "lifetime";

const PRICES: Record<Plan, { amount: string; period: string; ppp60: string }> = {
  monthly: { amount: "$4", period: "/mo", ppp60: "$1.60" },
  annual: { amount: "$36", period: "/yr", ppp60: "$14.40" },
  lifetime: { amount: "$99", period: "once", ppp60: "$39.60" },
};

const FEATURES = [
  { icon: Palette, title: "Custom stamp colors", desc: "Choose your own palette for type badges" },
  { icon: MusicNote, title: "Sound packs", desc: "Swap the default UI sounds for themed packs" },
  { icon: Sparkle, title: "Extra themes", desc: "Unlock seasonal and special color themes" },
  { icon: TrendUp, title: "Analytics", desc: "Deeper stats on your watching and playing habits" },
  { icon: Star, title: "Achievements", desc: "Unlock badges for milestones in your catalog" },
  { icon: Binoculars, title: "Early access", desc: "Be first to try new features before launch" },
];

const FAQ = [
  {
    q: "What stays free?",
    a: "Everything you use today. Catalog, tracking, search, all auth methods, data sync. Ranger Pass adds cosmetic and analytics features on top.",
  },
  {
    q: "What if I cancel?",
    a: "You keep Ranger Pass until your current billing period ends. After that, everything reverts to the free tier. No data is lost.",
  },
  {
    q: "Can I switch plans?",
    a: "Yes. Upgrade or downgrade anytime — changes take effect at the next billing cycle.",
  },
];

export const Route = createFileRoute("/ranger-pass")({
  loader: async ({ context }) => {
    let subscription = null;
    if (context.auth) {
      try {
        subscription = await getSubscription();
      } catch {
        // Not authenticated or no subscription
      }
    }
    const checkoutEnabled = !!process.env.LEMONSQUEEZY_API_KEY;
    return { subscription, checkoutEnabled };
  },
  head: () => ({
    meta: [
      { title: pageTitle("Ranger Pass — donguri") },
      {
        name: "description",
        content: "Unlock premium features with the donguri Ranger Pass.",
      },
      ...ogTags({
        title: "Ranger Pass — donguri",
        description: "Unlock custom stamps, sound packs, themes, and more.",
        path: "/ranger-pass",
      }),
    ],
  }),
  component: RangerPassPage,
});

function RangerPassPage() {
  const { auth } = Route.useRouteContext();
  const { subscription, checkoutEnabled } = Route.useLoaderData();
  const [plan, setPlan] = useState<Plan>("annual");
  const [loading, setLoading] = useState(false);

  const isSubscribed = isSubscriptionActive(subscription);

  const handleCheckout = async () => {
    if (!checkoutEnabled) return;
    setLoading(true);
    try {
      const { url } = await createCheckoutUrl({ data: { plan } });
      window.location.href = url;
    } catch (e) {
      console.error("[ranger-pass] checkout failed:", e);
      setLoading(false);
    }
  };

  const cardProps = {
    handle: auth?.handle ?? "ranger",
    plan: isSubscribed ? (subscription?.plan ?? plan) : plan,
    entriesCount: 42,
  };

  return (
    <div className="dg-page-enter text-dg-text flex-1 overflow-y-auto font-body">
      <div className="max-w-[700px] mx-auto px-g3 py-g4 sm:py-g6 flex flex-col gap-g6">
        {/* Hero */}
        <div className="flex flex-col items-center gap-g3 text-center">
          <Suspense fallback={<RangerPassCard {...cardProps} />}>
            <RangerPassCard3D {...cardProps} />
          </Suspense>
          <div className="flex flex-col gap-1">
            <h1 className="font-display text-[2rem] sm:text-[2.5rem] font-light leading-tight">
              Ranger Pass
            </h1>
            <p className="text-[0.9rem] text-dg-text-secondary max-w-[420px]">
              Personalize your catalog with custom colors, sounds, themes, and deeper analytics.
            </p>
          </div>
        </div>

        {/* Features */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {FEATURES.map((feat, i) => (
            <div
              key={feat.title}
              className="bg-dg-surface border border-dg-border-subtle rounded p-3 flex flex-col gap-2"
              style={{ animation: `fadeIn 50ms ${20 * i}ms both` }}
            >
              <feat.icon size={20} weight="duotone" className="text-dg-accent" />
              <span className="text-[0.8rem] font-semibold">{feat.title}</span>
              <span className="text-[0.7rem] text-dg-text-tertiary leading-snug">{feat.desc}</span>
            </div>
          ))}
        </div>

        {/* Subscription Management or Pricing */}
        {isSubscribed ? (
          <SubscriptionManagement
            subscription={subscription as Subscription}
            checkoutEnabled={checkoutEnabled}
          />
        ) : (
          <div className="flex flex-col items-center gap-g2">
            <div className="inline-flex rounded-sm border border-dg-border-subtle overflow-hidden">
              {(["monthly", "annual", "lifetime"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  aria-pressed={plan === p}
                  onClick={() => setPlan(p)}
                  className="dg-press font-mono text-[0.7rem] tracking-wider uppercase px-4 py-2 border-none"
                  style={{
                    background: plan === p ? "var(--color-dg-accent-soft)" : "transparent",
                    color: plan === p ? "var(--color-dg-accent)" : "var(--color-dg-text-tertiary)",
                    borderRight:
                      p !== "lifetime" ? "1px solid var(--color-dg-border-subtle)" : "none",
                  }}
                >
                  {p}
                </button>
              ))}
            </div>

            <div className="text-center">
              <span className="font-display text-[2.5rem] font-light">{PRICES[plan].amount}</span>
              <span className="text-dg-text-tertiary text-[0.85rem] ml-1">
                {PRICES[plan].period}
              </span>
              {plan === "annual" && (
                <span className="block text-[0.7rem] text-dg-game mt-1">Save 25% vs monthly</span>
              )}
            </div>

            <div className="flex flex-col items-center gap-2 w-full max-w-[300px]">
              {auth ? (
                <Button
                  variant="primary"
                  onClick={handleCheckout}
                  disabled={!checkoutEnabled || loading}
                  className="w-full"
                >
                  {checkoutEnabled
                    ? loading
                      ? "Redirecting..."
                      : "Get Ranger Pass"
                    : "Coming soon"}
                </Button>
              ) : (
                <LinkButton to="/login" variant="accent" className="w-full text-center">
                  Sign in to subscribe
                </LinkButton>
              )}
            </div>
          </div>
        )}

        {/* FAQ */}
        <div className="flex flex-col gap-g2">
          <h2 className="font-display text-[1.2rem] font-light text-center text-dg-text-secondary">
            Questions
          </h2>
          <div className="flex flex-col gap-3">
            {FAQ.map((item) => (
              <div
                key={item.q}
                className="bg-dg-surface border border-dg-border-subtle rounded p-4"
              >
                <div className="text-[0.85rem] font-semibold mb-1">{item.q}</div>
                <div className="text-[0.8rem] text-dg-text-secondary leading-relaxed">{item.a}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Free tier reassurance */}
        <p className="text-center text-[0.7rem] text-dg-text-tertiary pb-g2">
          donguri is free to use. Ranger Pass is entirely optional — it supports development and
          unlocks extras.
        </p>
      </div>
    </div>
  );
}

// ─── Subscription Management ──────────────────────────────────────────────────

function SubscriptionManagement({
  subscription,
  checkoutEnabled,
}: {
  subscription: Subscription;
  checkoutEnabled: boolean;
}) {
  const router = useRouter();
  const [switchLoading, setSwitchLoading] = useState<Plan | null>(null);
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const confirmTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    return () => {
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
    };
  }, []);

  const reload = useCallback(() => {
    router.invalidate();
  }, [router]);

  const handleSwitch = async (newPlan: "monthly" | "annual") => {
    setSwitchLoading(newPlan);
    try {
      await switchSubscriptionPlan({ data: { plan: newPlan } });
      reload();
    } catch (e) {
      console.error("[ranger-pass] switch failed:", e);
    } finally {
      setSwitchLoading(null);
    }
  };

  const handleCancel = async () => {
    if (!cancelConfirm) {
      setCancelConfirm(true);
      confirmTimer.current = setTimeout(() => setCancelConfirm(false), 3000);
      return;
    }
    setCancelLoading(true);
    try {
      await cancelCurrentSubscription();
      reload();
    } catch (e) {
      console.error("[ranger-pass] cancel failed:", e);
    } finally {
      setCancelLoading(false);
      setCancelConfirm(false);
    }
  };

  const handlePortal = async () => {
    setPortalLoading(true);
    try {
      const { url } = await getCustomerPortalUrl();
      window.location.href = url;
    } catch (e) {
      console.error("[ranger-pass] portal failed:", e);
      setPortalLoading(false);
    }
  };

  const { status, plan, currentPeriodEnd, createdAt, providerCustomerId } = subscription;
  const isComped = subscription.provider === "comped";
  const isLifetime = plan === "lifetime" || status === "lifetime";
  const isActive = status === "active";
  const isCanceled = status === "canceled";
  const isPastDue = status === "past_due";

  const STATUS_LABELS: Record<SubscriptionStatus, { label: string; className: string }> = {
    active: { label: "Active", className: "text-dg-game" },
    canceled: { label: "Canceled", className: "text-dg-anime" },
    past_due: { label: "Payment failed", className: "text-dg-anime" },
    lifetime: { label: "Lifetime", className: "text-dg-accent" },
    expired: { label: "Expired", className: "text-dg-text-tertiary" },
    paused: { label: "Paused", className: "text-dg-text-tertiary" },
  };

  const statusInfo = STATUS_LABELS[status] ?? { label: status, className: "text-dg-text-tertiary" };
  const statusLabel = isComped ? "Complimentary" : statusInfo.label;
  const statusClass = isComped ? "text-dg-accent" : statusInfo.className;

  return (
    <div className="bg-dg-surface border border-dg-border-subtle rounded p-4 sm:p-5 flex flex-col gap-4">
      {/* Status row */}
      <div className="flex items-baseline justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-[0.65rem] tracking-wider uppercase text-dg-text-tertiary">
            Your Ranger Pass
          </span>
          <span className={`font-semibold text-[0.9rem] ${statusClass}`}>{statusLabel}</span>
          {createdAt && (
            <span className="font-mono text-[0.6rem] text-dg-text-tertiary mt-0.5">
              Member since {formatDate(createdAt)}
            </span>
          )}
        </div>
        <div className="flex flex-col items-end gap-0.5">
          {isComped ? (
            <span className="font-mono text-[0.7rem] text-dg-accent">Complimentary</span>
          ) : isLifetime ? (
            <span className="font-mono text-[0.7rem] text-dg-accent">Forever yours</span>
          ) : currentPeriodEnd ? (
            <>
              <span className="font-mono text-[0.65rem] tracking-wider uppercase text-dg-text-tertiary">
                {isCanceled ? "Access until" : "Next billing"}
              </span>
              <span className="font-mono text-[0.8rem] text-dg-text-secondary">
                {formatDate(currentPeriodEnd)}
              </span>
            </>
          ) : null}
        </div>
      </div>

      {/* Comped notice — stop here, no billing UI */}
      {isComped && (
        <div className="bg-dg-accent/8 border border-dg-accent/20 rounded p-3 text-[0.8rem] text-dg-text-secondary leading-relaxed">
          Your Ranger Pass is complimentary — all features are unlocked with no billing required.
        </div>
      )}

      {/* Current plan */}
      {!isComped && !isLifetime && (
        <div className="text-[0.8rem] text-dg-text-secondary">
          Plan:{" "}
          <span className="font-semibold text-dg-text">
            {plan === "annual" ? "Annual" : "Monthly"} ({PRICES[plan as Plan]?.amount}
            {PRICES[plan as Plan]?.period})
          </span>
        </div>
      )}

      {/* Past due warning */}
      {!isComped && isPastDue && (
        <div className="bg-dg-anime/10 border border-dg-anime/20 rounded p-3 text-[0.8rem] text-dg-anime flex flex-col gap-2">
          <span>
            Your last payment failed. Update your payment method to keep your Ranger Pass.
          </span>
          {checkoutEnabled && (
            <Button
              variant="accent"
              size="compact"
              onClick={handlePortal}
              disabled={portalLoading}
              className="self-start"
            >
              {portalLoading ? "Loading..." : "Update payment method"}
            </Button>
          )}
        </div>
      )}

      {/* Plan switching (active subs only, not lifetime, not comped) */}
      {!isComped && isActive && !isLifetime && checkoutEnabled && (
        <div className="flex flex-col gap-2">
          <span className="font-mono text-[0.65rem] tracking-wider uppercase text-dg-text-tertiary">
            Switch plan
          </span>
          <div className="flex gap-2">
            {plan !== "monthly" && (
              <Button
                variant="secondary"
                size="compact"
                onClick={() => handleSwitch("monthly")}
                disabled={switchLoading !== null}
              >
                {switchLoading === "monthly" ? "Switching..." : "Monthly ($4/mo)"}
              </Button>
            )}
            {plan !== "annual" && (
              <Button
                variant="secondary"
                size="compact"
                onClick={() => handleSwitch("annual")}
                disabled={switchLoading !== null}
              >
                {switchLoading === "annual" ? "Switching..." : "Annual ($36/yr)"}
              </Button>
            )}
            <Button
              variant="secondary"
              size="compact"
              disabled={switchLoading !== null}
              onClick={async () => {
                setSwitchLoading("lifetime");
                try {
                  const { url } = await createCheckoutUrl({ data: { plan: "lifetime" } });
                  window.location.href = url;
                } catch (e) {
                  console.error("[ranger-pass] lifetime checkout failed:", e);
                  setSwitchLoading(null);
                }
              }}
            >
              {switchLoading === "lifetime" ? "Redirecting..." : "Lifetime ($99)"}
            </Button>
          </div>
        </div>
      )}

      {/* Canceled state: access-until + resume via portal */}
      {!isComped && isCanceled && checkoutEnabled && (
        <div className="flex flex-col gap-2">
          <span className="text-[0.8rem] text-dg-text-secondary">
            Your subscription is canceled. You'll keep access until {formatDate(currentPeriodEnd)}.
          </span>
          <Button
            variant="secondary"
            size="compact"
            onClick={handlePortal}
            disabled={portalLoading}
            className="self-start"
          >
            {portalLoading ? "Loading..." : "Resume subscription"}
          </Button>
        </div>
      )}

      {/* Cancel button (active or past_due, not lifetime, not comped) */}
      {!isComped && (isActive || isPastDue) && !isLifetime && checkoutEnabled && (
        <div className="border-t border-dg-border-subtle pt-3 flex flex-col gap-1.5">
          <Button
            variant="danger"
            size="compact"
            onClick={handleCancel}
            disabled={cancelLoading}
            className="self-start"
          >
            {cancelLoading
              ? "Canceling..."
              : cancelConfirm
                ? "Confirm cancel"
                : "Cancel subscription"}
          </Button>
          {!cancelConfirm && (
            <span className="text-[0.65rem] text-dg-text-tertiary">
              Canceling stops future charges. You keep full Ranger Pass access until{" "}
              {currentPeriodEnd ? formatDate(currentPeriodEnd) : "your period ends"}. After that,
              you return to the free tier. No tracking data is lost.
            </span>
          )}
        </div>
      )}

      {/* Manage billing link — always shown for paying subscribers with a customer ID */}
      {!isComped && providerCustomerId && checkoutEnabled && (
        <button
          type="button"
          onClick={handlePortal}
          disabled={portalLoading}
          className="self-start font-mono text-[0.65rem] text-dg-text-tertiary hover:text-dg-text-secondary transition-colors duration-150 border-none bg-transparent cursor-pointer"
        >
          {portalLoading ? "Loading..." : "Manage billing & invoices →"}
        </button>
      )}
    </div>
  );
}
