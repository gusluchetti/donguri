import type { Agent } from "@atproto/api";
import { and, eq } from "drizzle-orm";
import { getDb } from "../db";
import type { CatalogEntry } from "../db/schema";
import { catalogEntries } from "../db/schema";

const COLLECTION = "app.donguri.catalog.entry";

/** PDS wire format — field names differ from DB row (mediaRef vs mediaWikidataId, ISO strings vs timestamps). */
export interface CatalogEntryRecord {
  mediaRef: string;
  status: NonNullable<CatalogEntry["status"]>;
  rating?: number;
  note?: string;
  episodeProgress?: number;
  createdAt: string;
  updatedAt?: string;
}

export async function putCatalogEntry(
  agent: Agent,
  userId: string,
  did: string,
  entry: CatalogEntryRecord,
): Promise<{ uri: string; cid: string }> {
  const rkey = entry.mediaRef;

  const response = await agent.com.atproto.repo.putRecord({
    repo: did,
    collection: COLLECTION,
    rkey,
    record: {
      $type: COLLECTION,
      ...entry,
    },
    validate: false, // PDS can't validate custom lexicons
  });

  await upsertLocalMirror(userId, rkey, entry);

  return { uri: response.data.uri, cid: response.data.cid };
}

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

  const db = getDb();
  await db
    .delete(catalogEntries)
    .where(and(eq(catalogEntries.userId, userId), eq(catalogEntries.mediaWikidataId, mediaRef)));
}

export async function upsertLocalMirror(
  userId: string,
  rkey: string,
  record: CatalogEntryRecord,
): Promise<void> {
  const db = getDb();

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

/** Reconcile on login — catches writes from other clients. */
export async function reconcileUser(agent: Agent, userId: string, did: string): Promise<void> {
  const db = getDb();

  let cursor: string | undefined;
  const pdsRecords = new Map<string, CatalogEntryRecord>();

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

  for (const [rkey, record] of pdsRecords) {
    await upsertLocalMirror(userId, rkey, record);
  }

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
