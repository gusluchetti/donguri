# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build and Development Commands

**Runtime**: Bun (dev/build), Cloudflare Workers V8 (production)

```bash
# Development server (port 3000)
bun run dev

# Production build
bun run build

# Database commands (Drizzle + Turso/libSQL)
bun run db:generate    # Generate migrations from schema
bun run db:migrate     # Run pending migrations
bun run db:push        # Push schema changes directly
bun run db:studio      # Open Drizzle Studio

# Wikidata import (two-pass pipeline)
# Pass 1: Extract media subset from full dump
lbzip2 -dc /path/to/latest-all.json.bz2 | bun run src/import/subset.ts > media-subset.ndjson

# Pass 2: Import subset into Turso
bun run src/import/index.ts media-subset.ndjson                     # Test mode (100 entities)
bun run src/import/index.ts media-subset.ndjson --full              # Full import
bun run src/import/index.ts media-subset.ndjson --full --limit=1000 # Limited import
bun run src/import/index.ts media-subset.ndjson --full --resumeFrom=Q123
bun run src/import/index.ts media-subset.ndjson --clean             # Clean DB first

# Deploy to Cloudflare Workers
bun run build && wrangler deploy
```

## Architecture

**Stack**: TanStack Start (React SSR) + Drizzle ORM + Turso (libSQL) + Cloudflare Workers

```
src/
  router.tsx          → TanStack Router setup
  server.tsx          → SSR handler
  routes/
    __root.tsx        → Root layout (HTML shell)
    index.tsx         → Catalog page (virtual list, search, filter)
    media/
      $wikidataId.tsx → Media detail page (SSR)
  db/
    schema.ts         → Drizzle schema (media, genres, platforms, import_progress)
    index.ts          → Database client (Turso/libSQL)
    fts.ts            → FTS5 virtual table setup SQL
  lib/
    media.functions.ts → Server functions (listMedia, getMedia, etc.)
    styles.ts         → Design tokens
  import/
    subset.ts         → Pass 1: filter Wikidata dump to media NDJSON
    index.ts          → Pass 2: parse and import into Turso
    parser.ts         → Entity property extraction
    filters.ts        → P31 type classification, quality filters
    types.ts          → Wikidata types and constants
vite.config.ts        → Vite + TanStack Start plugin
wrangler.toml         → Cloudflare Workers config
drizzle.config.ts     → Drizzle Kit config for Turso
```

## Data Architecture

**Key split**: Media catalog in Turso (our DB). User data in AT Protocol (their PDS).

### Database (Turso/libSQL)
- `media` — Unified table for movies, TV, anime, games. Sparse columns for type-specific fields.
- `genres` / `media_genres` — Many-to-many genre relationships
- `platforms` / `media_platforms` — Many-to-many platform relationships (games)
- `import_progress` — Import job tracking with resume support
- `media_fts` — FTS5 virtual table for title search

### Wikidata Import
Supports 10 P31 types: Film, TV Film, TV Series, Anime (6 variants), Video Game.
Quality filter: must have external ID + sitelinks >= 1.
Properties extracted: titles, dates, duration, episodes, seasons, country, 8 external IDs, genres, platforms, sitelinks count.

## Environment Variables

```bash
TURSO_DATABASE_URL=    # libSQL URL (e.g., libsql://db-name.turso.io)
TURSO_AUTH_TOKEN=      # Turso auth token
# Or:
DATABASE_URL=          # Alternative URL variable
```

## Frontend Aesthetics

Dark theme with warm, earthy tones (donguri = acorn in Japanese).
IBM Plex Mono for a technical, catalog-like feel.
Amber/ochre accent (#d4a44a) on dark background (#0f0e0c).
Type badges color-coded: movie (copper), TV (teal), anime (rose), game (sage).

Avoid generic AI design patterns. Be creative but restrained — this is a data-dense catalog, not a marketing page.
