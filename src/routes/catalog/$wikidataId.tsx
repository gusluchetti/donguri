import { useHotkey } from "@tanstack/react-hotkeys";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, getRouteApi, useRouter } from "@tanstack/react-router";
import { X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CatalogEntry } from "../../db/schema";
import {
  getCatalogEntry,
  getMediaStub,
  removeCatalogEntry,
  setCatalogEntry,
} from "../../lib/catalog.functions";
import type { getMedia } from "../../lib/media.functions";
import {
  availableStatuses,
  mediaTypeLabel,
  ratingColor,
  replayCountLabel,
  STATUS_BUTTON_COLORS,
  statusLabel,
  typeBadgeClass,
} from "../../lib/media-types";
import { ogTags, pageTitle } from "../../lib/og";
import { catalogEntryOptions, mediaDetailOptions } from "../../lib/query-options";
import { useAction } from "../../lib/use-action";

const rootRoute = getRouteApi("__root__");

type FullLoaderData = {
  kind: "full";
  media: NonNullable<Awaited<ReturnType<typeof getMedia>>>;
  initialEntry?: CatalogEntry | null;
};

type StubLoaderData = {
  kind: "stub";
  stub: { wikidataId: string; title: string; mediaType: string | null };
};

type LoaderData = FullLoaderData | StubLoaderData;

export const Route = createFileRoute("/catalog/$wikidataId")({
  loader: async ({ params, context }): Promise<LoaderData> => {
    const mediaPromise = context.queryClient.ensureQueryData(mediaDetailOptions(params.wikidataId));
    const entryPromise = context.queryClient
      .ensureQueryData(catalogEntryOptions(params.wikidataId))
      .catch(() => null);

    const [media, initialEntry] = await Promise.all([mediaPromise, entryPromise]);

    if (media) {
      return {
        kind: "full",
        media,
        initialEntry,
      };
    }

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

    let description = "";
    let ogType = "website";
    let wikidataId = "";

    if (loaderData?.kind === "full") {
      const m = loaderData.media;
      wikidataId = m.wikidataId;
      description = m.description ?? "";

      // Build fallback description from structured data
      if (!description) {
        const parts: string[] = [];
        if (m.startYear) parts.push(String(m.startYear));
        parts.push(mediaTypeLabel(m.mediaType));
        if (m.genres?.length > 0) parts.push(m.genres.map((g) => g.name).join(", "));
        description = `${parts.join(" \u00b7 ")} \u2014 Track on donguri`;
      }

      // Map media type to OG type
      if (m.mediaType === "movie") ogType = "video.movie";
      else if (m.mediaType === "tv_series" || m.mediaType === "anime") ogType = "video.tv_show";
    } else if (loaderData?.kind === "stub") {
      wikidataId = loaderData.stub.wikidataId;
      description = `Track on donguri`;
    }

    return {
      meta: [
        { title: pageTitle(`${title} — donguri`) },
        { name: "description", content: description },
        ...ogTags({
          title: `${title} — donguri`,
          description,
          path: wikidataId ? `/catalog/${wikidataId}` : "/catalog",
          type: ogType,
        }),
      ],
    };
  },
  component: MediaDetailRouter,
});

function MediaDetailRouter() {
  const data = Route.useLoaderData();
  if (data.kind === "stub") return <MediaStubPage stub={data.stub} />;
  return <MediaDetailPage data={data.media} initialEntry={data.initialEntry} />;
}

