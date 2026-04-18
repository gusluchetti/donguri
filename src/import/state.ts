import Database from "better-sqlite3";
import { getConfig } from "./config";

const db = new Database(getConfig().stateDbPath);

db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS import_state (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS entity_changes (
    wikidata_id TEXT PRIMARY KEY,
    last_imported_at TIMESTAMP,
    revision_id TEXT,
    properties TEXT,
    data_hash TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_entity_changes_imported ON entity_changes(last_imported_at);
`);

interface ImportStateRow {
  value: string;
}

interface EntityChangeRow {
  data_hash: string;
}

export function get(key: string): string | null {
  const row = db.prepare("SELECT value FROM import_state WHERE key = ?").get(key) as
    | ImportStateRow
    | undefined;
  return row?.value || null;
}

export function set(key: string, value: string): void {
  const stmt = db.prepare(`
      INSERT INTO import_state (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `);
  stmt.run(key, value);
}

export function setIfNewer(key: string, value: string): boolean {
  const existing = get(key);
  if (!existing || value > existing) {
    set(key, value);
    return true;
  }
  return false;
}

export function trackEntity(
  wikidataId: string,
  revisionId: string,
  dataHash: string,
  properties: string[],
): void {
  const stmt = db.prepare(`
      INSERT INTO entity_changes (wikidata_id, last_imported_at, revision_id, properties, data_hash)
      VALUES (?, CURRENT_TIMESTAMP, ?, ?, ?)
      ON CONFLICT(wikidata_id) DO UPDATE SET 
        last_imported_at = CURRENT_TIMESTAMP,
        revision_id = excluded.revision_id,
        properties = excluded.properties,
        data_hash = excluded.data_hash
    `);
  stmt.run(wikidataId, revisionId, JSON.stringify(properties), dataHash);
}

export function hasEntityChanged(wikidataId: string, newDataHash: string): boolean {
  const row = db
    .prepare("SELECT data_hash FROM entity_changes WHERE wikidata_id = ?")
    .get(wikidataId) as EntityChangeRow | undefined;
  return !row || row.data_hash !== newDataHash;
}

export function getLastFullDumpAt(): Date | null {
  const value = get("last_full_dump_at");
  return value ? new Date(value) : null;
}

export function setLastFullDumpAt(date: Date): void {
  set("last_full_dump_at", date.toISOString());
}

export function getLastIncrementalAt(): Date | null {
  const value = get("last_incremental_at");
  return value ? new Date(value) : null;
}

export function setLastIncrementalAt(date: Date): void {
  set("last_incremental_at", date.toISOString());
}

export function close(): void {
  db.close();
}
