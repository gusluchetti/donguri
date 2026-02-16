import { experimental_createQueryPersister } from "@tanstack/query-persist-client-core";
import { QueryClient } from "@tanstack/react-query";
import { del, get, set } from "idb-keyval";

// Auto-generated at Vite startup / build time — changes on every deploy, stable during dev.
declare const __BUILD_ID__: string;
export const DATA_VERSION = typeof __BUILD_ID__ !== "undefined" ? __BUILD_ID__ : "dev";

export function createQueryClient() {
  return new QueryClient({
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
        refetchOnRestore: true,
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
