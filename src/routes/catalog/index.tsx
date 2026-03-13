import {
  Check,
  CircleNotch,
  DotsThree,
  MagnifyingGlass,
  Plus,
  Shuffle,
  X,
} from "@phosphor-icons/react";
import { useHotkey, useHotkeySequence } from "@tanstack/react-hotkeys";
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import {
  createFileRoute,
  getRouteApi,
  Link,
  useElementScrollRestoration,
  useNavigate,
} from "@tanstack/react-router";
import { useVirtualizer } from "@tanstack/react-virtual";
import { forwardRef, memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { z } from "zod";
import { IconButton } from "~/components/IconButton";
import type { Media } from "~/db/schema";
import { useCatalogCursor } from "~/features/catalog/catalog.cursor";
import { useSetCatalogEntry } from "~/features/catalog/catalog.mutations";
import { catalogInfiniteOptions } from "~/features/catalog/catalog.queries";
import { SoundEngine } from "~/features/catalog/catalog.sound";
import { CoverThumb } from "~/features/catalog/components/CoverThumb";
import { StampBadge } from "~/features/catalog/components/StampBadge";
import { StatusIcon } from "~/features/catalog/components/StatusIcon";
import { getRandomMediaId } from "~/features/media/media.functions";
import {
  displayMediaType,
  STAMP_COLORS,
  STATUS_BUTTON_COLORS,
  type StatusValue,
} from "~/features/media/media-types";
import { cn } from "~/lib/cn";
import { ogTags, pageTitle } from "~/lib/og";

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

    await context.queryClient.prefetchInfiniteQuery(catalogInfiniteOptions(mediaType, undefined));
    return {};
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

type QuickAddState = "pending" | "done";

function useQuickAdd() {
  const mutation = useSetCatalogEntry();
  const [quickAddState, setQuickAddState] = useState<Record<string, QuickAddState>>({});
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const handleQuickAdd = useCallback(
    (wikidataId: string, itemMediaType: string, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const defaultStatus: "planned" | "in_progress" =
        itemMediaType === "movie" ? "planned" : "in_progress";
      setQuickAddState((prev) => ({ ...prev, [wikidataId]: "pending" }));
      mutation.mutate(
        { wikidataId, status: defaultStatus },
        {
          onSuccess: () => {
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
          },
          onError: () => {
            setQuickAddState((prev) => {
              const next = { ...prev };
              delete next[wikidataId];
              return next;
            });
          },
        },
      );
    },
    [mutation],
  );

  useEffect(
    () => () => {
      for (const t of timers.current.values()) clearTimeout(t);
    },
    [],
  );

  return { quickAddState, handleQuickAdd };
}

type FilterType = "movie" | "tv_series" | "anime" | "game" | undefined;

function TypeFilterBar({
  mediaType,
  onTypeChange,
}: {
  mediaType: FilterType;
  onTypeChange: (type: FilterType) => void;
}) {
  return (
    <div className="flex gap-0 border border-dg-border rounded-sm overflow-hidden bg-dg-surface">
      {MEDIA_TYPES.map((t, i) => {
        const isActive = mediaType === t.value;
        return (
          <button
            type="button"
            key={t.label}
            onClick={() => onTypeChange(t.value)}
            className={cn(
              "dg-press py-2 sm:py-1.5 px-3 min-h-[44px] sm:min-h-0 font-body text-xs flex items-center gap-1.5 flex-1 justify-center relative uppercase tracking-[0.04em]",
              isActive
                ? "bg-dg-elevated text-dg-accent font-semibold"
                : "bg-transparent text-dg-text-tertiary font-normal",
            )}
            style={
              i < MEDIA_TYPES.length - 1
                ? { borderRight: "1px solid var(--color-dg-border-subtle)" }
                : undefined
            }
          >
            {t.label}
            {isActive && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-dg-accent" />}
          </button>
        );
      })}
    </div>
  );
}

const SearchBar = forwardRef<
  HTMLInputElement,
  {
    initialValue: string;
    onRandom?: () => void;
    onFocusChange?: (focused: boolean) => void;
    mobileExtra?: React.ReactNode;
  }
>(function SearchBar({ initialValue, onRandom, onFocusChange, mobileExtra }, ref) {
  const navigate = useNavigate({ from: "/catalog/" });
  const { q } = Route.useSearch();
  const [value, setValue] = useState(initialValue);
  const [focused, setFocused] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Sync when URL changes externally (back/forward) but not while typing
  useEffect(() => {
    if (!focused && !timeoutRef.current) setValue(q ?? "");
  }, [q, focused]);

  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    },
    [],
  );

  const flush = (input: string) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = undefined;
    navigate({
      search: (prev) => ({ ...prev, q: input || undefined }),
      replace: true,
    });
  };

  const handleChange = (input: string) => {
    setValue(input);
    if (input.length > 0) SoundEngine.search();
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => flush(input), 350);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      flush(value);
      (e.target as HTMLInputElement).blur();
    }
  };

  const handleClear = () => {
    setValue("");
    flush("");
  };

  return (
    <div className="relative flex gap-1.5">
      <div className="relative flex-1">
        <div
          className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none transition-colors duration-50"
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
          onKeyDown={handleKeyDown}
          onFocus={() => {
            setFocused(true);
            onFocusChange?.(true);
          }}
          onBlur={() => {
            setFocused(false);
            onFocusChange?.(false);
          }}
          className="w-full py-2 sm:py-2.5 pl-9 pr-8 bg-dg-bg border rounded-sm text-dg-text font-body text-[0.85rem] sm:text-[0.85rem] outline-none box-border transition-all duration-50"
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
      <IconButton
        variant="surface"
        title="Random title"
        onClick={() => onRandom?.()}
        className="self-stretch rounded"
      >
        <Shuffle size={17} weight="bold" />
      </IconButton>
      {mobileExtra}
    </div>
  );
});

