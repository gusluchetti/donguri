import { createFileRoute, getRouteApi, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import type { Media } from "../../db/schema";
import { setCatalogEntry } from "../../lib/catalog.functions";
import { cacheGet, cacheSet, invalidateUserCaches, isStale } from "../../lib/idb-cache";
import { getMediaStats, listMedia } from "../../lib/media.functions";
import { mediaTypeLabel, TYPE_BADGE_CLASSES } from "../../lib/media-types";
import { ogTags } from "../../lib/og";
import { scheduleCatalogPrefetch } from "../../lib/prefetch";

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
  head: () => ({
    meta: [
      { title: "Catalog — donguri" },
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

function CatalogPage() {
  const { auth, trackedIds: rootTrackedIds } = rootRoute.useLoaderData();
  const router = useRouter();
  const { q, type: mediaType } = Route.useSearch();
  const navigate = useNavigate({ from: "/catalog" });

  const [items, setItems] = useState<Media[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [stats, setStats] = useState<{ total: number; byType: Record<string, number> }>({
    total: 0,
    byType: {},
  });
  const [initialLoading, setInitialLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState(q ?? "");
  const [localOverrides, setLocalOverrides] = useState<Record<string, string>>({});
  const [quickAddState, setQuickAddState] = useState<Record<string, "pending" | "done">>({});
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);
  const parentRef = useRef<HTMLDivElement>(null);

  // Merge root tracked IDs with local optimistic overrides
  const trackedIds: Record<string, string | null> = { ...rootTrackedIds, ...localOverrides };

  // Fetch data when search params change (only if logged in)
  const isSearch = !!q;
  const catalogCacheKey = `catalog:${mediaType ?? "all"}:0`;
  const prefetchTriggered = useRef(false);

  useEffect(() => {
    if (!auth) {
      setInitialLoading(false);
      return;
    }

    let cancelled = false;
    setError(null);

    const load = async () => {
      // Try IDB cache first (only for browse, not search)
      if (!isSearch) {
        const [cachedCatalog, cachedStats] = await Promise.all([
          cacheGet<{ items: Media[]; nextCursor: string | null }>(catalogCacheKey),
          cacheGet<{ total: number; byType: Record<string, number> }>("mediaStats"),
        ]);

        if (cachedCatalog && !cancelled) {
          setItems(cachedCatalog.data.items);
          setNextCursor(cachedCatalog.data.nextCursor);
          if (cachedStats) setStats(cachedStats.data);
          setInitialLoading(false);

          // If fresh, skip network
          if (!isStale(cachedCatalog.timestamp, 10 * 60 * 1000)) return;
        }
      } else {
        setInitialLoading(true);
      }

      // Fetch fresh data
      try {
        const [data, statsData] = await Promise.all([
          listMedia({ data: { limit: 50, mediaType, search: q || undefined } }),
          getMediaStats({}),
        ]);
        if (cancelled) return;
        setItems(data.items);
        setNextCursor(data.nextCursor);
        setStats(statsData);
        setInitialLoading(false);

        // Cache browse results (not search)
        if (!isSearch) {
          cacheSet(catalogCacheKey, data).catch(() => {});
          cacheSet("mediaStats", statsData).catch(() => {});

          // Trigger prefetch after first successful load
          if (!prefetchTriggered.current) {
            prefetchTriggered.current = true;
            scheduleCatalogPrefetch();
          }
        }
      } catch (e) {
        if (cancelled) return;
        console.error("[catalog] fetch failed:", e);
        setError("Could not connect to database");
        setInitialLoading(false);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [auth, q, mediaType, isSearch, catalogCacheKey]);

  // Sync search input when URL param changes externally (e.g. back/forward)
  useEffect(() => {
    setSearchInput(q ?? "");
  }, [q]);

  const fetchMore = useCallback(
    async (cursor: string) => {
      setLoading(true);
      try {
        const result = await listMedia({
          data: {
            cursor,
            limit: 50,
            mediaType,
            search: q || undefined,
          },
        });
        setItems((prev) => [...prev, ...result.items]);
        setNextCursor(result.nextCursor);
      } finally {
        setLoading(false);
      }
    },
    [mediaType, q],
  );

  const handleSearchInput = useCallback(
    (value: string) => {
      setSearchInput(value);
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
      searchTimeout.current = setTimeout(() => {
        navigate({
          search: (prev) => ({
            ...prev,
            q: value || undefined,
          }),
          replace: true,
        });
      }, 300);
    },
    [navigate],
  );

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
    async (wikidataId: string, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      console.debug("[quick-add] %s → watching (optimistic)", wikidataId);
      setLocalOverrides((prev) => ({ ...prev, [wikidataId]: "watching" }));
      setQuickAddState((prev) => ({ ...prev, [wikidataId]: "pending" }));
      try {
        await setCatalogEntry({ data: { wikidataId, status: "watching" } });
        console.debug("[quick-add] %s → server ok", wikidataId);
        setQuickAddState((prev) => ({ ...prev, [wikidataId]: "done" }));
        setTimeout(() => {
          setQuickAddState((prev) => {
            const next = { ...prev };
            delete next[wikidataId];
            return next;
          });
        }, 1500);
        invalidateUserCaches();
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
    [router],
  );

  const virtualizer = useVirtualizer({
    count: items.length + (nextCursor ? 1 : 0),
    getScrollElement: () => parentRef.current,
    estimateSize: () => 64,
    overscan: 10,
  });

  const virtualItems = virtualizer.getVirtualItems();

  // Trigger load more when approaching end
  useEffect(() => {
    const lastItem = virtualItems[virtualItems.length - 1];
    if (!lastItem) return;
    if (lastItem.index >= items.length - 5 && nextCursor && !loading) {
      fetchMore(nextCursor);
    }
  }, [virtualItems, items.length, nextCursor, loading, fetchMore]);

  return (
    <div className="bg-dg-bg text-dg-text h-screen font-mono flex flex-col overflow-hidden">
      {/* Header */}
      <header className="px-4 sm:px-6 pt-4 sm:pt-6 pb-2 sm:pb-4">
        <div className="max-w-[1000px] mx-auto">
          <p className="text-dg-text-tertiary text-[0.8rem]">
            {stats.total > 0
              ? `${stats.total.toLocaleString()} titles across the catalog`
              : "\u00a0"}
          </p>
        </div>
      </header>

      {/* Controls */}
      <div className="max-w-[1000px] mx-auto w-full px-4 sm:px-6 py-3 sm:py-4 flex flex-col gap-3">
        {/* Search */}
        <div className="w-full">
          <input
            type="text"
            placeholder="Search titles..."
            value={searchInput}
            onChange={(e) => handleSearchInput(e.target.value)}
            className="w-full py-2.5 px-3 bg-dg-surface border border-dg-border rounded text-dg-text font-mono text-base sm:text-[0.85rem] outline-none box-border"
          />
        </div>

        {/* Type filter tabs */}
        <div className="flex gap-1 flex-nowrap overflow-x-auto sm:flex-wrap scrollbar-hide">
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
                className={`py-2 sm:py-1.5 px-3 min-h-[44px] sm:min-h-0 border rounded-sm font-mono text-xs cursor-pointer flex items-center gap-1.5 shrink-0 transition-all duration-150 ${
                  isActive
                    ? "bg-dg-accent/[0.08] border-dg-accent/25 text-dg-accent"
                    : "bg-transparent border-dg-border-subtle text-dg-text-secondary"
                }`}
              >
                {t.label}
                {count > 0 && (
                  <span className="text-[0.65rem] opacity-60">{count.toLocaleString()}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Login prompt */}
      {!auth && (
        <div className="max-w-[1000px] mx-auto w-full px-4 sm:px-6 pb-3">
          <Link
            to="/"
            className="block border border-dg-accent/20 bg-dg-accent/[0.04] rounded px-4 py-3 text-[0.8rem] text-dg-text-secondary no-underline transition-colors duration-150"
          >
            <span className="text-dg-accent">Sign in</span> to add titles to your watchlist and
            track your progress.
          </Link>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="max-w-[1000px] mx-auto w-full px-4 sm:px-6 pb-4">
          <div className="border border-dg-accent/30 bg-dg-accent/[0.05] rounded px-4 py-3 text-sm text-dg-accent">
            {error}
          </div>
        </div>
      )}

      {/* Virtual list */}
      <div
        ref={parentRef}
        className="flex-1 overflow-auto max-w-[1000px] mx-auto w-full px-4 sm:px-6"
      >
        {initialLoading ? (
          <div className="flex items-center justify-center py-12">
            <span className="text-dg-text-tertiary text-[0.85rem]">Loading catalog...</span>
          </div>
        ) : (
          <div
            style={{
              height: virtualizer.getTotalSize(),
              width: "100%",
              position: "relative",
            }}
          >
            {virtualItems.map((virtualRow) => {
              if (virtualRow.index >= items.length) {
                return (
                  <div
                    key="loader"
                    className="w-full left-0 border-b border-dg-surface absolute flex items-center justify-center"
                    style={{
                      top: virtualRow.start,
                      height: virtualRow.size,
                    }}
                  >
                    <span className="text-dg-text-tertiary">{loading ? "Loading..." : ""}</span>
                  </div>
                );
              }

              const item = items[virtualRow.index];
              const status = trackedIds[item.wikidataId] ?? null;
              const isTracked = status !== null;
              const showAdd = auth && !isTracked;
              const addState = quickAddState[item.wikidataId] ?? null;

              return (
                <Link
                  key={item.id}
                  to="/catalog/$wikidataId"
                  params={{ wikidataId: item.wikidataId }}
                  className="w-full left-0 border-b border-dg-surface absolute no-underline text-inherit block group"
                  style={{
                    top: virtualRow.start,
                    height: virtualRow.size,
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
        )}
      </div>
    </div>
  );
}

const TRACKED_ASTERISK_COLORS: Record<string, string> = {
  watching: "text-dg-accent",
  plan_to_watch: "text-dg-tv",
  paused: "text-dg-text-tertiary",
  dropped: "text-dg-anime",
  completed: "text-dg-game",
};

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

function MediaRow({
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
  onQuickAdd: (wikidataId: string, e: React.MouseEvent) => void;
}) {
  const badgeClass =
    TYPE_BADGE_CLASSES[item.mediaType] ?? "bg-dg-elevated text-dg-text-tertiary border-dg-border";

  const meta = formatMeta(item);

  return (
    <div className="flex items-center justify-between py-2 h-full gap-2 sm:gap-4">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
        {addState === "pending" ? (
          <span className="text-[0.75rem] font-bold text-dg-accent font-mono shrink-0">
            [<span className="dg-ellipsis" />]
          </span>
        ) : addState === "done" ? (
          <span className="text-[0.75rem] font-bold text-dg-game font-mono shrink-0">[ok]</span>
        ) : showAdd ? (
          <button
            type="button"
            onClick={(e) => onQuickAdd(item.wikidataId, e)}
            className="text-[0.75rem] font-bold text-dg-text-tertiary bg-transparent border-none font-mono cursor-pointer p-0 shrink-0 inline-block hover:text-dg-accent"
          >
            [+]
          </button>
        ) : null}
        <span
          className={`text-[0.6rem] font-semibold py-0.5 px-1.5 rounded-sm border uppercase tracking-wide whitespace-nowrap shrink-0 min-w-[3rem] text-center ${badgeClass}`}
        >
          {mediaTypeLabel(item.mediaType, true)}
        </span>
        <div className="flex items-baseline gap-2 min-w-0 overflow-hidden">
          <span className="text-[0.85rem] font-medium truncate text-dg-text">{item.title}</span>
          {trackedStatus && (
            <span
              className={`text-sm shrink-0 ${TRACKED_ASTERISK_COLORS[trackedStatus] ?? "text-dg-text-tertiary"}`}
            >
              *
            </span>
          )}
          {item.originalTitle && (
            <span className="text-xs text-dg-text-tertiary truncate hidden sm:inline">
              {item.originalTitle}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-4 shrink-0">
        {meta && (
          <span className="text-[0.7rem] text-dg-text-tertiary min-w-12 text-right tabular-nums hidden sm:flex">
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
}
