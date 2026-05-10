import { Star } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, getRouteApi, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { LinkButton } from "~/components/LinkButton";
import { trackedIdsOptions, watchlistOptions } from "~/features/catalog/catalog.queries";
import { SoundEngine } from "~/features/catalog/catalog.sound";
import { CoverThumb } from "~/features/catalog/components/CoverThumb";
import { StampBadge } from "~/features/catalog/components/StampBadge";
import { StatusIcon } from "~/features/catalog/components/StatusIcon";
import { AcornIcon } from "~/features/media/components/AcornIcon";
import { InfiniteCarousel } from "~/features/media/components/InfiniteCarousel";
import { SectionHeader } from "~/features/media/components/SectionHeader";
import { homepageSampleOptions } from "~/features/media/media.queries";
import {
  displayMediaType,
  normalizeRuns,
  type RunWatchedEpisodes,
  ratingColor,
  replayCountLabel,
  STAMP_COLORS,
  STATUS_LABELS_GENERIC,
  STATUS_ORDER,
  type StatusValue,
  type WatchedEpisodes,
} from "~/features/media/media-types";
import { OnboardingFlow } from "~/features/onboarding/OnboardingFlow";
import { onboardingPicksOptions } from "~/features/onboarding/onboarding.queries";
import { ogTags, pageTitle } from "~/lib/og";

const rootRoute = getRouteApi("__root__");

type CatalogEntryRow = {
  id: string;
  mediaWikidataId: string;
  status: string | null;
  rating: number | null;

  episodeProgress: number | null;
  isFavorite: boolean;
  replayCount: number;
  updatedAt: Date | null;
  mediaTitle: string | null;
  mediaType: string | null;
  animationOrigin: string | null;
  watchedEpisodes: WatchedEpisodes | RunWatchedEpisodes | null;
  episodeCount: number | null;
  seasonCount: number | null;
  posterUrl: string | null;
  mediaUpdatedAt: Date | null;
};

/** Check if media has been updated since user last edited the entry */
function hasMediaUpdate(item: CatalogEntryRow): boolean {
  if (!item.mediaUpdatedAt || !item.updatedAt) return false;
  return item.mediaUpdatedAt.getTime() > item.updatedAt.getTime();
}

