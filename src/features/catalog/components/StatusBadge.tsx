import {
  STATUS_ICONS,
  STATUS_LABELS_GENERIC,
  type StatusValue,
} from "~/features/media/media-types";

const STATUS_COLOR_MAP: Record<StatusValue, string> = {
  planned: "var(--color-dg-charted)",
  in_progress: "var(--color-dg-enroute)",
  on_hold: "var(--color-dg-paused)",
  completed: "var(--color-dg-stamped)",
  mastered: "var(--color-dg-sealed)",
  dropped: "var(--color-dg-dropped)",
};

/**
 * Clickable status indicator with icon + label.
 * Fires `stampDown` CSS animation when `animating` is true.
 */
export function StatusBadge({
  status,
  compact,
  animating,
  onClick,
}: {
  status: StatusValue;
  compact?: boolean;
  animating?: boolean;
  onClick?: () => void;
}) {
  const color = STATUS_COLOR_MAP[status];
  const icon = STATUS_ICONS[status];
  const label = STATUS_LABELS_GENERIC[status];
  if (!color) return null;

  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 font-body font-bold tracking-[0.08em] uppercase rounded-[2px] whitespace-nowrap relative"
      style={{
        fontSize: compact ? "9px" : "0.6875rem",
        color,
        border: compact ? `1.5px solid ${color}` : `2px solid ${color}`,
        padding: compact ? "1px 6px 0" : "4px 12px 3px",
        background: "var(--stamp-bg)",
        cursor: onClick ? "pointer" : "default",
        transition: "all 120ms var(--ease-spring)",
        animation: animating ? "stampDown 300ms var(--ease-smooth) both" : "none",
      }}
    >
      <span
        className="absolute pointer-events-none"
        style={{
          inset: compact ? 1 : 2.5,
          border: `0.5px solid ${color}`,
          opacity: 0.25,
        }}
      />
      <span className="text-[8px]">{icon}</span>
      {label}
    </button>
  );
}
