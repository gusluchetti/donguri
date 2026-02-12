# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build and Development Commands

**Runtime**: Bun (dev/build), Fly.io (production)

```bash
# Development (starts fly proxy + cloudflared tunnel + vite dev server)
bun run dev

# Vite only (no proxy/tunnel)
bun run dev:vite

# Production build
bun run build

# Database commands (Drizzle + Postgres)
bun run db:generate    # Generate migrations from schema
bun run db:migrate     # Run pending migrations
bun run db:push        # Push schema changes directly
bun run db:studio      # Open Drizzle Studio

# Wikidata import (two-pass pipeline)
# Pass 1: Extract media subset from full dump
lbzip2 -dc /path/to/latest-all.json.bz2 | bun run src/import/subset.ts > media-subset.ndjson

# Pass 2: Import subset into Postgres
bun run src/import/index.ts media-subset.ndjson                     # Test mode (100 entities)
bun run src/import/index.ts media-subset.ndjson --full              # Full import
bun run src/import/index.ts media-subset.ndjson --full --limit=1000 # Limited import
bun run src/import/index.ts media-subset.ndjson --full --resumeFrom=Q123
bun run src/import/index.ts media-subset.ndjson --clean             # Clean DB first

# Deploy to Fly.io
bun run build && fly deploy
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
    roadmap.tsx       → Static roadmap page
    catalog/
      index.tsx       → Catalog browse (virtual list, search, type filter)
      $wikidataId.tsx → Media detail page (SSR, tracking controls)
  db/
    schema.ts         → Drizzle schema (media, genres, platforms, users, catalog_entries, oauth)
    index.ts          → Database client (postgres.js)
    fts.ts            → pg_trgm extension + GIN index setup
  lib/
    env.ts            → Environment variable access (process.env, not used in vite.config.ts)
    media.functions.ts → Server functions (listMedia, getMedia, getMediaStats)
    media-types.ts    → Type labels and badge color mappings
    catalog.functions.ts → Server functions (catalog entries, tracked IDs)
    auth.functions.ts → Server functions (login, logout, auth state)
    prefetch.ts       → Background catalog prefetch for perf
    swr-loader.ts     → Stale-while-revalidate loader with IDB cache
    idb-cache.ts      → IndexedDB cache layer for client-side data
    sync.ts           → AT Protocol PDS sync helpers
    auth/
      client.ts       → AT Protocol OAuth client (Bluesky only)
      session.ts      → Cookie-based session (HMAC-signed)
      kv-stores.ts    → Postgres-backed OAuth state/session stores
  import/
    subset.ts         → Pass 1: filter Wikidata dump to media NDJSON
    index.ts          → Pass 2: parse and import into Postgres
    parser.ts         → Entity property extraction
    filters.ts        → P31 type classification, quality filters
    types.ts          → Wikidata types and constants
Dockerfile            → Multi-stage Bun build
fly.toml              → Fly.io app config
drizzle.config.ts     → Drizzle Kit config for Postgres
```

## Data Architecture

**Three-tier model**: PDS (AT users' source of truth) ↔ Server DB (canonical store) ↔ Local storage (future offline support)

### Database (Postgres)
- `media` — Unified table for movies, TV, anime, games. Sparse columns for type-specific fields.
- `genres` / `media_genres` — Many-to-many genre relationships
- `platforms` / `media_platforms` — Many-to-many platform relationships (games)
- `users` — User accounts (AT Protocol via Bluesky OAuth)
- `catalog_entries` — User tracking data (status, ratings, episode progress, notes)
- `oauth_states` / `oauth_sessions` — AT Protocol OAuth state (replaces KV)
- `import_progress` — Import job tracking with resume support

Search uses `pg_trgm` extension with GIN indexes for fast ILIKE on title/original_title.

### Wikidata Import
Supports 10 P31 types: Film, TV Film, TV Series, Anime (6 variants), Video Game.
Quality filter: must have external ID + sitelinks >= 1.
Properties extracted: titles, dates, duration, episodes, seasons, country, 8 external IDs, genres, platforms, sitelinks count.

## Environment Variables

```bash
DATABASE_URL=          # Postgres connection string (e.g., postgresql://user:pass@host:5432/donguri)
OAUTH_PRIVATE_KEY_JWK= # ES256 private key in JWK format
SESSION_SECRET=        # Session cookie signing secret
PUBLIC_URL=            # Public-facing URL (e.g., https://donguri.fly.dev)
```

## Current Features

- **Catalog**: 100k+ titles (movies, TV, anime, games) with full-text search and type filtering
- **Detail pages**: genres, platforms, external links (IMDb, TMDB, MAL, AniList, IGDB, etc.)
- **Tracking**: status (watching/completed/dropped/paused/plan to watch), 0-100 ratings, episode progress count
- **Auth**: Bluesky OAuth only. Account required to browse the catalog.
- **Caching**: IDB-backed stale-while-revalidate on client, background prefetch
- **Not yet built**: per-episode tracking UI, genre filtering in catalog, cover art display, notes UI, additional login methods, data import/export

## Frontend Aesthetics

Dark theme with warm, earthy tones (donguri = acorn in Japanese).
IBM Plex Mono for a technical, catalog-like feel.
Amber/ochre accent (#d4a44a) on dark background (#0f0e0c).
Type badges color-coded: movie (copper), TV (teal), anime (rose), game (sage).

Avoid generic AI design patterns. Be creative but restrained — this is a data-dense catalog, not a marketing page.
