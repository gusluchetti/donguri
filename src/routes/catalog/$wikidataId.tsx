import { useHotkey } from "@tanstack/react-hotkeys";
import { createFileRoute, getRouteApi, useRouter } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import type { CatalogEntry } from "../../db/schema";
import { getMediaStub } from "../../lib/catalog.functions";
import type { getMedia } from "../../lib/media.functions";
import { countWatchedEpisodes, mediaTypeLabel, type WatchedEpisodes } from "../../lib/media-types";
import { ogTags, pageTitle } from "../../lib/og";
import { catalogEntryOptions, mediaDetailOptions } from "../../lib/query-options";
import { EpisodeTracker, TrackingPanel } from "../../lib/TrackingPanel";
import styles from "./$wikidataId.module.css";

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

function MediaDetailRouter() {
  const data = Route.useLoaderData();
  if (data.kind === "stub") return <MediaStubPage stub={data.stub} />;
  return <MediaDetailPage data={data.media} initialEntry={data.initialEntry} />;
}

function MediaDetailSkeleton() {
  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <button type="button" onClick={() => window.history.back()} className={styles.backBtn}>
          &larr; back
        </button>
        <div style={{ marginBottom: "1.25rem" }}>
          <div className={`dg-skeleton ${styles.skeleton} ${styles.skeletonBadge}`} />
          <div className={`dg-skeleton ${styles.skeleton} ${styles.skeletonTitle}`} />
        </div>
        <div className={styles.skeletonMeta}>
          {[...Array(4)].map((_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton items
            <div key={i} className={styles.skeletonMetaItem}>
              <div className={`dg-skeleton ${styles.skeleton} ${styles.skeletonMetaLabel}`} />
              <div className={`dg-skeleton ${styles.skeleton} ${styles.skeletonMetaValue}`} />
            </div>
          ))}
        </div>
        <div className={styles.skeletonLines}>
          <div
            className={`dg-skeleton ${styles.skeleton} ${styles.skeletonLine} ${styles.skeletonLineFull}`}
          />
          <div
            className={`dg-skeleton ${styles.skeleton} ${styles.skeletonLine} ${styles.skeletonLinePartial}`}
          />
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

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <button type="button" onClick={() => window.history.back()} className={styles.backBtn}>
          &larr; back
        </button>

        <div style={{ marginBottom: "1rem" }}>
          {stub.mediaType && (
            <span className={styles.badge} data-type={stub.mediaType}>
              {mediaTypeLabel(stub.mediaType)}
            </span>
          )}
          <h1 className={styles.titleMain}>{stub.title}</h1>
        </div>

        <div className={styles.stubCard}>
          <p className={styles.stubText}>
            This title has not been imported into the catalog yet. Metadata will appear after the
            next data import.
          </p>
        </div>

        {auth && (
          <TrackingPanel wikidataId={stub.wikidataId} mediaType={stub.mediaType ?? undefined} />
        )}

        <div className={styles.linksSection}>
          <h3 className={styles.sectionLabel}>Links</h3>
          <div className={styles.externalLinks}>
            <a
              href={`https://www.wikidata.org/wiki/${stub.wikidataId}`}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.extLink}
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
  const [localIsFavorite, setLocalIsFavorite] = useState(initialEntry?.isFavorite ?? false);
  const [localWatchedEpisodes, setLocalWatchedEpisodes] = useState<WatchedEpisodes>(
    (initialEntry?.watchedEpisodes as WatchedEpisodes) ?? {},
  );
  const [localWatchedAt, setLocalWatchedAt] = useState<string | null>(
    initialEntry?.watchedAt ?? null,
  );
  const [localStatus, setLocalStatus] = useState<string | null>(initialEntry?.status ?? null);

  useHotkey("H", () => router.history.back());
  useHotkey("ArrowLeft", () => router.history.back());
  useHotkey("Backspace", () => router.history.back());
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

  useEffect(() => {
    if (localStatus === "in_progress" && totalEps > 0) {
      if (countWatchedEpisodes(localWatchedEpisodes) >= totalEps) {
        setLocalStatus("completed");
      }
    }
  }, [localStatus, localWatchedEpisodes, totalEps]);

  const subGenreParentIds = new Set(
    data.genres.flatMap((g: { parentId: string | null }) => (g.parentId ? [g.parentId] : [])),
  );
  const visibleGenres = data.genres.filter((g: { id: string; parentId: string | null }) => {
    if (g.parentId) return true;
    return !subGenreParentIds.has(g.id);
  });

  const externalLinks: { label: string; url: string }[] = [];
  if (data.imdbId)
    externalLinks.push({ label: "IMDb", url: `https://www.imdb.com/title/${data.imdbId}` });
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
    externalLinks.push({ label: "AniList", url: `https://anilist.co/anime/${data.anilistId}` });
  if (data.anidbId && isAnime)
    externalLinks.push({ label: "AniDB", url: `https://anidb.net/anime/${data.anidbId}` });
  if (data.annId && isAnime)
    externalLinks.push({
      label: "ANN",
      url: `https://www.animenewsnetwork.com/encyclopedia/anime.php?id=${data.annId}`,
    });
  if (data.igdbId && isGame)
    externalLinks.push({ label: "IGDB", url: `https://www.igdb.com/games/${data.igdbId}` });
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
    <div className={styles.page}>
      <div className={styles.container}>
        <button type="button" onClick={() => window.history.back()} className={styles.backBtn}>
          &larr; back
        </button>

        <div className={styles.headerRow}>
          {data.posterUrl && (
            <img
              src={data.posterUrl}
              alt={`${data.title} poster`}
              width={160}
              className={styles.posterLarge}
              loading="eager"
            />
          )}
          <div className={styles.headerContent}>
            <span className={styles.badge} data-type={data.mediaType}>
              {mediaTypeLabel(data.mediaType)}
            </span>
            <h1 className={styles.titleMain}>{data.title}</h1>
            {data.originalTitle && <p className={styles.titleOriginal}>{data.originalTitle}</p>}

            <div className={styles.metaSlab}>
              <div className={styles.metaGrid}>
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
                  <div className={styles.metaItem}>
                    <a
                      href="https://qrank.wmcloud.org/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.metaLabelLink}
                    >
                      Popularity (QRank) ↗
                    </a>
                    <span className={styles.metaValue}>Top {data.qrankPct}%</span>
                  </div>
                )}
                <MetaItem label="Sitelinks" value={String(data.sitelinksCount ?? 0)} />
              </div>
              {visibleGenres.length > 0 && (
                <>
                  <hr className={styles.metaDivider} />
                  <div className={styles.genreList}>
                    {visibleGenres.map(
                      (g: { id: string; name: string; parentName?: string | null }) => (
                        <span key={g.id} className={styles.genreChip}>
                          {g.parentName ? (
                            <>
                              <span className={styles.genreParent}>{g.parentName} &rsaquo; </span>
                              {g.name}
                            </>
                          ) : (
                            g.name
                          )}
                        </span>
                      ),
                    )}
                  </div>
                </>
              )}
              {data.description && (
                <>
                  <hr className={styles.metaDivider} />
                  <p className={styles.description}>{data.description}</p>
                </>
              )}
              <hr className={styles.metaDivider} />
              <div className={styles.externalLinks}>
                {externalLinks.map((link) => (
                  <a
                    key={link.label}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.extLink}
                  >
                    {link.label} {"\u2197"}
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>

        {auth && (
          <div className={styles.trackingCard}>
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

        {!auth && hasSeasons && data.seasons && (
          <div className={styles.trackingCard}>
            <div className={styles.trackingInner}>
              <EpisodeTracker seasons={data.seasons} />
            </div>
          </div>
        )}

        {data.platforms.length > 0 && (
          <div className={styles.platformsSection}>
            <h3 className={styles.sectionLabel}>Platforms</h3>
            <div className={styles.chipList}>
              {data.platforms.map((p: { id: string; name: string }) => (
                <span key={p.id} className={styles.chip}>
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

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.metaItem}>
      <span className={styles.metaLabel}>{label}</span>
      <span className={styles.metaValue}>{value}</span>
    </div>
  );
}
