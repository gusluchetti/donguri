# donguri — todos

Internal reference. One line per feature, sorted by priority.
See `ROADMAP.md` for the public version.

Live at **donguri.app**.

---

## P0 — Quick wins with big impact

- [ ] **Unified status vocab + data model overhaul** — schema-level changes, do in one migration batch
  - **Status enum** → neutral DB values: `planned`, `in_progress`, `on_hold`, `completed`, `dropped`, `mastered`
    - Movies: only `planned`, `completed`, `dropped` shown in UI (no "watching" a movie)
    - Games: `mastered` shown as "100%" — hidden for all other types
    - `in_progress` / `on_hold` hidden for movies — valid in DB but not offered in UI
    - Migration: `watching` → `in_progress`, `plan_to_watch` → `planned`, `paused` → `on_hold`
  - **New columns on `catalog_entries`**:
    - `is_favorite` boolean DEFAULT false
    - `replay_count` integer DEFAULT 0 — only incrementable from `completed` status, no separate "revisiting" status
    - `completed_at` timestamp — set when status changes to `completed`, null otherwise (for stats, year-in-review, recommendation freshness)
    - `watched_episodes` JSONB — per-episode checkboxes: `{"1": [1,2,3,4,5,6,7], "2": [1,2,3]}` (season → watched ep numbers)
    - Keep `episode_progress` integer as denormalized total for quick display/sorting
  - **New `seasons` table**: `media_id` FK, `season_number`, `episode_count`, `title` (optional), `data_source` enum (`wikidata`/`tvmaze`/`anime_offline_db`), unique on (media_id, season_number)
  - **New column on `media`**: `tvmaze_id` text + index — Wikidata P4372, for TVMaze season import matching
  - **Display label map** in `media-types.ts` keyed by media type — returns null for hidden combos (e.g. movie + in_progress)
    - Movie: Planned → "Plan to Watch", Completed → "Watched", Dropped → "Dropped"
    - TV/Anime: Planned/Watching/Paused/Completed/Dropped per type
    - Game: adds "Playing", "Plan to Play", "100%"
    - Book/Manga/Music: ready in map for future media types
    - `replay_count` display: "Watched x3" / "Replayed x2" / "Reread x2" per type
  - **AT Protocol Lexicon update** — add `isFavorite`, `replayCount`, `watchedEpisodes` to catalog entry record schema; update sync.ts read/write mappers
  - **Import parser** — extract P4372 (TVMaze ID) alongside existing 8 external IDs
- [ ] **Genre normalization (two-tier)** — current `genres.name` stores raw Wikidata Q-IDs ("Q18518" instead of "Action")
  - **Schema**: self-referencing `canonical_genres` table: `slug`, `name`, `parent_id` (NULL = main genre, FK = sub-genre), `sort_order`
  - **Mapping table**: `genre_mappings` — `wikidata_id` → `canonical_genre_id` (many-to-many), `source` (`manual`/`p279_auto`)
  - **Main genres (~18)**: Action, Adventure, Comedy, Crime, Documentary, Drama, Family, Fantasy, Historical, Horror, Music, Mystery, Romance, Sci-Fi, Sports, Thriller, War, Western
  - **Sub-genres (~47)**, each parented to a main genre:
    - Action → Martial Arts, Mecha, Superhero
    - Adventure → Survival, Exploration
    - Comedy → Parody, Satire, Romantic Comedy
    - Crime → Noir, Heist
    - Drama → Slice of Life, Coming of Age, Tragedy
    - Fantasy → Dark Fantasy, High Fantasy, Isekai, Urban Fantasy, Mahou Shoujo
    - Historical → Samurai, Medieval
    - Horror → Psychological Horror, Slasher, Gothic, Body Horror, Survival Horror
    - Mystery → Detective
    - Sci-Fi → Cyberpunk, Space Opera, Dystopian, Post-Apocalyptic, Time Travel
    - Thriller → Psychological Thriller, Espionage
    - Game mechanics → RPG, Platformer, FPS, TPS, Strategy, Puzzle, Simulation, Racing, Fighting, Visual Novel
    - Floating → Musical (pairs with any main genre)
  - **Mapping rules**: sub-genre implies its parent — "Romantic Comedy" maps to Main: Comedy | Sub: Romantic Comedy, NOT Comedy + Romance. Avoids repetition. Compound Wikidata genres (e.g., "comedy horror" Q108466999) map to multiple main genres only when no sub-genre captures the combo.
  - **Mapping strategy (hybrid)**:
    - Phase 1: Manual core map (~100-150 most common Wikidata Q-IDs). Covers ~90% of assignments.
    - Phase 2: P279 auto-resolve — walk Wikidata `subclass of` hierarchy (max 3 hops) for unmapped Q-IDs. Batch SPARQL query.
    - Phase 3: Unmapped after 3 hops → drop from display. Keep raw Q-IDs in `media_genres` for traceability.
  - **Import pipeline**: after `ensureGenres()`, resolve Q-IDs via mapping → populate `media` ↔ `canonical_genres` links. Fix `genres.name` to store English labels (fetch from Wikidata).
  - **Genre vectors for recommendations**: binary multi-hot encoding against canonical genres. Cosine similarity for content-based filtering. Pre-compute user preference profile from highly-rated items.
