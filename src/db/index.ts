import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

function getConnectionString() {
  const url = cleanEnv(process.env.DATABASE_URL);
  if (!url) {
    throw new Error("DATABASE_URL environment variable is required");
  }
  return url;
}

/** Strip surrounding quotes that Docker --env-file keeps literal. */
export function cleanEnv(value: string | undefined): string {
  if (!value) return "";
  return value.trim().replace(/^['"]/, "").replace(/['"]$/, "");
}

function debugSlowQueries(
  _connection: number,
  query: string,
  _params: unknown[],
  _types: unknown[],
) {
  const start = performance.now();
  return () => {
    const ms = performance.now() - start;
    if (ms > 50) {
      console.warn(`[db] slow query (${ms.toFixed(0)}ms): ${query.slice(0, 200)}`);
    }
  };
}

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  if (!_db) {
    const client = postgres(getConnectionString(), {
      max: 10,
      idle_timeout: 20,
      prepare: false, // Required for PgBouncer (Fly.io transaction mode)
      debug: debugSlowQueries,
    });
    _db = drizzle(client, { schema });
  }
  return _db;
}

// For import scripts that run outside the server
export function createDb(url: string) {
  const client = postgres(url, {
    max: 5,
    idle_timeout: 30,
    connect_timeout: 30,
  });
  return drizzle(client, { schema });
}

/** Raw postgres.js client for COPY and other low-level operations. */
export function createRawClient(url: string) {
  return postgres(url, { max: 5, idle_timeout: 30, connect_timeout: 30 });
}
