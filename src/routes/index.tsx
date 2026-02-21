import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, getRouteApi, Link } from "@tanstack/react-router";
import { useState } from "react";
import { initiateLogin, initiateOAuthLogin } from "../lib/auth.functions";
import {
  mediaTypeLabel,
  ratingColor,
  replayCountLabel,
  STATUS_ACCENT,
  STATUS_LABELS_GENERIC,
  STATUS_ORDER,
  type StatusValue,
  typeBadgeClass,
} from "../lib/media-types";
import { ogTags, pageTitle } from "../lib/og";
import { watchlistOptions } from "../lib/query-options";

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

function HomePage() {
  const { auth } = rootRoute.useLoaderData();

  if (auth) {
    return (
      <div className="flex-1">
        <div className="max-w-[1000px] mx-auto px-4 py-6 sm:px-6 sm:py-8">
          <LoggedInView />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1">
      <div className="max-w-[1000px] mx-auto px-4 py-6 sm:px-6 sm:py-8">
        <h1 className="text-3xl font-bold mb-2 text-balance">
          <span className="text-dg-accent">donguri</span>
        </h1>
        <p className="text-dg-text-secondary text-base leading-relaxed mb-5 sm:mb-6">
          Track movies, TV, anime, and games.
        </p>

        <SignInSection />

        <div className="flex flex-col sm:flex-row gap-3 mt-5 sm:mt-6">
          <Link
            to="/catalog"
            className="text-base text-dg-bg no-underline py-2.5 sm:py-2 px-5 bg-dg-accent rounded-sm transition-all duration-100 text-center sm:text-left active:scale-[0.97] font-medium"
          >
            Browse catalog
          </Link>
          <Link
            to="/roadmap"
            className="text-base text-dg-text-secondary no-underline py-2.5 sm:py-2 px-5 border border-dg-border-subtle rounded-sm transition-all duration-100 text-center sm:text-left active:scale-[0.97] hover:border-dg-border"
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
    <div className="border-l-[3px] border-l-dg-accent pl-4 sm:pl-5 flex flex-col gap-3">
      <div className="text-sm text-dg-text-secondary uppercase tracking-wider">Sign in</div>

      {/* Bluesky — primary */}
      <BlueskyLoginForm />

      {/* Divider */}
      <div className="flex items-center gap-3">
        <div
          className="flex-1 h-px"
          style={{
            backgroundImage:
              "linear-gradient(90deg, transparent, var(--color-dg-border-subtle), transparent)",
          }}
        />
        <span className="text-sm text-dg-text-tertiary">or</span>
        <div
          className="flex-1 h-px"
          style={{
            backgroundImage:
              "linear-gradient(90deg, transparent, var(--color-dg-border-subtle), transparent)",
          }}
        />
      </div>

      {/* Google + GitHub */}
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
    <div className="rounded p-4 sm:p-5 bg-dg-surface dg-grain dg-card">
      <form onSubmit={onSubmit}>
        <label
          htmlFor="handle"
          className="block text-sm text-dg-text-secondary uppercase tracking-wider mb-3"
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
            className="flex-1 bg-dg-bg border border-dg-border rounded px-3 py-2.5 sm:py-2 text-base text-dg-text placeholder:text-dg-text-tertiary disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={loading || !handle.trim()}
            className="bg-dg-accent text-dg-bg px-4 py-2.5 sm:py-2 rounded-sm text-base font-medium cursor-pointer transition-all duration-100 hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.97]"
          >
            {loading ? <span className="dg-ellipsis">Signing in</span> : "Sign in"}
          </button>
        </div>
        {error && <p className="text-dg-movie text-sm mt-2">{error}</p>}
      </form>
      <p className="text-[0.8125rem] text-dg-text-tertiary mt-3">
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
      className="w-full bg-transparent border border-dg-border text-dg-text-secondary px-4 py-2.5 sm:py-2 rounded-sm text-base cursor-pointer transition-all duration-100 hover:bg-dg-surface hover:text-dg-text disabled:opacity-40 disabled:cursor-not-allowed text-center active:scale-[0.97] dg-hover-lift"
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
        <div className="border border-dashed border-dg-border rounded p-8 text-center dg-grain">
          <p className="text-base text-dg-text-secondary mb-1">your catalog is empty</p>
          <Link to="/catalog" className="text-base text-dg-accent no-underline hover:underline">
            browse titles to start filing &rarr;
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
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
  const accentClass = STATUS_ACCENT[status as StatusValue] ?? "text-dg-text-secondary";

  return (
    <div>
      <div className="flex items-center gap-3 mb-2">
        <h2 className={`text-sm font-bold uppercase tracking-widest m-0 ${accentClass}`}>
          {STATUS_LABELS_GENERIC[status as StatusValue] ?? status}
        </h2>
        <div className="flex-1 border-t border-dotted border-dg-border-subtle" />
        <span className="text-sm text-dg-text-tertiary tabular-nums">({items.length})</span>
      </div>
      <div className="rounded bg-dg-surface dg-grain dg-card">
        {items.map((item, i) => {
          const badgeClass = typeBadgeClass(item.mediaType);
          const replay = replayCountLabel(item.replayCount, item.mediaType ?? undefined);
          return (
            <Link
              key={item.id}
              to="/catalog/$wikidataId"
              params={{ wikidataId: item.mediaWikidataId }}
              className={`flex items-center gap-3 px-3 sm:px-4 py-3 sm:py-2.5 no-underline text-inherit hover:bg-dg-elevated/50 transition-colors duration-[60ms] dg-tab-in${i < items.length - 1 ? "" : ""}`}
              style={
                i < items.length - 1
                  ? {
                      borderBottom: "1px solid transparent",
                      borderImage:
                        "linear-gradient(90deg, transparent, var(--color-dg-border-subtle), transparent) 1",
                    }
                  : undefined
              }
            >
              <span className={`whitespace-nowrap shrink-0 min-w-[3rem] text-center ${badgeClass}`}>
                {mediaTypeLabel(item.mediaType ?? "", true)}
              </span>
              <span className="text-base text-dg-text truncate flex-1">
                {item.isFavorite && (
                  <span className="text-dg-accent mr-1" title="Favorite">
                    &#9733;
                  </span>
                )}
                {item.mediaTitle ?? item.mediaWikidataId}
              </span>
              {(() => {
                const pos = episodePosition(item);
                return pos ? (
                  <span className="text-[0.8125rem] text-dg-text-tertiary tabular-nums shrink-0">
                    {pos}
                  </span>
                ) : null;
              })()}
              {replay && (
                <span className="text-[0.8125rem] text-dg-text-tertiary shrink-0">{replay}</span>
              )}
              {item.rating != null && (
                <span
                  className="text-[0.8125rem] tabular-nums shrink-0"
                  style={{ color: ratingColor(item.rating) ?? "var(--color-dg-accent)" }}
                >
                  {item.rating}/100
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
