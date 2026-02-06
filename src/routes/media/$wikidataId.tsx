import { createFileRoute, Link } from "@tanstack/react-router";
import { getMedia } from "../../lib/media.functions";

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

const TYPE_COLORS: Record<string, string> = {
  movie: "#c17a50",
  tv_series: "#5a8fa0",
  anime: "#c25d7e",
  game: "#6a9f5a",
};

function MediaDetailPage() {
  const data = Route.useLoaderData();
  const typeColor = TYPE_COLORS[data.mediaType] ?? "#776b57";

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
    <div style={styles.container}>
      <div style={styles.inner}>
        {/* Back link */}
        <Link to="/" style={styles.back}>
          ← catalog
        </Link>

        {/* Header */}
        <div style={styles.header}>
          <span
            style={{
              ...styles.typeBadge,
              backgroundColor: typeColor + "20",
              color: typeColor,
              borderColor: typeColor + "40",
            }}
          >
            {data.mediaType === "tv_series"
              ? "TV Series"
              : data.mediaType.charAt(0).toUpperCase() +
                data.mediaType.slice(1)}
          </span>
          <h1 style={styles.title}>{data.title}</h1>
          {data.originalTitle && (
            <p style={styles.originalTitle}>{data.originalTitle}</p>
          )}
        </div>

        {/* Meta info */}
        <div style={styles.metaGrid}>
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
          {data.countryOfOrigin && (
            <MetaItem label="Country" value={data.countryOfOrigin} />
          )}
          {data.runtimeMinutes && (
            <MetaItem label="Runtime" value={`${data.runtimeMinutes} min`} />
          )}
          {data.seasonCount && (
            <MetaItem
              label="Seasons"
              value={String(data.seasonCount)}
            />
          )}
          {data.episodeCount && (
            <MetaItem
              label="Episodes"
              value={String(data.episodeCount)}
            />
          )}
          {data.status && (
            <MetaItem
              label="Status"
              value={data.status.charAt(0).toUpperCase() + data.status.slice(1)}
            />
          )}
          <MetaItem
            label="Popularity"
            value={`${data.sitelinksCount ?? 0} sitelinks`}
          />
        </div>

        {/* Description */}
        {data.description && (
          <p style={styles.description}>{data.description}</p>
        )}

        {/* Genres */}
        {data.genres.length > 0 && (
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Genres</h3>
            <div style={styles.tagList}>
              {data.genres.map((g) => (
                <span key={g.id} style={styles.tag}>
                  {g.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Platforms (games) */}
        {data.platforms.length > 0 && (
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Platforms</h3>
            <div style={styles.tagList}>
              {data.platforms.map((p) => (
                <span key={p.id} style={styles.tag}>
                  {p.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* External links */}
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Links</h3>
          <div style={styles.linkList}>
            {externalLinks.map((link) => (
              <a
                key={link.label}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                style={styles.externalLink}
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
    <div style={styles.metaItem}>
      <span style={styles.metaLabel}>{label}</span>
      <span style={styles.metaValue}>{value}</span>
    </div>
  );
}

// ─── Inline styles ──────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  container: {
    backgroundColor: "#0f0e0c",
    color: "#e8e0d4",
    minHeight: "100vh",
    fontFamily: "'IBM Plex Mono', 'SF Mono', monospace",
  },
  inner: {
    maxWidth: "700px",
    margin: "0 auto",
    padding: "1.5rem",
  },
  back: {
    color: "#776b57",
    fontSize: "0.8rem",
    textDecoration: "none",
    display: "inline-block",
    marginBottom: "1.5rem",
  },
  header: {
    marginBottom: "1.5rem",
  },
  typeBadge: {
    fontSize: "0.65rem",
    fontWeight: 600,
    padding: "0.2rem 0.5rem",
    borderRadius: "2px",
    border: "1px solid",
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    display: "inline-block",
    marginBottom: "0.75rem",
  },
  title: {
    fontSize: "1.6rem",
    fontWeight: 600,
    margin: 0,
    lineHeight: 1.2,
    letterSpacing: "-0.01em",
  },
  originalTitle: {
    fontSize: "1rem",
    color: "#a8997f",
    marginTop: "0.35rem",
  },
  metaGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
    gap: "0.75rem",
    marginBottom: "1.5rem",
    padding: "1rem",
    backgroundColor: "#1a1815",
    borderRadius: "4px",
    border: "1px solid #2e2a21",
  },
  metaItem: {
    display: "flex",
    flexDirection: "column",
    gap: "0.15rem",
  },
  metaLabel: {
    fontSize: "0.65rem",
    color: "#776b57",
    textTransform: "uppercase" as const,
    letterSpacing: "0.08em",
  },
  metaValue: {
    fontSize: "0.85rem",
    color: "#e8e0d4",
  },
  description: {
    fontSize: "0.85rem",
    lineHeight: 1.6,
    color: "#a8997f",
    marginBottom: "1.5rem",
  },
  section: {
    marginBottom: "1.5rem",
  },
  sectionTitle: {
    fontSize: "0.7rem",
    color: "#776b57",
    textTransform: "uppercase" as const,
    letterSpacing: "0.08em",
    marginBottom: "0.5rem",
  },
  tagList: {
    display: "flex",
    flexWrap: "wrap",
    gap: "0.35rem",
  },
  tag: {
    fontSize: "0.75rem",
    padding: "0.2rem 0.5rem",
    backgroundColor: "#242119",
    border: "1px solid #3d3628",
    borderRadius: "3px",
    color: "#a8997f",
  },
  linkList: {
    display: "flex",
    flexWrap: "wrap",
    gap: "0.5rem",
  },
  externalLink: {
    fontSize: "0.75rem",
    color: "#d4a44a",
    textDecoration: "none",
    padding: "0.3rem 0.6rem",
    border: "1px solid #d4a44a30",
    borderRadius: "3px",
    transition: "all 0.15s",
  },
};