function CatalogPage() {
  const { auth } = rootRoute.useRouteContext();
  const { trackedIds: rootTrackedIds } = rootRoute.useLoaderData();
  const { q, type: mediaType } = Route.useSearch();
  const navigate = useNavigate({ from: "/catalog/" });

  const { data, fetchNextPage, hasNextPage, isFetching, isFetchingNextPage, isPlaceholderData } =
    useInfiniteQuery({
      ...catalogInfiniteOptions(mediaType, q || undefined),
      placeholderData: keepPreviousData,
    });
  const isSearching = isFetching && !isFetchingNextPage && isPlaceholderData;
  const allItems = data?.pages.flatMap((p) => p.items) ?? [];

  // Only animate items when data is genuinely new — not when returning with cached results
  const seenQueryKeys = useRef(new Set<string>());
  const currentQueryKey = `${mediaType ?? ""}|${q ?? ""}`;
  const isNewData =
    !seenQueryKeys.current.has(currentQueryKey) && !isPlaceholderData && allItems.length > 0;
  useEffect(() => {
    if (!isPlaceholderData && allItems.length > 0) seenQueryKeys.current.add(currentQueryKey);
  }, [currentQueryKey, isPlaceholderData, allItems.length]);

  const { quickAddState, handleQuickAdd } = useQuickAdd();
  const parentRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [searchFocused, setSearchFocused] = useState(false);

  const trackedIds: Record<string, string | null> = rootTrackedIds;

  const handleTypeChange = useCallback(
    (type: FilterType) => {
      SoundEngine.click();
      navigate({ search: (prev) => ({ ...prev, type }) });
    },
    [navigate],
  );

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

  const { selectedIndex, setSelectedIndex } = useCatalogCursor({
    itemCount: allItems.length,
    virtualizer,
    fetchNextPage,
    hasNextPage,
    enabled: !searchFocused,
  });

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

  useHotkey("Enter", openSelected, { ignoreInputs: true });

  useHotkey("L", openSelected, { enabled: !searchFocused && selectedIndex >= 0 });
  useHotkey("ArrowRight", openSelected, { enabled: !searchFocused && selectedIndex >= 0 });

  useHotkey("/", () => searchRef.current?.focus());

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
  const applyTypeFilter = (type: FilterType) => () => handleTypeChange(type);
  useHotkeySequence(["F", "F"], applyTypeFilter(undefined), { enabled: !searchFocused });
  useHotkeySequence(["F", "M"], applyTypeFilter("movie"), { enabled: !searchFocused });
  useHotkeySequence(["F", "T"], applyTypeFilter("tv_series"), { enabled: !searchFocused });
  useHotkeySequence(["F", "A"], applyTypeFilter("anime"), { enabled: !searchFocused });
  useHotkeySequence(["F", "G"], applyTypeFilter("game"), { enabled: !searchFocused });

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
    { enabled: !searchFocused && selectedIndex >= 0 && !!auth },
  );

  const [filterOpen, setFilterOpen] = useState(false);
  const filterDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!filterOpen) return;
    const handler = (e: MouseEvent) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(e.target as Node)) {
        setFilterOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [filterOpen]);

  const handleRandom = useCallback(async () => {
    SoundEngine.dice();
    const id = await getRandomMediaId();
    if (id) {
      navigate({ to: "/catalog/$wikidataId", params: { wikidataId: id } });
    }
  }, [navigate]);

  useEffect(() => {
    const lastItem = virtualItems[virtualItems.length - 1];
    if (!lastItem) return;
    if (lastItem.index >= allItems.length - 1 && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [virtualItems, allItems.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <div className="text-dg-text flex-1 font-body flex flex-col overflow-hidden">
      <div className="max-w-[1100px] mx-auto w-full px-g1 sm:px-g3 pt-2 sm:pt-3 pb-2 flex flex-col gap-2">
        <div className="flex items-center justify-center gap-1.5 text-[0.7rem] text-dg-text-tertiary sm:hidden">
          <Link
            to="/news"
            className="no-underline text-dg-text-tertiary hover:text-dg-text-secondary transition-colors"
          >
            news
          </Link>
        </div>

        <div className="relative" ref={filterDropdownRef}>
          <SearchBar
            ref={searchRef}
            initialValue={q ?? ""}
            onRandom={handleRandom}
            onFocusChange={setSearchFocused}
            mobileExtra={
              <IconButton
                variant="surface"
                title="Filters"
                onClick={() => setFilterOpen((o) => !o)}
                className="self-stretch rounded sm:hidden"
                style={{
                  color: filterOpen ? "var(--color-dg-accent)" : undefined,
                  borderColor: filterOpen ? "var(--color-dg-accent)" : undefined,
                }}
              >
                <DotsThree size={20} weight="bold" />
              </IconButton>
            }
          />

          {filterOpen && (
            <div className="absolute left-0 right-0 top-full mt-1 z-20 sm:hidden">
              <TypeFilterBar
                mediaType={mediaType}
                onTypeChange={(t) => {
                  handleTypeChange(t);
                  setFilterOpen(false);
                }}
              />
            </div>
          )}
        </div>

        <div className="hidden sm:block">
          <TypeFilterBar mediaType={mediaType} onTypeChange={handleTypeChange} />
        </div>
      </div>

      {!auth && (
        <div className="max-w-[1100px] mx-auto w-full px-g1 sm:px-g3 pb-2">
          <Link
            to="/"
            className="block border border-dg-accent/20 bg-dg-accent-soft rounded px-4 py-3 text-[0.8rem] text-dg-text-secondary no-underline transition-colors duration-50"
          >
            You're seeing a limited catalog. <span className="text-dg-accent">Sign in</span> for the
            full version and to start tracking your media.
          </Link>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        <div className="max-w-[1100px] mx-auto w-full px-g1 sm:px-g3 pb-4 flex-1 flex flex-col min-h-0">
          <div
            className="relative flex-1 min-h-0 border border-dg-border rounded-md overflow-hidden flex flex-col transition-opacity duration-50 bg-dg-surface"
            style={{ opacity: isPlaceholderData ? 0.6 : 1 }}
          >
            {isSearching && (
              <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-sm bg-dg-elevated border border-dg-border shadow-md">
                  <CircleNotch size={13} className="animate-spin text-dg-accent" />
                  <span className="text-[0.75rem] text-dg-text-secondary font-body">
                    Searching...
                  </span>
                </div>
              </div>
            )}
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
                          STAMP_COLORS[displayMediaType(item.mediaType, item.animationOrigin)] ??
                          "var(--color-dg-accent)",
                        animationName: isNewData ? "fadeIn" : "none",
                        animationDuration: "50ms",
                        animationTimingFunction: "var(--ease-smooth)",
                        animationFillMode: "both",
                        animationDelay:
                          isNewData && virtualRow.index < 20 ? `${virtualRow.index * 8}ms` : "0ms",
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
  if (mediaType === "tv_series") {
    const parts: string[] = [];
    if (seasonCount || (episodeCount && episodeCount > 1)) {
      const epToShow = episodeCount && episodeCount > 1 ? episodeCount : null;
      const maxDigits = Math.max(String(seasonCount ?? 0).length, String(epToShow ?? 0).length);
      if (seasonCount) parts.push(`S${String(seasonCount).padStart(maxDigits, "0")}`);
      if (epToShow) parts.push(`E${String(epToShow).padStart(maxDigits, "0")}`);
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
  const displayType = displayMediaType(item.mediaType, item.animationOrigin);
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
      <div
        className="absolute left-0 top-0 bottom-0 w-[2.5px] opacity-0 group-hover:opacity-100 transition-opacity duration-50"
        style={{ backgroundColor: "var(--type-color)" }}
      />

      <div
        className="grid items-center flex-1 min-w-0 gap-1.5 sm:gap-2 py-1.5 px-2 sm:px-3 group-hover:bg-dg-row-hover transition-colors duration-50"
        style={{ gridTemplateColumns: "36px auto 1fr auto" }}
      >
        <CoverThumb
          title={item.title}
          mediaType={displayType}
          size={36}
          posterUrl={item.posterUrl ?? undefined}
        />

        <div className="flex items-center gap-1 self-center">
          <StampBadge type={displayType} index={index} />
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[0.85rem] font-medium text-dg-text truncate flex-1 min-w-0">
              {item.title}
            </span>
            {trackedStatus && (
              <span
                className={`text-[0.58rem] font-mono font-bold uppercase tracking-wider px-1.5 py-[2px] rounded-sm border shrink-0 leading-none flex items-center justify-center ${STATUS_BUTTON_COLORS[trackedStatus as StatusValue] ?? ""}`}
              >
                <StatusIcon status={trackedStatus as StatusValue} size={9} />
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
          {item.episodeCount && item.mediaType === "tv_series" ? (
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
          className={`shrink-0 overflow-hidden transition-[width] duration-150 ease-out h-full flex items-center ${panelOpen ? "w-10" : "w-0 group-hover:w-10"}`}
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
              className="w-full h-full flex items-center justify-center bg-transparent border-none cursor-pointer transition-colors duration-50"
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
