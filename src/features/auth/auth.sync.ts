import type { Agent } from "@atproto/api";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "~/db";
import { catalogEntries } from "~/db/schema";
import { countWatchedEpisodes, normalizeStatus } from "~/features/media/media-types";

const COLLECTION = "app.donguri.catalog.entry";

const CatalogEntryRecordSchema = z.object({
  mediaRef: z.string(),
  status: z.string(),
  rating: z.number().optional(),
  note: z.string().optional(),
  episodeProgress: z.number().optional(),
  isFavorite: z.boolean().optional(),
  replayCount: z.number().optional(),
  watchedEpisodes: z.record(z.string(), z.record(z.string(), z.string())).optional(),
  watchedAt: z.string().optional(),
  title: z.string().optional(),
  mediaType: z.string().optional(),
  animationOrigin: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
});

/** PDS wire format — field names differ from DB row (mediaRef vs mediaWikidataId, ISO strings vs timestamps). */
export type CatalogEntryRecord = z.infer<typeof CatalogEntryRecordSchema>;

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
    console.debug(
      "[sync] putCatalogEntry PDS putRecord → uri=%s cid=%s",
      response.data.uri,
      response.data.cid,
    );
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

  try {
    await agent.com.atproto.repo.deleteRecord({
      repo: did,
      collection: COLLECTION,
      rkey,
    });
    console.debug("[sync] deleteCatalogEntry PDS deleteRecord → ok");
  } catch (err) {
    // If the record is already gone from PDS (e.g. deleted via another client,
    // or was never synced), proceed with local DB cleanup instead of blocking.
    const msg = err instanceof Error ? err.message : String(err);
    const isNotFound = /RecordNotFound|Could not locate record/i.test(msg);
    if (isNotFound) {
      console.debug("[sync] deleteCatalogEntry PDS record already gone, proceeding with DB delete");
    } else {
      console.error("[sync] deleteCatalogEntry PDS deleteRecord FAILED:", err);
      throw err;
    }
  }

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
  // Normalize status once at the boundary (handles legacy PDS values)
  const normalized = { ...record, status: normalizeStatus(record.status) };

  const db = getDb();

  const rows = await db
    .select()
    .from(catalogEntries)
    .where(
      and(
        eq(catalogEntries.userId, userId),
        eq(catalogEntries.mediaWikidataId, normalized.mediaRef),
      ),
    )
    .limit(1);

  const now = new Date();
  const recordUpdatedAt = normalized.updatedAt ? new Date(normalized.updatedAt) : now;
  const completedAt =
    normalized.status === "completed"
      ? rows[0]?.status === "completed"
        ? (rows[0].completedAt ?? now)
        : now
      : null;

  // Auto-compute episodeProgress from watchedEpisodes
  const epProgress = normalized.watchedEpisodes
    ? countWatchedEpisodes(normalized.watchedEpisodes)
    : (normalized.episodeProgress ?? null);

  if (rows.length > 0) {
    const existing = rows[0];

    // Skip update if nothing meaningful changed
    const unchanged =
      existing.status === normalized.status &&
      existing.rating === (normalized.rating ?? null) &&
      existing.note === (normalized.note ?? null) &&
      existing.episodeProgress === (normalized.episodeProgress ?? null) &&
      existing.isFavorite === (normalized.isFavorite ?? false) &&
      existing.replayCount === (normalized.replayCount ?? 0) &&
      existing.watchedAt === (normalized.watchedAt ?? null) &&
      JSON.stringify(existing.watchedEpisodes ?? null) ===
        JSON.stringify(normalized.watchedEpisodes ?? null) &&
      existing.rkey === rkey;

    if (unchanged) {
      console.debug(
        "[sync] upsertLocalMirror userId=%s rkey=%s → no changes, skipping",
        userId,
        rkey,
      );
      return;
    }

    console.debug("[sync] upsertLocalMirror userId=%s rkey=%s → update existing", userId, rkey);
    await db
      .update(catalogEntries)
      .set({
        status: normalized.status,
        rating: normalized.rating ?? null,
        note: normalized.note ?? null,
        episodeProgress: epProgress,
        isFavorite: normalized.isFavorite ?? false,
        replayCount: normalized.replayCount ?? 0,
        completedAt,
        watchedEpisodes: normalized.watchedEpisodes ?? null,
        watchedAt: normalized.watchedAt ?? null,
        mediaTitle: normalized.title ?? undefined,
        mediaType:
          (normalized.mediaType as "movie" | "tv_series" | "game" | undefined) ?? undefined,
        animationOrigin: normalized.animationOrigin ?? undefined,
        rkey,
        syncedAt: now,
        updatedAt: recordUpdatedAt,
      })
      .where(eq(catalogEntries.id, existing.id));
  } else {
    console.debug("[sync] upsertLocalMirror userId=%s rkey=%s → insert new", userId, rkey);
    await db.insert(catalogEntries).values({
      userId,
      mediaWikidataId: normalized.mediaRef,
      mediaTitle: normalized.title ?? null,
      mediaType: (normalized.mediaType ?? null) as "movie" | "tv_series" | "game" | null,
      animationOrigin: normalized.animationOrigin ?? null,
      status: normalized.status,
      rating: normalized.rating ?? null,
      note: normalized.note ?? null,
      episodeProgress: epProgress,
      isFavorite: normalized.isFavorite ?? false,
      replayCount: normalized.replayCount ?? 0,
      completedAt,
      watchedEpisodes: normalized.watchedEpisodes ?? null,
      watchedAt: normalized.watchedAt ?? null,
      rkey,
      syncedAt: now,
      updatedAt: recordUpdatedAt,
    });
  }
}

/** Reconcile on login — catches writes from other clients. */
export async function reconcileUser(agent: Agent, userId: string, did: string): Promise<void> {
  console.debug("[sync] reconcileUser did=%s — fetching PDS records...", did);
  const db = getDb();

  let cursor: string | undefined;
  let fetchComplete = false;
  const pdsRecords = new Map<string, CatalogEntryRecord>();

  try {
    do {
      const response = await agent.com.atproto.repo.listRecords({
        repo: did,
        collection: COLLECTION,
        limit: 100,
        cursor,
      });

      for (const record of response.data.records) {
        const rkey = record.uri.split("/").pop() ?? "";
        const parsed = CatalogEntryRecordSchema.safeParse(record.value);
        if (parsed.success) {
          pdsRecords.set(rkey, parsed.data);
        } else {
          console.debug(
            "[sync] reconcileUser skipping invalid record rkey=%s errors=%o",
            rkey,
            parsed.error.flatten().fieldErrors,
          );
        }
      }

      cursor = response.data.cursor;
    } while (cursor);

    fetchComplete = true;
  } catch (err) {
    console.error(
      "[sync] reconcileUser PDS fetch incomplete (got %d records):",
      pdsRecords.size,
      err,
    );
  }

  console.debug(
    "[sync] reconcileUser fetched %d records from PDS (complete=%s)",
    pdsRecords.size,
    fetchComplete,
  );

  for (const [rkey, record] of pdsRecords) {
    await upsertLocalMirror(userId, rkey, record);
  }
  console.debug("[sync] reconcileUser upserted %d records to local DB", pdsRecords.size);

  // Only prune entries missing from PDS if the fetch completed fully
  if (fetchComplete) {
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
  } else {
    console.debug("[sync] reconcileUser skipped pruning — PDS fetch was incomplete");
  }

  console.debug("[sync] reconcileUser → done");
}
