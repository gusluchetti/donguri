# donguri — todos

Working document for planning and prioritization.
See `ROADMAP.md` for the user-facing version.

---

## P0 — Data enrichment

Critical foundation work — the catalog needs real genres and per-episode tracking before other features can build on top.

### Episode-per-season data

Current state: we store total episode count but not per-season breakdowns. Users can't track "I've seen S2E5" — only a flat episode number.

Source options:
- **TMDB API** (recommended) — free, excellent season/episode data for TV + anime, well-documented. Rate limit: ~50 req/s with API key.
- **TVDB** — good data but requires paid subscription for API access.
- **AniList/Jikan (MAL)** — good for anime specifically, could supplement TMDB.
- **IGDB** — no episode concept, but useful for DLC/expansion tracking on games (future).

### TODO

- [ ] TMDB API key + client setup
- [ ] New tables: `seasons` (media_id, season_number, episode_count, air_date) and `episodes` (season_id, episode_number, title, air_date, runtime)
- [ ] Import pipeline: match media by TMDB external ID (already stored) -> fetch season/episode data -> insert
- [ ] Backfill existing catalog (batch job with rate limiting)
- [ ] UI: season selector on detail page, per-episode checkboxes for tracking
- [ ] Update `catalog_entries` to support per-episode watched state (jsonb array or separate `episode_progress` table)

### Genre normalization

Current state: genres come from Wikidata as raw tags (Q-IDs mapped to labels). They're noisy and inconsistent — "anime television series" is a genre alongside "drama".

### TODO

- [ ] Define a canonical genre list (~20-30 genres: action, comedy, drama, horror, sci-fi, romance, thriller, fantasy, mystery, documentary, etc.)
- [ ] Build mapping from Wikidata genre Q-IDs to canonical genres (many-to-one)
- [ ] Migration: reclassify existing `genres` table entries using the mapping
- [ ] Drop unmappable junk genres or bucket them into "other"
- [ ] UI: genre chips on detail pages become meaningful and filterable
- [ ] Catalog filtering by canonical genre (not just media type)

---

## P1 — Monetization

Make it feel like a real product. Accept payments, support regional pricing (USD + BRL).

### Payment platform decision

**Lemon Squeezy** (recommended) — Merchant of Record model:
- Handles all tax compliance globally, including Brazil's 2026 CBS/IBS VAT reform
- Built-in regional pricing (USD, BRL, etc.)
- 5% + $0.50/tx — higher than Stripe but zero tax ops burden
- Fast integration (~2 hours), good docs, Node.js SDK
- Solo-dev friendly — no tax entity registration needed

**Paddle** — same MoR model, same fees, supports Pix (Brazil's dominant payment method). Worth considering if Brazilian users need Pix specifically.

**Stripe** — 4% fees but you handle all tax compliance yourself. Only makes sense if volume justifies hiring tax help. Not recommended for now.

### What to monetize (TBD)

- Define free tier vs. paid tier
- Candidates for paid: statistics, import/export, unlimited lists, custom themes, achievement badges
- Consider "supporter" tier — pay what you want, cosmetic perks
- BRL pricing should reflect purchasing power, not just fx conversion

### TODO

- [ ] Create Lemon Squeezy account, configure products + regional pricing
- [ ] Add `subscription_status` / `subscription_tier` to `users` table
- [ ] Checkout flow (hosted or embedded)
- [ ] Webhook handler for payment lifecycle events
- [ ] Feature gating based on subscription status
- [ ] Billing management page (upgrade, cancel, invoices)

---

## P2 — User feedback pipeline

Get feedback flowing before scaling features.

### Approach: feedback form -> GitHub Issues API

- Floating feedback button in the app
- Server function creates issues via `POST /repos/{owner}/{repo}/issues`
- Fine-grained PAT with Issues write scope, stored as `GITHUB_FEEDBACK_TOKEN` env var
- Rate-limit: 5 submissions/hour/IP, or require auth
- Auto-label issues (bug, feature-request, feedback)
- Zero external dependencies

### TODO

- [ ] Feedback form component (title, description, category selector)
- [ ] TanStack Start server function for GitHub Issues API
- [ ] `GITHUB_FEEDBACK_TOKEN` env var setup
- [ ] Rate limiting (Postgres counter or in-memory)
- [ ] Success/error UI states
- [ ] Auto-labels on created issues

### Later

- Screenshot capture (HTML2Canvas) for visual bug reports
- Upgrade to GitHub App if PAT rate limits matter
- Public "known issues" page sourcing from open issues

---

## P3 — Onboarding and UX

Iterative — ships continuously alongside other work.

### Auth expansion

- [ ] Google OAuth login
- [ ] GitHub OAuth login
- [ ] Clear messaging: AT Protocol recommended (portability), alternatives available
- [ ] Unified user model — all auth methods -> same `users` table, AT sync is opt-in

### First-run experience

- [ ] Onboarding flow — pick media types, favorite genres
- [ ] Empty state design — suggestions when watchlist is empty
- [ ] Subtle guided tour or tooltips for first interaction

### Data richness

- [ ] More metadata on detail pages (directors, cast, studios, episode lists)
- [ ] Cover art / posters (TMDB API, IGDB API)
- [ ] Inline external ratings (IMDb, MAL scores)
- [ ] Multi-genre filtering, tag-based discovery

### Data safety

- [ ] Export data (JSON/CSV)
- [ ] Backup reminders for non-AT users
- [ ] Account deletion flow (GDPR-style)

### Styling and polish

- [ ] Design system review — spacing, typography, component consistency
- [ ] Transitions, loading states, toast notifications
- [ ] Accessibility audit — keyboard nav, screen readers, contrast
- [ ] Dark/light theme toggle

---

## P4 — Profiles and gamification

Retention through rewarding genuine activity.

### Public profiles

- [ ] `/user/{handle}` profile page
- [ ] AT Protocol identity display
- [ ] Privacy controls — choose what's public
- [ ] Profile card — avatar, bio, top-level stats

### Achievements

- [ ] Achievement system with unlock conditions from tracking data
- [ ] Examples:
  - Studio Ghibli Pilgrim — watch 10 Ghibli films
  - Genre Explorer — track titles in 5+ genres
  - Century Club — rate 100 titles
  - Completionist — finish every season of a long-running series
  - Retro Gamer — play 10 pre-2000 games
  - World Cinema — watch films from 10+ countries
  - Speed Runner — complete a game within a week of adding it
  - Binge Watcher — complete a full series in under 48 hours
- [ ] Achievement badges on profile
- [ ] Unlock notifications
- [ ] Tiered achievements (bronze/silver/gold)

### Streaks and stats

- [ ] Daily/weekly tracking streaks
- [ ] Personal stats dashboard — genre distribution, avg rating, completion rate
- [ ] Year-in-review (Spotify Wrapped style)
- [ ] Opt-in leaderboards

---

## Backlog

Carried over from current roadmap — valuable but not prioritized yet.

- Import from other services (MAL, Letterboxd, Trakt)
- Offline mutations (queue writes, sync when online)
- Activity feed (what people you follow are watching)
- Community ratings (aggregate donguri network scores)
- Lists and collections (themed curation)
- Recommendations (based on history and taste)
- Multi-language support (Wikidata has multilingual titles)
- Production deployment (custom domain, CI/CD)

---

## Principles

- Your data, your choice — AT Protocol for portability, alternative auth for convenience
- Catalog is shared, tracking is personal
- Offline-first — reads from cache, writes sync in background
- Earn engagement, don't manufacture it — no dark patterns, no FOMO
- Regional fairness — pricing reflects local purchasing power
