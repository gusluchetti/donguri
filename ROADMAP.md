# donguri roadmap

donguri is a media catalog and tracker for movies, TV shows, anime, and games. Sign in with Bluesky to sync your data via the AT Protocol — your personal data server becomes the source of truth. No account required to browse the catalog.

## What's live

- **Catalog** — browse 100k+ titles sourced from Wikidata, with search and type filtering (movies, TV, anime, games)
- **Detail pages** — metadata, genres, platforms, and links to IMDb, TMDB, MAL, AniList, IGDB, and more
- **Tracking** — add titles to your watchlist, set status (watching, completed, dropped, paused, plan to watch), rate on a 0–100 scale, track episode progress, and add notes
- **Quick-add** — one-click add from the catalog list
- **Bluesky login** — sign in with your AT Protocol identity, data syncs to your PDS
- **Offline cache** — catalog pages, watchlist, and detail pages are cached locally for instant repeat visits
- **Background prefetch** — catalog tabs are prefetched in the background so switching between types is instant

## Coming soon

- **Import from other services** — bring your data from MyAnimeList, Letterboxd, Trakt, and others
- **Production deployment** — custom domain, CI/CD pipeline
- **Offline mutations** — save changes while offline, automatically sync when back online

## On the horizon

- **Public profiles** — share what you're watching via your AT Protocol identity
- **Activity feed** — see recently watched, rated, and reviewed titles from people you follow
- **Community ratings** — aggregate scores from the donguri network alongside external ratings
- **Lists and collections** — curate themed lists (e.g. "best sci-fi of 2024", "comfort watches")
- **Recommendations** — discover new titles based on your history and taste
- **Statistics** — visualize your watching habits, genres, completion rates, and rating distribution
- **Multi-language support** — browse the catalog in your language (Wikidata has multilingual titles)
- **Mobile experience** — optimized layouts and gesture-based interactions for mobile

## Principles

- **Your data, your choice.** AT Protocol users sync to their personal data server — portable, no lock-in. No account required to browse.
- **Catalog is shared, tracking is personal.** The catalog is public infrastructure sourced from Wikidata. Your watchlist and ratings are yours.
- **Offline-first.** Reads are instant from local cache. Writes sync in the background.