- [ ] Genre chips on detail pages — show main + sub-genre with hierarchy (e.g., "Sci-Fi > Cyberpunk"), not Q-IDs
- [ ] Genre filter in catalog — filter by main genre and/or sub-genre, scoped by media type where relevant
- [ ] Multi-filter search — combine type + genre + year range + rating

## P1 — Episode data import

`seasons` table and `watched_episodes` JSONB created in P0. This section is about populating season data.

**Open data only.** No TMDB (proprietary, commercial license issues). Wikidata is always the primary source.

Data sources (researched Feb 2026):
- **Wikidata** (CC0, primary) — season entities are Q3464665 (TV season) and Q100269041 (anime season). ~36% have episode counts, but we should extract everything available. Expand the dump filter in `subset.ts` to also capture season entities, then link to parent series via P179 (part of series) with P1545 ordinal qualifier. Episode counts via P1113 on season entities.
- **TVMaze** (CC BY-SA) — gap-fill for TV series where Wikidata seasons are missing. Per-season episode counts, explicit caching allowed, `/updates/shows` for incremental sync. Attribute with footer link.
- **anime-offline-database** (ODbL) — gap-fill for anime. 40k+ entries, weekly JSON dump, match via MAL/AniList IDs. Total episode count only (no per-season), but most anime don't have Western-style seasons → single "Season 1" with all episodes.

Pipeline:
- [ ] Expand `subset.ts` filter to capture Q3464665 + Q100269041 (season entities) alongside media entities
- [ ] Expand `parser.ts` to extract season data: P179 (parent series link), P1545 (season ordinal), P1113 (episode count), P527 (has parts / episodes)
- [ ] Import pipeline: link season entities to parent `media` rows via wikidata_id → insert into `seasons` table with `data_source: "wikidata"`
- [ ] TVMaze gap-fill script — for TV series with no Wikidata seasons, match by `tvmaze_id` or IMDB ID → fetch `/shows/{id}/seasons` → insert with `data_source: "tvmaze"`
- [ ] anime-offline-database gap-fill — download weekly JSON, match by `mal_id`/`anilist_id` → insert single season per anime with total episode count, `data_source: "anime_offline_db"`
- [ ] Backfill: run Wikidata season import first, then gap-fill with TVMaze + anime-offline-db
- [ ] Periodic refresh (monthly) to pick up new seasons and corrections
- [ ] UI: season accordion + per-episode checkboxes on detail page, "mark through episode X" bulk toggle
- [ ] Attribution: TVMaze link + ODbL notice in footer/about page (Wikidata is CC0, no attribution required)

## P2 — Auth + onboarding + UX polish

More auth methods = more users. Polish + onboarding = users that stay.

- [ ] Account linking UI — settings page to connect additional providers (Google/GitHub/Bluesky) to an existing account. Email auto-link only works between Google↔GitHub; Bluesky has no email so needs explicit linking.
- [ ] Onboarding flow — pick media types + favorite genres on first login
- [ ] Empty state design — smart suggestions when watchlist is empty
- [ ] Guided tour / tooltips for first-time users
- [ ] Extract reusable component library (buttons, cards, modals, badges — currently inline)
- [ ] Loading states, skeleton screens, toast notifications
- [ ] Responsive design audit (catalog grid, detail pages, forms)
- [ ] Accessibility pass — keyboard nav, screen reader labels, contrast ratios
- [ ] Changelog / "What's new" page — render from a static list (markdown or JSON), link from footer
- [ ] Version display in footer or settings — semver from `package.json` injected at build time

## P3 — Monetization

Target: 10 paying users. Get the rails in once the app is worth charging for.

Platform: **Lemon Squeezy** (MoR, handles tax globally, 5%+$0.50/tx, regional pricing built-in).

- [ ] Define free vs paid tiers (candidates: stats, export, unlimited lists, themes, badges)
- [ ] Lemon Squeezy account + product setup with USD/BRL regional pricing
- [ ] `subscription_tier` column on `users` table
- [ ] Checkout flow (hosted or embedded)
- [ ] Webhook handler for payment lifecycle events
- [ ] Feature gating middleware based on subscription status
- [ ] Billing management page (upgrade, cancel, invoices)

