# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Reference `ROADMAP.md` for project priorities, planned features, and technical context.** HTML comments in that file contain implementation details. When unsure what to work on or how something fits, check there first.

## Build and Development Commands

**Runtime**: Bun (dev/build), Fly.io (production)

```bash
# ─── First-time setup ───────────────────────────────────────────────────────
cp .env.example .env          # Edit with your secrets
bun install
bun run dev                   # Starts local Postgres + Vite dev server

# On first run, push the schema to the local DB:
bun run db:push

# ─── Development ─────────────────────────────────────────────────────────────
bun run dev                   # Local Postgres (Docker) + cloudflared tunnel + Vite

# ─── Local Database (Docker Compose) ────────────────────────────────────────
bun run db:up                 # Start local Postgres (idempotent)
bun run db:down               # Stop local Postgres (data preserved)
bun run db:reset              # Destroy and recreate local Postgres (data lost)

# ─── Database commands (Drizzle + Postgres) ──────────────────────────────────
bun run db:generate           # Generate migrations from schema
bun run db:migrate            # Run pending migrations
bun run db:push               # Push schema changes directly
bun run db:studio             # Open Drizzle Studio

# ─── Production build ───────────────────────────────────────────────────────
bun run build                 # Vite build → dist/
bun run dev:prod              # Tunnel + Docker build+run (test prod bundle locally)
fly deploy                    # Deploy to Fly.io

# ─── Import pipeline ────────────────────────────────────────────────────────
# Step 1: Extract media + season subset from full Wikidata dump (single pass)
lbzip2 -dc /path/to/latest-all.json.bz2 | bun run import:dump > subset.ndjson

# Step 2: Unified import (interactive menu or non-interactive --all)
bun run import:update                    # Interactive menu (pick features)
bun run import:update --all              # Non-interactive: all features, auto-detect data/
bun run import:update --all --reset      # Wipe + full reimport
bun run import:update --all --qrank=data/qrank.csv.gz --subset=data/subset.ndjson
bun run import:update --all --anime-offline=data/anime-offline-database.jsonl

# Step 3 (optional): Incremental Wikidata updates via SPARQL
bun run src/import/incremental.ts --days=7           # Last 7 days
bun run src/import/incremental.ts --days=30          # Last 30 days
bun run src/import/incremental.ts --days=7 --dry-run # Preview only

# ─── Cron (unattended overnight import) ─────────────────────────────────────
./scripts/import-cron.sh                              # Manual run
# Cron entry (Sunday 2 AM): 0 2 * * 0 cd /path/to/donguri && ./scripts/import-cron.sh
```

## Validation (run before every commit)

**Always run these four commands to validate changes. Fix any errors before committing.**

```bash
bun run typecheck             # TypeScript type checking — fix all errors
bun run format                # Biome formatter — auto-fixes in place
bun run lint                  # Biome linter — fix all errors, warnings are OK
bun run build                 # Vite production build — must succeed cleanly
```

## Architecture

**Stack**: TanStack Start (React SSR) + Drizzle ORM + Postgres + Fly.io

