/**
 * Sync helpers: PDS (source of truth) → local Turso mirror.
 *
 * Write path: write to PDS first, then upsert local mirror on success.
 * Read path: read from local Turso DB (fast, supports aggregation).
 * Live sync: Jetstream subscription (Phase 3 — not implemented here).
 */

import type { Agent } from "@atproto/api";
import { eq, and } from "drizzle-orm";
import { getDb } from "../db";
import { userRecords } from "../db/schema";

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
  await upsertLocalMirror(did, rkey, entry);

  return { uri: response.data.uri, cid: response.data.cid };
}

/**
 * Delete a catalog entry from the user's PDS and local mirror.
 */
export async function deleteCatalogEntry(
  agent: Agent,
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
    .delete(userRecords)
    .where(
      and(
        eq(userRecords.did, did),
        eq(userRecords.collection, COLLECTION),
        eq(userRecords.rkey, rkey),
      ),
    );
}

/**
 * Upsert a record into the local mirror table.
 * Called after PDS writes and during Jetstream/reconciliation sync.
 */
export async function upsertLocalMirror(
  did: string,
  rkey: string,
  record: CatalogEntryRecord,
): Promise<void> {
  const db = getDb();

  // Check if record already exists
  const existing = await db
    .select({ id: userRecords.id })
    .from(userRecords)
    .where(
      and(
        eq(userRecords.did, did),
        eq(userRecords.collection, COLLECTION),
        eq(userRecords.rkey, rkey),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(userRecords)
      .set({
        mediaWikidataId: record.mediaRef,
        status: record.status,
        rating: record.rating ?? null,
        note: record.note ?? null,
        episodeProgress: record.episodeProgress ?? null,
        indexedAt: new Date().toISOString(),
      })
      .where(eq(userRecords.id, existing[0].id));
  } else {
    await db.insert(userRecords).values({
      did,
      rkey,
      collection: COLLECTION,
      mediaWikidataId: record.mediaRef,
      status: record.status,
      rating: record.rating ?? null,
      note: record.note ?? null,
      episodeProgress: record.episodeProgress ?? null,
    });
  }
}

/**
 * Reconcile local mirror with PDS records for a user.
 * Call on login to catch any writes made from other clients.
 */
export async function reconcileUser(agent: Agent, did: string): Promise<void> {
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
    await upsertLocalMirror(did, rkey, record);
  }

  // Remove local records that no longer exist on PDS
  const localRecords = await db
    .select({ id: userRecords.id, rkey: userRecords.rkey })
    .from(userRecords)
    .where(
      and(eq(userRecords.did, did), eq(userRecords.collection, COLLECTION)),
    );

  for (const local of localRecords) {
    if (!pdsRecords.has(local.rkey)) {
      await db.delete(userRecords).where(eq(userRecords.id, local.id));
    }
  }
}
