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
      style={{ padding: "clamp(8px, 2%, 16px)" }}
    >
      <div
        className="flex flex-col sm:flex-row items-center sm:items-start"
        style={{ gap: "clamp(8px, 2%, 16px)" }}
      >
        <div
          className={cn(
            "shrink-0 rounded overflow-hidden",
            "w-[45%] max-w-[180px] mx-auto",
            "sm:w-[clamp(88px,22%,160px)] sm:max-w-none sm:mx-0",
          )}
          style={{ aspectRatio: "2/3" }}
        >
          {posterSlot}
        </div>
        <div className="min-w-0 flex-1 w-full">{children}</div>
      </div>
    </div>
  );
}
