import { createFileRoute, getRouteApi, useRouter } from "@tanstack/react-router";
import { Save, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CatalogEntry } from "../../db/schema";
import { getCatalogEntry, getMediaStub, removeCatalogEntry, setCatalogEntry } from "../../lib/catalog.functions";
import { clearCachedWatchlist } from "../../lib/idb-cache";
import { mediaTypeLabel, TYPE_BADGE_CLASSES } from "../../lib/media-types";
import { getMedia } from "../../lib/media.functions";

const rootRoute = getRouteApi("__root__");

/** Maps 0–10 rating to a color: dark red → amber → green */
function ratingColor(value: number | null): string | undefined {
  if (value == null || value === 0) return undefined;
  // 3-stop gradient: 0→red(0,70%,45%), 5→amber(40,80%,55%), 10→green(140,60%,45%)
  const t = value / 10;
  let h: number, s: number, l: number;
  if (t <= 0.5) {
    const p = t / 0.5;
    h = 0 + p * 40;
    s = 70 + p * 10;
    l = 45 + p * 10;
  } else {
    const p = (t - 0.5) / 0.5;
    h = 40 + p * 100;
    s = 80 - p * 20;
    l = 55 - p * 10;
  }
  return `hsl(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%)`;
}

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

type FullLoaderData = {
  kind: "full";
  media: NonNullable<Awaited<ReturnType<typeof getMedia>>>;
};

type StubLoaderData = {
  kind: "stub";
  stub: { wikidataId: string; title: string; mediaType: string | null };
};

type LoaderData = FullLoaderData | StubLoaderData;

export const Route = createFileRoute("/catalog/$wikidataId")({
  loader: async ({ params }): Promise<LoaderData> => {
    const data = await getMedia({ data: { wikidataId: params.wikidataId } });
    if (data) return { kind: "full", media: data };

    const stub = await getMediaStub({ data: { wikidataId: params.wikidataId } });
    if (stub) return { kind: "stub", stub };

    throw new Error("Media not found");
  },
  staleTime: 5 * 60 * 1000,
  pendingMs: 0,
  pendingComponent: MediaDetailSkeleton,
  head: ({ loaderData }) => {
    const title =
      loaderData?.kind === "full"
        ? loaderData.media.title
        : loaderData?.kind === "stub"
          ? loaderData.stub.title
          : "Media";
    const description =
      loaderData?.kind === "full" ? (loaderData.media.description ?? "") : "";
    return {
      meta: [
        { title: `${title} — donguri` },
        { name: "description", content: description },
      ],
    };
  },
  component: MediaDetailRouter,
});

function MediaDetailRouter() {
  const data = Route.useLoaderData();
  if (data.kind === "stub") return <MediaStubPage stub={data.stub} />;
  return <MediaDetailPage data={data.media} />;
}

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

