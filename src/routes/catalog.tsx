import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import type { Media } from "../db/schema";
import { getMediaStats, listMedia } from "../lib/media.functions";
import { mediaTypeLabel, TYPE_BADGE_CLASSES } from "../lib/media-types";

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

export const Route = createFileRoute("/catalog")({
  validateSearch: catalogSearchSchema,
  loaderDeps: ({ search }) => ({ q: search.q, type: search.type }),
  loader: async ({ deps }) => {
    const [initialData, stats] = await Promise.all([
      listMedia({
        data: {
          limit: 50,
          mediaType: deps.type,
          search: deps.q || undefined,
        },
      }),
      getMediaStats(),
    ]);
    return { initialData, stats };
  },
  component: CatalogPage,
});

function CatalogPage() {
  const { initialData, stats } = Route.useLoaderData();
  const { q, type: mediaType } = Route.useSearch();
  const navigate = useNavigate({ from: "/catalog" });

  const [items, setItems] = useState<Media[]>(initialData.items);
  const [nextCursor, setNextCursor] = useState<string | null>(initialData.nextCursor);
  const [loading, setLoading] = useState(false);
  const [searchInput, setSearchInput] = useState(q ?? "");
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>();
  const parentRef = useRef<HTMLDivElement>(null);

  // Reset items when loader data changes (URL params changed)
  useEffect(() => {
    setItems(initialData.items);
    setNextCursor(initialData.nextCursor);
  }, [initialData]);

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
      <header className="px-6 pt-6 pb-4">
        <div className="max-w-[1000px] mx-auto">
          <p className="text-dg-text-tertiary text-[0.8rem]">
            {stats.total.toLocaleString()} titles across the catalog
          </p>
        </div>
      </header>

      {/* Controls */}
      <div className="max-w-[1000px] mx-auto w-full px-6 py-4 flex flex-col gap-3">
        {/* Search */}
        <div className="w-full">
          <input
            type="text"
            placeholder="Search titles..."
            value={searchInput}
            onChange={(e) => handleSearchInput(e.target.value)}
            className="w-full py-2.5 px-3 bg-dg-surface border border-dg-border rounded text-dg-text font-mono text-[0.85rem] outline-none box-border"
          />
        </div>

        {/* Type filter tabs */}
        <div className="flex gap-1 flex-wrap">
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
                className={`py-1.5 px-3 border rounded-sm font-mono text-xs cursor-pointer flex items-center gap-1.5 transition-all duration-150 ${
                  isActive
                    ? "bg-dg-accent/[0.08] border-dg-accent/25 text-dg-accent"
                    : "bg-transparent border-dg-border-subtle text-dg-text-secondary"
                }`}
              >
                {t.label}
                <span className="text-[0.65rem] opacity-60">{count.toLocaleString()}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Virtual list */}
      <div ref={parentRef} className="flex-1 overflow-auto max-w-[1000px] mx-auto w-full px-6">
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
            return (
              <Link
                key={item.id}
                to="/media/$wikidataId"
                params={{ wikidataId: item.wikidataId }}
                className="w-full left-0 border-b border-dg-surface absolute no-underline text-inherit block"
                style={{
                  top: virtualRow.start,
                  height: virtualRow.size,
                }}
              >
                <MediaRow item={item} />
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function MediaRow({ item }: { item: Media }) {
  const badgeClass =
    TYPE_BADGE_CLASSES[item.mediaType] ?? "bg-dg-elevated text-dg-text-tertiary border-dg-border";

  return (
    <div className="flex items-center justify-between py-2 h-full gap-4">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <span
          className={`text-[0.6rem] font-semibold py-0.5 px-1.5 rounded-sm border uppercase tracking-wide whitespace-nowrap shrink-0 ${badgeClass}`}
        >
          {mediaTypeLabel(item.mediaType, true)}
        </span>
        <div className="flex items-baseline gap-2 min-w-0 overflow-hidden">
          <span className="text-[0.85rem] font-medium truncate text-dg-text">{item.title}</span>
          {item.originalTitle && (
            <span className="text-xs text-dg-text-tertiary truncate">{item.originalTitle}</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-4 shrink-0">
        {item.startYear && (
          <span className="text-xs text-dg-text-secondary tabular-nums">
            {item.startYear}
            {item.endYear && item.endYear !== item.startYear ? `–${item.endYear}` : ""}
          </span>
        )}
        <span className="text-[0.7rem] text-dg-text-tertiary min-w-8 text-right tabular-nums">
          {item.sitelinksCount ?? 0}
        </span>
      </div>
    </div>
  );
}
