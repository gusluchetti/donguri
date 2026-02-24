import { experimental_createQueryPersister } from "@tanstack/query-persist-client-core";
import { focusManager, QueryClient } from "@tanstack/react-query";
import { del, get, set } from "idb-keyval";
import { setupTabSync } from "./tab-sync";

// Auto-generated at Vite startup / build time — changes on every deploy, stable during dev.
declare const __BUILD_ID__: string;
export const DATA_VERSION = typeof __BUILD_ID__ !== "undefined" ? __BUILD_ID__ : "dev";

// ─── Focus throttle ─────────────────────────────────────────────────────────
// Prevent refetch storms when rapidly switching between tabs. The default
// focusManager fires on every visibilitychange, which means N tabs × M queries
// all hit the server simultaneously. We throttle so that a tab must be hidden
// for at least FOCUS_THROTTLE_MS before a focus event triggers refetches.
const FOCUS_THROTTLE_MS = 5_000;
if (typeof window !== "undefined") {
  let lastHiddenAt = 0;
  focusManager.setEventListener((handleFocus) => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        lastHiddenAt = Date.now();
      } else {
        // Only signal "focused" if the tab was hidden long enough to warrant a refetch
        handleFocus(Date.now() - lastHiddenAt >= FOCUS_THROTTLE_MS);
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  });
}

export function createQueryClient() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 30 * 60 * 1000,
        retry: 1,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
      },
    },
  });

  // Wire up cross-tab invalidation via BroadcastChannel
  if (typeof window !== "undefined") {
    setupTabSync(qc);
  }

  return qc;
}

export const idbPersister =
  typeof window !== "undefined"
    ? experimental_createQueryPersister({
        storage: {
          getItem: (key) => get(key),
          setItem: (key, value) => set(key, value),
          removeItem: (key) => del(key),
        },
        maxAge: 24 * 60 * 60 * 1000,
        prefix: "dg",
        // Disabled: focus-based refetch + BroadcastChannel handle freshness.
        // Having this true caused double-fetches (restore + focus) on every tab switch.
        refetchOnRestore: false,
      })
    : undefined;

// ─── Catalog freshness check ────────────────────────────────────────────────
// Root loader fetches a lightweight fingerprint (count + max updated_at) on every
// navigation. If it differs from the last seen value, all ["user"] queries are
// invalidated so child loaders/components get fresh data.

let lastFingerprint: string | null = null;

export function checkCatalogFreshness(queryClient: QueryClient, fingerprint: string | null) {
  if (fingerprint === null) return;
  if (lastFingerprint !== null && lastFingerprint !== fingerprint) {
    queryClient.invalidateQueries({ queryKey: ["user"] });
  }
  lastFingerprint = fingerprint;
}
