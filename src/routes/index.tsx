import { Star } from "@phosphor-icons/react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, getRouteApi, Link } from "@tanstack/react-router";
import { useState } from "react";
import { CoverThumb } from "~/components/CoverThumb";
import { SectionHeader } from "~/components/SectionHeader";
import { StampBadge } from "~/components/StampBadge";
import { initiateLogin, initiateOAuthLogin } from "~/features/auth/auth.functions";
import {
  ratingColor,
  replayCountLabel,
  STATUS_ICONS,
  STATUS_LABELS_GENERIC,
  STATUS_ORDER,
  type StatusValue,
} from "~/lib/media-types";
import { ogTags, pageTitle } from "~/lib/og";
import { watchlistOptions } from "~/lib/query-options";
import { SoundEngine } from "~/lib/sound";

const rootRoute = getRouteApi("__root__");

type CatalogEntryRow = {
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
  watchedEpisodes: Record<string, Record<string, string>> | null;
  episodeCount: number | null;
  seasonCount: number | null;
  posterUrl: string | null;
};

/** Compute "on s01e05" or "on ep 05" from watchedEpisodes map. */
function episodePosition(item: CatalogEntryRow): string | null {
  if (!item.watchedEpisodes) return null;
  if (item.mediaType !== "tv_series" && item.mediaType !== "anime") return null;
  // Don't show position for completed entries
  if (item.status === "completed") return null;

  // Find the highest season with watched episodes
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

export const Route = createFileRoute("/")({
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
  loader: async ({ context }) => {
    try {
      const entries = (await context.queryClient.fetchQuery(
        watchlistOptions(),
      )) as CatalogEntryRow[];
      return { entries };
    } catch {
      const entries: CatalogEntryRow[] = [];
      return { entries };
    }
  },
  staleTime: 5 * 60 * 1000,
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
  const { auth } = rootRoute.useLoaderData();

  if (auth) {
    return (
      <div className="dg-page-enter text-dg-text flex-1 overflow-y-auto font-body">
        <div className="max-w-[1100px] mx-auto px-g3 py-6 sm:py-8">
          <LoggedInView />
        </div>
      </div>
    );
  }

  return (
    <div className="dg-page-enter text-dg-text flex-1 overflow-y-auto font-body">
      <div className="max-w-[1100px] mx-auto px-g3 py-6 sm:py-8">
        <h1 className="font-display text-[1.8rem] sm:text-[2.25rem] font-normal tracking-[-0.03em] mb-2">
          <span className="text-dg-accent">donguri</span>
        </h1>
        <p className="text-dg-text-secondary text-[0.9rem] leading-relaxed mb-4 sm:mb-5">
          Track movies, TV, anime, and games.
        </p>

        <SignInSection />

        <div className="flex flex-col sm:flex-row gap-3 mt-4 sm:mt-5">
          <Link
            to="/catalog"
            className="text-[0.85rem] text-dg-accent no-underline py-2.5 sm:py-2 px-4 border border-dg-accent/20 rounded-sm transition-all duration-150 text-center sm:text-left"
          >
            Browse catalog
          </Link>
          <Link
            to="/roadmap"
            className="text-[0.85rem] text-dg-text-secondary no-underline py-2.5 sm:py-2 px-4 border border-dg-border-subtle rounded-sm transition-all duration-150 text-center sm:text-left"
          >
            Roadmap
          </Link>
        </div>
      </div>
    </div>
  );
}

function SignInSection() {
  return (
    <div className="flex flex-col gap-3">
      <div className="text-[0.8rem] text-dg-text-secondary uppercase tracking-wider">Sign in</div>

      <BlueskyLoginForm />

      <div className="flex items-center gap-3">
        <div className="flex-1 border-t border-dg-border-subtle" />
        <span className="text-[0.75rem] text-dg-text-tertiary">or</span>
        <div className="flex-1 border-t border-dg-border-subtle" />
      </div>

      <div className="flex flex-col gap-2">
        <OAuthButton provider="google" label="Continue with Google" />
        <OAuthButton provider="github" label="Continue with GitHub" />
      </div>
    </div>
  );
}

function BlueskyLoginForm() {
  const [handle, setHandle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!handle.trim()) return;

    setLoading(true);
    setError(null);

    const trimmed = handle.trim();

    try {
      const result = await initiateLogin({ data: { handle: trimmed } });
      window.location.href = result.url;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to initiate login";
      setError(msg);
      setLoading(false);
    }
  };

  return (
    <div className="border border-dg-border-subtle rounded p-4 sm:p-5 bg-dg-surface">
      <form onSubmit={onSubmit}>
        <label
          htmlFor="handle"
          className="block text-dg-text-secondary text-[0.8rem] uppercase tracking-wider mb-3"
        >
          Bluesky
        </label>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            id="handle"
            type="text"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="handle.bsky.social"
            disabled={loading}
            className="flex-1 bg-dg-bg border border-dg-border rounded px-3 py-2.5 sm:py-2 text-base sm:text-[0.85rem] text-dg-text font-mono placeholder:text-dg-text-tertiary focus:outline-none focus:border-dg-accent/50 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={loading || !handle.trim()}
            className="bg-transparent border border-dg-accent/30 text-dg-accent px-4 py-2.5 sm:py-2 rounded-sm text-[0.85rem] font-body cursor-pointer transition-all duration-150 hover:border-dg-accent/60 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? <span className="dg-ellipsis">Signing in</span> : "Sign in"}
          </button>
        </div>
        {error && <p className="text-dg-movie text-[0.8rem] mt-2">{error}</p>}
      </form>
      <p className="text-[0.75rem] text-dg-text-tertiary mt-3">
        Your data syncs to your own PDS. Portable and private by design.
      </p>
    </div>
  );
}

function OAuthButton({ provider, label }: { provider: "google" | "github"; label: string }) {
  const [loading, setLoading] = useState(false);

  const onClick = async () => {
    setLoading(true);
    try {
      const result = await initiateOAuthLogin({ data: { provider } });
      window.location.href = result.url;
    } catch {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="w-full bg-dg-surface border border-dg-border text-dg-text-secondary px-4 py-2.5 sm:py-2 rounded-sm text-[0.85rem] font-body cursor-pointer transition-all duration-150 hover:border-dg-border-strong hover:text-dg-text disabled:opacity-40 disabled:cursor-not-allowed text-center"
    >
      {loading ? <span className="dg-ellipsis">Redirecting</span> : label}
    </button>
  );
}

function LoggedInView() {
  const { data: entries = [] } = useSuspenseQuery(watchlistOptions()) as {
    data: CatalogEntryRow[];
  };

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
    <div className="grid grid-cols-[repeat(auto-fill,minmax(100px,1fr))] gap-g1">
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
          <div className="w-full aspect-[2/3] rounded overflow-hidden relative transition-all duration-[120ms] ease-[var(--ease-spring)] group-hover:scale-[1.04] group-hover:shadow-[0_4px_20px_rgba(184,164,114,0.15)]">
            <CoverThumb
              title={item.mediaTitle ?? "?"}
              mediaType={item.mediaType ?? undefined}
              size={200}
              posterUrl={item.posterUrl ?? undefined}
            />
          </div>
          <div className="mt-1 text-xs font-medium text-dg-text truncate transition-all duration-150 group-hover:text-dg-accent group-hover:-translate-y-1">
            {item.isFavorite && (
              <Star size={10} weight="fill" className="text-dg-accent mr-0.5 inline-block" />
            )}
            {item.mediaTitle ?? item.mediaWikidataId}
          </div>
          <div className="mt-0.5 flex items-center gap-1">
            <StampBadge type={item.mediaType ?? ""} index={i} />
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
      <div className="absolute left-0 top-[15%] bottom-[15%] w-[2.5px] rounded-r-sm bg-transparent group-hover:bg-dg-accent transition-all duration-150 group-hover:shadow-[0_0_8px_rgba(184,164,114,0.3)]" />
      <StampBadge type={item.mediaType ?? ""} index={index} />
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
