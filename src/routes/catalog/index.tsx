import { useHotkey, useHotkeySequence } from "@tanstack/react-hotkeys";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import {
  createFileRoute,
  getRouteApi,
  Link,
  useElementScrollRestoration,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { useVirtualizer } from "@tanstack/react-virtual";
import { forwardRef, memo, useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import type { Media } from "../../db/schema";
import { setCatalogEntry } from "../../lib/catalog.functions";
import { isInputFocused } from "../../lib/hotkeys/shortcuts";
import { useCatalogCursor } from "../../lib/hotkeys/use-catalog-cursor";
import {
  mediaTypeLabel,
  STATUS_ACCENT,
  type StatusValue,
  typeBadgeClass,
} from "../../lib/media-types";
import { ogTags, pageTitle } from "../../lib/og";
import { catalogInfiniteOptions, mediaStatsOptions } from "../../lib/query-options";
import { useSound } from "../../lib/sound";

const rootRoute = getRouteApi("__root__");

const catalogSearchSchema = z.object({
  q: z.string().optional().catch(undefined),
  type: z.enum(["movie", "tv_series", "anime", "game"]).optional().catch(undefined),
});

const MEDIA_TYPES = [
  { value: undefined, label: "All" },
  { value: "movie" as const, label: "Movies" },
  { value: "tv_series" as const, label: "TV" },
  { value: "anime" as const, label: "Anime" },
  { value: "game" as const, label: "Games" },
];

export const Route = createFileRoute("/catalog/")({
  validateSearch: catalogSearchSchema,
  loaderDeps: ({ search }) => ({ q: search.q, mediaType: search.type }),
  loader: async ({ deps, context }) => {
    const { q, mediaType } = deps;

    const stats = await context.queryClient.ensureQueryData(mediaStatsOptions());
    await context.queryClient.prefetchInfiniteQuery(
      catalogInfiniteOptions(mediaType, q || undefined),
    );
    return { stats };
  },
  staleTime: 5 * 60 * 1000,
  head: () => ({
    meta: [
      { title: pageTitle("catalog — donguri") },
      {
        name: "description",
        content:
          "Browse 100k+ movies, TV shows, anime, and games. Search, filter, and add titles to your watchlist.",
      },
      ...ogTags({
        title: "Catalog — donguri",
        description:
          "Browse 100k+ movies, TV shows, anime, and games. Search, filter, and add titles to your watchlist.",
        path: "/catalog",
      }),
    ],
  }),
  component: CatalogPage,
});

const SearchInput = forwardRef<HTMLInputElement, { initialValue: string }>(function SearchInput(
  { initialValue },
  ref,
) {
  const navigate = useNavigate({ from: "/catalog/" });
  const { q } = Route.useSearch();
  const [value, setValue] = useState(initialValue);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Sync when URL changes externally (e.g. back/forward)
  useEffect(() => {
    setValue(q ?? "");
  }, [q]);

  const handleChange = (input: string) => {
    setValue(input);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      navigate({
        search: (prev) => ({ ...prev, q: input || undefined }),
        replace: true,
      });
    }, 300);
  };

  return (
    <div className="dg-input-wrap w-full">
      <input
        ref={ref}
        type="text"
        placeholder="Search titles..."
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        className="w-full py-3 px-4 bg-dg-bg border border-dg-border rounded text-dg-text text-base sm:text-sm outline-none box-border transition-[border-color,box-shadow] duration-100"
      />
    </div>
  );
});

