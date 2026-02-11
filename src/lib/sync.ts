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
  title?: string;
  mediaType?: string;
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
  console.debug("[sync] putCatalogEntry did=%s rkey=%s status=%s", did, rkey, entry.status);

  let response: Awaited<ReturnType<typeof agent.com.atproto.repo.putRecord>>;
  try {
    response = await agent.com.atproto.repo.putRecord({
      repo: did,
      collection: COLLECTION,
      rkey,
      record: {
        $type: COLLECTION,
        ...entry,
      },
      validate: false, // PDS can't validate custom lexicons
    });
    console.debug("[sync] putCatalogEntry PDS putRecord → uri=%s cid=%s", response.data.uri, response.data.cid);
  } catch (err) {
    console.error("[sync] putCatalogEntry PDS write FAILED:", err);
    throw err;
  }

  try {
    console.debug("[sync] putCatalogEntry mirroring to local DB...");
    await upsertLocalMirror(userId, rkey, entry);
    console.debug("[sync] putCatalogEntry → done");
  } catch (err) {
    console.error("[sync] putCatalogEntry local mirror FAILED (PDS write succeeded):", err);
    throw err;
  }

  return { uri: response.data.uri, cid: response.data.cid };
}

export async function deleteCatalogEntry(
  agent: Agent,
  userId: string,
  did: string,
  mediaRef: string,
): Promise<void> {
  const rkey = mediaRef;
  console.debug("[sync] deleteCatalogEntry did=%s rkey=%s", did, rkey);

  await agent.com.atproto.repo.deleteRecord({
    repo: did,
    collection: COLLECTION,
    rkey,
  });
  console.debug("[sync] deleteCatalogEntry PDS deleteRecord → ok");

  const db = getDb();
  await db
    .delete(catalogEntries)
    .where(and(eq(catalogEntries.userId, userId), eq(catalogEntries.mediaWikidataId, mediaRef)));
  console.debug("[sync] deleteCatalogEntry DB delete → ok");
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
    console.debug("[sync] upsertLocalMirror userId=%s rkey=%s → update existing", userId, rkey);
    await db
      .update(catalogEntries)
      .set({
        status: record.status,
        rating: record.rating ?? null,
        note: record.note ?? null,
        episodeProgress: record.episodeProgress ?? null,
        mediaTitle: record.title ?? undefined,
        mediaType: record.mediaType ?? undefined,
        rkey,
        syncedAt: now,
        updatedAt: now,
      })
      .where(eq(catalogEntries.id, existing[0].id));
  } else {
    console.debug("[sync] upsertLocalMirror userId=%s rkey=%s → insert new", userId, rkey);
    await db.insert(catalogEntries).values({
      userId,
      mediaWikidataId: record.mediaRef,
      mediaTitle: record.title ?? null,
      mediaType: record.mediaType ?? null,
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
  console.debug("[sync] reconcileUser did=%s — fetching PDS records...", did);
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

  console.debug("[sync] reconcileUser fetched %d records from PDS", pdsRecords.size);

  for (const [rkey, record] of pdsRecords) {
    await upsertLocalMirror(userId, rkey, record);
  }
  console.debug("[sync] reconcileUser upserted %d records to local DB", pdsRecords.size);

  const localEntries = await db
    .select({ id: catalogEntries.id, rkey: catalogEntries.rkey })
    .from(catalogEntries)
    .where(eq(catalogEntries.userId, userId));

  let pruned = 0;
  for (const local of localEntries) {
    if (local.rkey && !pdsRecords.has(local.rkey)) {
      await db.delete(catalogEntries).where(eq(catalogEntries.id, local.id));
      pruned++;
    }
  }
  console.debug("[sync] reconcileUser pruned %d stale local entries", pruned);
  console.debug("[sync] reconcileUser → done");
}
