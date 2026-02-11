FROM oven/bun:1-slim AS base
WORKDIR /app

# All dependencies (for build)
FROM base AS deps
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

# Production dependencies only (for runtime)
FROM base AS prod-deps
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production

# Build
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bun run build

# Runtime — lean Node.js Alpine image
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY drizzle ./drizzle
COPY scripts ./scripts
COPY package.json ./

EXPOSE 3000
CMD ["node", "scripts/start.mjs"]
