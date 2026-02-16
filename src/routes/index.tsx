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
};

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
      <div className="bg-dg-bg text-dg-text flex-1 font-mono">
        <div className="max-w-[1000px] mx-auto px-4 py-6 sm:px-6 sm:py-8">
          <LoggedInView />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-dg-bg text-dg-text flex-1 font-mono">
      <div className="max-w-[1000px] mx-auto px-4 py-6 sm:px-6 sm:py-8">
        <h1 className="text-[1.6rem] sm:text-[2rem] font-semibold -tracking-[0.02em] mb-2">
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

      {/* Bluesky — primary */}
      <BlueskyLoginForm />

      {/* Divider */}
      <div className="flex items-center gap-3">
        <div className="flex-1 border-t border-dg-border-subtle" />
        <span className="text-[0.75rem] text-dg-text-tertiary">or</span>
        <div className="flex-1 border-t border-dg-border-subtle" />
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
            className="bg-transparent border border-dg-accent/30 text-dg-accent px-4 py-2.5 sm:py-2 rounded-sm text-[0.85rem] font-mono cursor-pointer transition-all duration-150 hover:border-dg-accent/60 disabled:opacity-40 disabled:cursor-not-allowed"
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
      className="w-full bg-transparent border border-dg-border-subtle text-dg-text-secondary px-4 py-2.5 sm:py-2 rounded-sm text-[0.85rem] font-mono cursor-pointer transition-all duration-150 hover:border-dg-border hover:text-dg-text disabled:opacity-40 disabled:cursor-not-allowed text-center"
    >
      {loading ? <span className="dg-ellipsis">Redirecting</span> : label}
    </button>
  );
}

function LoggedInView() {
  const { entries = [] } = Route.useLoaderData();

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
  const accentClass = STATUS_ACCENT[status as StatusValue] ?? "text-dg-text-secondary";

  return (
    <div>
      <h2 className={`text-[0.8rem] uppercase tracking-wider mb-2 ${accentClass}`}>
        {STATUS_LABELS_GENERIC[status as StatusValue] ?? status}{" "}
        <span className="text-dg-text-tertiary font-normal">({items.length})</span>
      </h2>
      <div className="border border-dg-border-subtle rounded bg-dg-surface divide-y divide-dg-border-subtle">
        {items.map((item) => {
          const badgeClass = typeBadgeClass(item.mediaType);
          const replay = replayCountLabel(item.replayCount, item.mediaType ?? undefined);
          return (
            <Link
              key={item.id}
              to="/catalog/$wikidataId"
              params={{ wikidataId: item.mediaWikidataId }}
              className="flex items-center gap-3 px-3 sm:px-4 py-3 sm:py-2.5 no-underline text-inherit hover:bg-dg-elevated/50 transition-colors duration-100"
            >
              <span
                className={`text-[0.6rem] font-semibold py-0.5 px-1.5 rounded-sm border uppercase tracking-wide whitespace-nowrap shrink-0 min-w-[3rem] text-center ${badgeClass}`}
              >
                {mediaTypeLabel(item.mediaType ?? "", true)}
              </span>
              <span className="text-[0.85rem] text-dg-text truncate flex-1">
                {item.isFavorite && (
                  <span className="text-dg-accent mr-1" title="Favorite">
                    &#9733;
                  </span>
                )}
                {item.mediaTitle ?? item.mediaWikidataId}
              </span>
              {replay && (
                <span className="text-[0.65rem] text-dg-text-tertiary shrink-0">{replay}</span>
              )}
              {item.rating != null && (
                <span
                  className="text-[0.75rem] tabular-nums shrink-0"
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
