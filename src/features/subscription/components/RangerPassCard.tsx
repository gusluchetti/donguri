import { Link } from "@tanstack/react-router";
import { SoundEngine } from "~/features/catalog/catalog.sound";

const PLAN_GRADIENTS: Record<string, string> = {
  monthly: "linear-gradient(135deg, #1a3a2a 0%, #0d2818 30%, #1a4030 60%, #0f3020 100%)",
  annual: "linear-gradient(135deg, #2a1a0a 0%, #3d2815 30%, #4a3018 60%, #2a1a0a 100%)",
  lifetime: "linear-gradient(135deg, #1a1028 0%, #2a1838 30%, #3a2048 60%, #1a1028 100%)",
};

const PLAN_ACCENT: Record<string, string> = {
  monthly: "#4ade80",
  annual: "#e8702e",
  lifetime: "#c084fc",
};

export function RangerPassCard({
  handle,
  plan,
  entriesCount,
}: {
  handle: string;
  plan: string;
  entriesCount: number;
}) {
  const gradient = PLAN_GRADIENTS[plan] ?? PLAN_GRADIENTS.monthly;
  const accent = PLAN_ACCENT[plan] ?? PLAN_ACCENT.monthly;

  return (
    <div
      className="dg-card-shine relative overflow-hidden rounded-lg border select-none"
      style={{
        maxWidth: 280,
        width: "100%",
        aspectRatio: "85.6 / 53.98",
        background: gradient,
        borderColor: `${accent}30`,
      }}
    >
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 280 178"
        preserveAspectRatio="none"
        style={{ opacity: 0.12 }}
        aria-hidden="true"
      >
        <path
          d="M0 140 Q50 120 100 132 T200 122 T280 138 V178 H0Z"
          fill="none"
          stroke={accent}
          strokeWidth="0.6"
        />
        <path d="M0 158 Q60 148 120 154 T240 148 T280 156 V178 H0Z" fill={accent} opacity="0.15" />
      </svg>

      <div className="relative h-full flex flex-col justify-between p-3.5">
        <div className="flex items-start justify-between">
          <div className="flex flex-col">
            <span
              className="font-mono text-[0.6rem] tracking-[0.2em] uppercase"
              style={{ color: `${accent}90` }}
            >
              donguri
            </span>
            <span
              className="font-display text-[0.85rem] font-semibold tracking-wide"
              style={{ color: accent }}
            >
              RANGER PASS
            </span>
          </div>
          <span
            className="font-mono text-[0.6rem] tracking-[0.12em] uppercase rounded-sm px-1.5 py-px border"
            style={{
              color: accent,
              borderColor: `${accent}40`,
              background: `${accent}10`,
            }}
          >
            {plan}
          </span>
        </div>

        <div className="flex items-end justify-between">
          <span
            className="font-body text-[0.75rem] font-semibold truncate max-w-[160px]"
            style={{ color: "rgba(255,255,255,0.9)" }}
          >
            {handle.replace(/\.bsky\.social$/, "")}
          </span>
          <span className="font-mono text-[0.6rem] tabular-nums" style={{ color: `${accent}50` }}>
            NO. {String(entriesCount).padStart(4, "0")}
          </span>
        </div>
      </div>
    </div>
  );
}

export function UpsellBanner() {
  const accent = PLAN_ACCENT.annual;
  return (
    <Link
      to="/ranger-pass"
      className="no-underline block group"
      onClick={() => SoundEngine.navForward()}
    >
      <div
        className="relative overflow-hidden rounded-lg border select-none transition-all duration-200 group-hover:border-dg-accent/40"
        style={{
          background: "linear-gradient(135deg, #1a1208 0%, #2a1a0a 40%, #1a1208 100%)",
          borderColor: "var(--color-dg-border-subtle)",
        }}
      >
        <svg
          className="absolute inset-0 w-full h-full"
          viewBox="0 0 800 56"
          preserveAspectRatio="none"
          style={{ opacity: 0.08 }}
          aria-hidden="true"
        >
          <path
            d="M0 42 Q100 30 200 38 T400 32 T600 38 T800 34 V56 H0Z"
            fill={accent}
            opacity="0.3"
          />
        </svg>

        <div className="relative flex items-center justify-between px-4 py-2.5 gap-4">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="font-display text-[0.75rem] font-semibold tracking-wide opacity-50 group-hover:opacity-100 transition-opacity duration-200"
              style={{ color: accent }}
            >
              RANGER PASS
            </span>
            <span className="font-body text-[0.75rem] text-dg-text-tertiary group-hover:text-dg-text-secondary transition-colors duration-200">
              Unlock the full experience
            </span>
          </div>
          <span
            className="font-mono text-[0.7rem] font-semibold tracking-wide opacity-0 group-hover:opacity-100 transition-opacity duration-200 shrink-0"
            style={{ color: accent }}
          >
            Learn more &rarr;
          </span>
        </div>
      </div>
    </Link>
  );
}