/** Compute "on s01e05" or "on ep 05" from watchedEpisodes map. */
function episodePosition(item: CatalogEntryRow): string | null {
  if (!item.watchedEpisodes) return null;
  if (item.mediaType !== "tv_series") return null;
  // Don't show position for completed entries
  if (item.status === "completed") return null;

  // Normalize: if runs shape, use the last run; if flat, use as-is
  const normalized = normalizeRuns(item.watchedEpisodes);
  const flat = normalized.runs[normalized.runs.length - 1] ?? {};

  // Find the highest season with watched episodes
  const seasons = Object.entries(flat)
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

export const Route = createFileRoute("/")({
  loader: async ({ context }) => {
    await context.queryClient.prefetchQuery(homepageSampleOptions());
    if (!context.auth) return { entries: [] as CatalogEntryRow[] };
    try {
      const trackedIds = await context.queryClient.ensureQueryData(trackedIdsOptions());
      const entries = await context.queryClient
        .fetchQuery(watchlistOptions())
        .catch(() => [] as CatalogEntryRow[]);
      // Prefetch onboarding picks when logged in but collection is empty
      if (trackedIds && entries.length === 0) {
        context.queryClient.prefetchQuery(onboardingPicksOptions());
      }
      return { entries };
    } catch {
      return { entries: [] as CatalogEntryRow[] };
    }
  },
  staleTime: 5 * 60 * 1000,
  head: () => ({
    meta: [
      { title: pageTitle("donguri") },
      ...ogTags({
        title: "donguri — track movies, TV, anime, and games",
        description:
          "Your personal catalog for movies, TV shows, anime, and games. Track what you've watched, rate titles, and keep your watchlist organized.",
        path: "/",
      }),
    ],
  }),
  component: HomePage,
});

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

function HomePage() {
  const { auth } = rootRoute.useRouteContext();
  const { entries } = Route.useLoaderData();

  if (!auth) {
    return <LoggedOutView />;
  }

  if (entries.length === 0) {
    return <OnboardingFlow />;
  }

  return (
    <div className="dg-page-enter text-dg-text flex-1 overflow-y-auto font-body">
      <div className="max-w-[1100px] mx-auto px-g3 py-4 sm:py-6">
        <LoggedInView />
      </div>
    </div>
  );
}

const TYPE_CARDS = [
  { type: "movie", label: "Movies", count: "28k+" },
  { type: "tv_series", label: "TV Shows", count: "12k+" },
  { type: "anime", label: "Anime", count: "8k+" },
  { type: "game", label: "Games", count: "15k+" },
] as const;

const AT_LINK = (
  <a
    href="https://atproto.com"
    target="_blank"
    rel="noopener noreferrer"
    className="text-dg-text-secondary hover:text-dg-accent transition-colors duration-50 underline decoration-dg-border-strong underline-offset-2"
  >
    AT Protocol
  </a>
);

const STEPS = [
  {
    step: "1",
    title: "Create an account or sign in",
    desc: (
      <>
        Use your {AT_LINK} identity, Google, or GitHub. We recommend AT Protocol for the full
        experience.
      </>
    ),
  },
  {
    step: "2",
    title: "Browse and track",
    desc: "Search across 100k+ titles. Mark what you\u2019re watching, playing, or planning to.",
  },
  {
    step: "3",
    title: "Your catalog, your way",
    desc: <>Rate, review, and organize. With {AT_LINK}, your data syncs to your own server.</>,
  },
];

function LoggedOutView() {
  return (
    <div className="dg-page-enter text-dg-text flex-1 overflow-y-auto font-body">
      {/* Hero */}
      <section className="pt-3 sm:pt-6 pb-5 sm:pb-8 text-center">
        <h1 className="font-display text-[2.5rem] sm:text-[3.5rem] font-normal tracking-[-0.04em] mb-3 text-dg-text flex items-center justify-center">
          d
          <span className="text-dg-accent inline-flex items-center" style={{ margin: "0 -0.06em" }}>
            <span className="sm:hidden">
              <AcornIcon size={38} />
            </span>
            <span className="hidden sm:inline-flex">
              <AcornIcon size={52} />
            </span>
          </span>
          nguri
        </h1>
        <p className="text-dg-text-secondary text-[1rem] sm:text-[1.1rem] leading-relaxed max-w-[480px] mx-auto mb-2">
          All your media in one place.
        </p>
        <p className="text-dg-text-tertiary text-[0.85rem] leading-relaxed max-w-[420px] mx-auto mb-5">
          Track movies, TV shows, anime, and games.
          <br />
          Built on{" "}
          <a
            href="https://atproto.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-dg-text-secondary hover:text-dg-accent transition-colors duration-50 underline decoration-dg-border-strong underline-offset-2"
          >
            AT Protocol
          </a>{" "}
          — your catalog, your data.
        </p>
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <LinkButton to="/login" variant="primary" onClick={() => SoundEngine.click()}>
            Get started
          </LinkButton>
          <LinkButton to="/catalog" variant="secondary" onClick={() => SoundEngine.click()}>
            Browse catalog →
          </LinkButton>
        </div>
      </section>

      {/* Media type cards */}
      <section className="py-3 sm:py-6 max-w-[1100px] mx-auto px-g3">
        <div className="text-[0.75rem] text-dg-text-tertiary uppercase tracking-wider mb-3">
          One place for everything
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          {TYPE_CARDS.map((t) => (
            <Link
              key={t.type}
              to="/catalog"
              search={{ type: t.type }}
              className="dg-press border border-dg-border-subtle rounded bg-dg-surface p-4 text-center no-underline hover:border-dg-border-strong"
              onClick={() => SoundEngine.click()}
            >
              <div className="text-[0.85rem] font-medium text-dg-text mb-1">{t.label}</div>
              <div className="text-[0.7rem] text-dg-text-tertiary">{t.count} titles</div>
            </Link>
          ))}
        </div>
      </section>

      {/* Catalog sample — right under type cards */}
      <CarouselSection />

      {/* How it works */}
      <section className="py-4 sm:py-6 max-w-[1100px] mx-auto px-g3">
        <div className="text-[0.75rem] text-dg-text-tertiary uppercase tracking-wider mb-3">
          How it works
        </div>
        <div className="flex flex-col gap-3">
          {STEPS.map((s) => (
            <div key={s.step} className="flex gap-3 items-start">
              <div className="w-7 h-7 rounded-full border border-dg-border flex items-center justify-center shrink-0 text-[0.75rem] text-dg-accent font-semibold">
                {s.step}
              </div>
              <div>
                <div className="text-[0.85rem] font-medium text-dg-text mb-0.5">{s.title}</div>
                <div className="text-[0.8rem] text-dg-text-tertiary leading-relaxed">{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Value props */}
      <section className="py-5 sm:py-8 max-w-[1100px] mx-auto px-g3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="border border-dg-border-subtle rounded bg-dg-surface p-4 sm:p-5">
            <div className="font-body text-[0.85rem] font-semibold text-dg-text mb-1">
              Your data, portable
            </div>
            <div className="text-[0.8rem] text-dg-text-secondary leading-relaxed">
              With{" "}
              <a
                href="https://atproto.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-dg-text-secondary hover:text-dg-accent transition-colors duration-50 underline decoration-dg-border-strong underline-offset-2"
              >
                AT Protocol
              </a>
              , your catalog syncs to your own data server. Take it anywhere.
            </div>
          </div>
          <div className="border border-dg-border-subtle rounded bg-dg-surface p-4 sm:p-5">
            <div className="font-body text-[0.85rem] font-semibold text-dg-text mb-1">
              100k+ titles
            </div>
            <div className="text-[0.8rem] text-dg-text-secondary leading-relaxed">
              Movies, TV, anime, and games — sourced from Wikidata, always growing.
            </div>
          </div>
          <div className="border border-dg-border-subtle rounded bg-dg-surface p-4 sm:p-5">
            <div className="font-body text-[0.85rem] font-semibold text-dg-text mb-1">
              Free and open
            </div>
            <div className="text-[0.8rem] text-dg-text-secondary leading-relaxed">
              Open source. No ads, no tracking, no premium tiers gating core features.
            </div>
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="py-5 sm:py-8 text-center border-t border-dg-border-subtle max-w-[1100px] mx-auto px-g3">
        <p className="font-display text-[1.3rem] sm:text-[1.5rem] text-dg-text mb-2">
          Ready to start tracking?
        </p>
        <p className="text-[0.8rem] text-dg-text-tertiary mb-4">Free and open source.</p>
        <LinkButton to="/login" variant="primary" onClick={() => SoundEngine.click()}>
          Get started
        </LinkButton>
      </section>
    </div>
  );
}

function CarouselSection() {
  const { data: samples } = useQuery(homepageSampleOptions());
  if (!samples || samples.length === 0) return null;

  return (
    <section className="pt-4 sm:pt-6 pb-4 sm:pb-6 overflow-hidden">
      <div className="flex items-center justify-between mb-3 max-w-[1100px] mx-auto px-g3">
        <div className="text-[0.75rem] text-dg-text-tertiary uppercase tracking-wider">
          From the catalog
        </div>
        <Link to="/catalog" className="text-[0.7rem] text-dg-accent no-underline">
          Browse all →
        </Link>
      </div>
      <InfiniteCarousel items={samples} />
    </section>
  );
}

function LoggedInView() {
  const { entries } = Route.useLoaderData();

  const grouped = useMemo(() => {
    const map = new Map<string, CatalogEntryRow[]>();
    for (const status of STATUS_ORDER) {
      const items = entries
        .filter((e) => e.status === status)
        .sort((a, b) => {
          const tA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
          const tB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
          if (tB !== tA) return tB - tA;
          return (a.mediaType ?? "").localeCompare(b.mediaType ?? "");
        });
      if (items.length > 0) map.set(status, items);
    }
    return map;
  }, [entries]);

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
        icon={<StatusIcon status={s} size={12} />}
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
            animation: `fadeIn 50ms var(--ease-smooth) both ${i * 8}ms`,
          }}
        >
          <div className="w-full aspect-[2/3] rounded overflow-hidden relative">
            <div className="w-full h-full transition-transform duration-50 ease-out group-hover:scale-[1.03]">
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
          <div className="mt-1 text-xs font-medium text-dg-text truncate transition-colors duration-50 group-hover:text-dg-accent">
            {item.isFavorite && (
              <Star size={10} weight="fill" className="text-dg-accent mr-0.5 inline-block" />
            )}
            {item.mediaTitle ?? item.mediaWikidataId}
            {hasMediaUpdate(item) && (
              <span
                className="inline-block w-1.5 h-1.5 rounded-full bg-dg-accent ml-1 align-middle"
                role="img"
                aria-label="catalog updated since you last edited"
                title="catalog updated since you last edited"
              />
            )}
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
  const typeColor =
    STAMP_COLORS[displayMediaType(item.mediaType ?? "", item.animationOrigin)] ??
    "var(--color-dg-accent)";

  return (
    <Link
      key={item.id}
      to="/catalog/$wikidataId"
      params={{ wikidataId: item.mediaWikidataId }}
      className="flex items-center gap-3 px-3 sm:px-g3 py-3 sm:py-2.5 no-underline text-inherit transition-all duration-50 relative group hover:bg-dg-row-hover hover:translate-x-[3px]"
      onClick={() => SoundEngine.navForward()}
      onMouseEnter={() => SoundEngine.tick()}
      style={
        {
          animation: `fadeIn 50ms var(--ease-smooth) both ${index * 8}ms`,
          "--line-color": typeColor,
        } as React.CSSProperties
      }
    >
      <div className="absolute left-0 top-[15%] bottom-[15%] w-[2.5px] rounded-r-sm bg-transparent group-hover:bg-[var(--line-color)] transition-all duration-50 group-hover:shadow-[0_0_8px_var(--line-color)]" />
      <StampBadge
        type={displayMediaType(item.mediaType ?? "", item.animationOrigin)}
        index={index}
      />
      <span className="text-[0.85rem] text-dg-text truncate flex-1 font-medium">
        {item.isFavorite && (
          <Star size={11} weight="fill" className="text-dg-accent mr-1 inline-block" />
        )}
        {item.mediaTitle ?? item.mediaWikidataId}
        {hasMediaUpdate(item) && (
          <span
            className="inline-block w-1.5 h-1.5 rounded-full bg-dg-accent ml-1.5 align-middle"
            role="img"
            aria-label="catalog updated since you last edited"
            title="catalog updated since you last edited"
          />
        )}
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
