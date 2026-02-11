/**
 * Sync helpers: PDS (source of truth for AT users) → server DB mirror.
 *
 * Write path: write to PDS first, then upsert DB mirror on success.
 * Read path: read from Postgres DB (fast, supports aggregation).
 * Live sync: Jetstream subscription (Phase 3 — not implemented here).
 */

import type { Agent } from "@atproto/api";
import { and, eq } from "drizzle-orm";
import { getDb } from "../db";
import { catalogEntries } from "../db/schema";

const COLLECTION = "app.donguri.catalog.entry";

export interface CatalogEntryRecord {
  mediaRef: string;
  status: "watching" | "completed" | "dropped" | "plan_to_watch";
  rating?: number;
  note?: string;
  episodeProgress?: number;
  createdAt: string;
  updatedAt?: string;
}

/**
 * Write a catalog entry to the user's PDS, then mirror locally.
 * Uses com.atproto.repo.putRecord so the rkey is deterministic (mediaRef-based).
 */
export async function putCatalogEntry(
  agent: Agent,
  userId: string,
  did: string,
  entry: CatalogEntryRecord,
): Promise<{ uri: string; cid: string }> {
  // Deterministic rkey from mediaRef so each media item has one record
  const rkey = entry.mediaRef;

  const response = await agent.com.atproto.repo.putRecord({
    repo: did,
    collection: COLLECTION,
    rkey,
    record: {
      $type: COLLECTION,
      ...entry,
    },
  });

  // Mirror to local DB
  await upsertLocalMirror(userId, rkey, entry);

  return { uri: response.data.uri, cid: response.data.cid };
}

/**
 * Delete a catalog entry from the user's PDS and local mirror.
 */
export async function deleteCatalogEntry(
  agent: Agent,
  userId: string,
  did: string,
  mediaRef: string,
): Promise<void> {
  const rkey = mediaRef;

  await agent.com.atproto.repo.deleteRecord({
    repo: did,
    collection: COLLECTION,
    rkey,
  });

  // Remove from local mirror
  const db = getDb();
  await db
    .delete(catalogEntries)
    .where(and(eq(catalogEntries.userId, userId), eq(catalogEntries.mediaWikidataId, mediaRef)));
}

/**
 * Upsert a record into the catalog_entries table.
 * Called after PDS writes and during Jetstream/reconciliation sync.
 */
export async function upsertLocalMirror(
  userId: string,
  rkey: string,
  record: CatalogEntryRecord,
): Promise<void> {
  const db = getDb();

  // Check if entry already exists for this user + media
  const existing = await db
    .select({ id: catalogEntries.id })
    .from(catalogEntries)
    .where(
      and(eq(catalogEntries.userId, userId), eq(catalogEntries.mediaWikidataId, record.mediaRef)),
    )
    .limit(1);

  const now = new Date();

  if (existing.length > 0) {
    await db
      .update(catalogEntries)
      .set({
        status: record.status,
        rating: record.rating ?? null,
        note: record.note ?? null,
        episodeProgress: record.episodeProgress ?? null,
        rkey,
        syncedAt: now,
        updatedAt: now,
      })
      .where(eq(catalogEntries.id, existing[0].id));
  } else {
    await db.insert(catalogEntries).values({
      userId,
      mediaWikidataId: record.mediaRef,
      status: record.status,
      rating: record.rating ?? null,
      note: record.note ?? null,
      episodeProgress: record.episodeProgress ?? null,
      rkey,
      syncedAt: now,
    });
  }
}

/**
 * Reconcile local mirror with PDS records for an AT Protocol user.
 * Call on login to catch any writes made from other clients.
 */
export async function reconcileUser(agent: Agent, userId: string, did: string): Promise<void> {
  const db = getDb();

  let cursor: string | undefined;
  const pdsRecords = new Map<string, CatalogEntryRecord>();

  // Paginate through all records in the collection
  do {
    const response = await agent.com.atproto.repo.listRecords({
      repo: did,
      collection: COLLECTION,
      limit: 100,
      cursor,
    });

    for (const record of response.data.records) {
      const rkey = record.uri.split("/").pop()!;
      pdsRecords.set(rkey, record.value as unknown as CatalogEntryRecord);
    }

    cursor = response.data.cursor;
  } while (cursor);

  // Upsert all PDS records into local mirror
  for (const [rkey, record] of pdsRecords) {
    await upsertLocalMirror(userId, rkey, record);
  }

  // Remove local entries that no longer exist on PDS
  const localEntries = await db
    .select({ id: catalogEntries.id, rkey: catalogEntries.rkey })
    .from(catalogEntries)
    .where(eq(catalogEntries.userId, userId));

  for (const local of localEntries) {
    if (local.rkey && !pdsRecords.has(local.rkey)) {
      await db.delete(catalogEntries).where(eq(catalogEntries.id, local.id));
    }
  }
}
