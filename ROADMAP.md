# donguri roadmap

donguri is a media catalog and tracker for movies, TV shows, anime, and games. User data is stored on a server database with optional AT Protocol sync — your PDS becomes the source of truth if you connect it, otherwise the DB is your source of truth.

## Current status

The media catalog is functional with ~70k titles imported from Wikidata. AT Protocol OAuth scaffolding is in place. Migrating to Fly.io + Postgres for deployment.

## Phase 0: Catalog infrastructure [DONE]

- [x] Wikidata import pipeline (10 P31 types, quality filtering)
- [x] Database with search
- [x] Catalog UI with virtual list, search, filtering
- [x] Media detail pages with external links
- [x] Roadmap page
- [x] Catalog search params in URL (shareable, preserved on navigation)

## Phase 1: AT Protocol integration [IN PROGRESS]

- [x] OAuth client scaffolding (metadata endpoints, JWKS)
- [x] Singleton OAuth client with dynamic PUBLIC_URL
- [x] Design Lexicon schema (`app.donguri.catalog.entry`)
- [x] Sync helpers (PDS write → DB mirror, reconciliation on login)
- [ ] Fix OAuth login flow end-to-end (dev tunnel, key generation, test)
- [ ] Session management and identity display
- [ ] Handle resolution (DID ↔ handle)
- [ ] Store user data on their PDS via catalog entry records

## Phase 1.5: Fly.io deployment [IN PROGRESS]

- [x] Migrate from Turso/libSQL to Postgres (Drizzle schema + client)
- [x] Replace FTS5 with pg_trgm ILIKE search
- [x] Replace KV stores with Postgres-backed OAuth stores
- [x] Remove Cloudflare Workers layer
- [x] Dockerfile + fly.toml
- [ ] Fly.io app provisioning (app + Postgres cluster)
- [ ] ES256 key pair generation and fly secrets
- [ ] Production PUBLIC_URL and domain setup
- [ ] Run Wikidata import against production DB
- [ ] CI/CD pipeline (build + deploy)

## Phase 2: Tracking features + local storage

The core experience — track what you watch and play, with offline support.

### Data flow

```
User action (e.g. "watched ep 3 of HxH")
  → Local write (IndexedDB → instant optimistic UI)
  → Server DB write
    → AT users: PDS write → eventual DB sync (PDS is source of truth)
    → Non-AT users: DB is source of truth directly
```

### Features

- [ ] Local storage layer (IndexedDB) for offline support and optimistic UI
- [ ] User accounts: AT Protocol login or local-only accounts
- [ ] Watchlist: add/remove media, set status (watching, completed, dropped, plan to watch)
- [ ] Episode progress tracking for series and anime
- [ ] Ratings (1–10 scale)
- [ ] Short reviews / notes per title
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
