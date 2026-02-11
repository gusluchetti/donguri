# donguri roadmap

donguri is a media catalog and tracker for movies, TV shows, anime, and games — built on the AT Protocol so your data stays yours.

## Current status

The media catalog is live with ~70k titles imported from Wikidata. AT Protocol OAuth scaffolding is in place, with Lexicon schema designed and local mirror table ready for user data.

## Phase 0: Catalog infrastructure [DONE]

- [x] Wikidata import pipeline (10 P31 types, quality filtering)
- [x] Turso/libSQL database with FTS5 search
- [x] Catalog UI with virtual list, search, filtering
- [x] Media detail pages with external links
- [x] Roadmap page
- [x] Catalog search params in URL (shareable, preserved on navigation)

## Phase 1: AT Protocol integration [IN PROGRESS]

- [x] OAuth client scaffolding (metadata endpoints, JWKS, KV stores)
- [x] Singleton OAuth client with dynamic PUBLIC_URL
- [x] Design Lexicon schema (`app.donguri.catalog.entry`)
- [x] Local DB mirror table for user PDS records
- [x] Sync helpers (PDS write → local mirror, reconciliation on login)
- [ ] Fix OAuth login flow end-to-end (dev tunnel, key generation, test)
- [ ] Session management and identity display
- [ ] Handle resolution (DID ↔ handle)
- [ ] Store user data on their PDS via catalog entry records

## Phase 1.5: Deployment

- [ ] Cloudflare Workers KV namespace setup (OAUTH_STATE, OAUTH_SESSION)
- [ ] ES256 key pair generation and wrangler secrets
- [ ] Production PUBLIC_URL and domain setup
- [ ] Turso production database provisioning
- [ ] wrangler.toml finalization (KV IDs, compatibility flags)
- [ ] CI/CD pipeline (build + deploy)

## Phase 2: Tracking features

The core experience — track what you watch and play.

- [ ] Watchlist: add/remove media, set status (watching, completed, dropped, plan to watch)
- [ ] Episode progress tracking for series and anime
- [ ] Ratings (1–10 scale, stored as AT Proto records)
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

- **Your data, your PDS.** No vendor lock-in. Export is built in because AT Proto records are portable.
- **Catalog is shared, tracking is personal.** The Wikidata-sourced catalog is public infrastructure. Your watchlist and ratings live on your PDS.
- **Eventual consistency.** PDS is source of truth. Local mirror enables fast reads and aggregation. Jetstream keeps it in sync.
