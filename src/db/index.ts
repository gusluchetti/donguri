import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const isDev = process.env.NODE_ENV !== "production";

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

function debugQueries(slowMs = 50) {
  return (_connection: number, query: string, _params: unknown[], _types: unknown[]) => {
    const start = performance.now();
    return () => {
      const ms = performance.now() - start;
      const log = ms > slowMs ? console.warn : console.debug;
      log(`[db] (${ms.toFixed(0)}ms) ${query.slice(0, 300)}`);
    };
  };
}

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  if (!_db) {
    const url = getConnectionString();
    const isLocal = /localhost|127\.0\.0\.1/.test(url);
    const client = postgres(url, {
      max: 15,
      idle_timeout: 20,
      connect_timeout: 30,
      ssl: isLocal ? undefined : "require",
      debug: isDev ? debugQueries() : undefined,
    });
    _db = drizzle(client, { schema });
  }
  return _db;
}
