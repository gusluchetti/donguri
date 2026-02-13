import { createFileRoute } from "@tanstack/react-router";
import { ogTags, pageTitle } from "../lib/og";

export const Route = createFileRoute("/roadmap")({
  head: () => ({
    meta: [
      { title: pageTitle("roadmap — donguri") },
      {
        name: "description",
        content:
          "See what's coming next for donguri — episode tracking, genre filtering, cover art, and more.",
      },
      ...ogTags({
        title: "Roadmap — donguri",
        description:
          "See what's coming next for donguri — episode tracking, genre filtering, cover art, and more.",
        path: "/roadmap",
      }),
    ],
  }),
  component: RoadmapPage,
});

const SECTIONS = [
  {
    title: "Available now",
    items: [
      ["100,000+ titles", "movies, TV shows, anime, and games, all searchable and filterable"],
      [
        "Rich detail pages",
        "genres, platforms, and direct links to IMDb, TMDB, MAL, AniList, IGDB, and more",
      ],
      [
        "Track your collection",
        "smart status labels per media type (Watching for TV, Playing for games), rate 0\u2013100, mark favorites, and count rewatches",
      ],
      ["One-click add", "see something interesting? Add it to your collection instantly"],
      [
        "Sign in with Bluesky, Google, or GitHub",
        "Bluesky syncs to your own PDS. Google and GitHub for quick access",
      ],
      [
        "Favorites and rewatch tracking",
        "star your favorites and keep count of rewatches, replays, and rewatches across all media types",
      ],
      [
        "Dark and light themes",
        "toggle between dark and light mode, or follow your system preference",
      ],
      [
        "Fast and cached",
        "pages load instantly from local cache, with background sync to keep everything up to date",
      ],
    ],
  },
  {
    title: "Coming soon",
    items: [
      [
        "Per-episode tracking",
        "mark individual episodes as watched, season by season. Never lose your place in a long-running series",
      ],
      ["Genre filtering", "filter the catalog by genre, not just media type"],
      ["Cover art and posters", "visuals for every title in the catalog and on detail pages"],
      ["Notes", "add personal notes to any title in your collection"],
      ["Import your data", "bring your lists from MyAnimeList, Letterboxd, Trakt, and more"],
    ],
  },
  {
    title: "On the horizon",
    items: [
      ["Public profiles", "show off your collection, stats, and taste. You control what's visible"],
      [
        "Achievements",
        "unlock badges for milestones like watching every Studio Ghibli film or completing a long-running series",
      ],
      [
        "Stats and year-in-review",
        "genre breakdowns, average ratings, watching habits, and an annual summary",
      ],
      ["Activity feed", "see what the people you follow are watching, rating, and discovering"],
      ["Community ratings", "scores from the donguri community alongside external ratings"],
      [
        "Lists and collections",
        'curate and share themed lists like "best sci-fi of 2024" or "comfort watches"',
      ],
      ["Recommendations", "discover new titles based on your history and taste"],
      ["Data export", "download your entire collection as a file, anytime"],
    ],
  },
  {
    title: "What we believe",
    items: [
      [
        "Your data belongs to you.",
        "Bluesky users sync to their own personal server — portable, no lock-in.",
      ],
      [
        "Open catalog, private collection.",
        "The catalog is sourced from Wikidata. Your watchlist, ratings, and progress are yours alone.",
      ],
      [
        "Fast by default.",
        "Everything loads from local cache first. Changes sync quietly in the background.",
      ],
      ["No dark patterns.", "We'll never manufacture urgency or guilt you into opening the app."],
    ],
  },
] as const;

function RoadmapPage() {
  return (
    <div className="bg-dg-bg text-dg-text min-h-screen font-mono">
      <div className="max-w-[1000px] mx-auto px-4 py-10 sm:px-6 sm:py-16">
        <h1 className="text-[1.6rem] sm:text-[2rem] font-semibold -tracking-[0.02em] mb-2">
          <span className="text-dg-accent">roadmap</span>
        </h1>
        <p className="text-dg-text-secondary text-[0.9rem] leading-relaxed mb-6 sm:mb-8">
          Your personal catalog for movies, TV shows, anime, and games. Track what you've watched,
          what you're playing, and what's next — all in one place. Sign in with Bluesky and your
          data stays yours, synced to your own server.
        </p>

        <div className="flex flex-col gap-6">
          {SECTIONS.map((section) => (
            <div key={section.title}>
              <h2 className="text-[0.8rem] uppercase tracking-wider mb-2 text-dg-text-secondary">
                {section.title}
              </h2>
              <div className="border border-dg-border-subtle rounded bg-dg-surface divide-y divide-dg-border-subtle">
                {section.items.map(([label, desc]) => (
                  <div key={label} className="px-3 sm:px-4 py-3 sm:py-2.5">
                    <span className="text-[0.85rem] text-dg-text font-semibold">{label}</span>
                    <span className="text-[0.85rem] text-dg-text-secondary"> — {desc}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
