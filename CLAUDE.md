# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build and Development Commands

**Runtime**: Bun (dev/build), Fly.io (production)

```bash
# Development server (port 3000)
bun run dev

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
    __root.tsx        → Root layout (HTML shell)
    index.tsx         → Catalog page (virtual list, search, filter)
    media/
      $wikidataId.tsx → Media detail page (SSR)
    api/
      health.ts       → Health check endpoint
  db/
    schema.ts         → Drizzle schema (media, genres, platforms, users, catalog_entries, oauth)
    index.ts          → Database client (postgres.js)
    fts.ts            → pg_trgm extension + GIN index setup
  lib/
    env.ts            → Environment variable access (process.env)
    media.functions.ts → Server functions (listMedia, getMedia, etc.)
    styles.ts         → Design tokens
    sync.ts           → AT Protocol PDS sync helpers
    auth/
      client.ts       → AT Protocol OAuth client
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
- `users` — User accounts (AT Protocol or local)
- `catalog_entries` — User tracking data (watchlist, ratings, progress)
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

## Frontend Aesthetics

Dark theme with warm, earthy tones (donguri = acorn in Japanese).
IBM Plex Mono for a technical, catalog-like feel.
Amber/ochre accent (#d4a44a) on dark background (#0f0e0c).
Type badges color-coded: movie (copper), TV (teal), anime (rose), game (sage).

Avoid generic AI design patterns. Be creative but restrained — this is a data-dense catalog, not a marketing page.
