import { createFileRoute } from "@tanstack/react-router";
import { useState, useCallback, useRef, useEffect } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { listMedia, getMediaStats } from "../lib/media.functions";
import type { Media } from "../db/schema";

const MEDIA_TYPES = [
  { value: undefined, label: "All" },
  { value: "movie" as const, label: "Movies" },
  { value: "tv_series" as const, label: "TV" },
  { value: "anime" as const, label: "Anime" },
  { value: "game" as const, label: "Games" },
];

const TYPE_COLORS: Record<string, string> = {
  movie: "#c17a50",
  tv_series: "#5a8fa0",
  anime: "#c25d7e",
  game: "#6a9f5a",
};

export const Route = createFileRoute("/")({
  loader: async () => {
    const [initialData, stats] = await Promise.all([
      listMedia({ data: { limit: 50 } }),
      getMediaStats(),
    ]);
    return { initialData, stats };
  },
  component: CatalogPage,
});

function CatalogPage() {
  const { initialData, stats } = Route.useLoaderData();
  const [items, setItems] = useState<Media[]>(initialData.items);
  const [nextCursor, setNextCursor] = useState<string | null>(
    initialData.nextCursor,
  );
  const [loading, setLoading] = useState(false);
  const [mediaType, setMediaType] = useState<
    "movie" | "tv_series" | "anime" | "game" | undefined
  >(undefined);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>();
  const parentRef = useRef<HTMLDivElement>(null);

  const fetchMedia = useCallback(
    async (
      opts: {
        cursor?: string;
        type?: "movie" | "tv_series" | "anime" | "game";
        searchTerm?: string;
        append?: boolean;
      } = {},
    ) => {
      setLoading(true);
      try {
        const result = await listMedia({
          data: {
            cursor: opts.append ? opts.cursor : undefined,
            limit: 50,
            mediaType: opts.type,
            search: opts.searchTerm || undefined,
          },
        });
        if (opts.append) {
          setItems((prev) => [...prev, ...result.items]);
        } else {
          setItems(result.items);
        }
        setNextCursor(result.nextCursor);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  // Refetch when type filter changes
  useEffect(() => {
    fetchMedia({ type: mediaType, searchTerm: search });
  }, [mediaType, search, fetchMedia]);

  // Debounced search
  const handleSearchInput = useCallback(
    (value: string) => {
      setSearchInput(value);
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
      searchTimeout.current = setTimeout(() => {
        setSearch(value);
      }, 300);
    },
    [],
  );

  const loadMore = useCallback(() => {
    if (nextCursor && !loading) {
      fetchMedia({
        cursor: nextCursor,
        type: mediaType,
        searchTerm: search,
        append: true,
      });
    }
  }, [nextCursor, loading, mediaType, search, fetchMedia]);

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
      loadMore();
    }
  }, [virtualItems, items.length, nextCursor, loading, loadMore]);

  return (
    <div style={styles.container}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <h1 style={styles.logo}>
            <span style={styles.logoAccent}>donguri</span>
          </h1>
          <p style={styles.tagline}>
            {stats.total.toLocaleString()} titles across the catalog
          </p>
        </div>
      </header>

      {/* Controls */}
      <div style={styles.controls}>
        {/* Search */}
        <div style={styles.searchWrap}>
          <input
            type="text"
            placeholder="Search titles..."
            value={searchInput}
            onChange={(e) => handleSearchInput(e.target.value)}
            style={styles.searchInput}
          />
        </div>

        {/* Type filter tabs */}
        <div style={styles.tabs}>
          {MEDIA_TYPES.map((t) => {
            const isActive = mediaType === t.value;
            const count = t.value
              ? (stats.byType as Record<string, number>)[t.value] ?? 0
              : stats.total;
            return (
              <button
                key={t.label}
                onClick={() => setMediaType(t.value)}
                style={{
                  ...styles.tab,
                  ...(isActive ? styles.tabActive : {}),
                }}
              >
                {t.label}
                <span style={styles.tabCount}>
                  {count.toLocaleString()}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Virtual list */}
      <div ref={parentRef} style={styles.listContainer}>
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
                  style={{
                    ...styles.row,
                    position: "absolute",
                    top: virtualRow.start,
                    height: virtualRow.size,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <span style={{ color: "#776b57" }}>
                    {loading ? "Loading..." : ""}
                  </span>
                </div>
              );
            }

            const item = items[virtualRow.index];
            return (
              <a
                key={item.id}
                href={`/media/${item.wikidataId}`}
                style={{
                  ...styles.row,
                  position: "absolute",
                  top: virtualRow.start,
                  height: virtualRow.size,
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                <MediaRow item={item} />
              </a>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function MediaRow({ item }: { item: Media }) {
  const typeColor = TYPE_COLORS[item.mediaType] ?? "#776b57";

  return (
    <div style={styles.rowInner}>
      <div style={styles.rowLeft}>
        <span
          style={{
            ...styles.typeBadge,
            backgroundColor: typeColor + "20",
            color: typeColor,
            borderColor: typeColor + "40",
          }}
        >
          {item.mediaType === "tv_series"
            ? "TV"
            : item.mediaType.charAt(0).toUpperCase() +
              item.mediaType.slice(1)}
        </span>
        <div style={styles.rowTitles}>
          <span style={styles.rowTitle}>{item.title}</span>
          {item.originalTitle && (
            <span style={styles.rowOriginalTitle}>
              {item.originalTitle}
            </span>
          )}
        </div>
      </div>
      <div style={styles.rowRight}>
        {item.startYear && (
          <span style={styles.rowYear}>
            {item.startYear}
            {item.endYear && item.endYear !== item.startYear
              ? `–${item.endYear}`
              : ""}
          </span>
        )}
        <span style={styles.rowSitelinks}>
          {item.sitelinksCount ?? 0}
        </span>
      </div>
    </div>
  );
}

// ─── Inline styles ──────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  container: {
    backgroundColor: "#0f0e0c",
    color: "#e8e0d4",
    minHeight: "100vh",
    fontFamily: "'IBM Plex Mono', 'SF Mono', monospace",
    display: "flex",
    flexDirection: "column",
  },
  header: {
    padding: "2rem 1.5rem 1rem",
    borderBottom: "1px solid #2e2a21",
  },
  headerInner: {
    maxWidth: "1000px",
    margin: "0 auto",
  },
  logo: {
    fontSize: "1.8rem",
    fontWeight: 600,
    margin: 0,
    letterSpacing: "-0.02em",
  },
  logoAccent: {
    color: "#d4a44a",
  },
  tagline: {
    color: "#776b57",
    fontSize: "0.8rem",
    marginTop: "0.25rem",
  },
  controls: {
    maxWidth: "1000px",
    margin: "0 auto",
    width: "100%",
    padding: "1rem 1.5rem",
    display: "flex",
    flexDirection: "column",
    gap: "0.75rem",
  },
  searchWrap: {
    width: "100%",
  },
  searchInput: {
    width: "100%",
    padding: "0.6rem 0.8rem",
    backgroundColor: "#1a1815",
    border: "1px solid #3d3628",
    borderRadius: "4px",
    color: "#e8e0d4",
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: "0.85rem",
    outline: "none",
    boxSizing: "border-box",
  },
  tabs: {
    display: "flex",
    gap: "0.25rem",
    flexWrap: "wrap",
  },
  tab: {
    padding: "0.4rem 0.7rem",
    backgroundColor: "transparent",
    border: "1px solid #2e2a21",
    borderRadius: "3px",
    color: "#a8997f",
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: "0.75rem",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: "0.4rem",
    transition: "all 0.15s",
  },
  tabActive: {
    backgroundColor: "#d4a44a15",
    borderColor: "#d4a44a40",
    color: "#d4a44a",
  },
  tabCount: {
    fontSize: "0.65rem",
    opacity: 0.6,
  },
  listContainer: {
    flex: 1,
    overflow: "auto",
    maxWidth: "1000px",
    margin: "0 auto",
    width: "100%",
    padding: "0 1.5rem",
  },
  row: {
    width: "100%",
    left: 0,
    borderBottom: "1px solid #1a1815",
  },
  rowInner: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0.5rem 0",
    height: "100%",
    gap: "1rem",
  },
  rowLeft: {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
    minWidth: 0,
    flex: 1,
  },
  typeBadge: {
    fontSize: "0.6rem",
    fontWeight: 600,
    padding: "0.15rem 0.4rem",
    borderRadius: "2px",
    border: "1px solid",
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    whiteSpace: "nowrap" as const,
    flexShrink: 0,
  },
  rowTitles: {
    display: "flex",
    alignItems: "baseline",
    gap: "0.5rem",
    minWidth: 0,
    overflow: "hidden",
  },
  rowTitle: {
    fontSize: "0.85rem",
    fontWeight: 500,
    whiteSpace: "nowrap" as const,
    overflow: "hidden",
    textOverflow: "ellipsis",
    color: "#e8e0d4",
  },
  rowOriginalTitle: {
    fontSize: "0.75rem",
    color: "#776b57",
    whiteSpace: "nowrap" as const,
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  rowRight: {
    display: "flex",
    alignItems: "center",
    gap: "1rem",
    flexShrink: 0,
  },
  rowYear: {
    fontSize: "0.75rem",
    color: "#a8997f",
    fontVariantNumeric: "tabular-nums",
  },
  rowSitelinks: {
    fontSize: "0.7rem",
    color: "#776b57",
    minWidth: "2rem",
    textAlign: "right" as const,
    fontVariantNumeric: "tabular-nums",
  },
};
