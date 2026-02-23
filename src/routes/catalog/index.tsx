import { Check, CircleNotch, MagnifyingGlass, Plus, Shuffle, X } from "@phosphor-icons/react";
import { useHotkey, useHotkeySequence } from "@tanstack/react-hotkeys";
import { keepPreviousData, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import {
  createFileRoute,
  getRouteApi,
  Link,
  useElementScrollRestoration,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { useVirtualizer } from "@tanstack/react-virtual";
import { forwardRef, memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { z } from "zod";
import { CoverThumb } from "../../components/CoverThumb";
import { StampBadge } from "../../components/StampBadge";
import type { Media } from "../../db/schema";
import { setCatalogEntry } from "../../lib/catalog.functions";
import { isInputFocused } from "../../lib/hotkeys/shortcuts";
import { useCatalogCursor } from "../../lib/hotkeys/use-catalog-cursor";
import {
  STAMP_COLORS,
  STATUS_BUTTON_COLORS,
  STATUS_ICONS,
  type StatusValue,
} from "../../lib/media-types";
import { ogTags, pageTitle } from "../../lib/og";
import { catalogInfiniteOptions, mediaStatsOptions } from "../../lib/query-options";
import { SoundEngine } from "../../lib/sound";

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
  loaderDeps: ({ search }) => ({ mediaType: search.type }),
  loader: async ({ deps, context }) => {
    const { mediaType } = deps;

    const stats = await context.queryClient.ensureQueryData(mediaStatsOptions());
    await context.queryClient.prefetchInfiniteQuery(catalogInfiniteOptions(mediaType, undefined));
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

// ─── Hooks ────────────────────────────────────────────────────────────────────

type QuickAddState = "pending" | "done";

function useQuickAdd() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [localOverrides, setLocalOverrides] = useState<Record<string, string>>({});
  const [quickAddState, setQuickAddState] = useState<Record<string, QuickAddState>>({});
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const handleQuickAdd = useCallback(
    async (wikidataId: string, itemMediaType: string, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const defaultStatus: "planned" | "in_progress" =
        itemMediaType === "movie" ? "planned" : "in_progress";
      setLocalOverrides((prev) => ({ ...prev, [wikidataId]: defaultStatus }));
      setQuickAddState((prev) => ({ ...prev, [wikidataId]: "pending" }));
      try {
        await setCatalogEntry({ data: { wikidataId, status: defaultStatus } });
        setQuickAddState((prev) => ({ ...prev, [wikidataId]: "done" }));
        clearTimeout(timers.current.get(wikidataId));
        timers.current.set(
          wikidataId,
          setTimeout(() => {
            timers.current.delete(wikidataId);
            setQuickAddState((prev) => {
              const next = { ...prev };
              delete next[wikidataId];
              return next;
            });
          }, 1500),
        );
        queryClient.invalidateQueries({ queryKey: ["user"] });
        router.invalidate();
      } catch {
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
    [router, queryClient],
  );

  // Clear timers on unmount
  useEffect(
    () => () => {
      for (const t of timers.current.values()) clearTimeout(t);
    },
    [],
  );

  return { localOverrides, quickAddState, handleQuickAdd };
}

// ─── Components ───────────────────────────────────────────────────────────────

type MediaStats = {
  total: number;
  byType: Record<string, number>;
};

type FilterType = "movie" | "tv_series" | "anime" | "game" | undefined;

function TypeFilterBar({
  mediaType,
  stats,
  onTypeChange,
}: {
  mediaType: FilterType;
  stats: MediaStats;
  onTypeChange: (type: FilterType) => void;
}) {
  return (
    <div className="flex gap-0 border border-dg-border rounded-sm overflow-hidden bg-dg-surface">
      {MEDIA_TYPES.map((t, i) => {
        const isActive = mediaType === t.value;
        const count = t.value ? (stats.byType[t.value] ?? 0) : stats.total;
        return (
          <button
            type="button"
            key={t.label}
            onClick={() => onTypeChange(t.value)}
            className="py-2 sm:py-1.5 px-3 min-h-[44px] sm:min-h-0 font-body text-xs cursor-pointer flex items-center gap-1.5 flex-1 justify-center transition-all duration-150 relative"
            style={{
              background: isActive ? "var(--color-dg-elevated)" : "transparent",
              color: isActive ? "var(--color-dg-accent)" : "var(--color-dg-text-tertiary)",
              fontWeight: isActive ? 600 : 400,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              borderRight:
                i < MEDIA_TYPES.length - 1 ? "1px solid var(--color-dg-border-subtle)" : "none",
            }}
          >
            {t.label}
            {count > 0 && (
              <span
                className="text-[0.65rem] tabular-nums"
                style={{ opacity: isActive ? 0.8 : 0.4 }}
              >
                {count.toLocaleString()}
              </span>
            )}
            {isActive && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-dg-accent" />}
          </button>
        );
      })}
    </div>
  );
}

const SearchBar = forwardRef<HTMLInputElement, { initialValue: string; onRandom?: () => void }>(
  function SearchBar({ initialValue, onRandom }, ref) {
    const navigate = useNavigate({ from: "/catalog/" });
    const { q } = Route.useSearch();
    const [value, setValue] = useState(initialValue);
    const [focused, setFocused] = useState(false);
    const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

    // Sync when URL changes externally (e.g. back/forward) — but not while typing or debounce pending
    useEffect(() => {
      if (!focused && !timeoutRef.current) setValue(q ?? "");
    }, [q, focused]);

    // Clear pending debounce on unmount so stale navigate() can't fire after page transition
    useEffect(
      () => () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
      },
      [],
    );

    const handleChange = (input: string) => {
      setValue(input);
      if (input.length > 0) SoundEngine.search();
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = undefined;
        navigate({
          search: (prev) => ({ ...prev, q: input || undefined }),
          replace: true,
          viewTransition: false,
        });
      }, 300);
    };

    const handleClear = () => {
      setValue("");
      navigate({
        search: (prev) => ({ ...prev, q: undefined }),
        replace: true,
        viewTransition: false,
      });
    };

    return (
      <div className="relative flex gap-1.5">
        <div className="relative flex-1">
          <div
            className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none transition-colors duration-[120ms]"
            style={{ color: focused ? "var(--color-dg-accent)" : "var(--color-dg-text-tertiary)" }}
          >
            <MagnifyingGlass size={14} weight="bold" />
          </div>
          <input
            ref={ref}
            type="text"
            placeholder="Search catalog..."
            value={value}
            onChange={(e) => handleChange(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            className="w-full py-2.5 pl-9 pr-8 bg-dg-surface border rounded text-dg-text font-body text-base sm:text-[0.85rem] outline-none box-border transition-all duration-[120ms]"
            style={{
              borderColor: focused ? "var(--color-dg-accent)" : "var(--color-dg-border)",
              boxShadow: focused ? "0 0 0 2px var(--color-dg-accent-glow)" : "none",
            }}
          />
          {value && (
            <button
              type="button"
              onClick={handleClear}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 bg-dg-elevated border-none rounded-sm w-4 h-4 flex items-center justify-center cursor-pointer text-dg-text-tertiary hover:text-dg-text-secondary transition-colors"
            >
              <X size={10} />
            </button>
          )}
        </div>
        <button
          type="button"
          title="Random title"
          onClick={() => {
            SoundEngine.dice();
            onRandom?.();
          }}
          className="self-stretch w-[42px] flex items-center justify-center bg-dg-surface border border-dg-border rounded cursor-pointer text-dg-text-tertiary hover:text-dg-accent hover:border-dg-accent transition-all duration-[120ms]"
        >
          <Shuffle size={17} weight="bold" />
        </button>
      </div>
    );
  },
);

function CatalogPage() {
  const { stats } = Route.useLoaderData();
  const { auth, trackedIds: rootTrackedIds } = rootRoute.useLoaderData();
  const { q, type: mediaType } = Route.useSearch();
  const navigate = useNavigate({ from: "/catalog/" });

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isPlaceholderData } =
    useInfiniteQuery({
      ...catalogInfiniteOptions(mediaType, q || undefined),
      placeholderData: keepPreviousData,
    });
  const allItems = data?.pages.flatMap((p) => p.items) ?? [];

  // Only animate items when data is genuinely new — not when returning with cached results
  const seenQueryKeys = useRef(new Set<string>());
  const currentQueryKey = `${mediaType ?? ""}|${q ?? ""}`;
  const isNewData =
    !seenQueryKeys.current.has(currentQueryKey) && !isPlaceholderData && allItems.length > 0;
  useEffect(() => {
    if (!isPlaceholderData && allItems.length > 0) seenQueryKeys.current.add(currentQueryKey);
  }, [currentQueryKey, isPlaceholderData, allItems.length]);

  const { localOverrides, quickAddState, handleQuickAdd } = useQuickAdd();
  const parentRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const trackedIds: Record<string, string | null> = { ...rootTrackedIds, ...localOverrides };

  const handleTypeChange = useCallback(
    (type: FilterType) => {
      SoundEngine.click();
      navigate({ search: (prev) => ({ ...prev, type }), viewTransition: false });
    },
    [navigate],
  );

  // Scroll restoration for the custom scroll container via TanStack Router
  const scrollEntry = useElementScrollRestoration({
    getElement: () => parentRef.current,
  });

  // Restore scroll position after data is available and virtualizer has rendered
  const didRestore = useRef(false);
  useLayoutEffect(() => {
    if (didRestore.current || !scrollEntry || allItems.length === 0) return;
    didRestore.current = true;
    const el = parentRef.current;
    if (!el || scrollEntry.scrollY === 0) return;
    el.scrollTop = scrollEntry.scrollY;
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

  const openSelected = useCallback(() => {
    const item = allItems[selectedIndex];
    if (item) {
      SoundEngine.navForward();
      navigate({ to: "/catalog/$wikidataId", params: { wikidataId: item.wikidataId } });
    }
  }, [allItems, selectedIndex, navigate]);

  // Enter — blur search (if focused) or open selected item
  useHotkey(
    "Enter",
    () => {
      if (document.activeElement === searchRef.current) {
        searchRef.current?.blur();
        return;
      }
      openSelected();
    },
    { ignoreInputs: false },
  );

  useHotkey("L", openSelected, { enabled: selectedIndex >= 0 });
  useHotkey("ArrowRight", openSelected, { enabled: selectedIndex >= 0 });

  // / — focus search
  useHotkey("/", () => searchRef.current?.focus());

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
  const applyTypeFilter = (type: FilterType) => () => {
    if (isInputFocused()) return;
    handleTypeChange(type);
  };
  useHotkeySequence(["F", "F"], applyTypeFilter(undefined));
  useHotkeySequence(["F", "M"], applyTypeFilter("movie"));
  useHotkeySequence(["F", "T"], applyTypeFilter("tv_series"));
  useHotkeySequence(["F", "A"], applyTypeFilter("anime"));
  useHotkeySequence(["F", "G"], applyTypeFilter("game"));

  // a — quick-add selected item
  useHotkey(
    "A",
    () => {
      const item = allItems[selectedIndex];
      if (!item || !auth) return;
      const status = trackedIds[item.wikidataId] ?? null;
      if (status !== null) return;
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
    <div className="dg-page-enter text-dg-text flex-1 font-body flex flex-col overflow-hidden">
      <header className="pt-3 pb-1">
        <div className="max-w-[1100px] mx-auto px-4 sm:px-6">
          <p className="text-dg-text-tertiary text-[0.8rem]">
            {stats.total > 0
              ? `${stats.total.toLocaleString()} titles across the catalog`
              : "\u00a0"}
          </p>
        </div>
      </header>

      <div className="max-w-[1100px] mx-auto w-full px-4 sm:px-6 py-2 flex flex-col gap-2">
        <SearchBar
          ref={searchRef}
          initialValue={q ?? ""}
          onRandom={() => {
            if (!allItems.length) return;
            const item = allItems[Math.floor(Math.random() * allItems.length)];
            SoundEngine.navForward();
            navigate({ to: "/catalog/$wikidataId", params: { wikidataId: item.wikidataId } });
          }}
        />
        <TypeFilterBar
          mediaType={mediaType}
          stats={stats}
          onTypeChange={handleTypeChange}
        />
      </div>

      {!auth && (
        <div className="max-w-[1100px] mx-auto w-full px-4 sm:px-6 pb-2">
          <Link
            to="/"
            className="block border border-dg-accent/20 bg-dg-accent-soft rounded px-4 py-3 text-[0.8rem] text-dg-text-secondary no-underline transition-colors duration-150"
          >
            <span className="text-dg-accent">Sign in</span> to add titles to your watchlist and
            track your progress.
          </Link>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        <div className="max-w-[1100px] mx-auto w-full px-4 sm:px-6 pb-4 flex-1 flex flex-col min-h-0">
          <div
            className="flex-1 min-h-0 border border-dg-border rounded-md overflow-hidden flex flex-col transition-opacity duration-150 bg-dg-surface"
            style={{ opacity: isPlaceholderData ? 0.5 : 1 }}
          >
            <div ref={parentRef} className="flex-1 min-h-0 overflow-auto">
              <div
                style={{ height: virtualizer.getTotalSize(), width: "100%", position: "relative" }}
              >
                {virtualItems.map((virtualRow) => {
                  if (virtualRow.index >= allItems.length) {
                    return (
                      <div
                        key="loader"
                        className="w-full left-0 border-b border-dg-border-subtle absolute flex items-center justify-center overflow-hidden"
                        style={{ top: virtualRow.start, height: virtualRow.size }}
                      >
                        <span className="text-dg-text-tertiary">
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
                      className={`w-full left-0 absolute no-underline text-inherit block group border-b border-dg-border-subtle${isCursorActive ? " dg-cursor-active" : ""}`}
                      style={{
                        top: virtualRow.start,
                        height: virtualRow.size,
                        ["--type-color" as string]:
                          STAMP_COLORS[item.mediaType] ?? "var(--color-dg-accent)",
                        animation: isNewData ? "fadeIn 280ms var(--ease-smooth) both" : "none",
                        animationDelay:
                          isNewData && virtualRow.index < 20 ? `${virtualRow.index * 25}ms` : "0ms",
                      }}
                      onClick={() => SoundEngine.navForward()}
                      onMouseEnter={() => SoundEngine.tick()}
                    >
                      <MediaRow
                        item={item}
                        index={virtualRow.index}
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
  index,
  trackedStatus,
  showAdd,
  addState,
  onQuickAdd,
}: {
  item: Media;
  index: number;
  trackedStatus: string | null;
  showAdd: boolean;
  addState: QuickAddState | null;
  onQuickAdd: (wikidataId: string, mediaType: string, e: React.MouseEvent) => void;
}) {
  const meta = formatMeta(item);
  const year = item.startYear
    ? `${item.startYear}${item.endYear && item.endYear !== item.startYear ? `\u2013${item.endYear}` : ""}`
    : "";
  const subtitle = [item.originalTitle, year].filter(Boolean).join(" \u00b7 ");

  const [swiped, setSwiped] = useState(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const panelOpen = addState !== null || swiped;

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!showAdd) return;
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart.current) return;
    const dx = e.changedTouches[0].clientX - touchStart.current.x;
    const dy = e.changedTouches[0].clientY - touchStart.current.y;
    touchStart.current = null;
    // Threshold: horizontal gesture beats vertical by 1.2× to avoid interfering with scroll
    if (Math.abs(dx) < Math.abs(dy) * 1.2) return;
    if (dx < -30) setSwiped(true);
    else if (dx > 20) setSwiped(false);
  };

  const handleQuickAddClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    setSwiped(false);
    onQuickAdd(item.wikidataId, item.mediaType, e);
  };

  return (
    <div
      className="h-full flex items-center relative"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Left color bar — always on hover */}
      <div
        className="absolute left-0 top-0 bottom-0 w-[2.5px] opacity-0 group-hover:opacity-100 transition-opacity duration-150"
        style={{ backgroundColor: "var(--type-color)" }}
      />

      <div
        className="grid items-center flex-1 min-w-0 gap-2 sm:gap-g2 py-1.5 px-3 sm:px-g3 group-hover:bg-dg-row-hover transition-colors duration-100"
        style={{ gridTemplateColumns: "36px auto 1fr auto" }}
      >
        <CoverThumb
          title={item.title}
          mediaType={item.mediaType}
          size={36}
          posterUrl={item.posterUrl ?? undefined}
        />

        <div className="flex items-center gap-1">
          <StampBadge type={item.mediaType} index={index} />
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[0.85rem] font-medium text-dg-text truncate flex-1 min-w-0">
              {item.title}
            </span>
            {trackedStatus && (
              <span
                className={`text-[0.58rem] font-bold uppercase tracking-wider px-1.5 py-[2px] rounded-sm border shrink-0 leading-none ${STATUS_BUTTON_COLORS[trackedStatus as StatusValue] ?? ""}`}
              >
                {STATUS_ICONS[trackedStatus as StatusValue]}
              </span>
            )}
          </div>
          {subtitle && (
            <div className="text-[0.7rem] text-dg-text-tertiary truncate hidden sm:block">
              {subtitle}
            </div>
          )}
        </div>

        <div className="w-[4.5rem] flex items-center justify-end shrink-0">
          {item.episodeCount ? (
            <span className="text-[0.7rem] text-dg-text-tertiary tabular-nums text-right">
              {item.episodeCount}&nbsp;ep
            </span>
          ) : meta ? (
            <span className="text-[0.7rem] text-dg-text-tertiary tabular-nums text-right">
              {meta}
            </span>
          ) : null}
        </div>
      </div>

      {showAdd && (
        <div
          className={`shrink-0 overflow-hidden transition-[width] duration-150 h-full flex items-center ${panelOpen ? "w-10" : "w-0 group-hover:w-10"}`}
        >
          <div
            className="w-10 h-full flex items-center justify-center"
            style={{
              borderLeft: "2px solid var(--type-color)",
              background: "var(--color-dg-elevated)",
            }}
          >
            <button
              type="button"
              onClick={handleQuickAddClick}
              className="w-full h-full flex items-center justify-center bg-transparent border-none cursor-pointer transition-colors duration-100"
              style={{
                color:
                  addState === "done" ? "var(--color-dg-stamped)" : "var(--color-dg-text-tertiary)",
              }}
            >
              {addState === "pending" ? (
                <CircleNotch size={14} className="animate-spin" />
              ) : addState === "done" ? (
                <Check size={14} weight="bold" />
              ) : (
                <Plus size={14} weight="bold" />
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
});
