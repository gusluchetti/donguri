import { useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

export function NavProgress() {
  const isLoading = useRouterState({ select: (s) => s.isLoading });
  const [phase, setPhase] = useState<"idle" | "growing" | "done">("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (isLoading) {
      // Delay showing the bar — fast navigations never trigger it
      timerRef.current = setTimeout(() => setPhase("growing"), 100);
    } else if (phase === "growing") {
      // Navigation finished while bar was visible — snap to full + fade out
      setPhase("done");
      timerRef.current = setTimeout(() => setPhase("idle"), 300);
    }
    return () => clearTimeout(timerRef.current);
  }, [isLoading, phase]);

  if (phase === "idle") return null;

  return <div className={`dg-nav-progress ${phase === "done" ? "dg-nav-progress-done" : ""}`} />;
}
