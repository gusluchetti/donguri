export function Spinner({ size = 20 }: { size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        border: `${Math.max(2, Math.round(size / 8))}px solid var(--color-dg-border-subtle)`,
        borderTopColor: "var(--color-dg-accent)",
        borderRadius: "50%",
        animation: "dg-spin 0.7s linear infinite",
      }}
    />
  );
}
