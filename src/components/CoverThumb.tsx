import { TYPE_HUES } from "../lib/media-types";
import { useTheme } from "../lib/theme";

/**
 * Hue-based gradient placeholder with first-letter watermark,
 * or real poster when posterUrl is available.
 *
 * Two modes:
 * - **Small** (default, size <= 60): 2:3 portrait thumbnail for list rows (36×54).
 * - **Large** (size > 60): 2/3 aspect card for cover grids, deeper gradient,
 *   bigger watermark letter, heavier inner shadow.
 */
export function CoverThumb({
  hue,
  mediaType,
  title,
  size = 36,
  posterUrl,
  vtName,
}: {
  hue?: number;
  mediaType?: string;
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

  const h = hue ?? (mediaType ? (TYPE_HUES[mediaType] ?? 0) : 0);

  // Build acronym from first letter of each word, capped at 5 chars
  const initials = title
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase())
    .join("")
    .slice(0, 5) || "?";

  // Scale font size down as more letters appear
  const smallFontSize = initials.length <= 1 ? 14 : initials.length <= 2 ? 12 : initials.length <= 3 ? 10 : initials.length <= 4 ? 8 : 7;
  const largeFontSize = initials.length <= 1 ? 32 : initials.length <= 2 ? 26 : initials.length <= 3 ? 20 : initials.length <= 4 ? 16 : 13;

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
          className="relative font-display font-semibold select-none tracking-tight"
          style={{
            fontSize: largeFontSize,
            color: isLight ? `hsla(${h},30%,30%,0.15)` : `hsla(${h},25%,70%,0.15)`,
          }}
        >
          {initials}
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

  // Small thumbnail — 2:3 portrait, lighter gradient (matches poster image dimensions)
  return (
    <div
      className="rounded-[3px] border border-dg-border shrink-0 flex items-center justify-center relative overflow-hidden"
      style={{
        width: size,
        height: Math.round(size * 1.5),
        ...(vtName ? { viewTransitionName: vtName } : {}),
        background: isLight
          ? `linear-gradient(135deg, hsl(${h},20%,80%) 0%, hsl(${h + 30},16%,72%) 100%)`
          : `linear-gradient(135deg, hsl(${h},22%,20%) 0%, hsl(${h + 30},18%,13%) 100%)`,
      }}
    >
      <span
        className="relative font-display font-semibold select-none tracking-tight"
        style={{
          fontSize: smallFontSize,
          color: isLight ? `hsla(${h},30%,30%,0.3)` : `hsla(${h},25%,70%,0.3)`,
        }}
      >
        {initials}
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
