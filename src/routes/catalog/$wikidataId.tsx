import { Shuffle } from "@phosphor-icons/react";
import { useHotkey } from "@tanstack/react-hotkeys";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, getRouteApi, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "~/components/Button";
import { IconButton } from "~/components/IconButton";
import { InfoCard } from "~/components/InfoCard";
import { LinkButton } from "~/components/LinkButton";
import { Spinner } from "~/components/Spinner";
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
  currentRunWatched,
  displayMediaType,
  flattenForSave,
  mediaTypeLabel,
  normalizeRuns,
  type RunWatchedEpisodes,
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
    if (context.auth) {
      context.queryClient.ensureQueryData(trackedIdsOptions()).then(
        () => {
          context.queryClient.prefetchQuery(catalogEntryOptions(params.wikidataId));
        },
        () => {},
      );
    }

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

const INFO_CARD_CLASS = "rounded border border-dg-border-subtle bg-dg-surface mb-g3 sm:mb-g4";
const INFO_CARD_PAD = "clamp(8px, 2%, 16px)";

function NavButtons({ onBack, onShuffle }: { onBack: () => void; onShuffle: () => void }) {
  return (
    <div className="flex items-center gap-1.5 mb-g2">
      <Button variant="secondary" size="compact" onClick={onBack} className="text-[0.8rem]">
        &larr; back
      </Button>
      <IconButton
        variant="surface"
        title="Random title"
        onClick={onShuffle}
        className="ml-auto self-stretch rounded"
      >
        <Shuffle size={17} weight="bold" />
      </IconButton>
    </div>
  );
}