## P4 — Make the catalog visual

Cosmetic but impactful — cover art makes the product feel real.

- [ ] Cover art + posters via TMDB/IGDB APIs (match by stored external IDs)
- [ ] Richer detail pages — directors, cast, studios, episode lists
- [ ] Inline external ratings on detail pages (IMDb, MAL scores)

## P5 — Data safety

- [ ] **Account deletion** — full cascade: delete user row + all catalog_entries + revoke AT Protocol tokens for Bluesky users. Settings page button with confirmation. Non-negotiable.
- [ ] Export user data as JSON/CSV
- [ ] Backup reminders for non-AT users

## P6 — Feedback + community

- [ ] In-app feedback form → GitHub Issues API (server fn, rate-limited, auto-labeled)
- [ ] Public profile pages — `/user/{handle}`, avatar, bio, top stats
- [ ] Privacy controls — choose what's visible on your profile
- [ ] AT Protocol identity display on profiles
- [ ] Personal stats dashboard — genre distribution, avg rating, completion rate
- [ ] Activity feed — see what people you follow are tracking

## P7 — Gamification + retention

- [ ] Achievement system — unlock conditions derived from tracking data
- [ ] Achievement badges rendered on profile cards
- [ ] Tiered achievements (bronze / silver / gold)
- [ ] Unlock notifications (toast or inbox)
- [ ] Daily/weekly tracking streaks
- [ ] Year-in-review (Wrapped-style annual summary)
- [ ] Opt-in leaderboards

## Backlog — no priority yet

- [ ] Import from MAL, Letterboxd, Trakt (CSV/API ingest)
- [ ] Offline mutations — queue writes locally, sync when reconnected
- [ ] Community ratings — aggregate scores across donguri users
- [ ] Custom lists and collections (themed curation, shareable)
- [ ] Recommendation engine (collaborative filtering on tracking history)
- [ ] Multi-language UI + catalog titles (Wikidata already has translations)
- [ ] DLC/expansion tracking for games via IGDB
- [ ] Screenshot capture in feedback form (html2canvas)

## Ideas

### UX & catalog

- [ ] "Currently watching" shelf on homepage — surface in-progress titles front and center
- [ ] Quick-rate from catalog view — star rating inline without opening detail page
- [ ] Trending / recently added section — highlight new entries so the catalog feels alive
- [ ] "Where to watch" links — JustWatch API for streaming availability by region
- [ ] Franchise grouping — link sequels/prequels/spinoffs as a navigable tree
- [ ] Backlog time estimate — "you have 47 hours of unwatched content" stat on dashboard
- [ ] Keyboard shortcuts — j/k navigation, s to add, r to rate
- [ ] RSS/Atom feed per user — follow someone's activity without an account

### Gamification — progress & achievements

- [ ] Watching streaks — daily/weekly consistency rewards with streak counters
- [ ] Genre exploration badges — unlock for watching across genres, decades, or countries
- [ ] Milestone markers — "100 movies watched", "first anime completed", "500 hours logged"
- [ ] Completionist tracker — finish entire franchises or director filmographies
- [ ] Expertise tiers per genre — watch enough sci-fi and become a "Sci-Fi Scholar"
- [ ] Overall level / rank — "cinephile level" or "otaku rank" from accumulated activity

### Gamification — social (AT Protocol native)

- [ ] Achievement feed — post unlocks as atproto records visible to followers
- [ ] Watch challenges — issue dares to friends ("5 horror films this October")
- [ ] Follower leaderboards — compare watch time, genre diversity, streak length among mutuals
- [ ] Shared watchlists — collaborative lists where groups race to finish together
- [ ] Review reputation — upvotes on reviews boost a credibility score

### Gamification — discovery & events

- [ ] Curated quests — "Studio Ghibli Journey", "Best Picture Winners" with progress bars
- [ ] Seasonal events — horror in October, romance in February, anime in spring
- [ ] Discovery roulette — random pick from your backlog with bonus XP for watching it

### Stats & visualization

- [ ] Year-in-review / Wrapped — genres, hours, favorite directors, top ratings
- [ ] Heatmap calendar — daily watch activity (GitHub contribution graph style)
- [ ] Taste radar chart — genre distribution over time, compare with friends

---

## Principles

- Your data, your choice — AT Protocol for portability, alternatives for convenience
- Catalog is shared, tracking is personal
- Offline-first — reads from cache, writes sync in background
- Earn engagement, don't manufacture it — no dark patterns, no FOMO
- Regional fairness — pricing reflects local purchasing power
