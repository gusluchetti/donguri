import { experimental_createQueryPersister } from "@tanstack/query-persist-client-core";
import { QueryClient } from "@tanstack/react-query";
import { del, get, set } from "idb-keyval";

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
        refetchOnRestore: false,
      })
    : undefined;
