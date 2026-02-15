# Plan: Episode/Season Data Import + Cover Art

## Context

Users see season/episode counts from Wikidata on detail pages, but there's no per-season breakdown in the `seasons` table and no cover art anywhere. This plan:
1. Populates the `seasons` table from three open data sources (Wikidata dump, TVMaze, anime-offline-database)
2. Fetches cover art, converts to normalized .webp thumbnails, uploads to Cloudflare R2
3. Deprioritizes genre filter / multi-filter search in TODOS.md, updates roadmap

## Licensing Research Summary

- **TMDB**: Staff confirmed caching is allowed ("You can cache the data, don't worry about it" — Travis Bell, TMDB). Letterboxd and Trakt (both monetized apps) use TMDB's free API with attribution — TMDB considers subscription/ad-supported apps as reference use, not competing commercial use. Attribution required (logo + disclaimer).
- **IGDB/Twitch**: Free tier. Data retention explicitly allowed. Has a specific tier for "projects that intend to monetize" — apply once live. Before Twitch acquisition was $99/mo for commercial; now merged into free tier.
- **AniList**: Free public API under $150/mo revenue (donguri's P3 target of 10 users is well under). Commercial license above that.
- **anime-offline-database**: ODbL for the database. Thumbnail URLs point to third-party CDNs — we'll use AniList API directly for anime covers, which is cleaner.
- **Fair use precedent**: Kelly v. Arriba Soft established that thumbnails serving a different function (catalog tracking vs. marketing) are transformative fair use.

**Future costs when monetization kicks in:**

| API | Free until | Commercial license | Contact |
|-----|-----------|-------------------|---------|
| TMDB | No hard limit — never charged anyone, no fee guide exists | Case-by-case, no published pricing | info@themoviedb.org |
| AniList | $150/mo app revenue | Negotiated, no published price | contact@anilist.co |
| IGDB | Free tier (was $99/mo before Twitch merged tiers into free) | Partnership agreement | partner@igdb.com |

**Verdict**: Download → convert to small .webp → serve from R2 is safe with proper attribution. Thousands of monetized apps (Letterboxd, Trakt, Plex) do exactly this. All three APIs are "contact us when you outgrow free tier" — no surprise costs.

---

## Part 1: Cover Art

### Storage: Cloudflare R2

R2 free tier: 10GB storage, 10M reads/month, no egress fees. At ~15KB per image, 100k titles = ~1.5GB — well within free tier.

**Setup** (manual, one-time):
1. Create R2 bucket `donguri-covers` in Cloudflare dashboard
2. Enable public access (or custom domain like `covers.donguri.app`)
3. Create API token with R2 write permissions

**New env vars** (add to `.env.example`):
```
TMDB_API_KEY=           # Free — register at themoviedb.org
TWITCH_CLIENT_ID=       # Free — register at dev.twitch.tv
TWITCH_CLIENT_SECRET=
R2_ENDPOINT=            # https://<account_id>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=         # donguri-covers
R2_PUBLIC_URL=          # https://pub-xxx.r2.dev or custom domain
```

### Single script: `src/import/covers.ts`

One unified script that handles all media types. For each media row without a `posterUrl`, it resolves the source based on available IDs, downloads the image, converts to 240x360 .webp, uploads to R2, and updates the DB.

```bash
bun run src/import/covers.ts                    # test (100 items)
bun run src/import/covers.ts --full             # all media without posterUrl
bun run src/import/covers.ts --full --limit=5000
bun run src/import/covers.ts --full --type=anime  # only anime
```

**Resolution order per media type:**
- **movie / tv_series**: TMDB via `tmdbId` → done (TMDB has ~95% coverage for movies/TV)
- **anime**: TMDB via `tmdbId` → AniList via `anilistId` → skip
- **game**: IGDB via `igdbId` → skip

**Pipeline per image:**
1. Fetch poster URL/path from source API
2. Download raw image bytes
3. `sharp(bytes).resize(240, 360, { fit: 'cover' }).webp({ quality: 80 })` → buffer (~10-20KB)
4. Upload to R2 as `{wikidataId}.webp` via S3-compatible API
5. `UPDATE media SET posterUrl = '{R2_PUBLIC_URL}/{wikidataId}.webp' WHERE id = ...`

**Rate limiting** (built into the script):
- TMDB: 40 req / 10s
- AniList: 90 req / min
- IGDB: 4 req / sec

**Dependencies to add**: `sharp`, `@aws-sdk/client-s3`

### Attribution footer

**File**: `src/routes/__root.tsx`

Add to footer:
- TMDB: "This product uses the TMDB API but is not endorsed or certified by TMDB" (required wording)
- TVMaze: "TV schedule data from TVMaze" + link (CC BY-SA)
- anime-offline-database: "Anime data from anime-offline-database" + link (ODbL)

---

## Part 2: Episode/Season Data Import

### 2A. Wikidata season entities

Two new files (mirrors the existing subset.ts → index.ts two-pass pattern):

**`src/import/subset-seasons.ts`** — Pass 1: filter dump for season entities
- Streams stdin, same pattern as `subset.ts`
- Filter: P31 = Q3464665 (TV season) or Q100269041 (anime season), must have P179 (part of series)
- Writes to stdout as NDJSON

```bash
lbzip2 -dc /path/to/dump.json.bz2 | bun run src/import/subset-seasons.ts > season-subset.ndjson
```

**`src/import/import-seasons.ts`** — Pass 2 + gap-fill (unified entry point)

Single script with subcommands for all three season data sources:

```bash
# Wikidata (from NDJSON subset)
bun run src/import/import-seasons.ts wikidata season-subset.ndjson [--full]

# TVMaze gap-fill (API, for TV/anime with tvmazeId but no seasons)
bun run src/import/import-seasons.ts tvmaze [--full] [--limit=500]

# anime-offline-database gap-fill (file, for anime with no seasons)
bun run src/import/import-seasons.ts anime-offline path/to/anime-offline-database.json [--full]
```

**Wikidata mode**: Parse each season entity → extract P179 (parent series Q-ID), P1545 qualifier (ordinal), P1113 (episode count), English label → batch insert into `seasons` with `dataSource: 'wikidata'`.

**TVMaze mode**: Query DB for media with `tvmazeId` but no season rows → fetch `/shows/{tvmazeId}/seasons` → insert with `dataSource: 'tvmaze'`. Rate limit: 20 req / 10s.

**anime-offline mode**: Parse JSON file → match to DB via MAL/AniList ID → insert single season (seasonNumber: 1, total episodes) with `dataSource: 'anime_offline_db'`.

All modes: `ON CONFLICT (media_id, season_number) DO NOTHING` — first source wins (run Wikidata first, then TVMaze, then anime-offline).

### Constants to add in `src/import/types.ts`

```typescript
// WikidataProperties:
PART_OF_SERIES: "P179"
SERIES_ORDINAL: "P1545"

// MediaTypeQValues:
TV_SEASON: "Q3464665"
ANIME_SEASON: "Q100269041"

// New interface:
export interface ParsedSeason {
  wikidataId: string;
  seriesWikidataId: string;
  seasonNumber: number;
  episodeCount: number | null;
  title: string | null;
}
```

---

## Part 3: Frontend

### 3A. Serve season data

**File**: `src/lib/media.functions.ts`

Enhance `getMedia()` to also return `seasons` for the media item, ordered by `seasonNumber`.

### 3B. Detail page — seasons + poster + episode tracking

**File**: `src/routes/catalog/$wikidataId.tsx`

- Poster image next to title header (160x240 display, `object-fit: cover`)
- "Seasons" section below metadata for TV/anime (when seasons exist): "Season 1 — 12 episodes", etc.
- **Episode progress UI in TrackingPanel** (for TV/anime with season data):
  - Per-season row: "Season 1: [number input] / 12" — matches the existing minimal style
  - Total progress shown as summary (e.g., "37 / 151 episodes")
  - Writes to `watchedEpisodes` (per-season `Record<string, number[]>`) and `episodeProgress` (total int)
  - Shown below the rating section, above favorite/replay
  - `setCatalogEntry` already accepts both fields — just need to wire the UI
  - Seasons data comes from the enhanced `getMedia()` response

### 3C. Catalog list — thumbnails

**File**: `src/routes/catalog/index.tsx`

Small thumbnail (40x60) in catalog list items when `posterUrl` exists.

### 3D. Cache version bump

**File**: `src/lib/query.ts` — bump `DATA_VERSION`

---

## Part 4: Documentation updates

### TODOS.md
- Move "Genre filter" and "Multi-filter search" from P0 to Backlog
- Track new cover art and season import work

### roadmap.tsx
- Adjust "Coming soon" ordering to reflect current priorities

---

## Files Summary

**New:**
```
src/import/subset-seasons.ts   # Wikidata dump → season entities NDJSON
src/import/import-seasons.ts   # Unified: wikidata / tvmaze / anime-offline → seasons table
src/import/covers.ts           # Unified: TMDB / AniList / IGDB → R2 .webp → posterUrl
```

**Modified:**
```
src/import/types.ts                 # New constants + ParsedSeason
src/lib/media.functions.ts          # getMedia returns seasons
src/routes/catalog/$wikidataId.tsx   # Poster + seasons display
src/routes/catalog/index.tsx         # Thumbnails in list
src/routes/__root.tsx                # Attribution footer
src/lib/query.ts                     # DATA_VERSION bump
.env.example                         # New env vars
package.json                         # sharp + @aws-sdk/client-s3 deps, script shortcuts
TODOS.md                             # Reprioritize
src/routes/roadmap.tsx               # Update sections
```

## Git Workflow

- Branch: `feat/seasons-and-covers` from `staging`
- PR to `staging` when complete

## Implementation Order

1. Create branch `feat/seasons-and-covers` from `staging`
2. types.ts — constants + ParsedSeason
3. subset-seasons.ts — Wikidata season extraction
4. import-seasons.ts — unified season import (all 3 modes)
5. covers.ts — unified cover art pipeline
6. media.functions.ts — serve seasons
7. $wikidataId.tsx — poster + seasons UI
8. catalog/index.tsx — thumbnails
9. __root.tsx — attribution
10. query.ts, .env.example, package.json — config
11. TODOS.md + roadmap.tsx — docs
12. Push and create PR to staging

## Verification

1. `bun run src/import/import-seasons.ts tvmaze --limit=10` → check `SELECT * FROM seasons LIMIT 20`
2. `bun run src/import/covers.ts --limit=10` → check R2 bucket has .webp files, `SELECT poster_url FROM media WHERE poster_url IS NOT NULL LIMIT 10`
3. `bun run dev` → navigate to a detail page → poster + seasons visible
4. `bun run lint && bun run format && bun run build` — must all pass
