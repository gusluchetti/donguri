# donguri

A media catalog powered by Wikidata — track movies, TV series, anime, and games.

**Stack**: TanStack Start (React SSR) + Drizzle ORM + Postgres + Fly.io

Live at [donguri.app](https://donguri.app)

## Development

**Prerequisites**: [Bun](https://bun.sh), [flyctl](https://fly.io/docs/flyctl/install/), [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)

```bash
# Install dependencies
bun install

# Connect to the Fly.io Postgres database via flyctl proxy
fly proxy 15432:5432 -a <your-db-app>

# In another terminal, start a Cloudflare Tunnel for external access
cloudflared tunnel run <your-tunnel>

# Start the dev server
bun run dev
```

The development workflow uses `fly proxy` to forward the remote Postgres database locally and `cloudflared` to expose the dev server via a tunnel.

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

