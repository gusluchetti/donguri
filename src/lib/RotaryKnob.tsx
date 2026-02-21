import { useCallback, useRef } from "react";

interface RotaryKnobProps {
  value: number;
  onChange: (value: number) => void;
  size?: number;
  strokeWidth?: number;
  color?: string;
  disabled?: boolean;
}

const START_ANGLE = 135;
const END_ANGLE = 405;
const SWEEP = END_ANGLE - START_ANGLE;

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const sweep = endAngle - startAngle;
  const largeArc = sweep > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`;
}

export function RotaryKnob({
  value,
  onChange,
  size = 80,
  strokeWidth = 6,
  color = "var(--dg-accent)",
  disabled = false,
}: RotaryKnobProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);

  const cx = size / 2;
  const cy = size / 2;
  const r = (size - strokeWidth * 2) / 2;

  const valueAngle = START_ANGLE + (value / 100) * SWEEP;
  const trackPath = describeArc(cx, cy, r, START_ANGLE, END_ANGLE);
  const arcPath = value > 0 ? describeArc(cx, cy, r, START_ANGLE, valueAngle) : "";

  const angleToValue = useCallback(
    (clientX: number, clientY: number) => {
      const svg = svgRef.current;
      if (!svg) return value;
      const rect = svg.getBoundingClientRect();
      const dx = clientX - (rect.left + rect.width / 2);
      const dy = clientY - (rect.top + rect.height / 2);
      let angle = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
      if (angle < 0) angle += 360;

      // Map angle to value within the sweep range
      let normalizedAngle = angle - START_ANGLE;
      if (normalizedAngle < -45) normalizedAngle += 360;
      const clamped = Math.max(0, Math.min(SWEEP, normalizedAngle));
      return Math.round((clamped / SWEEP) * 100);
    },
    [value],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (disabled) return;
      e.preventDefault();
      dragging.current = true;
      (e.target as Element).setPointerCapture(e.pointerId);
      onChange(angleToValue(e.clientX, e.clientY));
    },
    [disabled, onChange, angleToValue],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current || disabled) return;
      onChange(angleToValue(e.clientX, e.clientY));
    },
    [disabled, onChange, angleToValue],
  );

  const handlePointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  const fontSize = size < 100 ? size * 0.22 : size * 0.2;

  return (
    <div
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={`Rating: ${value}`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      style={{
        position: "relative",
        cursor: disabled ? "default" : "pointer",
        touchAction: "none",
        flexShrink: 0,
        opacity: disabled ? 0.5 : 1,
        outline: "none",
      }}
    >
      <svg
        ref={svgRef}
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{
          display: "block",
          filter: `drop-shadow(0 0 4px ${color === "var(--dg-accent)" ? "var(--dg-accent-glow)" : `${color}30`})`,
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        aria-hidden="true"
      >
        <path
          d={trackPath}
          fill="none"
          stroke="var(--dg-elevated)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        {arcPath && (
          <path
            d={arcPath}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            style={{ transition: dragging.current ? "none" : "stroke 200ms ease" }}
          />
        )}
        <text
          x={cx}
          y={cy}
          fill="var(--dg-text)"
          textAnchor="middle"
          dominantBaseline="central"
          fontFamily="var(--dg-font-mono)"
          fontSize={fontSize}
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {value || "\u2014"}
        </text>
      </svg>
    </div>
  );
}
