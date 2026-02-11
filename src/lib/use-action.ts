import { useCallback, useState } from "react";

export type ActionState = "idle" | "pending" | "done" | "error";

export function useAction() {
  const [state, setState] = useState<ActionState>("idle");

  const run = useCallback(async <T>(fn: () => Promise<T>): Promise<T | undefined> => {
    setState("pending");
    try {
      const result = await fn();
      setState("done");
      setTimeout(() => setState("idle"), 1500);
      return result;
    } catch {
      setState("error");
      return undefined;
    }
  }, []);

  const reset = useCallback(() => setState("idle"), []);

  return { state, run, reset } as const;
}
