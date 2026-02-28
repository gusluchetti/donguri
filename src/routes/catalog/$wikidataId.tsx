import { Shuffle } from "@phosphor-icons/react";
import { useHotkey } from "@tanstack/react-hotkeys";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { getMediaStub } from "~/features/catalog/catalog.functions";
import { catalogEntryOptions, trackedIdsOptions } from "~/features/catalog/catalog.queries";
import { SoundEngine } from "~/features/catalog/catalog.sound";
import { CoverThumb } from "~/features/catalog/components/CoverThumb";
import { StampBadge } from "~/features/catalog/components/StampBadge";
import type { getMedia } from "~/features/media/media.functions";
import { getRandomMediaId } from "~/features/media/media.functions";
import { mediaDetailOptions } from "~/features/media/media.queries";
import {
  countWatchedEpisodes,
  displayMediaType,
  mediaTypeLabel,
  type WatchedEpisodes,
} from "~/features/media/media-types";
import { prefetchImage } from "~/lib/image-prefetch";
import { ogTags, pageTitle } from "~/lib/og";
import { EpisodeTracker } from "./-episodes";
import { TrackingPanel } from "./-tracking";

const rootRoute = getRouteApi("__root__");

type FullLoaderData = {
  kind: "full";
  media: NonNullable<Awaited<ReturnType<typeof getMedia>>>;
};

type StubLoaderData = {
  kind: "stub";
  stub: {
    wikidataId: string;
    title: string;
    mediaType: string | null;
    animationOrigin?: string | null;
  };
};

type LoaderData = FullLoaderData | StubLoaderData;

