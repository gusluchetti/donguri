# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build and Development Commands

**Runtime**: Bun

```bash
# Development server with hot reload (port 3000)
bun run --watch src/index.ts

# Database commands
bun run db:generate    # Generate Drizzle ORM migrations
bun run db:migrate     # Run pending migrations
bun run db:push        # Push schema changes directly
bun run db:studio      # Open Drizzle Studio (visual DB browser)

# Wikidata import
bun run src/import/index.ts [file.ndjson]                    # Test mode (100 entities)
bun run src/import/index.ts [file] --full                    # Full import
bun run src/import/index.ts [file] --full --limit=1000       # Limited full import
bun run src/import/index.ts [file] --full --resumeFrom=Q123  # Resume from entity
bun run src/import/index.ts [file] --clean                   # Clean DB before import
```

## Architecture

**Stack**: Bun + Elysia (HTTP framework) + Drizzle ORM + PostgreSQL + React 19

```
src/index.ts          → Main Elysia app entry, serves static files + API
src/routes/media.ts   → API endpoints under /api/media
src/db/schema.ts      → Drizzle schema (media, genres, media_genres, importProgress)
src/db/index.ts       → Database client initialization
src/import/           → Wikidata NDJSON import pipeline
public/               → Static frontend files (React)
drizzle/              → Migration files
```

**Database Schema**:
- `media` - Core table with wikidataId, mediaType (movie/tv_series/anime), titles, years, imdbId, malId, episode/season counts
- `genres` - Genre definitions from Wikidata
- `media_genres` - Many-to-many join table
- `importProgress` - Tracks import job state for resumability

**API Endpoints** (`/api/media`):
- `GET /` - List with pagination (`page`, `limit`), type filter, search on titles
- `GET /:wikidataId` - Get by Wikidata ID (includes genres)
- `GET /imdb/:imdbId` - Get by IMDb ID
- `GET /mal/:malId` - Get by MAL ID
- `GET /stats` - Collection statistics

**Frontend**: Uses `@elysiajs/eden` for type-safe API calls from React

## Environment

Requires `DATABASE_URL` environment variable (PostgreSQL connection string).
