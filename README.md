# donguri

A media catalog powered by Wikidata — track movies, TV series, anime, and games.

**Stack**: TanStack Start (React SSR) + Drizzle ORM + Postgres + Fly.io

Live at [donguri.app](https://donguri.app)

## Development

**Prerequisites**: [Bun](https://bun.sh), [flyctl](https://fly.io/docs/flyctl/install/), [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)

```bash
bun install
bun run dev    # starts fly proxy, cloudflared tunnel, and vite dev server
```

`bun run dev` uses `concurrently` to launch all three processes (DB proxy, Cloudflare tunnel, Vite) with color-coded output. Use `bun run dev:vite` to run only Vite.

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

