import { useCallback, useEffect, useRef, useState } from "react";

export type ActionState = "idle" | "pending" | "done" | "error";

export function useAction() {
  const [state, setState] = useState<ActionState>("idle");
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const run = useCallback(async <T>(fn: () => Promise<T>): Promise<T | undefined> => {
    clearTimeout(timeoutRef.current);
    setState("pending");
    try {
      const result = await fn();
      setState("done");
      timeoutRef.current = setTimeout(() => setState("idle"), 1500);
      return result;
    } catch {
      setState("error");
      return undefined;
    }
  }, []);

  const reset = useCallback(() => {
    clearTimeout(timeoutRef.current);
    setState("idle");
  }, []);

  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  return { state, run, reset } as const;
}
