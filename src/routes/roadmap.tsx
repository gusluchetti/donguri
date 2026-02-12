import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/roadmap")({
  head: () => ({
    meta: [{ title: "Roadmap — donguri" }],
  }),
  component: RoadmapPage,
});

const SECTIONS = [
  {
    title: "Available now",
    items: [
      ["100,000+ titles", "movies, TV shows, anime, and games, all searchable and filterable"],
      ["Rich detail pages", "genres, platforms, and direct links to IMDb, TMDB, MAL, AniList, IGDB, and more"],
      ["Track everything", "watchlist, status (watching, completed, dropped, paused, plan to watch), ratings, episode progress, and personal notes"],
      ["One-click add", "see something interesting? Add it to your collection instantly"],
      ["Sign in with Bluesky", "your identity, your data, your server. Portable and private by design"],
      ["Blazing fast", "pages load instantly from local cache, and tabs prefetch in the background so nothing ever feels slow"],
    ],
  },
  {
    title: "Coming soon",
    items: [
      ["Episode tracking", "mark individual episodes as watched, season by season. Never lose your place in a long-running series again"],
      ["Better genres", "cleaner, more useful genre labels and the ability to filter your catalog by genre"],
      ["Cover art and posters", "beautiful visuals for every title"],
      ["More ways to sign in", "Google and GitHub login for those who prefer it (Bluesky still recommended for full data portability)"],
      ["Import your data", "bring your lists from MyAnimeList, Letterboxd, Trakt, and more. No starting from scratch"],
      ["Send us feedback", "report bugs and suggest features directly from the app"],
    ],
  },
  {
    title: "On the horizon",
    items: [
      ["Your profile, your way", "a public profile page showing off your collection, stats, and taste. You control what's visible"],
      ["Achievements", "unlock badges for milestones like watching every Studio Ghibli film, exploring new genres, or completing a long-running series. Bronze, silver, and gold tiers for the dedicated"],
      ["Streaks and stats", "see your watching habits, genre breakdown, average ratings, and a year-in-review summary"],
      ["Activity feed", "see what the people you follow are watching, rating, and discovering"],
      ["Community ratings", "scores from the donguri community alongside the usual external ratings"],
      ["Lists and collections", 'curate and share themed lists like "best sci-fi of 2024" or "comfort watches"'],
      ["Recommendations", "discover new titles based on your history and taste"],
      ["Export your data", "download your entire collection as a file, anytime. Your data is always yours to take"],
      ["Multiple languages", "browse the catalog in your language"],
    ],
  },
  {
    title: "What we believe",
    items: [
      ["Your data belongs to you.", "Bluesky users sync to their own personal server — portable, no lock-in. No account required to just browse."],
      ["The catalog is for everyone. Your collection is yours.", "The catalog is open, sourced from Wikidata. Your watchlist, ratings, and notes are private."],
      ["Fast by default.", "Everything loads from local cache first. Changes sync quietly in the background."],
      ["No dark patterns.", "Achievements and streaks reward genuine activity. We'll never manufacture urgency or guilt you into opening the app."],
    ],
  },
] as const;

function RoadmapPage() {
  return (
    <div className="bg-dg-bg text-dg-text min-h-screen font-mono">
      <div className="max-w-[700px] mx-auto px-4 py-10 sm:px-6 sm:py-16">
        <h1 className="text-[1.6rem] sm:text-[2rem] font-semibold -tracking-[0.02em] mb-2">
          <span className="text-dg-accent">roadmap</span>
        </h1>
        <p className="text-dg-text-secondary text-[0.9rem] leading-relaxed mb-6 sm:mb-8">
          Your personal catalog for movies, TV shows, anime, and games. Track
          what you've watched, what you're playing, and what's next — all in one
          place. Sign in with Bluesky and your data stays yours, synced to your
          own server. No account needed to browse.
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
