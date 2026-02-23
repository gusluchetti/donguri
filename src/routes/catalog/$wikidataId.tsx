import { Shuffle } from "@phosphor-icons/react";
import { useHotkey } from "@tanstack/react-hotkeys";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, getRouteApi, useNavigate, useRouter } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import type { CatalogEntry } from "~/db/schema";
import { getMediaStub } from "~/features/catalog/catalog.functions";
import { catalogEntryOptions } from "~/features/catalog/catalog.queries";
import { SoundEngine } from "~/features/catalog/catalog.sound";
import { CoverThumb } from "~/features/catalog/components/CoverThumb";
import { StampBadge } from "~/features/catalog/components/StampBadge";
import type { getMedia } from "~/features/media/media.functions";
import { getRandomMediaId } from "~/features/media/media.functions";
import { mediaDetailOptions } from "~/features/media/media.queries";
import {
  countWatchedEpisodes,
  mediaTypeLabel,
  type WatchedEpisodes,
} from "~/features/media/media-types";
import { ogTags, pageTitle } from "~/lib/og";
import { EpisodeTracker } from "./-episodes";
import { TrackingPanel } from "./-tracking";

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
      .fetchQuery(catalogEntryOptions(params.wikidataId))
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

      if (!description) {
        const parts: string[] = [];
        if (m.startYear) parts.push(String(m.startYear));
        parts.push(mediaTypeLabel(m.mediaType));
        if (m.genres?.length > 0)
          parts.push(m.genres.map((g: { name: string }) => g.name).join(", "));
        description = `${parts.join(" \u00b7 ")} \u2014 Track on donguri`;
      }

      if (m.mediaType === "movie") ogType = "video.movie";
      else if (m.mediaType === "tv_series" || m.mediaType === "anime") ogType = "video.tv_show";
    } else if (loaderData?.kind === "stub") {
      wikidataId = loaderData.stub.wikidataId;
      description = "Track on donguri";
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

function triggerNavBack() {
  document.documentElement.dataset.navBack = "1";
  window.history.back();
  setTimeout(() => delete document.documentElement.dataset.navBack, 500);
}

function useShuffleNav() {
  const navigate = useNavigate();
  return useCallback(async () => {
    SoundEngine.dice();
    const id = await getRandomMediaId();
    if (id) {
      SoundEngine.navForward();
      navigate({ to: "/catalog/$wikidataId", params: { wikidataId: id } });
    }
  }, [navigate]);
}

function MediaDetailRouter() {
  const loaderData = Route.useLoaderData();
  if (loaderData.kind === "stub") return <MediaStubPage stub={loaderData.stub} />;
  return (
    <MediaDetailPage
      wikidataId={loaderData.media.wikidataId}
      initialEntry={loaderData.initialEntry}
    />
  );
}

function MediaDetailSkeleton() {
  const handleShuffle = useShuffleNav();
  return (
    <div className="dg-page-enter text-dg-text flex-1 overflow-y-auto font-body">
      <div className="max-w-[1100px] mx-auto px-g3 py-g3 sm:py-g4">
        <div className="flex items-center gap-1.5 mb-g2">
          <button
            type="button"
            onClick={() => {
              SoundEngine.navBack();
              triggerNavBack();
            }}
            className="text-dg-text-secondary text-[0.8rem] bg-dg-surface border border-dg-border font-body cursor-pointer py-1.5 px-3 inline-flex items-center gap-1.5 rounded-sm transition-all duration-150"
          >
            &larr; back
          </button>
          <button
            type="button"
            title="Random title"
            onClick={handleShuffle}
            className="ml-auto w-[42px] self-stretch flex items-center justify-center bg-dg-surface border border-dg-border rounded cursor-pointer text-dg-text-tertiary hover:text-dg-accent hover:border-dg-accent transition-all duration-[120ms]"
          >
            <Shuffle size={17} weight="bold" />
          </button>
        </div>
        <div className="mb-g3">
          <div className="w-16 h-5 bg-dg-surface rounded-sm mb-3 animate-pulse" />
          <div className="w-2/3 h-8 bg-dg-surface rounded animate-pulse" />
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-3 mb-g3 p-g2 sm:p-g3 bg-dg-surface rounded border border-dg-border-subtle">
          {[...Array(4)].map((_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton items
            <div key={i} className="flex flex-col gap-1">
              <div className="w-12 h-3 bg-dg-elevated rounded animate-pulse" />
              <div className="w-16 h-4 bg-dg-elevated rounded animate-pulse" />
            </div>
          ))}
        </div>
        <div className="space-y-2 mb-g4">
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
  const handleShuffle = useShuffleNav();

  return (
    <div className="dg-page-enter text-dg-text flex-1 overflow-y-auto font-body">
      <div className="max-w-[1100px] mx-auto px-g3 py-g3 sm:py-g4">
        <div className="flex items-center gap-1.5 mb-g2">
          <button
            type="button"
            onClick={() => {
              SoundEngine.navBack();
              triggerNavBack();
            }}
            className="text-dg-text-secondary text-[0.8rem] bg-dg-surface border border-dg-border font-body cursor-pointer py-1.5 px-3 inline-flex items-center gap-1.5 rounded-sm hover:border-dg-border-strong hover:text-dg-text transition-all duration-150"
          >
            &larr; back
          </button>
          <button
            type="button"
            title="Random title"
            onClick={handleShuffle}
            className="ml-auto w-[42px] self-stretch flex items-center justify-center bg-dg-surface border border-dg-border rounded cursor-pointer text-dg-text-tertiary hover:text-dg-accent hover:border-dg-accent transition-all duration-[120ms]"
          >
            <Shuffle size={17} weight="bold" />
          </button>
        </div>

        <div className="mb-g3">
          {stub.mediaType && (
            <div className="mb-2">
              <StampBadge type={stub.mediaType} />
            </div>
          )}
          <h1 className="font-display text-[1.6rem] sm:text-[2.25rem] font-normal m-0 leading-[1.15] tracking-[-0.03em]">
            {stub.title}
          </h1>
        </div>

        <div className="border border-dg-border-subtle rounded p-g2 sm:p-g3 bg-dg-surface mb-g3">
          <p className="text-[0.8rem] text-dg-text-tertiary">
            This title has not been imported into the catalog yet. Metadata will appear after the
            next data import.
          </p>
        </div>

        {auth && (
          <TrackingPanel wikidataId={stub.wikidataId} mediaType={stub.mediaType ?? undefined} />
        )}

        <div className="mb-g3">
          <h3 className="text-[0.7rem] text-dg-text-tertiary uppercase tracking-wider mb-2">
            Links
          </h3>
          <div className="flex flex-wrap gap-1.5">
            <a
              href={`https://www.wikidata.org/wiki/${stub.wikidataId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-dg-accent/70 no-underline py-1 px-2 border border-dg-accent/15 rounded-sm transition-all duration-150"
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
  wikidataId,
  initialEntry,
}: {
  wikidataId: string;
  initialEntry?: CatalogEntry | null;
}) {
  const { data } = useSuspenseQuery(mediaDetailOptions(wikidataId));
  if (!data) throw new Error("Media not found");
  const { auth } = rootRoute.useLoaderData();
  const router = useRouter();
  const handleBack = useCallback(() => {
    SoundEngine.navBack();
    document.documentElement.dataset.navBack = "1";
    router.history.back();
    setTimeout(() => delete document.documentElement.dataset.navBack, 500);
  }, [router]);
  const handleShuffle = useShuffleNav();

  const [localIsFavorite, setLocalIsFavorite] = useState(initialEntry?.isFavorite ?? false);
  const [localWatchedEpisodes, setLocalWatchedEpisodes] = useState<WatchedEpisodes>(
    (initialEntry?.watchedEpisodes as WatchedEpisodes) ?? {},
  );
  const [localWatchedAt, setLocalWatchedAt] = useState<string | null>(
    initialEntry?.watchedAt ?? null,
  );
  const [localStatus, setLocalStatus] = useState<string | null>(initialEntry?.status ?? null);

  useHotkey("H", handleBack);
  useHotkey("ArrowLeft", handleBack);
  useHotkey("Backspace", handleBack);
  useHotkey("F", () => setLocalIsFavorite((v) => !v), {
    enabled: !!auth && !!initialEntry?.status,
  });

  const isAnime = data.mediaType === "anime";
  const isGame = data.mediaType === "game";
  const isTvOrAnime = data.mediaType === "tv_series" || isAnime;
  const hasSeasons = isTvOrAnime && data.seasons && data.seasons.length > 0;

  const totalEps =
    hasSeasons && data.seasons
      ? data.seasons.reduce(
          (sum: number, s: { episodeCount: number | null }) => sum + (s.episodeCount ?? 0),
          0,
        )
      : 0;

  const handleWatchedEpisodesChange = useCallback(
    (newWatched: WatchedEpisodes) => {
      setLocalWatchedEpisodes(newWatched);
      if (!localStatus) setLocalStatus("in_progress");
    },
    [localStatus],
  );

  // Auto-complete: when all episodes watched while in_progress
  useEffect(() => {
    if (localStatus === "in_progress" && totalEps > 0) {
      if (countWatchedEpisodes(localWatchedEpisodes) >= totalEps) {
        setLocalStatus("completed");
      }
    }
  }, [localStatus, localWatchedEpisodes, totalEps]);

  // Dedup genres: if a sub-genre is present, suppress its standalone parent
  const subGenreParentIds = new Set(
    data.genres.flatMap((g: { parentId: string | null }) => (g.parentId ? [g.parentId] : [])),
  );
  const visibleGenres = data.genres.filter((g: { id: string; parentId: string | null }) => {
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
      url: `https://www.themoviedb.org/${data.tmdbId}`,
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
    <div className="dg-page-enter text-dg-text flex-1 overflow-y-auto font-body">
      <div className="max-w-[1100px] mx-auto px-g3 py-g3 sm:py-g4">
        <div className="flex items-center gap-1.5 mb-g2">
          <button
            type="button"
            onClick={handleBack}
            className="text-dg-text-secondary text-[0.8rem] bg-dg-surface border border-dg-border font-body cursor-pointer py-1.5 px-3 inline-flex items-center gap-1.5 rounded-sm hover:border-dg-border-strong hover:text-dg-text transition-all duration-150"
          >
            &larr; back
          </button>
          <button
            type="button"
            title="Random title"
            onClick={handleShuffle}
            className="ml-auto w-[42px] self-stretch flex items-center justify-center bg-dg-surface border border-dg-border rounded cursor-pointer text-dg-text-tertiary hover:text-dg-accent hover:border-dg-accent transition-all duration-[120ms]"
          >
            <Shuffle size={17} weight="bold" />
          </button>
        </div>

        <div className="flex flex-col sm:flex-row gap-g3 sm:gap-g4 mb-g3 sm:mb-g4">
          {/* Poster — portrait on mobile, stretches to match right column on desktop */}
          <div className="hidden sm:block sm:w-[210px] shrink-0">
            <div className="aspect-[2/3] w-full sm:aspect-auto sm:h-full">
              <CoverThumb
                title={data.title}
                mediaType={data.mediaType ?? undefined}
                posterUrl={data.posterUrl ?? undefined}
                size={210}
                loading="eager"
              />
            </div>
          </div>
          <div className="min-w-0 flex-1" style={{ viewTransitionName: "detail-content" }}>
            <div className="mb-2">
              <StampBadge type={data.mediaType} />
            </div>
            <h1 className="font-display text-[1.6rem] sm:text-[2.25rem] font-normal m-0 leading-[1.15] tracking-[-0.03em]">
              {data.title}
            </h1>
            {data.originalTitle && (
              <p className="text-[0.85rem] text-dg-text-secondary mt-1">{data.originalTitle}</p>
            )}

            <div className="mt-g2 p-g2 sm:p-g3 bg-dg-surface rounded border border-dg-border-subtle">
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
                    {visibleGenres.map(
                      (g: { id: string; name: string; parentName?: string | null }) => (
                        <span
                          key={g.id}
                          className="text-xs py-1.5 px-2.5 sm:py-1 sm:px-2 bg-dg-elevated border border-dg-border rounded-sm text-dg-text-secondary"
                        >
                          {g.parentName ? (
                            <>
                              <span className="text-dg-text-tertiary">
                                {g.parentName} &rsaquo;{" "}
                              </span>
                              {g.name}
                            </>
                          ) : (
                            g.name
                          )}
                        </span>
                      ),
                    )}
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
        </div>

        {auth && (
          <div className="border border-dg-border-subtle rounded bg-dg-surface mb-g3 sm:mb-g4">
            <TrackingPanel
              wikidataId={data.wikidataId}
              mediaType={data.mediaType}
              initialEntry={initialEntry}
              statusState={{ value: localStatus, set: setLocalStatus }}
              favoriteState={{ value: localIsFavorite, set: setLocalIsFavorite }}
              watchedEpisodesState={{
                value: localWatchedEpisodes,
                set: setLocalWatchedEpisodes,
              }}
              watchedAtState={{ value: localWatchedAt, set: setLocalWatchedAt }}
              isMovie={data.mediaType === "movie"}
              bare
            >
              {hasSeasons && data.seasons && (
                <EpisodeTracker
                  seasons={data.seasons}
                  watchedEpisodes={localWatchedEpisodes}
                  onWatchedChange={handleWatchedEpisodesChange}
                />
              )}
            </TrackingPanel>
          </div>
        )}

        {/* Read-only episode tracker for unauthenticated users */}
        {!auth && hasSeasons && data.seasons && (
          <div className="border border-dg-border-subtle rounded bg-dg-surface mb-g3 sm:mb-g4 p-g2 sm:p-g3">
            <EpisodeTracker seasons={data.seasons} />
          </div>
        )}

        {data.platforms.length > 0 &&
          (() => {
            // Dedup platforms: hide parent family when specific children are present
            const subPlatformParentIds = new Set(
              data.platforms.flatMap((p: { parentId: string | null }) =>
                p.parentId ? [p.parentId] : [],
              ),
            );
            const visiblePlatforms = data.platforms.filter(
              (p: { id: string; parentId: string | null }) => {
                if (p.parentId) return true;
                return !subPlatformParentIds.has(p.id);
              },
            );
            return (
              <div className="mb-g3 sm:mb-g4">
                <h3 className="text-[0.7rem] text-dg-text-tertiary uppercase tracking-wider mb-2">
                  Platforms
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {visiblePlatforms.map(
                    (p: { id: string; name: string; parentName?: string | null }) => (
                      <span
                        key={p.id}
                        className="text-xs py-1.5 px-2.5 sm:py-1 sm:px-2 bg-dg-elevated border border-dg-border rounded-sm text-dg-text-secondary"
                      >
                        {p.parentName ? (
                          <>
                            <span className="text-dg-text-tertiary">{p.parentName} &rsaquo; </span>
                            {p.name}
                          </>
                        ) : (
                          p.name
                        )}
                      </span>
                    ),
                  )}
                </div>
              </div>
            );
          })()}
      </div>
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
