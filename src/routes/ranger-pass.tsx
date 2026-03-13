import { Binoculars, MusicNote, Palette, Sparkle, Star, TrendUp } from "@phosphor-icons/react";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "~/components/Button";
import { LinkButton } from "~/components/LinkButton";
import { RangerPassCard } from "~/features/subscription/components/RangerPassCard";
import {
  createCheckoutUrl,
  getCustomerPortalUrl,
  getSubscription,
} from "~/features/subscription/subscription.functions";
import { ogTags, pageTitle } from "~/lib/og";

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
    a: "Yes. Upgrade or downgrade anytime from the customer portal. Changes take effect at the next billing cycle.",
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
    return { subscription };
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
  const { subscription } = Route.useLoaderData();
  const [plan, setPlan] = useState<Plan>("annual");
  const [loading, setLoading] = useState(false);

  const isSubscribed =
    subscription && ["active", "canceled", "past_due", "lifetime"].includes(subscription.status);

  const handleCheckout = async () => {
    setLoading(true);
    try {
      const { url } = await createCheckoutUrl({ data: { plan } });
      window.location.href = url;
    } catch (e) {
      console.error("[ranger-pass] checkout failed:", e);
      setLoading(false);
    }
  };

  const handlePortal = async () => {
    setLoading(true);
    try {
      const { url } = await getCustomerPortalUrl();
      window.location.href = url;
    } catch (e) {
      console.error("[ranger-pass] portal failed:", e);
      setLoading(false);
    }
  };

  return (
    <div className="dg-page-enter text-dg-text flex-1 overflow-y-auto font-body">
      <div className="max-w-[700px] mx-auto px-g3 py-g4 sm:py-g6 flex flex-col gap-g6">
        {/* Hero */}
        <div className="flex flex-col items-center gap-g3 text-center">
          <RangerPassCard
            handle={auth?.handle ?? "ranger"}
            memberSince={null}
            plan={plan}
            entriesCount={42}
          />
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

        {/* Pricing */}
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
            <span className="text-dg-text-tertiary text-[0.85rem] ml-1">{PRICES[plan].period}</span>
            {plan === "annual" && (
              <span className="block text-[0.7rem] text-dg-game mt-1">Save 25% vs monthly</span>
            )}
          </div>

          {/* CTA */}
          <div className="flex flex-col items-center gap-2 w-full max-w-[300px]">
            {isSubscribed ? (
              <>
                <div className="text-[0.85rem] text-dg-game font-semibold">You're a Ranger</div>
                <Button
                  variant="secondary"
                  onClick={handlePortal}
                  disabled={loading}
                  className="w-full"
                >
                  {loading ? "Loading..." : "Manage subscription"}
                </Button>
              </>
            ) : auth ? (
              <Button
                variant="primary"
                onClick={handleCheckout}
                disabled={loading}
                className="w-full"
              >
                {loading ? "Redirecting..." : "Get Ranger Pass"}
              </Button>
            ) : (
              <LinkButton to="/login" variant="accent" className="w-full text-center">
                Sign in to subscribe
              </LinkButton>
            )}
          </div>
        </div>

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
