# donguri

A media catalog powered by Wikidata — track movies, TV series, anime, and games.

**Stack**: TanStack Start (React SSR) + Drizzle ORM + Postgres + Fly.io

Live at [donguri.app](https://donguri.app)

## Development

**Prerequisites**: [Bun](https://bun.sh) and [Docker](https://www.docker.com).
[cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) is only needed for Bluesky (AT Protocol) sign-in.

```bash
bun install
cp .env.example .env   # then fill in the values you need
bun run dev:local      # local Postgres (Docker) + Vite dev server on http://127.0.0.1:3000
bun run db:push        # first run only: create the schema in the local database
```

`.env.example` documents every variable. Only `DATABASE_URL` (already set for the local Docker
Postgres) is needed to run the app. Google/GitHub OAuth, payments, cover art and email
notifications are optional.

### Bluesky sign-in

AT Protocol OAuth needs a public HTTPS URL that the user's PDS can reach, so `127.0.0.1` isn't
enough. Point a Cloudflare tunnel at `localhost:3000` and set `PUBLIC_URL` to its URL.
A throwaway tunnel works:

```bash
cloudflared tunnel --url http://localhost:3000
```

`bun run dev` does the same with the maintainer's named tunnel (`donguri-dev`). It runs Postgres,
the tunnel and Vite together, and only works if you have a tunnel with that name.

## Build & Deploy

```bash
bun run build          # Vite build → dist/
bun run start          # Serve the production build
bun run dev:prod       # Build and run the production Docker image locally (uses the named tunnel)
fly deploy             # Deploy to Fly.io (runs db:migrate as the release command)
```

## Database

```bash
bun run db:generate    # Generate migrations from schema
bun run db:migrate     # Run pending migrations
bun run db:push        # Push schema changes directly
bun run db:studio      # Open Drizzle Studio
bun run db:reset       # Wipe and recreate the local Postgres
```

## Media import

The catalog is built from a Wikidata dump, plus [QRank](https://qrank.wmcloud.org) popularity and
the [anime-offline-database](https://github.com/manami-project/anime-offline-database).

```bash
bun run import:auto         # Full or incremental, depending on what's already imported
bun run import:full         # Download, subset and import from scratch
bun run import:incremental  # Recent Wikidata changes via SPARQL
bun run import:covers       # Fetch cover art (needs TMDB_API_KEY / Twitch credentials)
```

The full Wikidata dump is over 100 GB, so check your disk space before running a full import.

## Checks

```bash
bun run validate       # Biome lint + format, then typecheck
```

## License

[AGPL-3.0](LICENSE)
