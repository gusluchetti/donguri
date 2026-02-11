import { createFileRoute, getRouteApi, useRouter } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import type { CatalogEntry } from "../../db/schema";
import { getCatalogEntry, removeCatalogEntry, setCatalogEntry } from "../../lib/catalog.functions";
import { mediaTypeLabel, TYPE_BADGE_CLASSES } from "../../lib/media-types";
import { getMedia } from "../../lib/media.functions";

const rootRoute = getRouteApi("__root__");

const STATUSES = [
  { value: "watching", label: "Watching" },
  { value: "plan_to_watch", label: "Plan to Watch" },
  { value: "paused", label: "Paused" },
  { value: "completed", label: "Completed" },
  { value: "dropped", label: "Dropped" },
] as const;

const STATUS_COLORS: Record<string, string> = {
  watching: "border-dg-accent text-dg-accent bg-dg-accent/10",
  plan_to_watch: "border-dg-tv text-dg-tv bg-dg-tv/10",
  paused: "border-dg-text-tertiary text-dg-text-tertiary bg-dg-text-tertiary/10",
  completed: "border-dg-game text-dg-game bg-dg-game/10",
  dropped: "border-dg-anime text-dg-anime bg-dg-anime/10",
};

export const Route = createFileRoute("/catalog/$wikidataId")({
  loader: async ({ params }) => {
    const data = await getMedia({ data: { wikidataId: params.wikidataId } });
    if (!data) throw new Error("Media not found");
    return data;
  },
  pendingMs: 0,
  pendingComponent: MediaDetailSkeleton,
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.title ?? "Media"} — donguri` },
      {
        name: "description",
        content: loaderData?.description ?? "",
      },
    ],
  }),
  component: MediaDetailPage,
});

function MediaDetailSkeleton() {
  return (
    <div className="bg-dg-bg text-dg-text min-h-screen font-mono">
      <div className="max-w-[700px] mx-auto p-6">
        <div className="text-dg-text-tertiary text-[0.8rem] mb-6">&larr; catalog</div>
        <div className="mb-6">
          <div className="w-16 h-5 bg-dg-surface rounded-sm mb-3 animate-pulse" />
          <div className="w-2/3 h-8 bg-dg-surface rounded animate-pulse" />
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3 mb-6 p-4 bg-dg-surface rounded border border-dg-border-subtle">
          {[...Array(4)].map((_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton items
            <div key={i} className="flex flex-col gap-1">
              <div className="w-12 h-3 bg-dg-elevated rounded animate-pulse" />
              <div className="w-16 h-4 bg-dg-elevated rounded animate-pulse" />
            </div>
          ))}
        </div>
        <div className="space-y-2 mb-6">
          <div className="w-full h-4 bg-dg-surface rounded animate-pulse" />
          <div className="w-4/5 h-4 bg-dg-surface rounded animate-pulse" />
        </div>
      </div>
    </div>
  );
}

function MediaDetailPage() {
  const data = Route.useLoaderData();
  const { auth } = rootRoute.useLoaderData();
  const badgeClass =
    TYPE_BADGE_CLASSES[data.mediaType] ?? "bg-dg-elevated text-dg-text-tertiary border-dg-border";

  const isAnime = data.mediaType === "anime";
  const isGame = data.mediaType === "game";
  const isTvOrAnime = data.mediaType === "tv_series" || isAnime;

  const externalLinks: { label: string; url: string }[] = [];
  if (data.imdbId)
    externalLinks.push({
      label: "IMDb",
      url: `https://www.imdb.com/title/${data.imdbId}`,
    });
  if (data.tmdbId && !isGame) {
    externalLinks.push({
      label: "TMDB",
      url:
        data.mediaType === "movie"
          ? `https://www.themoviedb.org/movie/${data.tmdbId}`
          : `https://www.themoviedb.org/tv/${data.tmdbId}`,
    });
  }
  if (data.malId && isAnime)
    externalLinks.push({
      label: "MyAnimeList",
      url: `https://myanimelist.net/anime/${data.malId}`,
    });
  if (data.anilistId && isAnime)
    externalLinks.push({
      label: "AniList",
      url: `https://anilist.co/anime/${data.anilistId}`,
    });
  if (data.anidbId && isAnime)
    externalLinks.push({
      label: "AniDB",
      url: `https://anidb.net/anime/${data.anidbId}`,
    });
  if (data.annId && isAnime)
    externalLinks.push({
      label: "ANN",
      url: `https://www.animenewsnetwork.com/encyclopedia/anime.php?id=${data.annId}`,
    });
  if (data.igdbId && isGame)
    externalLinks.push({
      label: "IGDB",
      url: `https://www.igdb.com/games/${data.igdbId}`,
    });
  if (data.tvdbId && isTvOrAnime) {
    const isNumeric = /^\d+$/.test(data.tvdbId);
    externalLinks.push({
      label: "TheTVDB",
      url: isNumeric
        ? `https://thetvdb.com/dereferrer/series/${data.tvdbId}`
        : `https://thetvdb.com/series/${data.tvdbId}`,
    });
  }
  externalLinks.push({
    label: "Wikidata",
    url: `https://www.wikidata.org/wiki/${data.wikidataId}`,
  });

  return (
    <div className="bg-dg-bg text-dg-text min-h-screen font-mono">
      <div className="max-w-[700px] mx-auto p-6">
        {/* Back link */}
        <button
          type="button"
          onClick={() => window.history.back()}
          className="text-dg-text-tertiary text-[0.8rem] bg-transparent border-none font-mono cursor-pointer p-0 mb-6 inline-block"
        >
          &larr; back
        </button>

        {/* Header */}
        <div className="mb-6">
          <span
            className={`text-[0.65rem] font-semibold py-1 px-2 rounded-sm border uppercase tracking-wide inline-block mb-3 ${badgeClass}`}
          >
            {mediaTypeLabel(data.mediaType)}
          </span>
          <h1 className="text-[1.6rem] font-semibold m-0 leading-[1.2] -tracking-[0.01em]">
            {data.title}
          </h1>
          {data.originalTitle && (
            <p className="text-base text-dg-text-secondary mt-1.5">{data.originalTitle}</p>
          )}
        </div>

        {/* Meta info */}
        <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3 mb-6 p-4 bg-dg-surface rounded border border-dg-border-subtle">
          {data.startYear && (
            <MetaItem
              label="Year"
              value={
                data.endYear && data.endYear !== data.startYear
                  ? `${data.startYear}\u2013${data.endYear}`
                  : String(data.startYear)
              }
            />
          )}
          {data.countryOfOrigin && <MetaItem label="Country" value={data.countryOfOrigin} />}
          {data.runtimeMinutes && (
            <MetaItem label="Runtime" value={`${data.runtimeMinutes} min`} />
          )}
          {data.seasonCount && <MetaItem label="Seasons" value={String(data.seasonCount)} />}
          {data.episodeCount && <MetaItem label="Episodes" value={String(data.episodeCount)} />}
          {data.status && (
            <MetaItem
              label="Status"
              value={data.status.charAt(0).toUpperCase() + data.status.slice(1)}
            />
          )}
          <MetaItem label="Popularity" value={`${data.sitelinksCount ?? 0} sitelinks`} />
        </div>

        {/* Tracking panel (inline) */}
        {auth && <TrackingPanel wikidataId={data.wikidataId} />}

        {/* Description */}
        {data.description && (
          <p className="text-[0.85rem] leading-relaxed text-dg-text-secondary mb-6">
            {data.description}
          </p>
        )}

        {/* Genres */}
        {data.genres.length > 0 && (
          <div className="mb-6">
            <h3 className="text-[0.7rem] text-dg-text-tertiary uppercase tracking-wider mb-2">
              Genres
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {data.genres.map((g) => (
                <span
                  key={g.id}
                  className="text-xs py-1 px-2 bg-dg-elevated border border-dg-border rounded-sm text-dg-text-secondary"
                >
                  {g.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Platforms (games) */}
        {data.platforms.length > 0 && (
          <div className="mb-6">
            <h3 className="text-[0.7rem] text-dg-text-tertiary uppercase tracking-wider mb-2">
              Platforms
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {data.platforms.map((p) => (
                <span
                  key={p.id}
                  className="text-xs py-1 px-2 bg-dg-elevated border border-dg-border rounded-sm text-dg-text-secondary"
                >
                  {p.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* External links */}
        <div className="mb-6">
          <h3 className="text-[0.7rem] text-dg-text-tertiary uppercase tracking-wider mb-2">
            Links
          </h3>
          <div className="flex flex-wrap gap-2">
            {externalLinks.map((link) => (
              <a
                key={link.label}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-dg-accent no-underline py-1.5 px-2.5 border border-dg-accent/20 rounded-sm transition-all duration-150"
              >
                {link.label} &nearr;
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function TrackingPanel({ wikidataId }: { wikidataId: string }) {
  const router = useRouter();
  const [entry, setEntry] = useState<CatalogEntry | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getCatalogEntry({ data: { wikidataId } })
      .then((e) => {
        if (!cancelled) {
          setEntry(e);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [wikidataId]);

  const handleSetStatus = useCallback(
    async (status: "watching" | "completed" | "dropped" | "plan_to_watch" | "paused") => {
      setSaving(true);
      setError(null);
      const prev = entry;
      setEntry((e) =>
        e
          ? { ...e, status, updatedAt: new Date() }
          : ({
              id: "",
              userId: "",
              mediaWikidataId: wikidataId,
              status,
              rating: null,
              note: null,
              episodeProgress: null,
              rkey: null,
              syncedAt: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            } as CatalogEntry),
      );
      try {
        await setCatalogEntry({
          data: {
            wikidataId,
            status,
            rating: prev?.rating,
            note: prev?.note,
            episodeProgress: prev?.episodeProgress,
          },
        });
        const fresh = await getCatalogEntry({ data: { wikidataId } });
        setEntry(fresh);
        router.invalidate();
      } catch {
        setEntry(prev);
        setError("Failed to save");
      } finally {
        setSaving(false);
      }
    },
    [entry, wikidataId, router],
  );

  const handleSetRating = useCallback(
    async (rating: number | null) => {
      if (!entry?.status) return;
      setSaving(true);
      setError(null);
      const prev = entry;
      setEntry((e) => (e ? { ...e, rating, updatedAt: new Date() } : e));
      try {
        await setCatalogEntry({
          data: {
            wikidataId,
            status: entry.status,
            rating,
            note: entry.note,
            episodeProgress: entry.episodeProgress,
          },
        });
        const fresh = await getCatalogEntry({ data: { wikidataId } });
        setEntry(fresh);
        router.invalidate();
      } catch {
        setEntry(prev);
        setError("Failed to save");
      } finally {
        setSaving(false);
      }
    },
    [entry, wikidataId, router],
  );

  const handleRemove = useCallback(async () => {
    setSaving(true);
    setError(null);
    const prev = entry;
    setEntry(null);
    try {
      await removeCatalogEntry({ data: { wikidataId } });
      router.invalidate();
    } catch {
      setEntry(prev);
      setError("Failed to remove");
    } finally {
      setSaving(false);
    }
  }, [entry, wikidataId, router]);

  if (!loaded) {
    return (
      <div className="border border-dg-border-subtle rounded p-4 bg-dg-surface mb-6">
        <div className="w-20 h-3 bg-dg-elevated rounded animate-pulse" />
      </div>
    );
  }

  return (
    <div className="border border-dg-border-subtle rounded p-4 bg-dg-surface mb-6">
      <h3 className="text-[0.7rem] text-dg-text-tertiary uppercase tracking-wider mb-3">
        Tracking {saving && <span className="text-dg-accent ml-1">saving...</span>}
      </h3>

      {error && <p className="text-dg-anime text-[0.75rem] mb-2">{error}</p>}

      {/* Status buttons — horizontal */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {STATUSES.map((s) => {
          const isActive = entry?.status === s.value;
          const colorClass = STATUS_COLORS[s.value];
          return (
            <button
              key={s.value}
              type="button"
              onClick={() => handleSetStatus(s.value)}
              disabled={saving}
              className={`text-[0.8rem] py-1.5 px-3 rounded-sm border font-mono cursor-pointer transition-all duration-150 disabled:opacity-50 ${
                isActive
                  ? colorClass
                  : "border-dg-border-subtle text-dg-text-secondary bg-transparent hover:border-dg-border"
              }`}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      {/* Rating (only when tracked) */}
      {entry?.status && (
        <div className="mb-4">
          <h4 className="text-[0.65rem] text-dg-text-tertiary uppercase tracking-wider mb-2">
            Rating
          </h4>
          <div className="flex flex-wrap gap-1">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => {
              const isActive = entry.rating === n;
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => handleSetRating(isActive ? null : n)}
                  disabled={saving}
                  className={`w-7 h-7 text-[0.75rem] rounded-sm border font-mono cursor-pointer transition-all duration-150 disabled:opacity-50 ${
                    isActive
                      ? "border-dg-accent text-dg-accent bg-dg-accent/10"
                      : "border-dg-border-subtle text-dg-text-tertiary bg-transparent hover:border-dg-border"
                  }`}
                >
                  {n}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Remove button */}
      {entry?.status && (
        <button
          type="button"
          onClick={handleRemove}
          disabled={saving}
          className="text-[0.75rem] text-dg-text-tertiary bg-transparent border-none font-mono cursor-pointer p-0 hover:text-dg-anime transition-colors duration-150 disabled:opacity-50"
        >
          Remove from list
        </button>
      )}
    </div>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[0.65rem] text-dg-text-tertiary uppercase tracking-wider">{label}</span>
      <span className="text-[0.85rem] text-dg-text">{value}</span>
    </div>
  );
}
