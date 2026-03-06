import type { ReactNode } from "react";
import { cn } from "~/lib/cn";

export function InfoCard({
  posterSlot,
  children,
  className,
}: {
  posterSlot: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded border border-dg-border-subtle bg-dg-surface mb-g3 sm:mb-g4",
        className,
      )}
      style={{ padding: "clamp(8px, 2%, 16px)", paddingBottom: "clamp(12px, 3%, 20px)" }}
    >
      <div
        className="flex flex-col sm:flex-row sm:items-stretch"
        style={{ gap: "clamp(8px, 2%, 16px)" }}
      >
        <div className="shrink-0 rounded overflow-hidden w-[clamp(100px,40%,160px)] mx-auto sm:mx-0 sm:w-[clamp(88px,22%,160px)] aspect-[2/3]">
          {posterSlot}
        </div>
        <div className="min-w-0 flex-1 flex flex-col gap-1.5 sm:self-stretch">{children}</div>
      </div>
    </div>
  );
}