function CatalogPage() {
  const { stats } = Route.useLoaderData();
  const { auth, trackedIds: rootTrackedIds } = rootRoute.useLoaderData();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { q, type: mediaType } = Route.useSearch();
  const navigate = useNavigate({ from: "/catalog/" });
  const { playSound } = useSound();

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery(
    catalogInfiniteOptions(mediaType, q || undefined),
  );
  const allItems = data?.pages.flatMap((p) => p.items) ?? [];

  const [localOverrides, setLocalOverrides] = useState<Record<string, string>>({});
  const [quickAddState, setQuickAddState] = useState<Record<string, "pending" | "done">>({});
  const quickAddTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const parentRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const trackedIds: Record<string, string | null> = { ...rootTrackedIds, ...localOverrides };

  const handleTypeChange = useCallback(
    (type: "movie" | "tv_series" | "anime" | "game" | undefined) => {
      navigate({
        search: (prev) => ({
          ...prev,
          type,
        }),
      });
    },
    [navigate],
  );

  const handleQuickAdd = useCallback(
    async (wikidataId: string, itemMediaType: string, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const defaultStatus: "planned" | "in_progress" =
        itemMediaType === "movie" ? "planned" : "in_progress";
      console.debug("[quick-add] %s → %s (optimistic)", wikidataId, defaultStatus);
      setLocalOverrides((prev) => ({ ...prev, [wikidataId]: defaultStatus }));
      setQuickAddState((prev) => ({ ...prev, [wikidataId]: "pending" }));
      playSound("confirm");
      try {
        await setCatalogEntry({ data: { wikidataId, status: defaultStatus } });
        console.debug("[quick-add] %s → server ok", wikidataId);
        setQuickAddState((prev) => ({ ...prev, [wikidataId]: "done" }));
        clearTimeout(quickAddTimers.current.get(wikidataId));
        quickAddTimers.current.set(
          wikidataId,
          setTimeout(() => {
            quickAddTimers.current.delete(wikidataId);
            setQuickAddState((prev) => {
              const next = { ...prev };
              delete next[wikidataId];
              return next;
            });
          }, 1500),
        );
        queryClient.invalidateQueries({ queryKey: ["user"] });
        router.invalidate();
      } catch (err) {
        console.error("[quick-add] %s → FAILED:", wikidataId, err);
        setQuickAddState((prev) => {
          const next = { ...prev };
          delete next[wikidataId];
          return next;
        });
        setLocalOverrides((prev) => {
          const next = { ...prev };
          delete next[wikidataId];
          return next;
        });
      }
    },
    [router, queryClient, playSound],
  );

  // Clean up quick-add timers on unmount
  useEffect(
    () => () => {
      for (const t of quickAddTimers.current.values()) clearTimeout(t);
    },
    [],
  );

  // Scroll restoration for the custom scroll container via TanStack Router
  const scrollEntry = useElementScrollRestoration({
    getElement: () => parentRef.current,
  });

  // Restore scroll position after data is available and virtualizer has rendered
  const didRestore = useRef(false);
  useEffect(() => {
    if (didRestore.current || !scrollEntry || allItems.length === 0) return;
    didRestore.current = true;
    const el = parentRef.current;
    if (!el || scrollEntry.scrollY === 0) return;
    requestAnimationFrame(() => {
      el.scrollTop = scrollEntry.scrollY;
    });
  }, [allItems.length, scrollEntry]);

  const virtualizer = useVirtualizer({
    count: hasNextPage ? allItems.length + 1 : allItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 60,
    overscan: 10,
  });

  const virtualItems = virtualizer.getVirtualItems();

  // ─── Keyboard shortcuts ─────────────────────────────────────────────────
  const { selectedIndex, setSelectedIndex } = useCatalogCursor({
    itemCount: allItems.length,
    virtualizer,
    fetchNextPage,
    hasNextPage,
  });

  // Reset cursor when search/filter changes
  const prevQ = useRef(q);
  const prevType = useRef(mediaType);
  useEffect(() => {
    if (q !== prevQ.current || mediaType !== prevType.current) {
      setSelectedIndex(-1);
      prevQ.current = q;
      prevType.current = mediaType;
    }
  }, [q, mediaType, setSelectedIndex]);

  // Enter — blur search (if focused) or open selected item
  useHotkey(
    "Enter",
    () => {
      if (document.activeElement === searchRef.current) {
        searchRef.current?.blur();
        return;
      }
      const item = allItems[selectedIndex];
      if (item) navigate({ to: "/catalog/$wikidataId", params: { wikidataId: item.wikidataId } });
    },
    { ignoreInputs: false },
  );

  // l / ArrowRight — open selected item
  const openSelected = () => {
    const item = allItems[selectedIndex];
    if (item) navigate({ to: "/catalog/$wikidataId", params: { wikidataId: item.wikidataId } });
  };
  useHotkey("L", openSelected, { enabled: selectedIndex >= 0 });
  useHotkey("ArrowRight", openSelected, { enabled: selectedIndex >= 0 });

  // / — focus search
  useHotkey("/", () => {
    searchRef.current?.focus();
  });

  // Esc — blur search or deselect cursor
  useHotkey(
    "Escape",
    () => {
      if (document.activeElement === searchRef.current) {
        searchRef.current?.blur();
      } else {
        setSelectedIndex(-1);
      }
    },
    { ignoreInputs: false, conflictBehavior: "allow" },
  );

  // f + key — type filter sequences
  const typeFilter = (type: "movie" | "tv_series" | "anime" | "game" | undefined) => () => {
    if (isInputFocused()) return;
    handleTypeChange(type);
  };
  useHotkeySequence(["F", "F"], typeFilter(undefined));
  useHotkeySequence(["F", "M"], typeFilter("movie"));
  useHotkeySequence(["F", "T"], typeFilter("tv_series"));
  useHotkeySequence(["F", "A"], typeFilter("anime"));
  useHotkeySequence(["F", "G"], typeFilter("game"));

  // a — quick-add selected item
  useHotkey(
    "A",
    () => {
      const item = allItems[selectedIndex];
      if (!item || !auth) return;
      const status = trackedIds[item.wikidataId] ?? null;
      if (status !== null) return; // already tracked
      // Synthesize a mouse event for the existing handler
      const fakeEvent = { preventDefault: () => {}, stopPropagation: () => {} } as React.MouseEvent;
      handleQuickAdd(item.wikidataId, item.mediaType, fakeEvent);
    },
    { enabled: selectedIndex >= 0 && !!auth },
  );

  // Trigger load more when approaching end
  useEffect(() => {
    const lastItem = virtualItems[virtualItems.length - 1];
    if (!lastItem) return;
    if (lastItem.index >= allItems.length - 1 && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [virtualItems, allItems.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="px-4 sm:px-6 pt-4 pb-1">
        <div className="max-w-[1000px] mx-auto">
          <p className="text-dg-text-secondary text-sm tabular-nums">
            {stats.total > 0
              ? `${stats.total.toLocaleString()} titles across the catalog`
              : "\u00a0"}
          </p>
        </div>
      </header>

      {/* Controls */}
      <div className="max-w-[1000px] mx-auto w-full px-4 sm:px-6 py-2 flex flex-col gap-2">
        {/* Search */}
        <SearchInput ref={searchRef} initialValue={q ?? ""} />

        {/* Type filter tabs — section dividers */}
        <div className="flex gap-2 flex-nowrap overflow-x-auto sm:flex-wrap scrollbar-hide">
          {MEDIA_TYPES.map((t) => {
            const isActive = mediaType === t.value;
            const count = t.value
              ? ((stats.byType as Record<string, number>)[t.value] ?? 0)
              : stats.total;
            return (
              <button
                type="button"
                key={t.label}
                onClick={() => handleTypeChange(t.value)}
                className={`py-2 sm:py-1.5 px-3 min-h-[44px] sm:min-h-0 text-sm cursor-pointer flex items-center gap-1.5 shrink-0 transition-[background-color,border-color] duration-[120ms] border rounded-sm active:scale-[0.97] ${
                  isActive
                    ? "bg-dg-elevated border-dg-border text-dg-accent dg-card"
                    : "bg-transparent border-dg-border-subtle text-dg-text-secondary hover:border-dg-border"
                }`}
              >
                {t.label}
                {count > 0 && (
                  <span className="text-xs text-dg-text-tertiary tabular-nums">
                    {count >= 1000 ? `${Math.round(count / 1000)}k` : count.toLocaleString()}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Login prompt */}
      {!auth && (
        <div className="max-w-[1000px] mx-auto w-full px-4 sm:px-6 pb-2">
          <Link
            to="/"
            className="block bg-dg-accent/[0.04] rounded px-4 py-3 text-xs text-dg-text-secondary no-underline transition-colors duration-100"
          >
            <span className="text-dg-accent">Sign in</span> to add titles to your watchlist and
            track your progress.
          </Link>
        </div>
      )}

      {/* Virtual list */}
      <div className="flex-1 relative min-h-0">
        <div
          ref={parentRef}
          className="absolute inset-0 overflow-auto max-w-[1000px] mx-auto w-full px-4 sm:px-6"
        >
          <div
            style={{
              height: virtualizer.getTotalSize(),
              width: "100%",
              position: "relative",
            }}
          >
            {virtualItems.map((virtualRow) => {
              if (virtualRow.index >= allItems.length) {
                return (
                  <div
                    key="loader"
                    className="w-full left-0 absolute flex items-center justify-center overflow-hidden"
                    style={{
                      top: virtualRow.start,
                      height: virtualRow.size,
                    }}
                  >
                    <span className="text-dg-text-tertiary text-sm">
                      {isFetchingNextPage ? "Loading..." : ""}
                    </span>
                  </div>
                );
              }

              const item = allItems[virtualRow.index];
              const status = trackedIds[item.wikidataId] ?? null;
              const isTracked = status !== null;
              const showAdd = auth && !isTracked;
              const addState = quickAddState[item.wikidataId] ?? null;

              const isCursorActive = virtualRow.index === selectedIndex;

              return (
                <Link
                  key={item.id}
                  to="/catalog/$wikidataId"
                  params={{ wikidataId: item.wikidataId }}
                  preload="intent"
                  className={`dg-catalog-row dg-tab-in w-full left-0 absolute no-underline text-inherit block group overflow-hidden transition-[background-color,border-left-color] duration-[60ms] hover:bg-dg-surface/60${isCursorActive ? " dg-cursor-active" : ""}`}
                  style={{
                    top: virtualRow.start,
                    height: virtualRow.size,
                    borderBottom: "1px solid transparent",
                    borderImage:
                      "linear-gradient(90deg, transparent, var(--color-dg-border-subtle), transparent) 1",
                  }}
                >
                  <MediaRow
                    item={item}
                    trackedStatus={status}
                    showAdd={!!showAdd}
                    addState={addState}
                    onQuickAdd={handleQuickAdd}
                  />
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function formatMeta(item: Media): string {
  const { mediaType, seasonCount, episodeCount, runtimeMinutes } = item;
  if (mediaType === "tv_series" || mediaType === "anime") {
    const parts: string[] = [];
    if (seasonCount || episodeCount) {
      const maxDigits = Math.max(String(seasonCount ?? 0).length, String(episodeCount ?? 0).length);
      if (seasonCount) parts.push(`S${String(seasonCount).padStart(maxDigits, "0")}`);
      if (episodeCount) parts.push(`E${String(episodeCount).padStart(maxDigits, "0")}`);
    }
    return parts.join("");
  }
  if (mediaType === "movie" && runtimeMinutes) {
    return `${runtimeMinutes} min`;
  }
  return "";
}

const MediaRow = memo(function MediaRow({
  item,
  trackedStatus,
  showAdd,
  addState,
  onQuickAdd,
}: {
  item: Media;
  trackedStatus: string | null;
  showAdd: boolean;
  addState: "pending" | "done" | null;
  onQuickAdd: (wikidataId: string, mediaType: string, e: React.MouseEvent) => void;
}) {
  const badgeClass = typeBadgeClass(item.mediaType);

  const meta = formatMeta(item);

  return (
    <div className="flex items-center justify-between py-1.5 px-1 h-full gap-2 sm:gap-4">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
        {item.posterUrl && (
          <img
            src={item.posterUrl}
            alt=""
            width={40}
            height={60}
            className="rounded-sm border border-dg-border-subtle object-cover shrink-0 hidden sm:block shadow-[inset_0_1px_3px_oklch(0_0_0/0.15)]"
            loading="lazy"
          />
        )}
        {addState === "pending" ? (
          <span className="text-xs font-bold text-dg-accent shrink-0">
            [<span className="dg-ellipsis" />]
          </span>
        ) : addState === "done" ? (
          <span className="text-xs font-bold text-dg-game shrink-0">[ok]</span>
        ) : showAdd ? (
          <button
            type="button"
            onClick={(e) => onQuickAdd(item.wikidataId, item.mediaType, e)}
            className="text-xs font-bold text-dg-text-tertiary bg-transparent border-none cursor-pointer p-0 shrink-0 inline-block hover:text-dg-accent hover:border hover:border-dg-border-subtle hover:px-1 hover:rounded-sm active:scale-[0.97] transition-all duration-100"
          >
            [+]
          </button>
        ) : null}
        <span className={`whitespace-nowrap shrink-0 min-w-[3rem] text-center ${badgeClass}`}>
          {mediaTypeLabel(item.mediaType, true)}
        </span>
        <div className="flex items-baseline gap-2 min-w-0 overflow-hidden">
          <span className="text-sm font-medium truncate text-dg-text">{item.title}</span>
          {trackedStatus && (
            <span
              className={`text-sm shrink-0 ${STATUS_ACCENT[trackedStatus as StatusValue] ?? "text-dg-text-tertiary"}`}
            >
              *
            </span>
          )}
          {item.originalTitle && (
            <span className="text-xs text-dg-text-tertiary italic truncate hidden sm:inline">
              {item.originalTitle}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-4 shrink-0">
        {meta && (
          <span className="text-xs text-dg-text-tertiary min-w-12 text-right tabular-nums hidden sm:flex">
            {meta}
          </span>
        )}
        {item.startYear && (
          <span className="text-xs text-dg-text-secondary tabular-nums">
            {item.startYear}
            {item.endYear && item.endYear !== item.startYear ? `–${item.endYear}` : ""}
          </span>
        )}
      </div>
    </div>
  );
});