export const Route = createFileRoute("/catalog/$wikidataId")({
  loader: async ({ params, context }): Promise<LoaderData> => {
    // Non-blocking: warm tracking cache for logged-in users only
    if (context.auth) {
      context.queryClient.ensureQueryData(trackedIdsOptions()).then(
        () => {
          context.queryClient.prefetchQuery(catalogEntryOptions(params.wikidataId));
        },
        () => {},
      );
    }

    // Blocking: media data is the page content
    const media = await context.queryClient.ensureQueryData(mediaDetailOptions(params.wikidataId));

    if (media?.posterUrl) {
      prefetchImage(media.posterUrl);
    }

    if (media) {
      return { kind: "full", media };
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
      else if (m.mediaType === "tv_series") ogType = "video.tv_show";
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

function useNavBack() {
  return useCallback(() => {
    SoundEngine.navBack();
    window.history.back();
  }, []);
}

function useShuffleNav() {
  const navigate = useNavigate();
  return useCallback(async () => {
    SoundEngine.dice();
    const id = await getRandomMediaId();
    if (id) {
      navigate({ to: "/catalog/$wikidataId", params: { wikidataId: id } });
    }
  }, [navigate]);
}

function MediaDetailRouter() {
  const loaderData = Route.useLoaderData();
  if (loaderData.kind === "stub") return <MediaStubPage stub={loaderData.stub} />;
  return <MediaDetailPage wikidataId={loaderData.media.wikidataId} />;
}

function MediaDetailSkeleton() {
  const handleBack = useNavBack();
  const handleShuffle = useShuffleNav();
  return (
    <div className="text-dg-text flex-1 overflow-y-auto overflow-x-hidden font-body">
      <div className="max-w-[1100px] mx-auto px-g3 py-g3 sm:py-g4">
        <div className="flex items-center gap-1.5 mb-g2">
          <button
            type="button"
            onClick={handleBack}
            className="text-dg-text-secondary text-[0.8rem] bg-dg-surface border border-dg-border font-body cursor-pointer py-1.5 px-3 inline-flex items-center gap-1.5 rounded-sm transition-all duration-50 active:scale-[0.97] active:opacity-80"
          >
            &larr; back
          </button>
          <button
            type="button"
            title="Random title"
            onClick={handleShuffle}
            className="ml-auto w-[42px] self-stretch flex items-center justify-center bg-dg-surface border border-dg-border rounded cursor-pointer text-dg-text-tertiary hover:text-dg-accent hover:border-dg-accent transition-all duration-50 active:scale-[0.97] active:opacity-80"
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
  stub: {
    wikidataId: string;
    title: string;
    mediaType: string | null;
    animationOrigin?: string | null;
  };
}) {
  const { auth } = rootRoute.useRouteContext();
  const handleBack = useNavBack();
  const handleShuffle = useShuffleNav();

  return (
    <div className="text-dg-text flex-1 overflow-y-auto overflow-x-hidden font-body">
      <div className="max-w-[1100px] mx-auto px-g3 py-g3 sm:py-g4">
        <div className="flex items-center gap-1.5 mb-g2">
          <button
            type="button"
            onClick={handleBack}
            className="text-dg-text-secondary text-[0.8rem] bg-dg-surface border border-dg-border font-body cursor-pointer py-1.5 px-3 inline-flex items-center gap-1.5 rounded-sm hover:border-dg-border-strong hover:text-dg-text transition-all duration-50 active:scale-[0.97] active:opacity-80"
          >
            &larr; back
          </button>
          <button
            type="button"
            title="Random title"
            onClick={handleShuffle}
            className="ml-auto w-[42px] self-stretch flex items-center justify-center bg-dg-surface border border-dg-border rounded cursor-pointer text-dg-text-tertiary hover:text-dg-accent hover:border-dg-accent transition-all duration-50 active:scale-[0.97] active:opacity-80"
          >
            <Shuffle size={17} weight="bold" />
          </button>
        </div>

        <div className="mb-g3">
          {stub.mediaType && (
            <div className="mb-2">
              <StampBadge type={displayMediaType(stub.mediaType, stub.animationOrigin ?? null)} />
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
              className="text-xs text-dg-accent/70 no-underline py-1 px-2 border border-dg-accent/15 rounded-sm transition-all duration-50"
            >
              Wikidata {"\u2197"}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

function MediaDetailPage({ wikidataId }: { wikidataId: string }) {
  const { data } = useSuspenseQuery(mediaDetailOptions(wikidataId));
  if (!data) throw new Error("Media not found");
  const { auth } = rootRoute.useRouteContext();
  const handleBack = useNavBack();
  const handleShuffle = useShuffleNav();

  const [localIsFavorite, setLocalIsFavorite] = useState(false);
  const [localWatchedEpisodes, setLocalWatchedEpisodes] = useState<WatchedEpisodes>({});
  const [localWatchedAt, setLocalWatchedAt] = useState<string | null>(null);
  const [localStatus, setLocalStatus] = useState<string | null>(null);

  useHotkey("H", handleBack);
  useHotkey("ArrowLeft", handleBack);
  useHotkey("Backspace", handleBack);
  useHotkey("F", () => setLocalIsFavorite((v) => !v), {
    enabled: !!auth && !!localStatus,
  });

  const isAnime = data.animationOrigin === "anime";
  const isGame = data.mediaType === "game";
  const isTv = data.mediaType === "tv_series";
  const totalEps =
    isTv && data.seasons && data.seasons.length > 0
      ? data.seasons.reduce(
          (sum: number, s: { episodeCount: number | null }) => sum + (s.episodeCount ?? 0),
          0,
        )
      : 0;
  const hasSeasons = totalEps > 1;

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
  if (data.tvdbId && isTv) {
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
    <div className="text-dg-text flex-1 overflow-y-auto overflow-x-hidden font-body">
      <div className="max-w-[1100px] mx-auto px-g3 py-g3 sm:py-g4">
        <div className="flex items-center gap-1.5 mb-g2">
          <button
            type="button"
            onClick={handleBack}
            className="text-dg-text-secondary text-[0.8rem] bg-dg-surface border border-dg-border font-body cursor-pointer py-1.5 px-3 inline-flex items-center gap-1.5 rounded-sm hover:border-dg-border-strong hover:text-dg-text transition-all duration-50 active:scale-[0.97] active:opacity-80"
          >
            &larr; back
          </button>
          <button
            type="button"
            title="Random title"
            onClick={handleShuffle}
            className="ml-auto w-[42px] self-stretch flex items-center justify-center bg-dg-surface border border-dg-border rounded cursor-pointer text-dg-text-tertiary hover:text-dg-accent hover:border-dg-accent transition-all duration-50 active:scale-[0.97] active:opacity-80"
          >
            <Shuffle size={17} weight="bold" />
          </button>
        </div>

        <div className="flex flex-col sm:flex-row gap-g3 sm:gap-g4 mb-g3 sm:mb-g4">
          {/* Mobile cover — centered above metadata */}
          {data.posterUrl && (
            <div className="sm:hidden flex justify-center">
              <div className="w-[120px] aspect-[2/3] overflow-hidden rounded">
                <CoverThumb
                  title={data.title}
                  mediaType={displayMediaType(data.mediaType, data.animationOrigin)}
                  posterUrl={data.posterUrl ?? undefined}
                  size={160}
                  loading="eager"
                />
              </div>
            </div>
          )}
          {/* Desktop poster — stretches to match right column */}
          <div className="hidden sm:block sm:w-[210px] shrink-0">
            <div className="aspect-[2/3] w-full sm:aspect-auto sm:h-full">
              <CoverThumb
                title={data.title}
                mediaType={displayMediaType(data.mediaType, data.animationOrigin)}
                posterUrl={data.posterUrl ?? undefined}
                size={210}
                loading="eager"
              />
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <div className="mb-2">
              <StampBadge type={displayMediaType(data.mediaType, data.animationOrigin)} />
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
                {data.episodeCount && data.episodeCount > 1 && (
                  <MetaItem label="Episodes" value={String(data.episodeCount)} />
                )}
                {data.popularityScore != null && (
                  <PopularityMeta
                    score={data.popularityScore}
                    qrankPct={data.qrankPct}
                    sitelinksPct={data.sitelinksPct}
                  />
                )}
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
                      className="text-xs text-dg-accent/70 no-underline py-1 px-2 border border-dg-accent/15 rounded-sm transition-all duration-50"
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

        {!auth && (
          <div
            className="rounded mb-g3 sm:mb-g4 px-g2 sm:px-g3 py-g2 sm:py-g3"
            style={{
              background: "var(--color-dg-accent-soft)",
              border: "1px solid color-mix(in srgb, var(--color-dg-accent) 20%, transparent)",
            }}
          >
            <p className="text-[0.85rem] sm:text-[0.9rem] text-dg-text-secondary m-0">
              <Link
                to="/login"
                onClick={() => SoundEngine.click()}
                className="inline-block bg-dg-accent text-white font-body text-[0.85rem] sm:text-[0.9rem] rounded-sm px-3 py-1 no-underline transition-all duration-50 hover:brightness-110 mr-1.5 active:scale-[0.97] active:opacity-80"
              >
                Sign in
              </Link>{" "}
              to track this title, rate it, and see detailed episode data.
            </p>
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

function PopularityMeta({
  score,
  qrankPct,
  sitelinksPct,
}: {
  score: string;
  qrankPct: string | null;
  sitelinksPct: string | null;
}) {
  const [visible, setVisible] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function show() {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setVisible(true);
  }

  // Small grace period so mouse can travel from label to tooltip without flicker
  function hide() {
    hideTimer.current = setTimeout(() => setVisible(false), 80);
  }

  const rounded = Number.parseFloat(score).toFixed(1);
  const hasQrank = qrankPct != null;

  return (
    <div className="relative flex flex-col gap-0.5">
      {/* biome-ignore lint/a11y/noStaticElementInteractions: tooltip trigger */}
      <span
        className="text-[0.65rem] text-dg-text-tertiary uppercase tracking-wider cursor-help underline decoration-dotted decoration-dg-border underline-offset-2 w-fit"
        onMouseEnter={show}
        onMouseLeave={hide}
      >
        Popularity
      </span>
      <span className="text-[0.85rem] text-dg-text">{rounded}</span>

      {/* biome-ignore lint/a11y/noStaticElementInteractions: tooltip body needs hover to stay open */}
      <div
        className="absolute bottom-full left-0 mb-1.5 z-50 w-[260px] p-2.5 rounded border border-dg-border-subtle bg-dg-surface text-[0.75rem] leading-relaxed text-dg-text-secondary shadow-lg transition-all duration-50"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? "translateY(0)" : "translateY(4px)",
          pointerEvents: visible ? "auto" : "none",
        }}
        onMouseEnter={show}
        onMouseLeave={hide}
      >
        {hasQrank ? (
          <p className="m-0">
            <span className="text-dg-text">score</span> = 0.6 &times; QRank ({qrankPct}) + 0.4
            &times; Sitelinks ({sitelinksPct ?? "n/a"})
          </p>
        ) : (
          <p className="m-0">
            <span className="text-dg-text">score</span> = Sitelinks only (no QRank data)
          </p>
        )}
        <div className="mt-1.5 flex items-center gap-1.5 text-[0.7rem] text-dg-text-tertiary">
          <a
            href="https://qrank.wmcloud.org/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-dg-accent/70 no-underline hover:text-dg-accent transition-colors"
          >
            QRank {"\u2197"}
          </a>
          <span>&middot;</span>
          <span>Wikipedia sitelinks coverage</span>
        </div>
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
