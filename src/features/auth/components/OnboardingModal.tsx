import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { completeOnboarding } from "~/features/auth/auth.functions";
import { setCatalogEntry } from "~/features/catalog/catalog.functions";
import { SoundEngine } from "~/features/catalog/catalog.sound";
import { CoverThumb } from "~/features/catalog/components/CoverThumb";
import { StampBadge } from "~/features/catalog/components/StampBadge";

// ─── Data ─────────────────────────────────────────────────────────────────────

type Territory = "movie" | "tv_series" | "anime" | "game";

const TERRITORIES: { type: Territory; label: string; icon: string }[] = [
  { type: "movie", label: "Movies", icon: "◈" },
  { type: "tv_series", label: "TV Shows", icon: "▣" },
  { type: "anime", label: "Anime", icon: "◉" },
  { type: "game", label: "Games", icon: "◆" },
];

const TERRITORY_COLORS: Record<Territory, string> = {
  movie: "var(--color-dg-movie)",
  tv_series: "var(--color-dg-tv)",
  anime: "var(--color-dg-anime)",
  game: "var(--color-dg-game)",
};

type QuickPick = {
  wikidataId: string;
  title: string;
  type: Territory;
  hue: number;
};

const QUICK_PICKS: QuickPick[] = [
  { wikidataId: "Q174910", title: "Spirited Away", type: "anime", hue: 28 },
  { wikidataId: "Q1130437", title: "Cowboy Bebop", type: "anime", hue: 220 },
  { wikidataId: "Q110258814", title: "The Last of Us", type: "game", hue: 145 },
  { wikidataId: "Q1079", title: "Breaking Bad", type: "tv_series", hue: 55 },
  { wikidataId: "Q160236", title: "Akira", type: "anime", hue: 0 },
  { wikidataId: "Q220232", title: "Attack on Titan", type: "anime", hue: 340 },
  { wikidataId: "Q183400", title: "Dark Souls", type: "game", hue: 15 },
  { wikidataId: "Q216538", title: "The Wire", type: "tv_series", hue: 200 },
  { wikidataId: "Q21500755", title: "Blade Runner 2049", type: "movie", hue: 30 },
  { wikidataId: "Q847740", title: "Steins;Gate", type: "anime", hue: 190 },
  { wikidataId: "Q116564692", title: "Tears of the Kingdom", type: "game", hue: 120 },
  { wikidataId: "Q105204609", title: "Severance", type: "tv_series", hue: 180 },
  { wikidataId: "Q494571", title: "Parasite", type: "movie", hue: 50 },
  { wikidataId: "Q1343038", title: "Mob Psycho 100", type: "anime", hue: 290 },
  { wikidataId: "Q65330827", title: "Hades", type: "game", hue: 0 },
  { wikidataId: "Q622294", title: "Succession", type: "tv_series", hue: 40 },
];

// ─── Onboarding Modal ─────────────────────────────────────────────────────────

type OnboardingModalProps = {
  onComplete: () => void;
};