```
src/
  router.tsx          → TanStack Router setup
  server.tsx          → SSR handler (well-known routes + TanStack Start)
  routes/
    __root.tsx        → Root layout (nav, auth state)
    index.tsx         → Home page (login form, watchlist grouped by status)
    roadmap.tsx       → Roadmap page (renders ROADMAP.md via react-markdown)
    catalog/
      index.tsx       → Catalog browse (virtual list, search, type filter)
      $wikidataId.tsx → Media detail page (SSR, tracking controls)
  db/
    schema.ts         → Drizzle schema (media, genres, platforms, users, catalog_entries, oauth, canonical_genres, genre_mappings, seasons)
    index.ts          → Database client (postgres.js)
    fts.ts            → pg_trgm extension + GIN index setup
    genre-data.ts     → Canonical genre definitions (18 main + ~47 sub) and ~150 Wikidata Q-ID mappings
    seed-genres.ts    → Seed script for canonical_genres + genre_mappings tables
  lib/
    media.functions.ts → Server functions (listMedia, getMedia, getMediaStats)
    media-types.ts    → Type labels and badge color mappings
    catalog.functions.ts → Server functions (catalog entries, tracked IDs)
    auth.functions.ts → Server functions (login, logout, auth state, unified OAuth)
    oauth-providers.ts → Generic OAuth provider config map + unified flow
    oauth-callback.tsx → Shared OAuth callback component (Google/GitHub)
    og.ts             → Open Graph + Twitter Card meta tag helper
    theme.tsx         → ThemeProvider + useTheme hook (dark/light toggle)
    query.ts          → TanStack Query client + IDB persister + DATA_VERSION for cache busting
    query-options.ts  → Query/infinite-query option factories with versioned keys
    sync.ts           → AT Protocol PDS sync helpers
    auth/
      client.ts       → AT Protocol OAuth client (Bluesky only)
      session.ts      → Cookie-based session (HMAC-signed)
      kv-stores.ts    → Postgres-backed OAuth state/session stores
  import/
    subset.ts         → Pass 1: filter Wikidata dump to media + season NDJSON
    update.ts         → Unified import pipeline (media, percentiles, seasons, covers)
    incremental.ts    → SPARQL-based incremental Wikidata updater
    _upsert.ts        → Shared COPY → temp table → upsert logic
    _filters.ts       → P31 type classification, quality filters, entity property extraction
    _types.ts         → Wikidata types and constants
    _retry.ts         → Retry + backoff utilities for flaky connections
Dockerfile            → Multi-stage Bun build
fly.toml              → Fly.io app config (iad + gru regions, suspend idle)
drizzle.config.ts     → Drizzle Kit config for Postgres
```

## Data Architecture