function MediaDetailSkeleton() {
  return (
    <div className="bg-dg-bg text-dg-text flex-1 font-mono">
      <div className="max-w-[1000px] mx-auto p-4 sm:p-5">
        <button
          type="button"
          onClick={() => window.history.back()}
          className="text-dg-text-tertiary text-[0.8rem] bg-transparent border-none font-mono cursor-pointer py-2 -my-2 px-0 mb-3 sm:mb-4 inline-block"
        >
          &larr; back
        </button>
        <div className="mb-5">
          <div className="w-16 h-5 bg-dg-surface rounded-sm mb-3 animate-pulse" />
          <div className="w-2/3 h-8 bg-dg-surface rounded animate-pulse" />
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-3 mb-4 sm:mb-5 p-3 sm:p-4 bg-dg-surface rounded border border-dg-border-subtle">
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

function MediaStubPage({
  stub,
}: {
  stub: { wikidataId: string; title: string; mediaType: string | null };
}) {
  const { auth } = rootRoute.useLoaderData();
  const badgeClass = typeBadgeClass(stub.mediaType);

  return (
    <div className="bg-dg-bg text-dg-text flex-1 font-mono">
      <div className="max-w-[1000px] mx-auto p-4 sm:p-5">
        <button
          type="button"
          onClick={() => window.history.back()}
          className="text-dg-text-tertiary text-[0.8rem] bg-transparent border-none font-mono cursor-pointer py-2 -my-2 px-0 mb-3 sm:mb-4 inline-block"
        >
          &larr; back
        </button>

        <div className="mb-4 sm:mb-5">
          {stub.mediaType && (
            <span
              className={`text-[0.65rem] font-semibold py-1 px-2 rounded-sm border uppercase tracking-wide inline-block mb-3 ${badgeClass}`}
            >
              {mediaTypeLabel(stub.mediaType)}
            </span>
          )}
          <h1 className="text-[1.35rem] sm:text-[1.6rem] font-semibold m-0 leading-[1.2] -tracking-[0.01em]">
            {stub.title}
          </h1>
        </div>

        <div className="border border-dg-border-subtle rounded p-3 sm:p-4 bg-dg-surface mb-4 sm:mb-5">
          <p className="text-[0.8rem] text-dg-text-tertiary">
            This title has not been imported into the catalog yet. Metadata will appear after the
            next data import.
          </p>
        </div>

        {auth && (
          <TrackingPanel wikidataId={stub.wikidataId} mediaType={stub.mediaType ?? undefined} />
        )}

        <div className="mb-4 sm:mb-5">
          <h3 className="text-[0.7rem] text-dg-text-tertiary uppercase tracking-wider mb-2">
            Links
          </h3>
          <div className="flex flex-wrap gap-2">
            <a
              href={`https://www.wikidata.org/wiki/${stub.wikidataId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-dg-accent/70 no-underline py-2 px-3 sm:py-1.5 sm:px-2.5 border border-dg-accent/15 rounded-sm transition-all duration-150"
            >
              Wikidata {"\u2197"}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

function MediaDetailPage({
  data,
  initialEntry,
}: {
  data: NonNullable<Awaited<ReturnType<typeof getMedia>>>;
  initialEntry?: CatalogEntry | null;
}) {
  const { auth } = rootRoute.useLoaderData();
  const router = useRouter();
  const badgeClass = typeBadgeClass(data.mediaType);
  const [localIsFavorite, setLocalIsFavorite] = useState(initialEntry?.isFavorite ?? false);

  // ─── Detail page shortcuts ──────────────────────────────────────────────
  // h — go back
  useHotkey("h", () => router.history.back());
  // Backspace — go back
  useHotkey("Backspace", () => router.history.back());
  // f — toggle favorite
  useHotkey("f", () => setLocalIsFavorite((v) => !v), {
    enabled: !!auth && !!initialEntry?.status,
  });

  const isAnime = data.mediaType === "anime";
  const isGame = data.mediaType === "game";
  const isTvOrAnime = data.mediaType === "tv_series" || isAnime;
  const hasSeasons = isTvOrAnime && data.seasons && data.seasons.length > 0;

  // Dedup genres: if a sub-genre is present, suppress its standalone parent
  const subGenreParentIds = new Set(data.genres.flatMap((g) => (g.parentId ? [g.parentId] : [])));
  const visibleGenres = data.genres.filter((g) => {
    if (g.parentId) return true;
    return !subGenreParentIds.has(g.id);
  });

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
    <div className="bg-dg-bg text-dg-text flex-1 font-mono">
      <div className="max-w-[1000px] mx-auto p-4 sm:p-5">
        {/* Back link */}
        <button
          type="button"
          onClick={() => window.history.back()}
          className="text-dg-text-tertiary text-[0.8rem] bg-transparent border-none font-mono cursor-pointer py-2 -my-2 px-0 mb-3 sm:mb-4 inline-block"
        >
          &larr; back
        </button>

        {/* Header + meta combined row */}
        <div className="flex gap-4 sm:gap-5 mb-4 sm:mb-5 relative">
          {data.posterUrl && (
            <img
              src={data.posterUrl}
              alt={`${data.title} poster`}
              width={120}
              className="w-[120px] rounded border border-dg-border-subtle shrink-0 self-stretch object-cover hidden sm:block"
              loading="eager"
            />
          )}
          <div className="min-w-0 flex-1">
            <span
              className={`text-[0.65rem] font-semibold py-1 px-2 rounded-sm border uppercase tracking-wide inline-block mb-3 ${badgeClass}`}
            >
              {mediaTypeLabel(data.mediaType)}
            </span>
            <h1 className="text-[1.35rem] sm:text-[1.6rem] font-semibold m-0 leading-[1.2] -tracking-[0.01em]">
              {data.title}
            </h1>
            {data.originalTitle && (
              <p className="text-base text-dg-text-secondary mt-1.5">{data.originalTitle}</p>
            )}

            {/* Meta slab */}
            <div className="mt-3 p-3 sm:p-4 bg-dg-surface rounded border border-dg-border-subtle">
              <div className="flex flex-wrap gap-x-6 gap-y-3">
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
                {data.episodeCount && (
                  <MetaItem label="Episodes" value={String(data.episodeCount)} />
                )}
                {data.qrankPct != null && (
                  <div className="flex flex-col gap-0.5">
                    <a
                      href="https://qrank.wmcloud.org/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[0.65rem] text-dg-text-tertiary uppercase tracking-wider whitespace-nowrap hover:text-dg-accent transition-colors"
                    >
                      Popularity (QRank) ↗
                    </a>
                    <span className="text-[0.85rem] text-dg-text">Top {data.qrankPct}%</span>
                  </div>
                )}
                <MetaItem label="Sitelinks" value={String(data.sitelinksCount ?? 0)} />
              </div>
              {visibleGenres.length > 0 && (
                <div className="border-t border-dg-border-subtle mt-3 pt-3">
                  <div className="flex flex-wrap gap-1.5">
                    {visibleGenres.map((g) => (
                      <span
                        key={g.id}
                        className="text-xs py-1.5 px-2.5 sm:py-1 sm:px-2 bg-dg-elevated border border-dg-border rounded-sm text-dg-text-secondary"
                      >
                        {g.parentName ? (
                          <>
                            <span className="text-dg-text-tertiary">{g.parentName} &rsaquo; </span>
                            {g.name}
                          </>
                        ) : (
                          g.name
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {data.description && (
                <div className="border-t border-dg-border-subtle mt-3 pt-3">
                  <p className="text-[0.8rem] text-dg-text-secondary m-0 leading-relaxed">
                    {data.description}
                  </p>
                </div>
              )}

              {/* External links */}
              <div className="border-t border-dg-border-subtle mt-3 pt-3">
                <div className="flex flex-wrap gap-1.5">
                  {externalLinks.map((link) => (
                    <a
                      key={link.label}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-dg-accent/70 no-underline py-1 px-2 border border-dg-accent/15 rounded-sm transition-all duration-150"
                    >
                      {link.label} {"\u2197"}
                    </a>
                  ))}
                </div>
              </div>
            </div>
          </div>
          {auth && initialEntry?.status && (
            <button
              type="button"
              onClick={() => setLocalIsFavorite(!localIsFavorite)}
              className={`absolute top-0 right-0 text-[1.1rem] bg-transparent border-none cursor-pointer p-1 transition-colors duration-150 ${
                localIsFavorite ? "text-dg-accent" : "text-dg-text-tertiary hover:text-dg-accent/60"
              }`}
              title={localIsFavorite ? "Remove from favorites" : "Mark as favorite"}
            >
              {localIsFavorite ? "\u2605" : "\u2606"}
            </button>
          )}
        </div>

        {/* Tracking + Episodes unified card */}
        {auth && (
          <div className="border border-dg-border-subtle rounded bg-dg-surface mb-4 sm:mb-5">
            <TrackingPanel
              wikidataId={data.wikidataId}
              mediaType={data.mediaType}
              initialEntry={initialEntry}
              favoriteState={{ value: localIsFavorite, set: setLocalIsFavorite }}
              bare
            />
            {hasSeasons && data.seasons && (
              <>
                <div className="border-t border-dg-border-subtle" />
                <EpisodeGrid seasons={data.seasons} />
              </>
            )}
          </div>
        )}

        {/* No auth: standalone episode grid */}
        {!auth && hasSeasons && data.seasons && (
          <div className="border border-dg-border-subtle rounded bg-dg-surface mb-4 sm:mb-5">
            <EpisodeGrid seasons={data.seasons} />
          </div>
        )}

        {/* Platforms (games) */}
        {data.platforms.length > 0 && (
          <div className="mb-4 sm:mb-5">
            <h3 className="text-[0.7rem] text-dg-text-tertiary uppercase tracking-wider mb-2">
              Platforms
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {data.platforms.map((p) => (
                <span
                  key={p.id}
                  className="text-xs py-1.5 px-2.5 sm:py-1 sm:px-2 bg-dg-elevated border border-dg-border rounded-sm text-dg-text-secondary"
                >
                  {p.name}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function EpisodeGrid({
  seasons,
}: {
  seasons: {
    id: string;
    seasonNumber: number;
    episodeCount: number | null;
    title: string | null;
    dataSource: string;
  }[];
}) {
  const isSingleSeason = seasons.length === 1;
  let runningTotal = 0;

  return (
    <div className="p-3 sm:p-4">
      <h3 className="text-[0.65rem] text-dg-text-tertiary uppercase tracking-wider mb-3">
        Episodes
      </h3>
      <div className="space-y-2">
        {seasons.map((s) => {
          const startEp = runningTotal;
          if (s.episodeCount != null) runningTotal += s.episodeCount;
          return (
            <div key={s.id} className="flex gap-2">
              {!isSingleSeason && (
                <span className="w-8 shrink-0 text-[0.75rem] text-dg-text-tertiary tabular-nums pt-1">
                  S{String(s.seasonNumber).padStart(2, "0")}
                </span>
              )}
              {s.episodeCount != null ? (
                <div className="flex flex-wrap gap-1">
                  {Array.from({ length: s.episodeCount }, (_, i) => {
                    const ep = i + 1;
                    const absEp = startEp + ep;
                    return (
                      <div
                        key={`ep-${ep}`}
                        title={`Episode ${absEp}`}
                        className="w-7 h-7 flex items-center justify-center text-[0.65rem] tabular-nums bg-dg-elevated border border-dg-border-subtle rounded-sm text-dg-text-secondary"
                      >
                        {String(ep).padStart(2, "0")}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <span className="text-xs text-dg-text-tertiary pt-1">unknown</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TrackingPanel({
  wikidataId,
  mediaType,
  initialEntry,
  favoriteState,
  bare,
}: {
  wikidataId: string;
  mediaType?: string;
  initialEntry?: CatalogEntry | null;
  favoriteState?: { value: boolean; set: (v: boolean) => void };
  bare?: boolean;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const hasInitial = initialEntry !== undefined;
  const [entry, setEntry] = useState<CatalogEntry | null>(hasInitial ? initialEntry : null);
  const [loaded, setLoaded] = useState(hasInitial);
  const action = useAction();
  // Local state tracks UI; saved* refs track what the server has
  const [localRating, setLocalRating] = useState<number | null>(
    hasInitial ? (initialEntry?.rating ?? null) : null,
  );
  const [localStatus, setLocalStatus] = useState<string | null>(
    hasInitial ? (initialEntry?.status ?? null) : null,
  );
  const [fallbackFav, setFallbackFav] = useState(
    hasInitial ? (initialEntry?.isFavorite ?? false) : false,
  );
  const localIsFavorite = favoriteState ? favoriteState.value : fallbackFav;
  const setLocalIsFavorite = favoriteState ? favoriteState.set : setFallbackFav;
  const [localReplayCount, setLocalReplayCount] = useState(
    hasInitial ? (initialEntry?.replayCount ?? 0) : 0,
  );
  const serverEntry = useRef<CatalogEntry | null>(hasInitial ? (initialEntry ?? null) : null);

  // When loader didn't provide the entry, use TanStack Query to fetch it
  const entryQuery = useQuery({
    ...catalogEntryOptions(wikidataId),
    enabled: !hasInitial,
  });

  useEffect(() => {
    if (hasInitial || entryQuery.isPending) return;
    const e = entryQuery.data ?? null;
    setEntry(e);
    setLocalRating(e?.rating ?? null);
    setLocalStatus(e?.status ?? null);
    setLocalIsFavorite(e?.isFavorite ?? false);
    setLocalReplayCount(e?.replayCount ?? 0);
    serverEntry.current = e;
    setLoaded(true);
  }, [hasInitial, entryQuery.isPending, entryQuery.data, setLocalIsFavorite]);

  const ratingDirty = localRating !== (serverEntry.current?.rating ?? null);
  const statusDirty = localStatus !== (serverEntry.current?.status ?? null);
  const favoriteDirty = localIsFavorite !== (serverEntry.current?.isFavorite ?? false);
  const replayDirty = localReplayCount !== (serverEntry.current?.replayCount ?? 0);
  const isDirty = ratingDirty || statusDirty || favoriteDirty || replayDirty;

  const handleSave = useCallback(async () => {
    const status = localStatus as NonNullable<CatalogEntry["status"]>;
    if (!status) return;
    console.debug("[tracking] save %s → status=%s rating=%s", wikidataId, status, localRating);
    const prev = entry;
    setEntry((e) =>
      e
        ? {
            ...e,
            status,
            rating: localRating,
            isFavorite: localIsFavorite,
            replayCount: localReplayCount,
            updatedAt: new Date(),
          }
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
            isFavorite: localIsFavorite,
            replayCount: localReplayCount,
            completedAt: null,
            watchedEpisodes: null,
            rkey: null,
            syncedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          } as CatalogEntry),
    );
    await action.run(async () => {
      try {
        await setCatalogEntry({
          data: {
            wikidataId,
            status,
            rating: localRating,
            note: prev?.note,
            episodeProgress: prev?.episodeProgress,
            isFavorite: localIsFavorite,
            replayCount: localReplayCount,
          },
        });
        console.debug("[tracking] save %s → server ok, refreshing", wikidataId);
        const fresh = await getCatalogEntry({ data: { wikidataId } });
        setEntry(fresh);
        setLocalRating(fresh?.rating ?? null);
        setLocalStatus(fresh?.status ?? null);
        setLocalIsFavorite(fresh?.isFavorite ?? false);
        setLocalReplayCount(fresh?.replayCount ?? 0);
        serverEntry.current = fresh;
        queryClient.invalidateQueries({ queryKey: ["user"] });
        router.invalidate();
      } catch (err) {
        console.error("[tracking] save %s → FAILED:", wikidataId, err);
        setEntry(prev);
        setLocalRating(prev?.rating ?? null);
        setLocalStatus(prev?.status ?? null);
        setLocalIsFavorite(prev?.isFavorite ?? false);
        setLocalReplayCount(prev?.replayCount ?? 0);
        throw err;
      }
    });
  }, [
    entry,
    localStatus,
    localRating,
    localIsFavorite,
    localReplayCount,
    wikidataId,
    router,
    queryClient,
    action,
    setLocalIsFavorite,
  ]);

  const handleRemove = useCallback(async () => {
    console.debug("[tracking] remove %s (optimistic)", wikidataId);
    const prev = entry;
    setEntry(null);
    await action.run(async () => {
      try {
        await removeCatalogEntry({ data: { wikidataId } });
        console.debug("[tracking] remove %s → server ok", wikidataId);
        queryClient.invalidateQueries({ queryKey: ["user"] });
        router.invalidate();
      } catch (err) {
        console.error("[tracking] remove %s → FAILED:", wikidataId, err);
        setEntry(prev);
        throw err;
      }
    });
  }, [entry, wikidataId, router, queryClient, action]);

  const statuses = availableStatuses(mediaType);

  // ─── Tracking shortcuts ───────────────────────────────────────────────
  const notBusy = action.state !== "pending";

  // Status keys — only fire if the status is visible for this media type
  const statusKeyMap: Record<string, string> = {
    p: "planned",
    w: "in_progress",
    o: "on_hold",
    c: "completed",
    d: "dropped",
    m: "mastered",
  };
  for (const [key, status] of Object.entries(statusKeyMap)) {
    // biome-ignore lint/correctness/useHookAtTopLevel: static iteration over constant map
    useHotkey(key, () => setLocalStatus(status), {
      enabled: loaded && notBusy && statusLabel(status as never, mediaType) !== null,
    });
  }

  // = — rating +5
  useHotkey(
    "=",
    () => {
      setLocalRating((prev) => Math.min(100, (prev ?? 0) + 5));
    },
    { enabled: loaded && notBusy && !!localStatus },
  );

  // - — rating -5
  useHotkey(
    "-",
    () => {
      setLocalRating((prev) => Math.max(0, (prev ?? 0) - 5));
    },
    { enabled: loaded && notBusy && !!localStatus },
  );

  // s — save
  useHotkey(
    "s",
    () => {
      if (isDirty) handleSave();
    },
    { enabled: loaded && notBusy && isDirty },
  );

  // D (shift+d) — delete entry
  useHotkey(
    "Shift+D",
    () => {
      if (serverEntry.current?.status) handleRemove();
    },
    { enabled: loaded && notBusy && !!serverEntry.current?.status },
  );

  if (!loaded) {
    return (
      <div
        className={
          bare
            ? "p-3 sm:p-4"
            : "border border-dg-border-subtle rounded p-3 sm:p-4 bg-dg-surface mb-4 sm:mb-5"
        }
      >
        <div className="w-20 h-3 bg-dg-elevated rounded animate-pulse" />
      </div>
    );
  }

  return (
    <div
      className={
        bare
          ? "p-3 sm:p-4"
          : "border border-dg-border-subtle rounded p-3 sm:p-4 bg-dg-surface mb-4 sm:mb-5"
      }
    >
      <h3 className="text-[0.7rem] text-dg-text-tertiary uppercase tracking-wider mb-3">
        {action.state === "pending" ? (
          <span className="dg-ellipsis">Tracking</span>
        ) : action.state === "done" ? (
          <>
            Tracking <span className="text-dg-game">ok</span>
          </>
        ) : action.state === "error" ? (
          <>
            Tracking <span className="text-dg-anime">err</span>
          </>
        ) : (
          "Tracking"
        )}
      </h3>

      {/* Status buttons — horizontal scroll on mobile, wrap on desktop */}
      <div className="flex flex-nowrap overflow-x-auto sm:flex-wrap gap-1.5 mb-4 scrollbar-hide">
        {statuses.map((s) => {
          const isActive = localStatus === s;
          const colorClass = STATUS_BUTTON_COLORS[s];
          const label = statusLabel(s, mediaType);
          return (
            <button
              key={s}
              type="button"
              onClick={() => setLocalStatus(s)}
              disabled={action.state === "pending"}
              className={`text-[0.8rem] py-2 sm:py-1.5 px-3 min-h-[44px] sm:min-h-0 rounded-sm border font-mono cursor-pointer shrink-0 transition-all duration-150 disabled:opacity-50 ${
                isActive
                  ? colorClass
                  : "border-dg-border-subtle text-dg-text-secondary bg-transparent hover:border-dg-border"
              }`}
            >
              {label}
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
              max="100"
              step="1"
              value={localRating ?? 0}
              onChange={(e) => {
                setLocalRating(Number.parseInt(e.target.value, 10) || null);
              }}
              disabled={action.state === "pending"}
              className="dg-range flex-1"
              style={{ "--rating-color": ratingColor(localRating) } as React.CSSProperties}
            />
            <RatingInput
              value={localRating}
              onChange={setLocalRating}
              disabled={action.state === "pending"}
            />
            {localRating != null && (
              <button
                type="button"
                onClick={() => setLocalRating(null)}
                disabled={action.state === "pending"}
                className="text-dg-text-tertiary bg-transparent border-none cursor-pointer p-2 -m-2 hover:text-dg-anime transition-colors duration-150 disabled:opacity-50"
                title="Clear rating"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Replay count (when completed) */}
      {localStatus === "completed" && (
        <div className="flex items-center gap-2 mb-4">
          <button
            type="button"
            onClick={() => setLocalReplayCount(Math.max(0, localReplayCount - 1))}
            disabled={action.state === "pending" || localReplayCount <= 0}
            className="text-[0.8rem] bg-transparent border border-dg-border-subtle text-dg-text-secondary rounded-sm w-7 h-7 flex items-center justify-center cursor-pointer disabled:opacity-30"
          >
            -
          </button>
          <span className="text-[0.75rem] text-dg-text-secondary min-w-[5rem] text-center">
            {replayCountLabel(localReplayCount, mediaType) ?? "First time"}
          </span>
          <button
            type="button"
            onClick={() => setLocalReplayCount(localReplayCount + 1)}
            disabled={action.state === "pending"}
            className="text-[0.8rem] bg-transparent border border-dg-border-subtle text-dg-text-secondary rounded-sm w-7 h-7 flex items-center justify-center cursor-pointer disabled:opacity-30"
          >
            +
          </button>
        </div>
      )}

      {/* Bottom bar: save (left) + remove (right) */}
      {localStatus && (
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={handleSave}
            disabled={action.state === "pending" || !isDirty}
            className={`text-[0.75rem] font-mono bg-transparent border-none cursor-pointer p-2 -m-2 transition-colors duration-150 disabled:opacity-30 ${
              isDirty ? "text-dg-accent hover:text-dg-accent/80" : "text-dg-text-tertiary"
            }`}
            title="Save changes"
          >
            save
          </button>
          {serverEntry.current?.status && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={action.state === "pending"}
              className="text-[0.75rem] font-mono text-dg-text-tertiary bg-transparent border-none cursor-pointer p-2 -m-2 hover:text-dg-anime transition-colors duration-150 disabled:opacity-50"
              title="Remove from list"
            >
              delete
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
    setText(value != null ? String(value) : "");
    setEditing(true);
    queueMicrotask(() => inputRef.current?.select());
  };

  const commit = () => {
    setEditing(false);
    const trimmed = text.trim();
    if (trimmed === "") {
      onChange(null);
      return;
    }
    const parsed = Number.parseInt(trimmed, 10);
    if (Number.isNaN(parsed)) return;
    onChange(Math.min(100, Math.max(0, parsed)));
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        value={text}
        maxLength={3}
        onChange={(e) => {
          if (/^\d{0,3}$/.test(e.target.value)) setText(e.target.value);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setEditing(false);
        }}
        className="w-[4ch] text-[0.85rem] tabular-nums text-right bg-dg-bg border border-dg-border rounded-sm px-1 py-0 font-mono outline-none shrink-0"
        style={{ color, borderColor: color }}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={startEditing}
      disabled={disabled}
      className="text-[0.85rem] tabular-nums w-[4ch] text-right bg-transparent border-none font-mono cursor-text p-0 shrink-0 hover:underline disabled:cursor-default disabled:no-underline"
      style={{ color, textDecorationColor: `${color}50` }}
      title="Click to type a rating"
    >
      {value != null ? value : "\u2014"}
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
