export function SectionHeader({
  label,
  color,
  count,
  icon,
}: {
  label: string;
  color: string;
  count: number | string;
  icon: string;
}) {
  return (
    <div className="flex items-center gap-g1 py-g2 pb-g1">
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
    </div>
  );
}
