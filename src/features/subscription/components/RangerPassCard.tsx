import { Link } from "@tanstack/react-router";
import { SoundEngine } from "~/features/catalog/catalog.sound";

function AcornIcon({ color, size = 12 }: { color: string; size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 256 256"
      width={size}
      height={size}
      fill={color}
      style={{ display: "inline", verticalAlign: "middle", flexShrink: 0 }}
      aria-hidden="true"
    >
      <path d="M232,104a56.06,56.06,0,0,0-56-56H136a24,24,0,0,1,24-24,8,8,0,0,0,0-16,40,40,0,0,0-40,40H80a56.06,56.06,0,0,0-56,56,16,16,0,0,0,8,13.83V128c0,35.53,33.12,62.12,59.74,83.49C103.66,221.07,120,234.18,120,240a8,8,0,0,0,16,0c0-5.82,16.34-18.93,28.26-28.51C190.88,190.12,224,163.53,224,128V117.83A16,16,0,0,0,232,104ZM80,64h96a40.06,40.06,0,0,1,40,40H40A40,40,0,0,1,80,64Zm74.25,135c-10.62,8.52-20,16-26.25,23.37-6.25-7.32-15.63-14.85-26.25-23.37C77.8,179.79,48,155.86,48,128v-8H208v8C208,155.86,178.2,179.79,154.25,199Z" />
    </svg>
  );
}

export const PLAN_GRADIENTS: Record<string, string> = {
  monthly: "linear-gradient(180deg, #0c2e1a 0%, #164028 40%, #225a3a 100%)",
  annual: "linear-gradient(180deg, #1a1008 0%, #3a2810 40%, #4d3418 100%)",
  lifetime: "linear-gradient(180deg, #10081a 0%, #281840 40%, #3a2050 100%)",
};

export const PLAN_ACCENT: Record<string, string> = {
  monthly: "#4ade80",
  annual: "#e8702e",
  lifetime: "#c084fc",
};

export function PlanLandscape({ plan, accent }: { plan: string; accent: string }) {
  if (plan === "annual") {
    // Mountains — jagged peaks, layered ridgelines
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
    // Valley — pine silhouettes, reflective lake, atmospheric depth
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

  // Monthly — Prairie: rolling hills, open sky
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

// Base design dimensions — content is always authored at this size, then scaled to fill maxWidth
const DESIGN_W = 280;
const DESIGN_H = Math.round((DESIGN_W * 53.98) / 85.6); // 177

export function RangerPassCard({
  handle,
  plan,
  entriesCount,
  maxWidth = 280,
}: {
  handle: string;
  plan: string;
  entriesCount: number;
  maxWidth?: number;
}) {
  const gradient = PLAN_GRADIENTS[plan] ?? PLAN_GRADIENTS.monthly;
  const accent = PLAN_ACCENT[plan] ?? PLAN_ACCENT.monthly;
  const scale = maxWidth / DESIGN_W;

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
          <div
            style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}
          >
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
              <AcornIcon color={accent} size={13} />
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
                fontVariantNumeric: "tabular-nums",
                color: `${accent}50`,
              }}
            >
              NO. {String(entriesCount).padStart(4, "0")}
            </span>
          </div>
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
