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
  memberSince,
  plan,
  entriesCount,
  dimmed,
}: {
  handle: string;
  memberSince: string | null;
  plan: string;
  entriesCount: number;
  dimmed?: boolean;
}) {
  const gradient = PLAN_GRADIENTS[plan] ?? PLAN_GRADIENTS.monthly;
  const accent = PLAN_ACCENT[plan] ?? PLAN_ACCENT.monthly;
  const year = memberSince ? new Date(memberSince).getFullYear() : new Date().getFullYear();

  return (
    <div
      className="relative overflow-hidden rounded-lg border select-none"
      style={{
        aspectRatio: "85.6 / 53.98",
        maxWidth: 360,
        width: "100%",
        background: gradient,
        borderColor: dimmed ? "var(--color-dg-border-subtle)" : `${accent}30`,
        opacity: dimmed ? 0.5 : 1,
        filter: dimmed ? "grayscale(0.6)" : "none",
        transition: "opacity 200ms, filter 200ms",
      }}
    >
      {/* Terrain lines */}
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 360 228"
        preserveAspectRatio="none"
        style={{ opacity: 0.12 }}
        aria-hidden="true"
      >
        <path
          d="M0 180 Q60 140 120 160 T240 145 T360 170 V228 H0Z"
          fill="none"
          stroke={accent}
          strokeWidth="0.8"
        />
        <path
          d="M0 195 Q90 170 180 185 T360 175 V228 H0Z"
          fill="none"
          stroke={accent}
          strokeWidth="0.5"
        />
        <path d="M0 210 Q80 195 160 200 T320 192 T360 205 V228 H0Z" fill={accent} opacity="0.15" />
      </svg>

      {/* Content */}
      <div className="relative h-full flex flex-col justify-between p-4 sm:p-5">
        <div className="flex items-start justify-between">
          <div className="flex flex-col gap-0.5">
            <span
              className="font-mono text-[7px] tracking-[0.25em] uppercase"
              style={{ color: `${accent}90` }}
            >
              donguri
            </span>
            <span
              className="font-display text-[1rem] sm:text-[1.1rem] font-semibold tracking-wide"
              style={{ color: accent }}
            >
              RANGER PASS
            </span>
          </div>
          <span
            className="font-mono text-[8px] tracking-[0.15em] uppercase rounded-sm px-1.5 py-0.5 border"
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
          <div className="flex flex-col gap-1">
            <span
              className="font-body text-[0.85rem] sm:text-[0.95rem] font-semibold truncate max-w-[200px]"
              style={{ color: "rgba(255,255,255,0.9)" }}
            >
              {handle}
            </span>
            <div className="flex items-center gap-3">
              <span
                className="font-mono text-[8px] tabular-nums"
                style={{ color: "rgba(255,255,255,0.4)" }}
              >
                {year}
              </span>
              <span
                className="font-mono text-[8px] tabular-nums"
                style={{ color: "rgba(255,255,255,0.4)" }}
              >
                {entriesCount} entries
              </span>
            </div>
          </div>
          <div className="font-mono text-[7px] tabular-nums" style={{ color: `${accent}50` }}>
            NO. {String(entriesCount).padStart(4, "0")}
          </div>
        </div>
      </div>
    </div>
  );
}
