FROM oven/bun:1 AS base
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

# Production image
FROM base AS runner

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY public ./public
COPY drizzle ./drizzle
COPY drizzle.config.ts ./
COPY tsconfig.json ./

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["bun", "run", "src/index.ts"]