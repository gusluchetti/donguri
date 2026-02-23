# roadmap

Your personal catalog for movies, TV shows, anime, and games.
Track what you've watched, what you're playing, and what's next.

## what we believe

1. Your media history is yours. Not ours, not a company's. AT Protocol means you can leave anytime and take everything with you.
2. Tracking should feel like maintaining a personal library, not filling out spreadsheets. Every interaction should have weight.
3. Social features exist to help you discover, not to manufacture engagement. No algorithmic feeds. No infinite scroll.
4. Open protocols over closed platforms. Always. Even when it's harder.

## Available now

- **100,000+ titles** — movies, TV shows, anime, and games, all searchable
- **Rich detail pages** — genres, platforms, links to IMDb, TMDB, MAL, AniList, IGDB
- **Cover art** — posters on detail pages and catalog thumbnails
- **Season and episode data** — per-season episode counts sourced from Wikidata, TVMaze, and anime-offline-database
- **Track your collection** — status labels per media type, rate 0–100, mark favorites, count rewatches
- **Sign in with Bluesky, Google, or GitHub** — Bluesky syncs to your PDS
- **Genre tags** — hierarchical display with sub-genres grouped under parent categories
- **Dark and light themes** — toggle or follow system preference
- **Per-episode tracking** — mark individual episodes watched, season by season, with bulk "mark through" toggle
- **Keyboard shortcuts** — j/k navigation, quick-add (a), search (/), open (l/→), back (h/←), filter sequences, help overlay (?)
- **Fast and cached** — local cache first, background sync

<!-- All shipped. Season data: Wikidata (primary) + TVMaze CC BY-SA (TV gap-fill) + anime-offline-database ODbL (anime gap-fill). Cover art: TMDB → AniList → IGDB hotlinked CDN URLs. -->

## Next up

- **Import from MyAnimeList** — upload your MAL XML export to bring your anime list into donguri
- **Anime catalog improvements** — better classification for anime titles and broader external ID coverage
- ~~**Per-episode tracking** — mark individual episodes watched, season by season~~
- **Filter by genre** — browse the catalog by genre, not just media type

<!-- P0: MAL XML import — parse <myanimelist><anime> entries, match via malId column, map statuses (Watching/Completed/On-Hold/Dropped/Plan to Watch → donguri equivalents), map scores 1-10 → 0-100 ratings, import watched episode counts. UI: file upload on settings or dedicated import page. First in a series of import sources. -->
<!-- P0: Anime misclassification — wrong Q-ID in _types.ts: ONA was Q1127759 (cognitive bias), correct is Q1047299 (original net animation). One-line fix. -->
<!-- P0: Per-episode UI — checkboxes on detail page, "mark through episode X" bulk toggle. seasons table + watched_episodes JSONB already exist. -->
<!-- P0: Genre filter — add genre facet to catalog search. canonical_genres + genre_mappings tables ready. No Phase 2-3 normalization needed for basic filtering. -->

## Planned

- **Multi-filter search** — combine type, genre, year range, and rating in one query
- **Notes** — add personal notes to any title in your collection
- **Account linking** — connect Google/GitHub accounts to Bluesky for data portability
- **Import from Letterboxd and Trakt** — expand import sources beyond MAL
- **Achievements and badges** — unlock milestones like completing a franchise or exploring new genres
- **Monetization** — free and paid tiers to sustain development
- **Onboarding** — pick your media types and favorite genres on first login

<!-- Multi-filter: type + genre + year + rating combined query against catalog. Needs genre filter (above) first. -->
<!-- Notes: new text column or table on catalog_entries. Simple textarea on detail page. -->
<!-- Account linking: let Google/GitHub users connect Bluesky, bulk-push catalog_entries to PDS. Reverse (AT→Google/GitHub) just populates googleId/githubId. -->
<!-- Letterboxd: CSV export import. Trakt: API or CSV. Match via TMDB/IMDB IDs. -->
<!-- Achievements: derived from tracking data. Tiered bronze/silver/gold. Genre exploration badges, milestone markers (100 movies, first anime completed), completionist tracker. -->
<!-- Monetization: Lemon Squeezy (MoR, handles tax). Free vs paid tier candidates: stats, export, unlimited lists, themes, badges. subscription_tier column on users. USD/BRL regional pricing. -->
<!-- Onboarding: first-login flow to pick media types + genres. Empty state design with smart suggestions. -->

## On the horizon

- **Public profiles** — show off your collection and stats, control what's visible
- **Stats and year-in-review** — genre breakdowns, average ratings, habits, and an annual summary
- **Activity feed** — see what the people you follow are watching and rating
- **Community ratings** — aggregate scores from donguri users alongside external ratings
- **Lists and collections** — curate and share themed lists
- **Recommendations** — discover titles based on your history and taste
- **Data export** — download your entire collection as a file, anytime
- **Account deletion** — full data removal with one click
- **Gamification** — tracking streaks, leaderboards, seasonal events, and discovery challenges
- **"Currently watching" shelf** — surface in-progress titles front and center on your homepage
- **Franchise grouping** — link sequels, prequels, and spinoffs as a navigable tree
- **Where to watch** — streaming availability by region
- ~~**Keyboard shortcuts** — j/k navigation, quick-rate, quick-add~~
- **Richer detail pages** — directors, cast, studios, awards

<!-- Data safety: account deletion must cascade (user → catalog_entries → revoke AT tokens). Export as JSON/CSV. Non-negotiable before paid tier. -->
<!-- Community: public profiles at /user/{handle}, privacy controls, AT Protocol identity display. Personal stats dashboard. In-app feedback → GitHub Issues API. -->
<!-- Gamification detail: daily/weekly streaks, genre exploration badges, expertise tiers per genre ("Sci-Fi Scholar"), year-in-review Wrapped-style, curated quests ("Studio Ghibli Journey"), seasonal events (horror October, romance February), discovery roulette from backlog. Opt-in leaderboards among mutuals. -->
<!-- Visual catalog remaining: directors/cast/studios from Wikidata, awards P166/P1411 (needs qualifier extraction + new awards table), inline external ratings. -->
<!-- Franchise grouping: Wikidata P179 (part of series) + P155/P156 (follows/followed by). -->
<!-- Where to watch: JustWatch API for streaming availability. -->
