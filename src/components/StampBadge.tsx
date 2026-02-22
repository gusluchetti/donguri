import { mediaTypeLabel, STAMP_COLORS } from "../lib/media-types";

/**
 * Type-colored uppercase badge with double-border and ink grain texture.
 * Replaces the old typeBadgeClass() approach with a richer visual treatment.
 */
export function StampBadge({ type, index = 0 }: { type: string; index?: number }) {
  const color = STAMP_COLORS[type] ?? "var(--color-dg-text-tertiary)";
  // Slight opacity variance per stamp for handmade feel
  const inkOpacity = 0.82 + (((index * 7) % 13) / 13) * 0.18;
  const innerBorderOpacity = 0.2 + (((index * 3) % 7) / 7) * 0.2;

  return (
    <span
      data-stamp-idx={index}
      className="inline-block font-body text-[9px] font-bold tracking-[0.12em] uppercase leading-[1.4] rounded-[1px] whitespace-nowrap relative shrink-0 min-w-[3rem] text-center"
      style={{
        color,
        opacity: inkOpacity,
        border: `1.5px solid ${color}`,
        padding: "1px 5px 0",
        background: "var(--stamp-bg)",
      }}
    >
      <span
        className="absolute pointer-events-none"
        style={{
          inset: 1.5,
          border: `0.5px solid ${color}`,
          opacity: innerBorderOpacity,
        }}
      />
      {mediaTypeLabel(type, true)}
    </span>
  );
}