function MediaDetailSkeleton() {
  const handleBack = useNavBack();
  const handleShuffle = useShuffleNav();
  return (
    <div className="text-dg-text flex-1 overflow-y-auto overflow-x-hidden">
      <div className="max-w-[1100px] mx-auto px-g3 py-g3 sm:py-g4">
        <NavButtons onBack={handleBack} onShuffle={handleShuffle} />
        <InfoCard posterSlot={<div className="w-full h-full bg-dg-elevated animate-pulse" />}>
          <div className="flex items-center justify-center h-full">
            <Spinner />
          </div>
        </InfoCard>
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
  const displayType = displayMediaType(stub.mediaType ?? "movie", stub.animationOrigin ?? null);

  return (
    <div className="text-dg-text flex-1 overflow-y-auto overflow-x-hidden">
      <div className="max-w-[1100px] mx-auto px-g3 py-g3 sm:py-g4">
        <NavButtons onBack={handleBack} onShuffle={handleShuffle} />

        <InfoCard
          posterSlot={
            <CoverThumb title={stub.title} mediaType={displayType} size={160} loading="eager" />
          }
        >
          {stub.mediaType && (
            <div className="mb-2">
              <StampBadge type={displayType} />
            </div>
          )}
          <h1
            className="font-display font-normal m-0 leading-[1.15] tracking-[-0.03em]"
            style={{ fontSize: "clamp(1.4rem, 4vw, 2.25rem)" }}
          >
            {stub.title}
          </h1>
          <p className="text-[0.8rem] text-dg-text-tertiary mt-3">
            This title has not been imported into the catalog yet. Metadata will appear after the
            next data import.
          </p>
          <div className="flex flex-wrap gap-1.5 mt-3">
            <a
              href={`https://www.wikidata.org/wiki/${stub.wikidataId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-dg-accent/70 no-underline py-1 px-2 border border-dg-accent/15 rounded-sm transition-all duration-50"
            >
              Wikidata {"\u2197"}
            </a>
          </div>
        </InfoCard>

        {auth && (
          <TrackingPanel wikidataId={stub.wikidataId} mediaType={stub.mediaType ?? undefined} />
        )}
      </div>
    </div>
  );
}

/** Suppress standalone parents when any of their children are present. */
function dedupHierarchy<T extends { id: string; parentId: string | null }>(items: T[]): T[] {
  const childParentIds = new Set(items.flatMap((i) => (i.parentId ? [i.parentId] : [])));
  return items.filter((i) => i.parentId || !childParentIds.has(i.id));
}

function buildExternalLinks(
  data: NonNullable<Awaited<ReturnType<typeof getMedia>>>,
): { label: string; url: string }[] {
  const links: { label: string; url: string }[] = [];
  const isAnime = data.animationOrigin === "anime";
  const isGame = data.mediaType === "game";
  const isTv = data.mediaType === "tv_series";

  if (data.imdbId) links.push({ label: "IMDb", url: `https://www.imdb.com/title/${data.imdbId}` });
  if (data.tmdbId && !isGame)
    links.push({ label: "TMDB", url: `https://www.themoviedb.org/${data.tmdbId}` });
  if (data.malId && isAnime)
    links.push({ label: "MyAnimeList", url: `https://myanimelist.net/anime/${data.malId}` });
  if (data.anilistId && isAnime)
    links.push({ label: "AniList", url: `https://anilist.co/anime/${data.anilistId}` });
  if (data.anidbId && isAnime)
    links.push({ label: "AniDB", url: `https://anidb.net/anime/${data.anidbId}` });
  if (data.annId && isAnime)
    links.push({
      label: "ANN",
      url: `https://www.animenewsnetwork.com/encyclopedia/anime.php?id=${data.annId}`,
    });
  if (data.igdbId && isGame)
    links.push({ label: "IGDB", url: `https://www.igdb.com/games/${data.igdbId}` });
  if (data.tvdbId && isTv) {
    const isNumeric = /^\d+$/.test(data.tvdbId);
    links.push({
      label: "TheTVDB",
      url: isNumeric
        ? `https://thetvdb.com/dereferrer/series/${data.tvdbId}`
        : `https://thetvdb.com/series/${data.tvdbId}`,
    });
  }
  links.push({ label: "Wikidata", url: `https://www.wikidata.org/wiki/${data.wikidataId}` });
  return links;
}

function buildMetaLine(data: NonNullable<Awaited<ReturnType<typeof getMedia>>>): string {
  const parts: string[] = [];
  if (data.startYear) {
    parts.push(
      data.endYear && data.endYear !== data.startYear
        ? `${data.startYear}\u2013${data.endYear}`
        : String(data.startYear),
    );
  }
  if (data.countryOfOrigin) parts.push(data.countryOfOrigin);
  if (data.runtimeMinutes && data.mediaType === "movie") parts.push(`${data.runtimeMinutes} min`);
  if (data.seasonCount) parts.push(`${data.seasonCount} seasons`);
  if (data.episodeCount && data.episodeCount > 1) parts.push(`${data.episodeCount} episodes`);
  return parts.join(" \u00b7 ");
}

function buildActivityItems(
  entry: { createdAt?: Date | null; watchedAt?: string | null },
  watchedEpisodes?: WatchedEpisodes | null,
  seasons?: { seasonNumber: number; episodeCount: number | null }[],
): { date: string; label: string }[] {
  const items: { date: string; label: string }[] = [];

  if (watchedEpisodes && seasons) {
    const dateGroups: Record<string, { season: number; eps: number[] }[]> = {};
    for (const [sn, eps] of Object.entries(watchedEpisodes)) {
      for (const [ep, date] of Object.entries(eps)) {
        if (!dateGroups[date]) dateGroups[date] = [];
        let group = dateGroups[date].find((g) => g.season === Number(sn));
        if (!group) {
          group = { season: Number(sn), eps: [] };
          dateGroups[date].push(group);
        }
        group.eps.push(Number(ep));
      }
    }
    for (const [date, groups] of Object.entries(dateGroups)) {
      for (const g of groups) {
        g.eps.sort((a, b) => a - b);
        const epRange =
          g.eps.length === 1
            ? `E${String(g.eps[0]).padStart(2, "0")}`
            : `E${String(g.eps[0]).padStart(2, "0")}\u2013E${String(g.eps[g.eps.length - 1]).padStart(2, "0")}`;
        items.push({
          date,
          label: `Watched S${String(g.season).padStart(2, "0")}${epRange}`,
        });
      }
    }
  }

  if (entry.watchedAt) {
    items.push({ date: entry.watchedAt, label: "Watched" });
  }

  if (entry.createdAt) {
    items.push({
      date: new Date(entry.createdAt).toISOString().slice(0, 10),
      label: "Added to list",
    });
  }

  items.sort((a, b) => b.date.localeCompare(a.date));
  return items.slice(0, 10);
}

function ActivityTimeline({
  entry,
  watchedEpisodes,
  seasons,
}: {
  entry: { createdAt?: Date | null; watchedAt?: string | null };
  watchedEpisodes?: WatchedEpisodes | null;
  seasons?: { seasonNumber: number; episodeCount: number | null }[];
}) {
  const visible = useMemo(
    () => buildActivityItems(entry, watchedEpisodes, seasons),
    [entry, watchedEpisodes, seasons],
  );

  if (visible.length === 0) return null;

  return (
    <div className={INFO_CARD_CLASS} style={{ padding: INFO_CARD_PAD }}>
      <h3 className="text-[0.7rem] text-dg-text-tertiary uppercase tracking-wider m-0 mb-3">
        Activity
      </h3>
      <div className="space-y-1.5">
        {visible.map((item, i) => {
          const dotColor = item.label.startsWith("Watched")
            ? "bg-dg-enroute"
            : item.label === "Added to list"
              ? "bg-dg-charted"
              : "bg-dg-stamped";
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: stable sorted list
            <div key={i} className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />
                <span className="text-[0.75rem] text-dg-text-secondary">{item.label}</span>
              </div>
              <span className="text-[0.65rem] font-mono text-dg-text-tertiary tabular-nums shrink-0">
                {item.date}
              </span>
            </div>
          );
        })}
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
  const [localRunsData, setLocalRunsData] = useState<RunWatchedEpisodes>({ runs: [{}] });
  const [localReplayCount, setLocalReplayCount] = useState(0);
  const [localWatchedAt, setLocalWatchedAt] = useState<string | null>(null);
  const [localStatus, setLocalStatus] = useState<string | null>(null);

  const entryQuery = useQuery({
    ...catalogEntryOptions(wikidataId),
    enabled: !!auth,
  });

  useHotkey("H", handleBack);
  useHotkey("ArrowLeft", handleBack);
  useHotkey("Backspace", handleBack);
  useHotkey("F", () => setLocalIsFavorite((v) => !v), {
    enabled: !!auth && !!localStatus,
  });

  const isTv = data.mediaType === "tv_series";
  const totalEps =
    isTv && data.seasons && data.seasons.length > 0
      ? data.seasons.reduce(
          (sum: number, s: { episodeCount: number | null }) => sum + (s.episodeCount ?? 0),
          0,
        )
      : 0;
  const hasSeasons = isTv && data.seasons && data.seasons.length > 0;

  const currentRunIndex = localReplayCount;
  const currentRunWatchedEps = useMemo(
    () => currentRunWatched(localRunsData, currentRunIndex),
    [localRunsData, currentRunIndex],
  );
  const flattenedForSave = useMemo(() => flattenForSave(localRunsData), [localRunsData]);

  const handleWatchedEpisodesChange = useCallback(
    (newWatched: WatchedEpisodes) => {
      setLocalRunsData((prev) => {
        const runs = [...prev.runs];
        while (runs.length <= currentRunIndex) runs.push({});
        runs[currentRunIndex] = newWatched;
        return { runs };
      });
      if (!localStatus) setLocalStatus("in_progress");
    },
    [localStatus, currentRunIndex],
  );

  const handleRewatch = useCallback(() => {
    setLocalRunsData((prev) => {
      const runs = [...prev.runs];
      runs.push({});
      return { runs };
    });
  }, []);

  const handleWatchedEpisodesSet = useCallback(
    (w: WatchedEpisodes) => setLocalRunsData(normalizeRuns(w)),
    [],
  );

  useEffect(() => {
    if (localStatus === "in_progress" && totalEps > 0) {
      if (countWatchedEpisodes(currentRunWatchedEps) >= totalEps) {
        setLocalStatus("completed");
        import("canvas-confetti").then(({ default: confetti }) =>
          confetti({
            particleCount: 80,
            spread: 60,
            origin: { y: 0.7 },
            colors: ["#d4a44a", "#e8702e", "#2aaba0"],
          }),
        );
      }
    }
  }, [localStatus, currentRunWatchedEps, totalEps]);

  const mediaDisplayType = displayMediaType(data.mediaType, data.animationOrigin);
  const visibleGenres = useMemo(() => dedupHierarchy(data.genres), [data.genres]);
  const externalLinks = useMemo(() => buildExternalLinks(data), [data]);
  const metaLine = useMemo(() => buildMetaLine(data), [data]);

  return (
    <div className="text-dg-text flex-1 overflow-y-auto overflow-x-hidden">
      <div className="max-w-[1100px] mx-auto px-g3 py-g3 sm:py-g4">
        <NavButtons onBack={handleBack} onShuffle={handleShuffle} />

        <InfoCard
          posterSlot={
            <CoverThumb
              title={data.title}
              mediaType={mediaDisplayType}
              posterUrl={data.posterUrl ?? undefined}
              size={160}
              loading="eager"
            />
          }
        >
          <div className="mb-2">
            <StampBadge type={mediaDisplayType} />
          </div>
          <h1
            className="font-display font-normal m-0 leading-[1.15] tracking-[-0.03em]"
            style={{ fontSize: "clamp(1.4rem, 4vw, 2.25rem)" }}
          >
            {data.title}
          </h1>
          {data.originalTitle && (
            <p className="text-[0.85rem] text-dg-text-secondary font-body mt-1">
              {data.originalTitle}
            </p>
          )}
          {metaLine && (
            <p className="text-[0.8rem] text-dg-text-tertiary font-mono mt-2 m-0">{metaLine}</p>
          )}
          {visibleGenres.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {visibleGenres.map((g: { id: string; name: string; parentName?: string | null }) => (
                <span
                  key={g.id}
                  className="text-xs font-mono py-1.5 px-2.5 sm:py-1 sm:px-2 bg-dg-elevated border border-dg-border rounded-sm text-dg-text-secondary"
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
          )}
          {data.description && (
            <p className="text-[0.8rem] text-dg-text-secondary font-body m-0 leading-relaxed mt-3 line-clamp-3">
              {data.description}
            </p>
          )}
          <div className="flex flex-wrap gap-1.5 mt-3">
            {externalLinks.map((link) => (
              <a
                key={link.label}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-mono text-dg-accent/70 no-underline py-1 px-2 border border-dg-accent/15 rounded-sm transition-all duration-50"
              >
                {link.label} {"\u2197"}
              </a>
            ))}
          </div>
          {data.platforms.length > 0 && (
            <div className="mt-3">
              <h3 className="text-[0.7rem] text-dg-text-tertiary uppercase tracking-wider mb-2">
                Platforms
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {dedupHierarchy(data.platforms).map(
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
          )}
        </InfoCard>

        {auth && (
          <TrackingPanel
            wikidataId={data.wikidataId}
            mediaType={data.mediaType}
            statusState={{ value: localStatus, set: setLocalStatus }}
            favoriteState={{ value: localIsFavorite, set: setLocalIsFavorite }}
            replayCountState={{ value: localReplayCount, set: setLocalReplayCount }}
            watchedEpisodesState={{
              value: flattenedForSave as WatchedEpisodes,
              set: handleWatchedEpisodesSet,
            }}
            watchedAtState={{ value: localWatchedAt, set: setLocalWatchedAt }}
            onRewatch={handleRewatch}
            isMovie={data.mediaType === "movie"}
          >
            {hasSeasons && data.seasons ? (
              <EpisodeTracker
                seasons={data.seasons}
                watchedEpisodes={currentRunWatchedEps}
                onWatchedChange={handleWatchedEpisodesChange}
              />
            ) : isTv ? (
              <div className="text-[0.7rem] text-dg-text-tertiary font-body py-2">
                no episode data available yet
              </div>
            ) : null}
          </TrackingPanel>
        )}

        {auth && localStatus && (
          <ActivityTimeline
            entry={entryQuery.data ?? {}}
            watchedEpisodes={currentRunWatchedEps}
            seasons={hasSeasons ? data.seasons : undefined}
          />
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
              <LinkButton
                to="/login"
                variant="primary"
                size="compact"
                onClick={() => SoundEngine.click()}
                className="mr-1.5"
              >
                Sign in
              </LinkButton>{" "}
              to track this title, rate it, and see detailed episode data.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
