export function SectionHeader({
  label,
  color,
  count,
  icon,
  collapsed,
  onToggle,
}: {
  label: string;
  color: string;
  count: number | string;
  icon: string;
  collapsed?: boolean;
  onToggle?: () => void;
}) {
  const inner = (
    <div
      className={`flex items-center gap-g1 py-g2 pb-g1 ${onToggle ? "cursor-pointer select-none" : ""}`}
    >
      <div className="w-[2.5px] h-[18px] rounded-sm shrink-0" style={{ background: color }} />
      <span className="text-xs font-bold tracking-[0.1em] uppercase" style={{ color }}>
        {icon} {label}
      </span>
      <span className="text-[9px] text-dg-text-tertiary tabular-nums">{count}</span>
      <div
        className="flex-1 h-px"
        style={{
          background: `linear-gradient(90deg, ${color}28, transparent)`,
        }}
      />
      {onToggle != null && (
        <span
          className="text-dg-text-tertiary text-[0.65rem] transition-transform duration-150"
          style={{ transform: collapsed ? "rotate(-90deg)" : "rotate(0)" }}
        >
          {"\u25BE"}
        </span>
      )}
    </div>
  );

  if (onToggle) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left bg-transparent border-none p-0 m-0 font-body"
      >
        {inner}
      </button>
    );
  }

  return inner;
}
