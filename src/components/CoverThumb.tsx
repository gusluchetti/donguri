import { useTheme } from "../lib/theme";

/**
 * Hue-based gradient placeholder with first-letter watermark,
 * or real poster when posterUrl is available.
 *
 * Two modes:
 * - **Small** (default, size <= 60): square thumbnail for list rows (36×36).
 * - **Large** (size > 60): 2/3 aspect card for cover grids, deeper gradient,
 *   bigger watermark letter, heavier inner shadow.
 */
export function CoverThumb({
  hue,
  title,
  size = 36,
  posterUrl,
  vtName,
}: {
  hue?: number;
  title: string;
  size?: number;
  posterUrl?: string;
  vtName?: string;
}) {
  const { theme } = useTheme();
  const isLight = theme === "light";
  const isLarge = size > 60;

  if (posterUrl) {
    return (
      <img
        src={posterUrl}
        alt=""
        width={size}
        height={isLarge ? undefined : Math.round(size * 1.5)}
        className={`border border-dg-border-subtle object-cover shrink-0 ${isLarge ? "w-full h-full rounded" : "rounded-sm"}`}
        style={{
          ...(isLarge ? {} : { width: size, height: Math.round(size * 1.5) }),
          ...(vtName ? { viewTransitionName: vtName } : {}),
        }}
        loading="lazy"
      />
    );
  }

  const h = hue ?? 0;
  const ch = title[0]?.toUpperCase() ?? "?";

  if (isLarge) {
    // Cover grid card — 2/3 aspect ratio, deep gradient, large watermark
    return (
      <div
        className="w-full h-full rounded flex items-center justify-center relative overflow-hidden"
        style={{
          ...(vtName ? { viewTransitionName: vtName } : {}),
          background: isLight
            ? `linear-gradient(160deg, hsl(${h},20%,82%) 0%, hsl(${h + 25},16%,74%) 100%)`
            : `linear-gradient(160deg, hsl(${h},22%,18%) 0%, hsl(${h + 25},18%,10%) 100%)`,
          border: "1px solid var(--color-dg-border)",
        }}
      >
        <span
          className="relative font-display font-semibold select-none"
          style={{
            fontSize: 32,
            color: isLight ? `hsla(${h},30%,30%,0.15)` : `hsla(${h},25%,70%,0.15)`,
          }}
        >
          {ch}
        </span>
        <div
          className="absolute inset-0 rounded pointer-events-none"
          style={{
            boxShadow: isLight
              ? "inset 0 0 0 1px rgba(0,0,0,0.04), inset 0 2px 10px rgba(0,0,0,0.06)"
              : "inset 0 0 0 1px rgba(255,255,255,0.025), inset 0 2px 10px rgba(0,0,0,0.25)",
          }}
        />
      </div>
    );
  }

  // Small thumbnail — square, lighter gradient
  return (
    <div
      className="rounded-[3px] border border-dg-border shrink-0 flex items-center justify-center relative overflow-hidden"
      style={{
        width: size,
        height: size,
        ...(vtName ? { viewTransitionName: vtName } : {}),
        background: isLight
          ? `linear-gradient(135deg, hsl(${h},20%,80%) 0%, hsl(${h + 30},16%,72%) 100%)`
          : `linear-gradient(135deg, hsl(${h},22%,20%) 0%, hsl(${h + 30},18%,13%) 100%)`,
      }}
    >
      <span
        className="relative font-display font-semibold select-none"
        style={{
          fontSize: 14,
          color: isLight ? `hsla(${h},30%,30%,0.3)` : `hsla(${h},25%,70%,0.3)`,
        }}
      >
        {ch}
      </span>
      <div
        className="absolute inset-0 rounded-[3px] pointer-events-none"
        style={{
          boxShadow: isLight
            ? "inset 0 0 0 1px rgba(0,0,0,0.04), inset 0 1px 3px rgba(0,0,0,0.06)"
            : "inset 0 0 0 1px rgba(255,255,255,0.03), inset 0 1px 3px rgba(0,0,0,0.2)",
        }}
      />
    </div>
  );
}