export function OnboardingModal({ onComplete }: OnboardingModalProps) {
  const [step, setStep] = useState(0);
  const [territories, setTerritories] = useState<Set<Territory>>(new Set());
  const [stamped, setStamped] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const queryClient = useQueryClient();

  const visiblePicks =
    territories.size === 0 ? QUICK_PICKS : QUICK_PICKS.filter((p) => territories.has(p.type));

  function toggleTerritory(type: Territory) {
    SoundEngine.stamp();
    setTerritories((prev) => {
      const next = new Set(prev);
      next.has(type) ? next.delete(type) : next.add(type);
      return next;
    });
  }

  function toggleStamp(wikidataId: string) {
    SoundEngine.stamp();
    setStamped((prev) => {
      const next = new Set(prev);
      next.has(wikidataId) ? next.delete(wikidataId) : next.add(wikidataId);
      return next;
    });
  }

  async function handleFinish() {
    if (submitting) return;
    setSubmitting(true);
    try {
      // Write stamped titles to catalog in parallel
      const stampedPicks = QUICK_PICKS.filter((p) => stamped.has(p.wikidataId));
      await Promise.allSettled(
        stampedPicks.map((p) =>
          setCatalogEntry({
            data: {
              wikidataId: p.wikidataId,
              status: "completed",
            },
          }),
        ),
      );
      // Mark onboarding done in DB
      await completeOnboarding({});
      // Invalidate watchlist / tracked ids so homepage refreshes
      await queryClient.invalidateQueries({ queryKey: ["user"] });
    } finally {
      SoundEngine.sealUnlock();
      onComplete();
    }
  }

  return (
    /* Fullscreen backdrop */
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{
        background: "rgba(0,0,0,0.7)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        animation: "scaleIn 280ms var(--ease-smooth) both",
      }}
    >
      {/* Modal card */}
      <div
        className="relative w-full max-w-lg rounded-lg border border-dg-border bg-dg-surface overflow-hidden"
        style={{ maxHeight: "90dvh", overflowY: "auto" }}
      >
        {/* Progress bar */}
        <div className="flex gap-1 p-4 pb-0">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="flex-1 h-[3px] rounded-full transition-colors duration-200"
              style={{
                background: i <= step ? "var(--color-dg-accent)" : "var(--color-dg-border)",
              }}
            />
          ))}
        </div>

        <div className="p-6">
          {step === 0 && (
            <StepTerritories
              territories={territories}
              onToggle={toggleTerritory}
              onNext={() => {
                SoundEngine.navForward();
                setStep(1);
              }}
            />
          )}
          {step === 1 && (
            <StepStamps
              picks={visiblePicks}
              stamped={stamped}
              onToggle={toggleStamp}
              onBack={() => {
                SoundEngine.navBack();
                setStep(0);
              }}
              onNext={() => {
                SoundEngine.navForward();
                setStep(2);
              }}
            />
          )}
          {step === 2 && (
            <StepDone stampCount={stamped.size} submitting={submitting} onFinish={handleFinish} />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Step 0: Territories ──────────────────────────────────────────────────────

function StepTerritories({
  territories,
  onToggle,
  onNext,
}: {
  territories: Set<Territory>;
  onToggle: (t: Territory) => void;
  onNext: () => void;
}) {
  return (
    <div style={{ animation: "fadeIn 280ms var(--ease-smooth) both" }}>
      <h2
        className="font-display font-normal tracking-tight text-dg-text mb-1"
        style={{ fontSize: "1.75rem", letterSpacing: "-0.03em" }}
      >
        Choose your territories
      </h2>
      <p className="text-sm text-dg-text-secondary mb-6 max-w-sm">
        What kind of media do you track? Pick as many as you like.
      </p>

      <div className="grid grid-cols-2 gap-3 mb-6">
        {TERRITORIES.map((t) => {
          const selected = territories.has(t.type);
          const color = TERRITORY_COLORS[t.type];
          return (
            <button
              key={t.type}
              type="button"
              onClick={() => onToggle(t.type)}
              className="rounded-md border-2 p-4 text-center cursor-pointer transition-all duration-150 font-body"
              style={{
                background: selected ? `${color}12` : "var(--color-dg-elevated)",
                borderColor: selected ? color : "var(--color-dg-border)",
                transform: selected ? "scale(1.02)" : "scale(1)",
              }}
            >
              <div
                className="text-2xl mb-2 font-display font-semibold"
                style={{ color: selected ? color : "var(--color-dg-text-tertiary)" }}
              >
                {t.icon}
              </div>
              <div
                className="text-sm font-semibold"
                style={{ color: selected ? color : "var(--color-dg-text)" }}
              >
                {t.label}
              </div>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={onNext}
        disabled={territories.size === 0}
        className="w-full py-3 rounded font-body text-sm font-semibold transition-all duration-150 border-none cursor-pointer"
        style={{
          background: territories.size > 0 ? "var(--color-dg-accent)" : "var(--color-dg-elevated)",
          color: territories.size > 0 ? "white" : "var(--color-dg-text-tertiary)",
          cursor: territories.size === 0 ? "default" : "pointer",
        }}
      >
        Continue
      </button>
    </div>
  );
}

// ─── Step 1: Quick stamps ─────────────────────────────────────────────────────

function StepStamps({
  picks,
  stamped,
  onToggle,
  onBack,
  onNext,
}: {
  picks: QuickPick[];
  stamped: Set<string>;
  onToggle: (id: string) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <div style={{ animation: "fadeIn 280ms var(--ease-smooth) both" }}>
      <h2
        className="font-display font-normal tracking-tight text-dg-text mb-1"
        style={{ fontSize: "1.75rem", letterSpacing: "-0.03em" }}
      >
        Stamp what you've seen
      </h2>
      <p className="text-sm text-dg-text-secondary mb-4 max-w-sm">
        Tap titles you've completed. Seeds your catalog so it doesn't start empty.
      </p>

      <div className="grid grid-cols-4 gap-2 mb-5">
        {picks.map((p, i) => {
          const isStamped = stamped.has(p.wikidataId);
          return (
            <button
              key={p.wikidataId}
              type="button"
              onClick={() => onToggle(p.wikidataId)}
              className="rounded border cursor-pointer text-center p-1.5 font-body transition-all duration-150"
              style={{
                background: isStamped ? "var(--color-dg-accent-soft)" : "var(--color-dg-elevated)",
                borderColor: isStamped ? "var(--color-dg-accent)" : "var(--color-dg-border-subtle)",
                borderWidth: isStamped ? 2 : 1,
                animation: `fadeIn 320ms var(--ease-smooth) both ${i * 20}ms`,
              }}
            >
              <div className="w-full aspect-[2/3] rounded overflow-hidden mb-1">
                <CoverThumb title={p.title} mediaType={p.type} hue={p.hue} size={200} />
              </div>
              <div
                className="text-[0.65rem] font-medium leading-tight mb-0.5 line-clamp-2"
                style={{
                  color: isStamped ? "var(--color-dg-accent)" : "var(--color-dg-text)",
                }}
              >
                {p.title}
              </div>
              <StampBadge type={p.type} index={i} />
              {isStamped && (
                <div
                  className="text-[0.65rem] font-bold mt-0.5"
                  style={{ color: "var(--color-dg-stamped)" }}
                >
                  ■
                </div>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 py-2.5 rounded border border-dg-border bg-dg-elevated text-dg-text-secondary text-sm font-body cursor-pointer transition-colors duration-150 hover:border-dg-border-strong"
        >
          Back
        </button>
        <button
          type="button"
          onClick={onNext}
          className="flex-[2] py-2.5 rounded text-sm font-semibold font-body border-none cursor-pointer transition-all duration-150"
          style={{ background: "var(--color-dg-accent)", color: "white" }}
        >
          {stamped.size > 0
            ? `Continue with ${stamped.size} stamp${stamped.size === 1 ? "" : "s"}`
            : "Skip for now"}
        </button>
      </div>
    </div>
  );
}

// ─── Step 2: Done ─────────────────────────────────────────────────────────────

function StepDone({
  stampCount,
  submitting,
  onFinish,
}: {
  stampCount: number;
  submitting: boolean;
  onFinish: () => void;
}) {
  return (
    <div className="text-center py-8" style={{ animation: "fadeIn 280ms var(--ease-smooth) both" }}>
      <div className="text-5xl mb-4" style={{ animation: "sealPop 500ms var(--ease-spring) both" }}>
        (^_^)
      </div>
      <h2
        className="font-display font-normal text-dg-text mb-2"
        style={{ fontSize: "1.75rem", letterSpacing: "-0.03em" }}
      >
        Your atlas is ready
      </h2>
      <p className="text-sm text-dg-text-secondary mb-8 max-w-xs mx-auto">
        {stampCount > 0
          ? `${stampCount} title${stampCount === 1 ? "" : "s"} stamped. Browse the catalog to chart new territory.`
          : "Start exploring the catalog and stamp your way through media."}
      </p>
      <button
        type="button"
        onClick={onFinish}
        disabled={submitting}
        className="px-10 py-3 rounded text-sm font-semibold font-body border-none cursor-pointer transition-all duration-150"
        style={{
          background: "var(--color-dg-accent)",
          color: "white",
          opacity: submitting ? 0.7 : 1,
        }}
        onMouseEnter={(e) => {
          if (!submitting) e.currentTarget.style.transform = "scale(1.03)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "scale(1)";
        }}
      >
        {submitting ? "Saving..." : "Open Atlas →"}
      </button>
    </div>
  );
}
