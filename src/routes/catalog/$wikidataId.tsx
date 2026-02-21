import type { Hotkey } from "@tanstack/hotkeys";
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
  clearSeasonFrom,
  countSeasonWatched,
  countWatchedEpisodes,
  highestConsecutiveEpisode,
  markThroughEpisode,
  mediaTypeLabel,
  ratingColor,
  replayCountLabel,
  statusLabel,
  todayISO,
  type WatchedEpisodes,
} from "../../lib/media-types";
import { ogTags, pageTitle } from "../../lib/og";
import { catalogEntryOptions, mediaDetailOptions } from "../../lib/query-options";
import { RotaryKnob } from "../../lib/RotaryKnob";
import { useAction } from "../../lib/use-action";
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

function EpisodeTracker({
  seasons,
  watchedEpisodes,
  onWatchedChange,
}: {
  seasons: {
    id: string;
    seasonNumber: number;
    episodeCount: number | null;
    title: string | null;
    dataSource: string;
  }[];
  watchedEpisodes?: WatchedEpisodes;
  onWatchedChange?: (w: WatchedEpisodes) => void;
}) {
  const interactive = !!onWatchedChange && !!watchedEpisodes;
  const isMultiSeason = seasons.length > 1;

  const [selectedSeason, setSelectedSeason] = useState(() => {
    for (const s of seasons) {
      if (s.episodeCount == null) continue;
      const w = highestConsecutiveEpisode(watchedEpisodes, s.seasonNumber);
      if (w < s.episodeCount) return s.seasonNumber;
    }
    return seasons[0]?.seasonNumber ?? 1;
  });
  const [episodeDate, setEpisodeDate] = useState(todayISO());

  const currentSeason = seasons.find((s) => s.seasonNumber === selectedSeason) ?? seasons[0];
  const seasonEpCount = currentSeason?.episodeCount ?? 0;
  const seasonWatched = countSeasonWatched(watchedEpisodes, currentSeason?.seasonNumber ?? 0);
  const consecutiveEp = highestConsecutiveEpisode(
    watchedEpisodes,
    currentSeason?.seasonNumber ?? 0,
  );
  const seasonPct = seasonEpCount > 0 ? Math.round((seasonWatched / seasonEpCount) * 100) : 0;

  const totalEps = seasons.reduce((sum, s) => sum + (s.episodeCount ?? 0), 0);
  const totalWatched = countWatchedEpisodes(watchedEpisodes);
  const totalPct = totalEps > 0 ? Math.round((totalWatched / totalEps) * 100) : 0;

  const idx = seasons.findIndex((s) => s.seasonNumber === currentSeason.seasonNumber);
  const nextSeason = isMultiSeason
    ? seasons.slice(idx + 1).find((s) => (s.episodeCount ?? 0) > 0)
    : undefined;
  const prevSeason = isMultiSeason
    ? seasons
        .slice(0, idx)
        .reverse()
        .find((s) => highestConsecutiveEpisode(watchedEpisodes, s.seasonNumber) > 0)
    : undefined;

  const handleIncrement = () => {
    if (consecutiveEp < seasonEpCount) {
      onWatchedChange?.(
        markThroughEpisode(
          watchedEpisodes,
          currentSeason.seasonNumber,
          consecutiveEp + 1,
          episodeDate,
        ),
      );
    } else if (nextSeason) {
      onWatchedChange?.(
        markThroughEpisode(watchedEpisodes, nextSeason.seasonNumber, 1, episodeDate),
      );
      setSelectedSeason(nextSeason.seasonNumber);
    }
  };

  const handleDecrement = () => {
    // BUG FIX: only delete the last consecutive episode, not from current to end
    if (consecutiveEp > 1) {
      onWatchedChange?.(
        clearSeasonFrom(watchedEpisodes, currentSeason.seasonNumber, consecutiveEp, consecutiveEp),
      );
    } else if (consecutiveEp === 1 && !prevSeason) {
      // At ep 1 with no previous season — clear all episodes for this season
      onWatchedChange?.(
        clearSeasonFrom(watchedEpisodes, currentSeason.seasonNumber, 1, seasonEpCount),
      );
    } else if (prevSeason) {
      const pc = highestConsecutiveEpisode(watchedEpisodes, prevSeason.seasonNumber);
      if (pc > 0) {
        onWatchedChange?.(clearSeasonFrom(watchedEpisodes, prevSeason.seasonNumber, pc, pc));
      }
      setSelectedSeason(prevSeason.seasonNumber);
    }
  };

  return (
    <div>
      <div className={styles.episodesHeader}>
        <h3 className={styles.episodesLabel}>Episodes</h3>
        {isMultiSeason && (
          <select
            value={selectedSeason}
            onChange={(e) => setSelectedSeason(Number(e.target.value))}
            className={styles.seasonSelect}
          >
            {seasons.map((s) => (
              <option key={s.id} value={s.seasonNumber}>
                S{String(s.seasonNumber).padStart(2, "0")}
                {s.title ? ` — ${s.title}` : ""}
              </option>
            ))}
          </select>
        )}
      </div>

      {seasonEpCount > 0 && (
        <div className={styles.progressRow}>
          {isMultiSeason && (
            <span className={styles.progressLabel}>
              S{String(currentSeason.seasonNumber).padStart(2, "0")}
            </span>
          )}
          <div className={styles.progressTrack}>
            <div className={styles.progressFill} style={{ width: `${seasonPct}%` }} />
          </div>
          <span className={styles.progressCount}>
            {seasonWatched}/{seasonEpCount}
          </span>
        </div>
      )}

      {isMultiSeason && totalEps > 0 && (
        <div className={styles.progressSection}>
          <div className={styles.progressRow}>
            <span className={styles.progressLabel}>ALL</span>
            <div className={styles.progressTrack}>
              <div className={styles.progressFillDim} style={{ width: `${totalPct}%` }} />
            </div>
            <span className={styles.progressCount}>
              {totalWatched}/{totalEps}
            </span>
          </div>
        </div>
      )}

      {interactive && seasonEpCount > 0 && (
        <div className={styles.counterControls}>
          <div className={styles.counterRow}>
            <button
              type="button"
              onClick={handleDecrement}
              disabled={consecutiveEp <= 0 && !prevSeason}
              className={styles.counterBtn}
            >
              -
            </button>
            <span className={styles.counterDisplay}>
              {consecutiveEp} / {seasonEpCount}
            </span>
            <button
              type="button"
              onClick={handleIncrement}
              disabled={consecutiveEp >= seasonEpCount && !nextSeason}
              className={styles.counterBtn}
            >
              +
            </button>
          </div>

          <div className={styles.dateRow}>
            <span className={styles.dateLabelSmall}>Watched on</span>
            <input
              type="date"
              value={episodeDate}
              max={todayISO()}
              onChange={(e) => setEpisodeDate(e.target.value || todayISO())}
              className={styles.dateInputSmall}
            />
          </div>
        </div>
      )}

      {!interactive && seasons.length > 0 && (
        <div className={styles.readOnlySeasons}>
          {seasons.map((s) => {
            const w = countSeasonWatched(watchedEpisodes, s.seasonNumber);
            const epCount = s.episodeCount ?? 0;
            const pct = epCount > 0 ? Math.round((w / epCount) * 100) : 0;
            return (
              <div key={s.id} className={styles.readOnlyRow}>
                <span className={styles.readOnlyLabel}>
                  S{String(s.seasonNumber).padStart(2, "0")}
                </span>
                <div className={styles.readOnlyTrack}>
                  <div className={styles.readOnlyFill} style={{ width: `${pct}%` }} />
                </div>
                <span className={styles.readOnlyCount}>{epCount > 0 ? `${epCount} ep` : "?"}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TrackingPanel({
  wikidataId,
  mediaType,
  initialEntry,
  statusState,
  favoriteState,
  watchedEpisodesState,
  watchedAtState,
  isMovie,
  bare,
  children,
}: {
  wikidataId: string;
  mediaType?: string;
  initialEntry?: CatalogEntry | null;
  statusState?: { value: string | null; set: (v: string | null) => void };
  favoriteState?: { value: boolean; set: (v: boolean) => void };
  watchedEpisodesState?: { value: WatchedEpisodes; set: (v: WatchedEpisodes) => void };
  watchedAtState?: { value: string | null; set: (v: string | null) => void };
  isMovie?: boolean;
  bare?: boolean;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const hasInitial = initialEntry !== undefined;
  const [entry, setEntry] = useState<CatalogEntry | null>(hasInitial ? initialEntry : null);
  const [loaded, setLoaded] = useState(hasInitial);
  const action = useAction();
  const cardRef = useRef<HTMLDivElement>(null);
  const [localRating, setLocalRating] = useState<number | null>(
    hasInitial ? (initialEntry?.rating ?? null) : null,
  );
  const [fallbackStatus, setFallbackStatus] = useState<string | null>(
    hasInitial ? (initialEntry?.status ?? null) : null,
  );
  const localStatus = statusState ? statusState.value : fallbackStatus;
  const setLocalStatus = statusState ? statusState.set : setFallbackStatus;
  const [fallbackFav, setFallbackFav] = useState(
    hasInitial ? (initialEntry?.isFavorite ?? false) : false,
  );
  const localIsFavorite = favoriteState ? favoriteState.value : fallbackFav;
  const setLocalIsFavorite = favoriteState ? favoriteState.set : setFallbackFav;
  const [localReplayCount, setLocalReplayCount] = useState(
    hasInitial ? (initialEntry?.replayCount ?? 0) : 0,
  );
  const serverEntry = useRef<CatalogEntry | null>(hasInitial ? (initialEntry ?? null) : null);

  const localWatchedEpisodes = watchedEpisodesState?.value ?? {};
  const setLocalWatchedEpisodes = watchedEpisodesState?.set;
  const localWatchedAt = watchedAtState?.value ?? null;
  const setLocalWatchedAt = watchedAtState?.set;

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
    setLocalWatchedEpisodes?.((e?.watchedEpisodes as WatchedEpisodes) ?? {});
    setLocalWatchedAt?.(e?.watchedAt ?? null);
    serverEntry.current = e;
    setLoaded(true);
  }, [
    hasInitial,
    entryQuery.isPending,
    entryQuery.data,
    setLocalIsFavorite,
    setLocalStatus,
    setLocalWatchedEpisodes,
    setLocalWatchedAt,
  ]);

  const ratingDirty = localRating !== (serverEntry.current?.rating ?? null);
  const statusDirty = localStatus !== (serverEntry.current?.status ?? null);
  const favoriteDirty = localIsFavorite !== (serverEntry.current?.isFavorite ?? false);
  const replayDirty = localReplayCount !== (serverEntry.current?.replayCount ?? 0);
  const episodesDirty =
    JSON.stringify(localWatchedEpisodes) !==
    JSON.stringify((serverEntry.current?.watchedEpisodes as WatchedEpisodes) ?? {});
  const watchedAtDirty = localWatchedAt !== (serverEntry.current?.watchedAt ?? null);
  const isDirty =
    ratingDirty || statusDirty || favoriteDirty || replayDirty || episodesDirty || watchedAtDirty;

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
        const hasWatchedEps = Object.keys(localWatchedEpisodes).length > 0;
        await setCatalogEntry({
          data: {
            wikidataId,
            status,
            rating: localRating,
            note: prev?.note,
            episodeProgress: prev?.episodeProgress,
            isFavorite: localIsFavorite,
            replayCount: localReplayCount,
            watchedEpisodes: hasWatchedEps ? localWatchedEpisodes : undefined,
            watchedAt: localWatchedAt,
          },
        });
        console.debug("[tracking] save %s → server ok, refreshing", wikidataId);
        const fresh = await getCatalogEntry({ data: { wikidataId } });
        setEntry(fresh);
        setLocalRating(fresh?.rating ?? null);
        setLocalStatus(fresh?.status ?? null);
        setLocalIsFavorite(fresh?.isFavorite ?? false);
        setLocalReplayCount(fresh?.replayCount ?? 0);
        setLocalWatchedEpisodes?.((fresh?.watchedEpisodes as WatchedEpisodes) ?? {});
        setLocalWatchedAt?.(fresh?.watchedAt ?? null);
        serverEntry.current = fresh;
        queryClient.invalidateQueries({ queryKey: ["user"] });
        router.invalidate();
        // Save pulse animation
        const card = cardRef.current?.closest(`.${styles.trackingCard}`) as HTMLElement | null;
        if (card) {
          card.removeAttribute("data-save-pulse");
          void card.offsetWidth;
          card.setAttribute("data-save-pulse", "");
          setTimeout(() => card.removeAttribute("data-save-pulse"), 900);
        }
      } catch (err) {
        console.error("[tracking] save %s → FAILED:", wikidataId, err);
        setEntry(prev);
        setLocalRating(prev?.rating ?? null);
        setLocalStatus(prev?.status ?? null);
        setLocalIsFavorite(prev?.isFavorite ?? false);
        setLocalReplayCount(prev?.replayCount ?? 0);
        setLocalWatchedEpisodes?.((prev?.watchedEpisodes as WatchedEpisodes) ?? {});
        setLocalWatchedAt?.(prev?.watchedAt ?? null);
        // Error pulse animation
        const card = cardRef.current?.closest(`.${styles.trackingCard}`) as HTMLElement | null;
        if (card) {
          card.removeAttribute("data-save-error");
          void card.offsetWidth;
          card.setAttribute("data-save-error", "");
          setTimeout(() => card.removeAttribute("data-save-error"), 900);
        }
        throw err;
      }
    });
  }, [
    entry,
    localStatus,
    localRating,
    localIsFavorite,
    localReplayCount,
    localWatchedEpisodes,
    localWatchedAt,
    wikidataId,
    router,
    queryClient,
    action,
    setLocalIsFavorite,
    setLocalStatus,
    setLocalWatchedEpisodes,
    setLocalWatchedAt,
  ]);

  // ─── Auto-save: 1s debounce ────────────────────────────────────────────
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const handleSaveRef = useRef(handleSave);
  handleSaveRef.current = handleSave;
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;

  // biome-ignore lint/correctness/useExhaustiveDependencies: extra deps intentionally trigger debounce reset on value changes
  useEffect(() => {
    if (!isDirty || !localStatus || action.state === "pending") {
      clearTimeout(autoSaveTimer.current);
      return;
    }
    autoSaveTimer.current = setTimeout(() => {
      if (isDirtyRef.current) {
        handleSaveRef.current();
      }
    }, 1000);
    return () => clearTimeout(autoSaveTimer.current);
  }, [
    isDirty,
    localStatus,
    action.state,
    localRating,
    localIsFavorite,
    localReplayCount,
    localWatchedEpisodes,
    localWatchedAt,
  ]);

  // Flush pending save on navigation / page close
  useEffect(() => {
    const flush = () => {
      if (isDirtyRef.current && autoSaveTimer.current) {
        clearTimeout(autoSaveTimer.current);
        handleSaveRef.current();
      }
    };
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("beforeunload", flush);
      flush();
    };
  }, []);

  const handleRemove = useCallback(async () => {
    console.debug("[tracking] remove %s", wikidataId);
    await action.run(async () => {
      await removeCatalogEntry({ data: { wikidataId } });
      console.debug("[tracking] remove %s → server ok, reloading", wikidataId);
      window.location.reload();
    });
  }, [wikidataId, action]);

  const statuses = availableStatuses(mediaType);

  const notBusy = action.state !== "pending";

  const statusKeyMap: Record<string, string> = {
    P: "planned",
    W: "in_progress",
    O: "on_hold",
    C: "completed",
    D: "dropped",
    M: "mastered",
  };
  for (const [key, status] of Object.entries(statusKeyMap)) {
    // biome-ignore lint/correctness/useHookAtTopLevel: static iteration over constant map
    useHotkey(key as Hotkey, () => setLocalStatus(status), {
      enabled: loaded && notBusy && statusLabel(status as never, mediaType) !== null,
    });
  }

  const [ratingMode, setRatingMode] = useState(false);
  const ratingBuf = useRef("");

  useHotkey("=", () => setRatingMode(true), {
    enabled: loaded && notBusy && !!localStatus && !ratingMode,
  });

  useEffect(() => {
    if (!ratingMode) return;
    ratingBuf.current = "";

    const commit = () => {
      const val = Number.parseInt(ratingBuf.current, 10);
      if (!Number.isNaN(val) && val >= 0 && val <= 100) {
        setLocalRating(val);
      }
      ratingBuf.current = "";
      setRatingMode(false);
    };

    const cancel = () => {
      ratingBuf.current = "";
      setRatingMode(false);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cancel();
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        commit();
        return;
      }
      if (e.key >= "0" && e.key <= "9") {
        e.preventDefault();
        ratingBuf.current += e.key;
        const val = Number.parseInt(ratingBuf.current, 10);
        if (ratingBuf.current.length >= 3 || (ratingBuf.current.length === 2 && val > 10)) {
          commit();
        }
        return;
      }
      cancel();
    };

    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [ratingMode]);

  useHotkey(
    "S",
    () => {
      if (isDirty) {
        clearTimeout(autoSaveTimer.current);
        handleSave();
      }
    },
    { enabled: loaded && notBusy && isDirty },
  );

  useHotkey(
    "Shift+D",
    () => {
      if (serverEntry.current?.status) handleRemove();
    },
    { enabled: loaded && notBusy && !!serverEntry.current?.status },
  );

  if (!loaded) {
    return (
      <div ref={cardRef} className={bare ? styles.trackingInner : styles.trackingCard}>
        <div
          className={`dg-skeleton ${styles.skeleton}`}
          style={{ width: "5rem", height: "0.75rem" }}
        />
      </div>
    );
  }

  const saveState =
    action.state === "pending"
      ? "pending"
      : action.state === "error"
        ? "error"
        : isDirty
          ? "dirty"
          : "clean";

  return (
    <div ref={cardRef} className={bare ? styles.trackingInner : styles.trackingCard}>
      <div className={styles.trackingHeader}>
        <h3 className={styles.trackingLabel}>Status</h3>
        {localStatus && (
          <button
            type="button"
            onClick={() => setLocalIsFavorite(!localIsFavorite)}
            className={styles.favBtn}
            {...(localIsFavorite ? { "data-active": "" } : {})}
            title={localIsFavorite ? "Remove from favorites" : "Mark as favorite"}
          >
            {localIsFavorite ? "\u2605" : "\u2606"}
          </button>
        )}
      </div>

      <div className={styles.statusRow}>
        {statuses.map((s) => {
          const isActive = localStatus === s;
          const label = statusLabel(s, mediaType);
          return (
            <button
              key={s}
              type="button"
              onClick={() => setLocalStatus(s)}
              disabled={action.state === "pending"}
              className={styles.statusBtn}
              data-status={s}
              {...(isActive ? { "data-active": "" } : {})}
            >
              {label}
            </button>
          );
        })}
      </div>

      {(localStatus === "in_progress" ||
        localStatus === "completed" ||
        localStatus === "mastered") && (
        <div className={styles.ratingSection}>
          <h4 className={styles.ratingLabel}>
            Rating
            {ratingMode && (
              <span className={styles.ratingMode}>
                = <span className="dg-breathe">_</span>
              </span>
            )}
          </h4>
          <div className={styles.ratingControls}>
            <div className={styles.knobWrapper}>
              <RotaryKnob
                value={localRating ?? 0}
                onChange={(v) => setLocalRating(v || null)}
                size={80}
                color={ratingColor(localRating) ?? "var(--dg-accent)"}
                disabled={action.state === "pending"}
              />
              <RatingInput
                value={localRating}
                onChange={setLocalRating}
                disabled={action.state === "pending"}
              />
            </div>
            {localRating != null && (
              <button
                type="button"
                onClick={() => setLocalRating(null)}
                disabled={action.state === "pending"}
                className={styles.ratingClearBtn}
                title="Clear rating"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>
      )}

      {(localStatus === "completed" || localStatus === "mastered") && (
        <div className={styles.replayRow}>
          <button
            type="button"
            onClick={() => setLocalReplayCount(Math.max(0, localReplayCount - 1))}
            disabled={action.state === "pending" || localReplayCount <= 0}
            className={styles.replayBtn}
          >
            -
          </button>
          <span className={styles.replayLabel}>
            {replayCountLabel(localReplayCount, mediaType) ?? "First time"}
          </span>
          <button
            type="button"
            onClick={() => setLocalReplayCount(localReplayCount + 1)}
            disabled={action.state === "pending"}
            className={styles.replayBtn}
          >
            +
          </button>
        </div>
      )}

      {isMovie && localStatus && setLocalWatchedAt && (
        <div className={styles.dateSection}>
          <h4 className={styles.dateLabel}>Watched on</h4>
          <input
            type="date"
            value={localWatchedAt ?? ""}
            max={todayISO()}
            onChange={(e) => setLocalWatchedAt(e.target.value || null)}
            disabled={action.state === "pending"}
            className={styles.dateInput}
          />
        </div>
      )}

      {children && <div className={styles.childrenSlot}>{children}</div>}

      {localStatus && (
        <div className={styles.bottomBar}>
          <button
            type="button"
            onClick={() => {
              clearTimeout(autoSaveTimer.current);
              handleSave();
            }}
            disabled={action.state === "pending" || !isDirty}
            className={styles.saveBtn}
            data-state={saveState}
            title="Save changes"
          >
            {action.state === "pending" ? (
              <span className="dg-ellipsis">saving</span>
            ) : action.state === "done" ? (
              "saved"
            ) : action.state === "error" ? (
              "error \u2014 retry"
            ) : isDirty ? (
              "save"
            ) : (
              "saved"
            )}
          </button>
          {serverEntry.current?.status && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={action.state === "pending"}
              className={styles.deleteBtn}
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
  const color = ratingColor(value) ?? "var(--dg-accent)";

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
        className={styles.ratingInputEditing}
        style={{ color, borderColor: color }}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={startEditing}
      disabled={disabled}
      className={styles.ratingInputDisplay}
      style={{ color, textDecorationColor: `${color}50` }}
      title="Click to type a rating"
    >
      {value != null ? value : "\u2014"}
    </button>
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
