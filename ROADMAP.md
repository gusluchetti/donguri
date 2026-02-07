# donguri roadmap

donguri is a media catalog and tracker for movies, TV shows, anime, and games — built on the AT Protocol so your data stays yours.

## Current status

The media catalog is live. ~70k titles imported from Wikidata with search, filtering, and detail pages. The stack is TanStack Start + Drizzle + Turso, deployed on Cloudflare Workers.

## Phase 1: AT Protocol integration

The foundation — connect donguri to the ATmosphere.

- [ ] OAuth login via AT Protocol (using `@atproto/oauth-client-node`)
- [ ] Design Lexicon schema for user records (watchlist entries, ratings, progress)
- [ ] Store user data on their PDS, not our database
- [ ] Session management and identity display
- [ ] Handle resolution (DID ↔ handle)

## Phase 2: Tracking features

The core experience — track what you watch and play.

- [ ] Watchlist: add/remove media, set status (watching, completed, dropped, plan to watch)
- [ ] Episode progress tracking for series and anime
- [ ] Ratings (numeric scale, stored as AT Proto records)
- [ ] Short reviews / notes per title
- [ ] Import from existing services (MyAnimeList, Letterboxd, etc.)

## Phase 3: Social features

The network — see what others are watching.

- [ ] Public profile pages (via AT Proto identity)
- [ ] Follow other users and see their activity
- [ ] Activity feed (recently watched, rated, reviewed)
- [ ] Aggregate ratings from the network

## Design principles

- **Your data, your PDS.** No vendor lock-in. Export is built in because AT Proto records are portable.
- **Catalog is shared, tracking is personal.** The Wikidata-sourced catalog is public infrastructure. Your watchlist and ratings live on your PDS.
- **Sparse over bloated.** Not every title needs every field. The schema is designed for a sparse, real-world dataset.