**Three-tier model**: PDS (AT users' source of truth) ↔ Server DB (canonical store) ↔ Local storage (future offline support)

### Database (Postgres)
- `media` — Unified table for movies, TV, anime, games. Sparse columns for type-specific fields.
- `genres` / `media_genres` — Raw Wikidata genre relationships (Q-IDs)
- `canonical_genres` — Two-tier genre hierarchy (18 main + ~47 sub-genres, self-referencing `parent_id`)
- `genre_mappings` — Wikidata Q-ID → canonical genre resolution (manual Phase 1 done, ~150 mappings)
- `platforms` / `media_platforms` — Many-to-many platform relationships (games)
- `seasons` — Per-series season data (season number, episode count, data source)
- `users` — User accounts (Bluesky via AT Protocol, Google, GitHub)
- `catalog_entries` — User tracking data (status, ratings, episode progress, favorites, replay count)
- `oauth_states` / `oauth_sessions` — AT Protocol OAuth state (replaces KV)
- `import_progress` — Import job tracking with resume support

Search uses `pg_trgm` with `word_similarity()` and GIN indexes for fuzzy matching on title/original_title.

### Data Import Pipeline
1. **Subset extraction** (Wikidata CC0): `subset.ts` captures media + season entities in one pass
2. **Unified import** (`update.ts` — interactive or `--all`):
   - **Media**: subset NDJSON → `media`, `genres`, `platforms`, `media_genres`, `media_platforms`
   - **Percentiles**: QRank CSV → `qrank_pct`, sitelinks → `sitelinks_pct`
   - **Seasons**: Wikidata (P179/P1545/P1113) → TVMaze (CC BY-SA) → anime-offline (ODbL)
   - **Cover art**: TMDB → AniList (anime fallback) → IGDB (games) → hotlink URL → `poster_url`
3. **Genres** (hand-curated): `genre-data.ts` → `seed-genres.ts` → `canonical_genres`, `genre_mappings`

### Wikidata Import
Supports 10 P31 types: Film, TV Film, TV Series, Anime (6 variants), Video Game.
Quality filter: must have external ID + sitelinks >= 5.
Properties extracted: titles, dates, duration, episodes, seasons, country, 9 external IDs, genres, platforms, sitelinks count.

## Environment Variables

```bash
DATABASE_URL=          # Neon Postgres connection string (e.g., postgresql://user:pass@ep-xxx.neon.tech/donguri)
OAUTH_PRIVATE_KEY_JWK= # ES256 private key in JWK format
SESSION_SECRET=        # Session cookie signing secret
PUBLIC_URL=            # Public-facing URL (e.g., https://donguri.fly.dev)
GOOGLE_CLIENT_ID=      # Google OAuth client ID
GOOGLE_CLIENT_SECRET=  # Google OAuth client secret
GITHUB_CLIENT_ID=      # GitHub OAuth client ID (App)
GITHUB_CLIENT_SECRET=  # GitHub OAuth client secret

# Cover art import (optional — only needed for covers.ts)
TMDB_API_KEY=          # TMDB v3 API key
TWITCH_CLIENT_ID=      # Twitch app client ID (for IGDB)
TWITCH_CLIENT_SECRET=  # Twitch app client secret (for IGDB)
```

## Current Features

- **Catalog**: 100k+ titles (movies, TV, anime, games) with fuzzy search (pg_trgm word_similarity) and type filtering
- **Detail pages**: hierarchical genre chips (e.g., "Sci-Fi > Cyberpunk"), platforms, external links (IMDb, TMDB, MAL, AniList, IGDB, etc.)
- **Tracking**: per-media-type status labels, 0-100 ratings, favorites, replay count, episode progress count
- **Auth**: Bluesky OAuth (with PDS sync), Google OAuth, GitHub OAuth
- **Caching**: IDB-persisted TanStack Query cache with DATA_VERSION for cache busting on schema changes, refetchOnWindowFocus for user data
- **Season data**: per-season episode counts from Wikidata, TVMaze, and anime-offline-database, displayed on detail pages
- **Cover art**: posters hotlinked from TMDB, AniList, and IGDB CDNs, shown on detail pages (160×240) and catalog list (40×60 thumbnails)
- **Not yet built**: per-episode tracking UI, genre filtering in catalog, notes UI, data import/export

## Frontend Aesthetics

**Single-font system**: CMU Sans Serif (`--font-sans`) for all text. Self-hosted WOFF2 in `public/fonts/`. Hierarchy is achieved through weight (400 vs 700), size, color, letter-spacing, and `text-transform: uppercase` rather than a second typeface.

**Color system**: `oklch()` color space for perceptual uniformity. "Deep Ink" dark mode (indigo-navy, hue ~260-270), "Kraft Card Stock" light mode (warm cream, hue ~76-80). Rich honey/amber accent. Media-type stamp inks at L=0.70 (dark) / L=0.45 (light).
Dark/light theme toggle. Light mode uses warm kraft parchment tones, dark mode uses deep indigo-navy with blue substance.

**Motion**: Custom easing curves (`--ease-weighted`, `--ease-snap`, `--ease-bounce`). View Transitions API for page navigation. `@starting-style` for modal entry. `active:scale-[0.97]` on all interactive elements.

**Sound**: Optional Web Audio oscillator engine (`src/lib/sound.tsx`). Sine wave bleeps (Wii-inspired). Off by default, toggle in nav.

**Surfaces**: `dg-grain` CSS-only SVG noise texture (card stock feel, baseFrequency 0.65). `dg-card` edge highlight. `oklch()` elevation system (bg → surface → elevated → overlay). Inset depth on inputs.

**Stamp system**: `dg-stamp` class for type badges — solid ink on card stock. CMU Sans Serif, uppercase, 0.1em tracking, 0.6875rem font-size, barely-rounded, inset shadow. Movie (copper), TV (cerulean), Anime (fuchsia), Game (jade).

**Physical Catalog motif**: Nav = filing tabs (bottom-border active state). Footer = colophon. Rows = index cards (gradient dividers, `dg-tab-in` left-border hover). Status sections = drawer labels. Roadmap = bulletin board with confidence gradient.

Avoid generic AI design patterns. Be creative but restrained — this is a data-dense catalog, not a marketing page.
