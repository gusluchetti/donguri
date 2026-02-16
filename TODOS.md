# donguri — todos

Internal reference. One line per feature, sorted by priority.
See `/roadmap` page for the public version.

Live at **donguri.app**.

---

## Deployment checklist — v0.3.0 (seasons + covers)

- [ ] Merge `feat/seasons-and-covers` → `staging` → `main`
- [ ] Deploy (`fly deploy`) — migrations 0006 + 0007 run automatically
- [ ] Backfill locally via `fly proxy` (point `DATABASE_URL` at prod):
  - `bun run src/import/import-all.ts subset.ndjson --full` (media + genre seed + Wikidata seasons)
  - `bun run src/import/import-seasons.ts tvmaze` (gap-fill TV)
  - `bun run src/import/import-seasons.ts anime-offline <file.json>` (gap-fill anime)
  - `bun run src/import/covers.ts` (needs TMDB_API_KEY, TWITCH_CLIENT_ID/SECRET locally)

---

## P0 — Quick wins with big impact

Genre normalization Phase 1 done (PR #22 merged) — 18 main + ~47 sub-genres, ~150 Q-ID mappings. Phases 2–3 remain.

- [ ] **Genre normalization — Phase 2: P279 auto-resolve** — walk Wikidata `subclass of` hierarchy (max 3 hops) for unmapped Q-IDs via batch SPARQL query
- [ ] **Genre normalization — Phase 3: unmapped handling + import integration** — unmapped after 3 hops → drop from display (keep raw Q-IDs in `media_genres`). Integrate resolution into import pipeline, fix `genres.name` to store English labels.
- [ ] **Genre vectors for recommendations** — binary multi-hot encoding against canonical genres. Cosine similarity for content-based filtering. Pre-compute user preference profile from highly-rated items.
- [ ] Genre filter in catalog — filter by main genre and/or sub-genre, scoped by media type where relevant
- [ ] Multi-filter search — combine type + genre + year range + rating

## P1 — Episode data import

`seasons` table and `watched_episodes` JSONB created in P0. Season import scripts implemented.

Data sources:
- **Wikidata** (CC0, primary) — `subset-seasons.ts` extracts Q3464665/Q100269041. `import-seasons.ts wikidata` links to parent series via P179/P1545.
- **TVMaze** (CC BY-SA) — `import-seasons.ts tvmaze` gap-fills TV series without Wikidata seasons.
- **anime-offline-database** (ODbL) — `import-seasons.ts anime-offline` gap-fills anime.

Done:
- [x] `subset.ts` — now captures both media AND season entities in a single pass
- [x] `import-seasons.ts wikidata` — parses P179/P1545/P1113, inserts into `seasons` table
- [x] `import-seasons.ts tvmaze` — API gap-fill for TV series
- [x] `import-seasons.ts anime-offline` — JSON gap-fill for anime
- [x] Seasons displayed on detail pages
- [x] Attribution footer (TMDB, TVMaze, anime-offline-database)

Remaining:
- [ ] Backfill: run all three sources on production data
- [ ] Periodic refresh (monthly) to pick up new seasons and corrections
- [ ] UI: per-episode checkboxes on detail page, "mark through episode X" bulk toggle

## P2 — Auth + onboarding + UX polish

More auth methods = more users. Polish + onboarding = users that stay.

- [ ] **Account linking + AT Protocol migration** — let Google/GitHub users connect a Bluesky account and become PDS-synced
  - **UI**: settings page to initiate Bluesky OAuth, link `did` to existing `users` row, set `authMethod` to `atproto`
  - **Data migration (one-time push)**: on link, bulk-push all `catalog_entries` to PDS via `putCatalogEntry`. Postgres data is authoritative for non-AT users, so no conflict — just push everything.
  - **Post-link**: normal PDS-first flow kicks in. `reconcileUser` on login handles ongoing sync.
  - **Edge case to revisit later**: if a user somehow has a pre-existing PDS collection (e.g., they used Bluesky on another instance first), need a delta/merge strategy — compare `updatedAt` timestamps, keep the newer version per entry. Not needed for v1 since no one can write to PDS without linking first.
  - **Reverse direction**: AT Protocol user linking Google/GitHub is simpler — just populate `googleId`/`githubId` on the `users` row, no data migration needed since PDS remains source of truth.
- [ ] Onboarding flow — pick media types + favorite genres on first login
- [ ] Empty state design — smart suggestions when watchlist is empty
- [ ] Guided tour / tooltips for first-time users
- [ ] Extract reusable component library (buttons, cards, modals, badges — currently inline)
- [ ] Loading states, skeleton screens, toast notifications
- [ ] Responsive design audit (catalog grid, detail pages, forms)
- [ ] Accessibility pass — keyboard nav, screen reader labels, contrast ratios
- [ ] Changelog / "What's new" page — render from a static list (markdown or JSON), link from footer

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

Cover art URLs hotlinked from source CDNs (TMDB, AniList, IGDB). No image storage — `poster_url` stores the hotlink URL directly. Future plan: user-submitted custom posters with community voting once we have 100+ users.

Done:
- [x] Cover art URL resolver (`covers.ts`) with TMDB → AniList → IGDB fallback chain
- [x] Poster display on detail pages (160×240)
- [x] Thumbnail display in catalog list (40×60)

Remaining:
- [ ] Backfill: run cover art import on production data
- [ ] Richer detail pages — directors, cast, studios, episode lists
- [ ] Awards & nominations from Wikidata (P166/P1411) — needs qualifier extraction in parser, new `awards` table, label resolution
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
