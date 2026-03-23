import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { cleanEnv } from "~/lib/env";
import * as schema from "./schema";

function getConnectionString() {
  const url = cleanEnv(process.env.DATABASE_URL);
  if (!url) {
    throw new Error("DATABASE_URL environment variable is required");
  }
  return url;
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
      prepare: false,
      connection: { "pg_trgm.word_similarity_threshold": "0.3" },
    });
    _db = drizzle(client, { schema });
  }
  return _db;
}
