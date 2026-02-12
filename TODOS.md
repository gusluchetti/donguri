# donguri — todos

Internal reference. One line per feature, sorted by priority.
See `ROADMAP.md` for the public version.

Live at **donguri.app**.

---

## P0 — Quick wins with big impact

- [x] Open Graph meta tags — link previews on WhatsApp, Discord, Twitter, iMessage (per-page: title, description, cover art)
- [x] Dark/light theme toggle
- [x] Google OAuth login (biggest reach, lowest friction)
- [x] GitHub OAuth login (dev audience)
- [ ] Define canonical genre list (~25: action, comedy, drama, horror, sci-fi, romance, thriller, fantasy, mystery, documentary, etc.)
- [ ] Build mapping table from Wikidata genre Q-IDs → canonical genres (many-to-one)
- [ ] Migration: reclassify existing `genres` rows using the mapping, drop unmappable junk
- [ ] Genre chips on detail pages become meaningful
- [ ] Genre filter in catalog — filter by canonical genre, not just media type
- [ ] Multi-filter search — combine type + genre + year range + rating

## P1 — Episode tracking

Core feature gap — half the catalog is TV/anime and users can't track "I watched S2E5" yet.

- [ ] TMDB API client setup (free, ~50 req/s, excellent season/episode data)
- [ ] New tables: `seasons` + `episodes` linked to `media`
- [ ] Import pipeline: match by stored TMDB ID → fetch seasons/episodes → insert
- [ ] Backfill existing TV/anime catalog entries (batch job, rate-limited)
- [ ] UI: season selector + per-episode checkboxes on detail page
- [ ] Per-episode watched state in `catalog_entries` (jsonb or `episode_progress` table)

## P2 — Auth + onboarding + UX polish

More auth methods = more users. Polish + onboarding = users that stay.

- [x] Unified user model — all auth methods → same `users` table, AT sync opt-in
- [ ] Account linking UI — settings page to connect additional providers (Google/GitHub/Bluesky) to an existing account. Email auto-link only works between Google↔GitHub; Bluesky has no email so needs explicit linking.
- [ ] Onboarding flow — pick media types + favorite genres on first login
- [ ] Empty state design — smart suggestions when watchlist is empty
- [ ] Guided tour / tooltips for first-time users
- [ ] Extract reusable component library (buttons, cards, modals, badges — currently inline)
- [ ] Loading states, skeleton screens, toast notifications
- [ ] Responsive design audit (catalog grid, detail pages, forms)
- [ ] Accessibility pass — keyboard nav, screen reader labels, contrast ratios

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
