import { createFileRoute, getRouteApi, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { initiateLogin } from "../lib/auth.functions";
import { getUserCatalogEntries } from "../lib/catalog.functions";
import { mediaTypeLabel, ratingColor, TYPE_BADGE_CLASSES } from "../lib/media-types";
import { scheduleCatalogPrefetch } from "../lib/prefetch";
import { swrLoadWithFallback } from "../lib/swr-loader";

const rootRoute = getRouteApi("__root__");

const STATUS_ORDER = ["watching", "plan_to_watch", "paused", "dropped", "completed"] as const;

const STATUS_LABELS: Record<string, string> = {
  watching: "Watching",
  plan_to_watch: "Plan to Watch",
  paused: "Paused",
  dropped: "Dropped",
  completed: "Completed",
};

const STATUS_ACCENT: Record<string, string> = {
  watching: "text-dg-accent",
  plan_to_watch: "text-dg-tv",
  paused: "text-dg-text-tertiary",
  dropped: "text-dg-anime",
  completed: "text-dg-game",
};

type CatalogEntryRow = {
  id: string;
  mediaWikidataId: string;
  status: string | null;
  rating: number | null;
  note: string | null;
  episodeProgress: number | null;
  updatedAt: Date | null;
  mediaTitle: string | null;
  mediaType: string | null;
};

export const Route = createFileRoute("/")({
  loader: async () => {
    try {
      const { data, fromCache } = await swrLoadWithFallback(() => getUserCatalogEntries({}), {
        key: "watchlist",
        maxAgeMs: 30_000,
      });
      return { entries: data as CatalogEntryRow[], fromCache };
    } catch {
      return { entries: [] as CatalogEntryRow[], fromCache: false };
    }
  },
  staleTime: 30_000,
  component: HomePage,
});

function HomePage() {
  const { auth } = rootRoute.useLoaderData();

  return (
    <div className="bg-dg-bg text-dg-text min-h-screen font-mono">
      <div className="max-w-[1000px] mx-auto px-4 py-10 sm:px-6 sm:py-16">
        <h1 className="text-[1.6rem] sm:text-[2rem] font-semibold -tracking-[0.02em] mb-2">
          <span className="text-dg-accent">donguri</span>
        </h1>
        <p className="text-dg-text-secondary text-[0.9rem] leading-relaxed mb-6 sm:mb-8">
          Track movies, TV, anime, and games. Your watchlist, your data, your rules.
        </p>

        {auth ? <LoggedInView handle={auth.handle} /> : <LoginForm />}

        <div className="flex flex-col sm:flex-row gap-3 mt-6 sm:mt-8">
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

function LoggedInView({ handle }: { handle: string }) {
  const { entries, fromCache } = Route.useLoaderData();

  useEffect(() => {
    scheduleCatalogPrefetch();
  }, []);

  // Group by status
  const grouped = new Map<string, CatalogEntryRow[]>();
  for (const status of STATUS_ORDER) {
    const items = entries.filter((e) => e.status === status);
    if (items.length > 0) grouped.set(status, items);
  }

  return (
    <div>
      <div className="border border-dg-border-subtle rounded p-4 sm:p-5 bg-dg-surface mb-6">
        <p className="text-dg-text text-[0.9rem]">
          Signed in as <span className="text-dg-accent">@{handle}</span>
        </p>
      </div>

      {fromCache && (
        <p className="text-dg-text-tertiary text-[0.75rem] mb-3">Showing cached data</p>
      )}

      {grouped.size === 0 ? (
        <div className="border border-dg-border-subtle rounded p-4 sm:p-5 bg-dg-surface">
          <p className="text-dg-text-secondary text-[0.85rem] leading-relaxed">
            Your watchlist is empty. Browse the catalog to add titles.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
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
  const accentClass = STATUS_ACCENT[status] ?? "text-dg-text-secondary";

  return (
    <div>
      <h2 className={`text-[0.8rem] uppercase tracking-wider mb-2 ${accentClass}`}>
        {STATUS_LABELS[status] ?? status}{" "}
        <span className="text-dg-text-tertiary font-normal">({items.length})</span>
      </h2>
      <div className="border border-dg-border-subtle rounded bg-dg-surface divide-y divide-dg-border-subtle">
        {items.map((item) => {
          const badgeClass =
            TYPE_BADGE_CLASSES[item.mediaType ?? ""] ??
            "bg-dg-elevated text-dg-text-tertiary border-dg-border";
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
                {item.mediaTitle ?? item.mediaWikidataId}
              </span>
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

function LoginForm() {
  const [handle, setHandle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!handle.trim()) return;

    setLoading(true);
    setError(null);

    const trimmed = handle.trim();
    console.debug("[login-ui] submitting handle:", trimmed);

    try {
      console.debug("[login-ui] calling initiateLogin...");
      const result = await initiateLogin({ data: { handle: trimmed } });
      console.debug("[login-ui] got redirect URL:", result.url);
      window.location.href = result.url;
    } catch (err) {
      console.error("[login-ui] initiateLogin failed:", err);
      const msg = err instanceof Error ? err.message : "Failed to initiate login";
      console.error("[login-ui] error message shown to user:", msg);
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
          Sign in with Bluesky
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
    </div>
  );
}
