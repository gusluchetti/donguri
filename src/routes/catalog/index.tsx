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
import { mediaTypeLabel, STATUS_ACCENT_VAR, type StatusValue } from "../../lib/media-types";
import { ogTags, pageTitle } from "../../lib/og";
import { catalogInfiniteOptions, mediaStatsOptions } from "../../lib/query-options";
import styles from "./index.module.css";

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
    <input
      ref={ref}
      type="text"
      placeholder="Search titles..."
      value={value}
      onChange={(e) => handleChange(e.target.value)}
      className={styles.searchInput}
    />
  );
});

function CatalogPage() {
  const { stats } = Route.useLoaderData();
  const { auth, trackedIds: rootTrackedIds } = rootRoute.useLoaderData();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { q, type: mediaType } = Route.useSearch();
  const navigate = useNavigate({ from: "/catalog/" });

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
    [router, queryClient],
  );

  useEffect(
    () => () => {
      for (const t of quickAddTimers.current.values()) clearTimeout(t);
    },
    [],
  );

  const scrollEntry = useElementScrollRestoration({
    getElement: () => parentRef.current,
  });

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

  const { selectedIndex, setSelectedIndex } = useCatalogCursor({
    itemCount: allItems.length,
    virtualizer,
    fetchNextPage,
    hasNextPage,
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

  const openSelected = () => {
    const item = allItems[selectedIndex];
    if (item) navigate({ to: "/catalog/$wikidataId", params: { wikidataId: item.wikidataId } });
  };
  useHotkey("L", openSelected, { enabled: selectedIndex >= 0 });
  useHotkey("ArrowRight", openSelected, { enabled: selectedIndex >= 0 });

  useHotkey("/", () => {
    searchRef.current?.focus();
  });

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

  const typeFilter = (type: "movie" | "tv_series" | "anime" | "game" | undefined) => () => {
    if (isInputFocused()) return;
    handleTypeChange(type);
  };
  useHotkeySequence(["F", "F"], typeFilter(undefined));
  useHotkeySequence(["F", "M"], typeFilter("movie"));
  useHotkeySequence(["F", "T"], typeFilter("tv_series"));
  useHotkeySequence(["F", "A"], typeFilter("anime"));
  useHotkeySequence(["F", "G"], typeFilter("game"));

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

  useEffect(() => {
    const lastItem = virtualItems[virtualItems.length - 1];
    if (!lastItem) return;
    if (lastItem.index >= allItems.length - 1 && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [virtualItems, allItems.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <p className={styles.statsText}>
            {stats.total > 0
              ? `${stats.total.toLocaleString()} titles across the catalog`
              : "\u00a0"}
          </p>
        </div>
      </header>

      <div className={styles.controls}>
        <div style={{ width: "100%" }}>
          <SearchInput ref={searchRef} initialValue={q ?? ""} />
        </div>

        <div className={styles.filters}>
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
                className={styles.filterBtn}
                {...(isActive ? { "data-active": "" } : {})}
              >
                {t.label}
                {count > 0 && <span className={styles.filterCount}>{count.toLocaleString()}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {!auth && (
        <div className={styles.loginPrompt}>
          <Link to="/" className={styles.loginBanner}>
            <span className={styles.loginAccent}>Sign in</span> to add titles to your watchlist and
            track your progress.
          </Link>
        </div>
      )}

      <div className={styles.listWrapper}>
        <div ref={parentRef} className={styles.listScroller}>
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
                    className={styles.loader}
                    style={{
                      top: virtualRow.start,
                      height: virtualRow.size,
                    }}
                  >
                    <span>{isFetchingNextPage ? "Loading..." : ""}</span>
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
                  className={`${styles.listItem}${isCursorActive ? " dg-cursor-active" : ""}`}
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
  const meta = formatMeta(item);

  return (
    <div className={styles.row}>
      <div className={styles.rowLeft}>
        {item.posterUrl && (
          <img
            src={item.posterUrl}
            alt=""
            width={40}
            height={60}
            className={styles.poster}
            loading="lazy"
          />
        )}
        {addState === "pending" ? (
          <span className={styles.addPending}>
            [<span className="dg-ellipsis" />]
          </span>
        ) : addState === "done" ? (
          <span className={styles.addDone}>[ok]</span>
        ) : showAdd ? (
          <button
            type="button"
            onClick={(e) => onQuickAdd(item.wikidataId, item.mediaType, e)}
            className={styles.addBtn}
          >
            [+]
          </button>
        ) : null}
        <span className={styles.badge} data-type={item.mediaType}>
          {mediaTypeLabel(item.mediaType, true)}
        </span>
        <div className={styles.titleGroup}>
          <span className={styles.title}>{item.title}</span>
          {trackedStatus && (
            <span
              className={styles.trackedDot}
              style={{
                color: STATUS_ACCENT_VAR[trackedStatus as StatusValue] ?? "var(--dg-text-tertiary)",
              }}
            >
              *
            </span>
          )}
          {item.originalTitle && <span className={styles.originalTitle}>{item.originalTitle}</span>}
        </div>
      </div>
      <div className={styles.rowRight}>
        {meta && <span className={styles.meta}>{meta}</span>}
        {item.startYear && (
          <span className={styles.year}>
            {item.startYear}
            {item.endYear && item.endYear !== item.startYear ? `–${item.endYear}` : ""}
          </span>
        )}
      </div>
    </div>
  );
});