function MediaStubPage({ stub }: { stub: { wikidataId: string; title: string; mediaType: string | null } }) {
  const { auth } = rootRoute.useLoaderData();
  const badgeClass =
    TYPE_BADGE_CLASSES[stub.mediaType ?? ""] ?? "bg-dg-elevated text-dg-text-tertiary border-dg-border";

  return (
    <div className="bg-dg-bg text-dg-text min-h-screen font-mono">
      <div className="max-w-[700px] mx-auto p-6">
        <button
          type="button"
          onClick={() => window.history.back()}
          className="text-dg-text-tertiary text-[0.8rem] bg-transparent border-none font-mono cursor-pointer p-0 mb-6 inline-block"
        >
          &larr; back
        </button>

        <div className="mb-6">
          {stub.mediaType && (
            <span
              className={`text-[0.65rem] font-semibold py-1 px-2 rounded-sm border uppercase tracking-wide inline-block mb-3 ${badgeClass}`}
            >
              {mediaTypeLabel(stub.mediaType)}
            </span>
          )}
          <h1 className="text-[1.6rem] font-semibold m-0 leading-[1.2] -tracking-[0.01em]">
            {stub.title}
          </h1>
        </div>

        <div className="border border-dg-border-subtle rounded p-4 bg-dg-surface mb-6">
          <p className="text-[0.8rem] text-dg-text-tertiary">
            This title has not been imported into the catalog yet. Metadata will appear after the next data import.
          </p>
        </div>

        {auth && <TrackingPanel wikidataId={stub.wikidataId} />}

        <div className="mb-6">
          <h3 className="text-[0.7rem] text-dg-text-tertiary uppercase tracking-wider mb-2">
            Links
          </h3>
          <div className="flex flex-wrap gap-2">
            <a
              href={`https://www.wikidata.org/wiki/${stub.wikidataId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-dg-accent no-underline py-1.5 px-2.5 border border-dg-accent/20 rounded-sm transition-all duration-150"
            >
              Wikidata {"\u2197"}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

function MediaDetailPage({ data }: { data: NonNullable<Awaited<ReturnType<typeof getMedia>>> }) {
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
          {data.runtimeMinutes && data.mediaType === "movie" && (
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
                {link.label} {"\u2197"}
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
  // Local state tracks UI; saved* refs track what the server has
  const [localRating, setLocalRating] = useState<number | null>(null);
  const [localStatus, setLocalStatus] = useState<string | null>(null);
  const savedRating = useRef<number | null>(null);
  const savedStatus = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    console.debug("[tracking] loading entry for %s", wikidataId);
    getCatalogEntry({ data: { wikidataId } })
      .then((e) => {
        if (!cancelled) {
          console.debug("[tracking] loaded entry for %s → %s", wikidataId, e ? e.status : "not tracked");
          setEntry(e);
          setLocalRating(e?.rating ?? null);
          setLocalStatus(e?.status ?? null);
          savedRating.current = e?.rating ?? null;
          savedStatus.current = e?.status ?? null;
          setLoaded(true);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error("[tracking] load FAILED for %s:", wikidataId, err);
          setLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [wikidataId]);

  const ratingDirty =
    localRating !== savedRating.current &&
    !(localRating === null && savedRating.current === null);
  const statusDirty = localStatus !== savedStatus.current;
  const isDirty = ratingDirty || statusDirty;

  const handleSave = useCallback(async () => {
    const status = localStatus as NonNullable<CatalogEntry["status"]>;
    if (!status) return;
    console.debug("[tracking] save %s → status=%s rating=%s", wikidataId, status, localRating);
    setSaving(true);
    setError(null);
    const prev = entry;
    setEntry((e) =>
      e
        ? { ...e, status, rating: localRating, updatedAt: new Date() }
        : ({
            id: "",
            userId: "",
            mediaWikidataId: wikidataId,
            mediaTitle: null,
            mediaType: null,
            status,
            rating: localRating,
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
          rating: localRating,
          note: prev?.note,
          episodeProgress: prev?.episodeProgress,
        },
      });
      console.debug("[tracking] save %s → server ok, refreshing", wikidataId);
      const fresh = await getCatalogEntry({ data: { wikidataId } });
      setEntry(fresh);
      setLocalRating(fresh?.rating ?? null);
      setLocalStatus(fresh?.status ?? null);
      savedRating.current = fresh?.rating ?? null;
      savedStatus.current = fresh?.status ?? null;
      clearCachedWatchlist();
      router.invalidate();
    } catch (err) {
      console.error("[tracking] save %s → FAILED:", wikidataId, err);
      setEntry(prev);
      setLocalRating(prev?.rating ?? null);
      setLocalStatus(prev?.status ?? null);
      setError("Failed to save");
    } finally {
      setSaving(false);
    }
  }, [entry, localStatus, localRating, wikidataId, router]);

  const handleRemove = useCallback(async () => {
    console.debug("[tracking] remove %s (optimistic)", wikidataId);
    setSaving(true);
    setError(null);
    const prev = entry;
    setEntry(null);
    try {
      await removeCatalogEntry({ data: { wikidataId } });
      console.debug("[tracking] remove %s → server ok", wikidataId);
      clearCachedWatchlist();
      router.invalidate();
    } catch (err) {
      console.error("[tracking] remove %s → FAILED:", wikidataId, err);
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

      {/* Status buttons — horizontal (local-only, saved on explicit save) */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {STATUSES.map((s) => {
          const isActive = localStatus === s.value;
          const colorClass = STATUS_COLORS[s.value];
          return (
            <button
              key={s.value}
              type="button"
              onClick={() => setLocalStatus(s.value)}
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

      {/* Rating (only when a status is selected) */}
      {localStatus && (
        <div className="mb-4">
          <h4 className="text-[0.65rem] text-dg-text-tertiary uppercase tracking-wider mb-2">
            Rating
          </h4>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min="0"
              max="10"
              step="0.01"
              value={localRating ?? 0}
              onChange={(e) => {
                setLocalRating(Number.parseFloat(e.target.value) || null);
              }}
              disabled={saving}
              className="dg-range flex-1"
              style={{ "--rating-color": ratingColor(localRating) } as React.CSSProperties}
            />
            <RatingInput value={localRating} onChange={setLocalRating} disabled={saving} />
            {localRating != null && (
              <button
                type="button"
                onClick={() => setLocalRating(null)}
                disabled={saving}
                className="text-dg-text-tertiary bg-transparent border-none cursor-pointer p-0 hover:text-dg-anime transition-colors duration-150 disabled:opacity-50"
                title="Clear rating"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Bottom bar: save (left) + remove (right) */}
      {localStatus && (
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !isDirty}
            className={`bg-transparent border-none cursor-pointer p-0 transition-colors duration-150 disabled:opacity-30 ${
              isDirty
                ? "text-dg-accent hover:text-dg-accent/80"
                : "text-dg-text-tertiary"
            }`}
            title="Save changes"
          >
            <Save size={16} />
          </button>
          {savedStatus.current && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={saving}
              className="text-dg-text-tertiary bg-transparent border-none cursor-pointer p-0 hover:text-dg-anime transition-colors duration-150 disabled:opacity-50"
              title="Remove from list"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function RatingInput({
  value,
  onChange,
  disabled,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  disabled: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const color = ratingColor(value) ?? "var(--color-dg-accent)";

  const startEditing = () => {
    if (disabled) return;
    setText(value != null ? value.toFixed(2) : "");
    setEditing(true);
  };

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commit = () => {
    setEditing(false);
    const normalized = text.replace(",", ".").trim();
    if (normalized === "") {
      onChange(null);
      return;
    }
    const parsed = Number.parseFloat(normalized);
    if (Number.isNaN(parsed)) return;
    onChange(Math.round(Math.min(10, Math.max(0, parsed)) * 100) / 100);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setEditing(false);
        }}
        className="w-[6ch] text-[0.85rem] tabular-nums text-right bg-dg-bg border border-dg-border rounded-sm px-1 py-0 font-mono outline-none shrink-0"
        style={{ color, borderColor: color }}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={startEditing}
      disabled={disabled}
      className="text-[0.85rem] tabular-nums w-[6ch] text-right bg-transparent border-none font-mono cursor-text p-0 shrink-0 hover:underline disabled:cursor-default disabled:no-underline"
      style={{ color, textDecorationColor: `${color}50` }}
      title="Click to type a rating"
    >
      {value != null ? value.toFixed(2) : "\u2014"}
    </button>
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
