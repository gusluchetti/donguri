# donguri roadmap

donguri is a media catalog and tracker for movies, TV shows, anime, and games. User data is stored on a server database with optional AT Protocol sync — your PDS becomes the source of truth if you connect it, otherwise the DB is your source of truth.

## Current status

Media catalog is live on Fly.io with Postgres, Wikidata titles imported (5+ sitelinks filter). AT Protocol OAuth login works end-to-end via Bluesky. Tracking features are live: watchlist, ratings (0–100 scale), episode progress, notes, quick-add from catalog, and save feedback UX. Next up: IDB offline cache, service imports, and social features.

## Phase 0: Catalog infrastructure [DONE]

- [x] Wikidata import pipeline (10 P31 types, quality filtering, 5+ sitelinks)
- [x] Postgres database with pg_trgm search
- [x] Catalog UI with virtual list, search, type filtering
- [x] Media detail pages with external links
- [x] Roadmap page
- [x] Catalog search params in URL (shareable, preserved on navigation)
- [x] Non-blocking navigation (client-side data fetching, skeleton loading states)
- [x] Catalog accessible without login (with sign-in prompt)

## Phase 1: AT Protocol integration [DONE]

- [x] OAuth client scaffolding (metadata endpoints, JWKS)
- [x] Singleton OAuth client with dynamic PUBLIC_URL
- [x] Design Lexicon schema (`app.donguri.catalog.entry`)
- [x] Sync helpers (PDS write → DB mirror, reconciliation on login)
- [x] OAuth login flow end-to-end (dev tunnel, key generation, tested)
- [x] Session management and identity display (@handle in nav, logout)
- [x] Handle resolution (DID → handle via plc.directory)
- [x] PDS writes for catalog entries (set status, rating, note → PDS → DB mirror)
- [x] Catalog entry CRUD (watchlist add/remove, status, rating, episode progress)
- [x] Tracking panel on media detail pages (optimistic UI, PDS-first writes)
- [x] Homepage watchlist view (grouped by status)
- [x] Debug logging across catalog sync pipeline (client → server → PDS → DB)

## Phase 1.5: Fly.io deployment [IN PROGRESS]

- [x] Migrate from Turso/libSQL to Postgres (Drizzle schema + client)
- [x] Replace FTS5 with pg_trgm ILIKE search
- [x] Replace KV stores with Postgres-backed OAuth stores
- [x] Remove Cloudflare Workers layer
- [x] Dockerfile + fly.toml
- [x] Fly.io app provisioning (app + Postgres cluster)
- [x] ES256 key pair generation
- [x] Run Wikidata import against production DB
- [x] Metadata enrichment (descriptions, genres, platforms)
- [x] Client-side IDB cache for watchlist
- [x] PWA manifest
- [ ] Production domain setup + fly secrets for production
- [ ] CI/CD pipeline (build + deploy)

## Phase 2: Tracking features + local storage [IN PROGRESS]

The core experience — track what you watch and play, with offline support.

### Data flow

```
User action (e.g. "watched ep 3 of HxH")
  → Optimistic UI (instant visual update)
  → Server DB write
    → AT users: PDS write → eventual DB sync (PDS is source of truth)
    → Non-AT users: DB is source of truth directly
  → Terminal-style save feedback (ok / err)
```

### Features

- [x] Watchlist: add/remove media, set status (watching, completed, dropped, plan to watch, paused)
- [x] Ratings (0–100 integer scale)
- [x] Episode progress tracking for series and anime
- [x] Short notes per title
- [x] Quick-add from catalog list ([+] → [...] → [ok])
- [x] Save feedback UX (terminal-style inline indicators via `useAction` hook)
- [ ] IndexedDB offline cache (partially implemented — watchlist cache exists)
- [ ] Import from existing services (MyAnimeList, Letterboxd, etc.)

## Phase 3: Social features

The network — see what others are watching.

- [ ] Jetstream subscription for live record sync
- [ ] Public profile pages (via AT Proto identity)
- [ ] Follow other users and see their activity
- [ ] Activity feed (recently watched, rated, reviewed)
- [ ] Aggregate ratings from the network

## Design principles

- **Your data, your choice.** AT Protocol users sync to their PDS (portable, no lock-in). Non-AT users store directly in the server DB. Local storage provides offline access for both.
- **Catalog is shared, tracking is personal.** The Wikidata-sourced catalog is public infrastructure. Your watchlist and ratings are yours.
- **Offline-first.** Local writes are instant. Server and PDS sync happen in the background.
- **Eventual consistency.** PDS is source of truth for AT users. DB is source of truth for non-AT users. IndexedDB is the fast local cache for everyone.
