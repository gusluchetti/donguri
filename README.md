# donguri

A media catalog powered by Wikidata — track movies, TV series, anime, and games.

**Stack**: TanStack Start (React SSR) + Drizzle ORM + Postgres + Fly.io

Live at [donguri.app](https://donguri.app)

## Development

**Prerequisites**: [Bun](https://bun.sh), [Docker](https://www.docker.com), [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)

```bash
bun install
bun run dev    # starts local Postgres (Docker), cloudflared tunnel, and vite dev server
```

`bun run dev` uses `concurrently` to launch two processes (Cloudflare tunnel, Vite) with color-coded output, after starting Docker Postgres.

## Build & Deploy

```bash
bun run build          # Vite build → .output/
fly deploy             # Deploy to Fly.io
```

## Database

```bash
bun run db:generate    # Generate migrations from schema
bun run db:migrate     # Run pending migrations
bun run db:push        # Push schema changes directly
bun run db:studio      # Open Drizzle Studio
```

