import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, getRouteApi, Link } from "@tanstack/react-router";
import { useState } from "react";
import { initiateLogin, initiateOAuthLogin } from "../lib/auth.functions";
import {
  highestConsecutiveEpisode,
  mediaTypeLabel,
  ratingColor,
  replayCountLabel,
  STATUS_ACCENT_VAR,
  STATUS_LABELS_GENERIC,
  STATUS_ORDER,
  type StatusValue,
} from "../lib/media-types";
import { ogTags, pageTitle } from "../lib/og";
import { watchlistOptions } from "../lib/query-options";
import styles from "./index.module.css";

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

/** Compute "on s01e05" or "on ep 05" from watchedEpisodes map.
 *  Uses highestConsecutiveEpisode to avoid gaps and off-by-one errors. */
function episodePosition(item: CatalogEntryRow): string | null {
  if (!item.watchedEpisodes) return null;
  if (item.mediaType !== "tv_series" && item.mediaType !== "anime") return null;
  if (item.status === "completed") return null;

  const seasons = Object.keys(item.watchedEpisodes)
    .map(Number)
    .filter((n) => !Number.isNaN(n))
    .sort((a, b) => b - a);

  if (seasons.length === 0) return null;

  // Find highest season with consecutive progress
  for (const season of seasons) {
    const consecutive = highestConsecutiveEpisode(item.watchedEpisodes, season);
    if (consecutive > 0) {
      const nextEp = Math.max(1, consecutive + 1);
      const pad = (n: number) => String(n).padStart(2, "0");
      if ((item.seasonCount ?? 1) > 1) {
        return `on s${pad(season)}e${pad(nextEp)}`;
      }
      return `on ep ${pad(nextEp)}`;
    }
  }

  // Episodes exist but no consecutive run — show season without episode
  const highestSeason = seasons[0];
  const pad = (n: number) => String(n).padStart(2, "0");
  if ((item.seasonCount ?? 1) > 1) {
    return `on s${pad(highestSeason)}`;
  }
  return null;
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
      <div className={styles.page}>
        <div className={styles.container}>
          <LoggedInView />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <h1 className={styles.heroTitle}>donguri</h1>
        <p className={styles.heroDesc}>Track movies, TV, anime, and games.</p>

        <SignInSection />

        <div className={styles.heroLinks}>
          <Link to="/catalog" className={styles.heroPrimary}>
            Browse catalog
          </Link>
          <Link to="/roadmap" className={styles.heroSecondary}>
            Roadmap
          </Link>
        </div>
      </div>
    </div>
  );
}

function SignInSection() {
  return (
    <div className={styles.signInSection}>
      <div className={styles.signInLabel}>Sign in</div>
      <BlueskyLoginForm />
      <div className={styles.divider}>
        <div className={styles.dividerLine} />
        <span className={styles.dividerText}>or</span>
        <div className={styles.dividerLine} />
      </div>
      <div className={styles.oauthButtons}>
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
    <div className={styles.bskyCard}>
      <form onSubmit={onSubmit}>
        <label htmlFor="handle" className={styles.bskyLabel}>
          Bluesky
        </label>
        <div className={styles.bskyForm}>
          <input
            id="handle"
            type="text"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="handle.bsky.social"
            disabled={loading}
            className={styles.bskyInput}
          />
          <button type="submit" disabled={loading || !handle.trim()} className={styles.bskySubmit}>
            {loading ? <span className="dg-ellipsis">Signing in</span> : "Sign in"}
          </button>
        </div>
        {error && <p className={styles.bskyError}>{error}</p>}
      </form>
      <p className={styles.bskyNote}>
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
    <button type="button" onClick={onClick} disabled={loading} className={styles.oauthBtn}>
      {loading ? <span className="dg-ellipsis">Redirecting</span> : label}
    </button>
  );
}

function LoggedInView() {
  const { data: entries = [] } = useSuspenseQuery(watchlistOptions()) as {
    data: CatalogEntryRow[];
  };

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
        <div className={styles.watchlistEmpty}>
          <p className={styles.watchlistEmptyText}>
            Your watchlist is empty. Browse the catalog to add titles.
          </p>
        </div>
      ) : (
        <div className={styles.watchlistSections}>
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
  const accentVar = STATUS_ACCENT_VAR[status as StatusValue] ?? "var(--dg-text-secondary)";

  return (
    <div>
      <h2 className={styles.sectionHeader} style={{ color: accentVar }}>
        {STATUS_LABELS_GENERIC[status as StatusValue] ?? status}{" "}
        <span className={styles.sectionCount}>({items.length})</span>
      </h2>
      <div className={styles.sectionList}>
        {items.map((item) => {
          const replay = replayCountLabel(item.replayCount, item.mediaType ?? undefined);
          return (
            <Link
              key={item.id}
              to="/catalog/$wikidataId"
              params={{ wikidataId: item.mediaWikidataId }}
              className={styles.watchlistRow}
            >
              <span className={styles.badge} data-type={item.mediaType}>
                {mediaTypeLabel(item.mediaType ?? "", true)}
              </span>
              <span className={styles.titleCell}>
                {item.isFavorite && (
                  <span className={styles.favorite} title="Favorite">
                    &#9733;
                  </span>
                )}
                {item.mediaTitle ?? item.mediaWikidataId}
              </span>
              {(() => {
                const pos = episodePosition(item);
                return pos ? <span className={styles.episodePos}>{pos}</span> : null;
              })()}
              {replay && <span className={styles.replay}>{replay}</span>}
              {item.rating != null && (
                <span
                  className={styles.ratingValue}
                  style={{ color: ratingColor(item.rating) ?? "var(--dg-accent)" }}
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
