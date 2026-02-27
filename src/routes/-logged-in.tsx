import { Star } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { SoundEngine } from "~/features/catalog/catalog.sound";
import { CoverThumb } from "~/features/catalog/components/CoverThumb";
import { StampBadge } from "~/features/catalog/components/StampBadge";
import { SectionHeader } from "~/features/media/components/SectionHeader";
import {
  displayMediaType,
  ratingColor,
  replayCountLabel,
  STATUS_ICONS,
  STATUS_LABELS_GENERIC,
  STATUS_ORDER,
  type StatusValue,
} from "~/features/media/media-types";

export type CatalogEntryRow = {
  id: string;
  mediaWikidataId: string;
  status: string | null;
  rating: number | null;
  note: string | null;
  episodeProgress: number | null;
  isFavorite: boolean;
  replayCount: number;
  updatedAt: Date | null;
  mediaTitle: string | null;
  mediaType: string | null;
  animationOrigin: string | null;
  watchedEpisodes: Record<string, Record<string, string>> | null;
  episodeCount: number | null;
  seasonCount: number | null;
  posterUrl: string | null;
};

const STATUS_SECTION_COLORS: Record<StatusValue, string> = {
  planned: "var(--color-dg-charted)",
  in_progress: "var(--color-dg-enroute)",
  on_hold: "var(--color-dg-paused)",
  completed: "var(--color-dg-stamped)",
  mastered: "var(--color-dg-sealed)",
  dropped: "var(--color-dg-dropped)",
};

/** Completed and mastered sections get cover grid layout */
const GRID_STATUSES = new Set<string>(["completed", "mastered"]);

/** Compute "on s01e05" or "on ep 05" from watchedEpisodes map. */
function episodePosition(item: CatalogEntryRow): string | null {
  if (!item.watchedEpisodes) return null;
  if (item.mediaType !== "tv_series") return null;
  if (item.status === "completed") return null;

  const seasons = Object.entries(item.watchedEpisodes)
    .map(([s, eps]) => ({
      season: Number.parseInt(s, 10),
      maxEp: Math.max(...Object.keys(eps).map(Number)),
    }))
    .sort((a, b) => b.season - a.season);

  if (seasons.length === 0) return null;

  const { season, maxEp } = seasons[0];
  const nextEp = maxEp + 1;
  const pad = (n: number) => String(n).padStart(2, "0");

  if ((item.seasonCount ?? 1) > 1) {
    return `on s${pad(season)}e${pad(nextEp)}`;
  }
  return `on ep ${pad(nextEp)}`;
}

export function LoggedInView({ entries }: { entries: CatalogEntryRow[] }) {
  // Group by status, sort within sections by updatedAt desc then mediaType alpha
  const grouped = new Map<string, CatalogEntryRow[]>();
  for (const status of STATUS_ORDER) {
    const items = entries
      .filter((e) => e.status === status)
      .sort((a, b) => {
        const tA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const tB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        if (tB !== tA) return tB - tA;
        return (a.mediaType ?? "").localeCompare(b.mediaType ?? "");
      });
    if (items.length > 0) grouped.set(status, items);
  }

  return (
    <div>
      {grouped.size === 0 ? (
        <div className="border border-dg-border-subtle rounded p-4 sm:p-5 bg-dg-surface">
          <p className="text-dg-text-secondary text-[0.85rem] leading-relaxed">
            Your watchlist is empty. Browse the catalog to add titles.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {STATUS_ORDER.map((status) => {
            const items = grouped.get(status);
            if (!items) return null;
            return <WatchlistSection key={status} status={status} items={items} />;
          })}
        </div>
      )}
    </div>
  );
}

function WatchlistSection({ status, items }: { status: string; items: CatalogEntryRow[] }) {
  const s = status as StatusValue;
  const isGrid = GRID_STATUSES.has(status);

  return (
    <div>
      <SectionHeader
        label={STATUS_LABELS_GENERIC[s] ?? status}
        color={STATUS_SECTION_COLORS[s] ?? "var(--color-dg-text-secondary)"}
        count={items.length}
        icon={STATUS_ICONS[s] ?? "\u00b7"}
      />
      {isGrid ? <WatchlistGrid items={items} /> : <WatchlistList items={items} />}
    </div>
  );
}

