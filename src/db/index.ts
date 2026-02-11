import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

function getConnectionString() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL environment variable is required");
  }
  return url;
}

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  if (!_db) {
    const client = postgres(getConnectionString(), {
      max: 10,
      idle_timeout: 20,
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
