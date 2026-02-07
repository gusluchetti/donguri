import { createFileRoute, Link } from "@tanstack/react-router";
import { getMedia } from "../../lib/media.functions";
import { mediaTypeLabel, TYPE_BADGE_CLASSES } from "../../lib/media-types";

export const Route = createFileRoute("/media/$wikidataId")({
  loader: async ({ params }) => {
    const data = await getMedia({ data: { wikidataId: params.wikidataId } });
    if (!data) throw new Error("Media not found");
    return data;
  },
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

function MediaDetailPage() {
  const data = Route.useLoaderData();
  const badgeClass =
    TYPE_BADGE_CLASSES[data.mediaType] ?? "bg-dg-elevated text-dg-text-tertiary border-dg-border";

  const externalLinks: { label: string; url: string }[] = [];
  if (data.imdbId)
    externalLinks.push({
      label: "IMDb",
      url: `https://www.imdb.com/title/${data.imdbId}`,
    });
  if (data.tmdbId && data.mediaType === "movie")
    externalLinks.push({
      label: "TMDB",
      url: `https://www.themoviedb.org/movie/${data.tmdbId}`,
    });
  if (data.tmdbId && data.mediaType !== "movie")
    externalLinks.push({
      label: "TMDB",
      url: `https://www.themoviedb.org/tv/${data.tmdbId}`,
    });
  if (data.malId)
    externalLinks.push({
      label: "MyAnimeList",
      url: `https://myanimelist.net/anime/${data.malId}`,
    });
  if (data.anilistId)
    externalLinks.push({
      label: "AniList",
      url: `https://anilist.co/anime/${data.anilistId}`,
    });
  if (data.anidbId)
    externalLinks.push({
      label: "AniDB",
      url: `https://anidb.net/anime/${data.anidbId}`,
    });
  if (data.igdbId)
    externalLinks.push({
      label: "IGDB",
      url: `https://www.igdb.com/games/${data.igdbId}`,
    });
  if (data.tvdbId)
    externalLinks.push({
      label: "TheTVDB",
      url: `https://thetvdb.com/series/${data.tvdbId}`,
    });
  externalLinks.push({
    label: "Wikidata",
    url: `https://www.wikidata.org/wiki/${data.wikidataId}`,
  });

  return (
    <div className="bg-dg-bg text-dg-text min-h-screen font-mono">
      <div className="max-w-[700px] mx-auto p-6">
        {/* Back link */}
        <Link to="/catalog" className="text-dg-text-tertiary text-[0.8rem] no-underline inline-block mb-6">
          ← catalog
        </Link>

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
                  ? `${data.startYear}–${data.endYear}`
                  : String(data.startYear)
              }
            />
          )}
          {data.countryOfOrigin && <MetaItem label="Country" value={data.countryOfOrigin} />}
          {data.runtimeMinutes && <MetaItem label="Runtime" value={`${data.runtimeMinutes} min`} />}
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
                {link.label} ↗
              </a>
            ))}
          </div>
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