/** Cover grid for completed/mastered sections */
function WatchlistGrid({ items }: { items: CatalogEntryRow[] }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-g1">
      {items.map((item, i) => (
        <Link
          key={item.id}
          to="/catalog/$wikidataId"
          params={{ wikidataId: item.mediaWikidataId }}
          className="no-underline text-inherit cursor-pointer group"
          onClick={() => SoundEngine.navForward()}
          style={{
            animation: `fadeIn 320ms var(--ease-smooth) both ${i * 30}ms`,
          }}
        >
          <div className="w-full aspect-[2/3] rounded overflow-hidden relative">
            <div className="w-full h-full transition-transform duration-200 ease-out group-hover:scale-[1.03]">
              <CoverThumb
                title={item.mediaTitle ?? "?"}
                mediaType={
                  item.mediaType
                    ? displayMediaType(item.mediaType, item.animationOrigin)
                    : undefined
                }
                size={200}
                posterUrl={item.posterUrl ?? undefined}
                loading="eager"
              />
            </div>
          </div>
          <div className="mt-1 text-xs font-medium text-dg-text truncate transition-colors duration-150 group-hover:text-dg-accent">
            {item.isFavorite && (
              <Star size={10} weight="fill" className="text-dg-accent mr-0.5 inline-block" />
            )}
            {item.mediaTitle ?? item.mediaWikidataId}
          </div>
          <div className="mt-0.5 flex items-center gap-1">
            <StampBadge
              type={displayMediaType(item.mediaType ?? "", item.animationOrigin)}
              index={i}
            />
          </div>
          {item.rating != null && (
            <div
              className="text-[0.65rem] tabular-nums font-mono mt-0.5"
              style={{ color: ratingColor(item.rating) ?? "var(--color-dg-accent)" }}
            >
              {item.rating}/100
            </div>
          )}
        </Link>
      ))}
    </div>
  );
}

function WatchlistListItem({ item, index }: { item: CatalogEntryRow; index: number }) {
  const pos = episodePosition(item);
  const replay = replayCountLabel(item.replayCount, item.mediaType ?? undefined);

  return (
    <Link
      key={item.id}
      to="/catalog/$wikidataId"
      params={{ wikidataId: item.mediaWikidataId }}
      className="flex items-center gap-3 px-3 sm:px-g3 py-3 sm:py-2.5 no-underline text-inherit transition-all duration-100 relative group hover:bg-dg-row-hover hover:translate-x-[3px]"
      onClick={() => SoundEngine.navForward()}
      onMouseEnter={() => SoundEngine.tick()}
      style={{
        animation: `fadeIn 320ms var(--ease-smooth) both ${index * 25}ms`,
      }}
    >
      <div className="absolute left-0 top-[15%] bottom-[15%] w-[2.5px] rounded-r-sm bg-transparent group-hover:bg-dg-accent transition-all duration-150 group-hover:shadow-[0_0_8px_rgba(232,112,46,0.3)]" />
      <StampBadge
        type={displayMediaType(item.mediaType ?? "", item.animationOrigin)}
        index={index}
      />
      <span className="text-[0.85rem] text-dg-text truncate flex-1 font-medium">
        {item.isFavorite && (
          <Star size={11} weight="fill" className="text-dg-accent mr-1 inline-block" />
        )}
        {item.mediaTitle ?? item.mediaWikidataId}
      </span>
      {pos && (
        <span className="text-[0.65rem] text-dg-text-tertiary tabular-nums shrink-0 font-mono">
          {pos}
        </span>
      )}
      {replay && <span className="text-[0.65rem] text-dg-text-tertiary shrink-0">{replay}</span>}
      {item.rating != null && (
        <span
          className="text-[0.75rem] tabular-nums shrink-0 font-mono"
          style={{ color: ratingColor(item.rating) ?? "var(--color-dg-accent)" }}
        >
          {item.rating}/100
        </span>
      )}
    </Link>
  );
}

/** List rows for in-progress, planned, on-hold, dropped sections */
function WatchlistList({ items }: { items: CatalogEntryRow[] }) {
  return (
    <div className="border border-dg-border-subtle rounded bg-dg-surface divide-y divide-dg-border-subtle overflow-hidden">
      {items.map((item, i) => (
        <WatchlistListItem key={item.id} item={item} index={i} />
      ))}
    </div>
  );
}
