import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { removeCatalogEntry, setCatalogEntry } from "~/features/catalog/catalog.functions";
import {
  catalogEntryOptions,
  trackedIdsOptions,
  watchlistOptions,
} from "~/features/catalog/catalog.queries";
import type { StatusValue } from "~/features/media/media-types";

export function useSetCatalogEntry() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const opts = trackedIdsOptions();

  return useMutation({
    mutationFn: (vars: { wikidataId: string; status: StatusValue; [key: string]: unknown }) =>
      setCatalogEntry({ data: vars as Parameters<typeof setCatalogEntry>[0]["data"] }),

    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: opts.queryKey });
      const previous = queryClient.getQueryData(opts.queryKey);
      queryClient.setQueryData(opts.queryKey, (old) =>
        old ? { ...old, [vars.wikidataId]: vars.status } : { [vars.wikidataId]: vars.status },
      );
      return { previous };
    },

    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(opts.queryKey, ctx.previous);
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["user"] });
      router.invalidate();
    },
  });
}

export function useRemoveCatalogEntry() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const opts = trackedIdsOptions();

  return useMutation({
    mutationFn: (vars: { wikidataId: string }) => removeCatalogEntry({ data: vars }),

    onMutate: async (vars) => {
      const wlOpts = watchlistOptions();
      const entryOpts = catalogEntryOptions(vars.wikidataId);
      await Promise.all([
        queryClient.cancelQueries({ queryKey: opts.queryKey }),
        queryClient.cancelQueries({ queryKey: wlOpts.queryKey }),
        queryClient.cancelQueries({ queryKey: entryOpts.queryKey }),
      ]);

      const prevTracked = queryClient.getQueryData(opts.queryKey);
      const prevWatchlist = queryClient.getQueryData(wlOpts.queryKey);
      const prevEntry = queryClient.getQueryData(entryOpts.queryKey);

      queryClient.setQueryData(opts.queryKey, (old) => {
        if (!old) return old;
        const next = { ...old };
        delete next[vars.wikidataId];
        return next;
      });
      queryClient.setQueryData(wlOpts.queryKey, (old) =>
        old?.filter((e) => e.mediaWikidataId !== vars.wikidataId),
      );
      queryClient.setQueryData(entryOpts.queryKey, null);

      return { prevTracked, prevWatchlist, prevEntry, wikidataId: vars.wikidataId };
    },

    onError: (_err, _vars, ctx) => {
      if (ctx) {
        queryClient.setQueryData(opts.queryKey, ctx.prevTracked);
        queryClient.setQueryData(watchlistOptions().queryKey, ctx.prevWatchlist);
        queryClient.setQueryData(catalogEntryOptions(ctx.wikidataId).queryKey, ctx.prevEntry);
      }
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["user"] });
      router.invalidate();
    },
  });
}
