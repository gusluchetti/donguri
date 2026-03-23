import { Link } from "@tanstack/react-router";
import { SoundEngine } from "~/features/catalog/catalog.sound";
import { AcornIcon } from "~/features/media/components/AcornIcon";
import type { Plan } from "~/features/subscription/subscription.provider";

export function toPlan(value: string): Plan {
  if (value === "annual" || value === "lifetime") return value;
  return "monthly";
}

export const PLAN_GRADIENTS: Record<Plan, string> = {
  monthly: "linear-gradient(180deg, #0c2e1a 0%, #164028 40%, #225a3a 100%)",
  annual: "linear-gradient(180deg, #1a1008 0%, #3a2810 40%, #4d3418 100%)",
  lifetime: "linear-gradient(180deg, #10081a 0%, #281840 40%, #3a2050 100%)",
};

export const PLAN_ACCENT: Record<Plan, string> = {
  monthly: "#4ade80",
  annual: "#e8702e",
  lifetime: "#c084fc",
};

export function PlanLandscape({ plan, accent }: { plan: string; accent: string }) {
  if (plan === "annual") {
    return (
      <svg
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        viewBox="0 0 280 178"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path
          d="M0 118 L28 85 L58 100 L95 66 L132 88 L170 64 L208 82 L248 70 L280 88 L280 178 L0 178Z"
          fill={accent}
          opacity="0.07"
        />
        <path
          d="M0 132 L38 102 L72 118 L112 90 L152 112 L192 94 L232 108 L280 98 L280 178 L0 178Z"
          fill={accent}
          opacity="0.15"
        />
        <path
          d="M0 148 L45 122 L88 138 L128 112 L165 132 L205 115 L248 130 L280 122 L280 178 L0 178Z"
          fill={accent}
          opacity="0.28"
        />
        <path
          d="M0 162 L32 150 L72 158 L115 145 L158 155 L205 146 L252 156 L280 148 L280 178 L0 178Z"
          fill={accent}
          opacity="0.45"
        />
      </svg>
    );
  }

  if (plan === "lifetime") {
    return (
      <svg
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        viewBox="0 0 280 178"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path d="M0 115 Q70 100 140 108 T280 104 L280 178 L0 178Z" fill={accent} opacity="0.08" />
        <ellipse cx="140" cy="150" rx="90" ry="9" fill={accent} opacity="0.16" />
        <path
          d="M18 160 L25 138 L32 160Z M32 163 L40 140 L48 163Z M46 157 L53 138 L60 157Z M218 158 L226 136 L234 158Z M233 162 L242 138 L251 162Z M249 157 L258 136 L267 157Z"
          fill={accent}
          opacity="0.34"
        />
        <path d="M0 163 Q70 156 140 160 T280 156 L280 178 L0 178Z" fill={accent} opacity="0.45" />
      </svg>
    );
  }

  return (
    <svg
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      viewBox="0 0 280 178"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path d="M0 108 Q140 96 280 104 L280 178 L0 178Z" fill={accent} opacity="0.06" />
      <path d="M0 122 Q90 108 180 116 T280 113 L280 178 L0 178Z" fill={accent} opacity="0.13" />
      <path
        d="M0 138 Q55 126 115 132 T225 128 T280 135 L280 178 L0 178Z"
        fill={accent}
        opacity="0.24"
      />
      <path
        d="M0 154 Q45 147 90 151 T195 147 T280 152 L280 178 L0 178Z"
        fill={accent}
        opacity="0.40"
      />
    </svg>
  );
}

// Deterministic alphanumeric serial from handle — 36^9 ≈ 101 trillion possibilities
const SERIAL_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
export function handleToSerial(handle: string): string {
  // Two-pass FNV-1a to get 64 bits of entropy (need ~46.5 bits for 36^9)
  let a = 0x811c9dc5;
  let b = 0xdeadbeef;
  for (let i = 0; i < handle.length; i++) {
    const c = handle.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x1b873593) >>> 0;
  }
  let out = "";
  let n = a;
  for (let i = 0; i < 6; i++) {
    out += SERIAL_CHARS[n % 36];
    n = Math.floor(n / 36);
  }
  n = b;
  for (let i = 0; i < 3; i++) {
    out += SERIAL_CHARS[n % 36];
    n = Math.floor(n / 36);
  }
  return `${out.slice(0, 3)}-${out.slice(3, 6)}-${out.slice(6, 9)}`;
}

// Base design dimensions — content is always authored at this size, then scaled to fill maxWidth
const DESIGN_W = 280;
const DESIGN_H = Math.round((DESIGN_W * 53.98) / 85.6); // 177

export function CardFaceContent({
  plan,
  accent,
  handle,
  serial,
}: {
  plan: string;
  accent: string;
  handle: string;
  serial: string;
}) {
  return (
    <div
      style={{
        position: "relative",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 14,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <span
          style={{
            fontFamily: "var(--font-display, serif)",
            fontSize: "0.85rem",
            fontWeight: 600,
            letterSpacing: "0.05em",
            color: accent,
            display: "flex",
            alignItems: "center",
            gap: 5,
          }}
        >
          <AcornIcon size={13} />
          RANGER PASS
        </span>
        <span
          style={{
            fontFamily: "var(--font-mono, monospace)",
            fontSize: "0.6rem",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            borderRadius: 2,
            padding: "1px 6px",
            border: `1px solid ${accent}40`,
            background: `${accent}10`,
            color: accent,
          }}
        >
          {plan}
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <span
          style={{
            fontFamily: "var(--font-body, sans-serif)",
            fontSize: "0.75rem",
            fontWeight: 600,
            color: "rgba(255,255,255,0.9)",
            maxWidth: 160,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {handle.replace(/\.bsky\.social$/, "")}
        </span>
        <span
          style={{
            fontFamily: "var(--font-mono, monospace)",
            fontSize: "0.6rem",
            letterSpacing: "0.08em",
            color: `${accent}99`,
          }}
        >
          {serial}
        </span>
      </div>
    </div>
  );
}

export function RangerPassCard({
  handle,
  plan,
  maxWidth = 280,
}: {
  handle: string;
  plan: string;
  maxWidth?: number;
}) {
  const safePlan = toPlan(plan);
  const gradient = PLAN_GRADIENTS[safePlan];
  const accent = PLAN_ACCENT[safePlan];
  const scale = maxWidth / DESIGN_W;
  const serial = handleToSerial(handle);

  return (
    <div
      className="dg-card-shine select-none"
      style={{
        maxWidth,
        width: "100%",
        aspectRatio: "85.6 / 53.98",
        position: "relative",
        overflow: "hidden",
        borderRadius: 8,
        border: `1px solid ${accent}30`,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: DESIGN_W,
          height: DESIGN_H,
          background: gradient,
          transform: `scale(${scale})`,
          transformOrigin: "0 0",
        }}
      >
        <PlanLandscape plan={plan} accent={accent} />
        <CardFaceContent plan={plan} accent={accent} handle={handle} serial={serial} />
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
