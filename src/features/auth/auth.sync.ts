import type { Agent } from "@atproto/api";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "~/db";
import { catalogEntries } from "~/db/schema";
import {
  countEpisodesFromRaw,
  normalizeStatus,
  watchedEpisodesSchema,
} from "~/features/media/media-types";
import { log } from "~/lib/logger";

const COLLECTION = "app.donguri.catalog.entry";

const CatalogEntryRecordSchema = z.object({
  mediaRef: z.string(),
  status: z.string(),
  rating: z.number().optional(),

  episodeProgress: z.number().optional(),
  isFavorite: z.boolean().optional(),
  replayCount: z.number().optional(),
  watchedEpisodes: watchedEpisodesSchema.optional(),
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
  } catch (err) {
    console.error("[sync] putCatalogEntry PDS write FAILED:", err);
    throw err;
  }

  try {
    await upsertLocalMirror(userId, rkey, entry);
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

  const epProgress = normalized.watchedEpisodes
    ? countEpisodesFromRaw(normalized.watchedEpisodes)
    : (normalized.episodeProgress ?? null);

  if (rows.length > 0) {
    const existing = rows[0];

    // Skip update if nothing meaningful changed
    const unchanged =
      existing.status === normalized.status &&
      existing.rating === (normalized.rating ?? null) &&
      existing.episodeProgress === (normalized.episodeProgress ?? null) &&
      existing.isFavorite === (normalized.isFavorite ?? false) &&
      existing.replayCount === (normalized.replayCount ?? 0) &&
      existing.watchedAt === (normalized.watchedAt ?? null) &&
      JSON.stringify(existing.watchedEpisodes ?? null) ===
        JSON.stringify(normalized.watchedEpisodes ?? null) &&
      existing.rkey === rkey;

    if (unchanged) {
      return;
    }
    await db
      .update(catalogEntries)
      .set({
        status: normalized.status,
        rating: normalized.rating ?? null,

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
    await db.insert(catalogEntries).values({
      userId,
      mediaWikidataId: normalized.mediaRef,
      mediaTitle: normalized.title ?? null,
      mediaType: (normalized.mediaType ?? null) as "movie" | "tv_series" | "game" | null,
      animationOrigin: normalized.animationOrigin ?? null,
      status: normalized.status,
      rating: normalized.rating ?? null,
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
          log.warn("[sync] catalog entry validation failed for rkey:", rkey, record.value);
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

  for (const [rkey, record] of pdsRecords) {
    await upsertLocalMirror(userId, rkey, record);
  }

  // Only prune entries missing from PDS if the fetch completed fully
  if (fetchComplete) {
    const localEntries = await db
      .select({ id: catalogEntries.id, rkey: catalogEntries.rkey })
      .from(catalogEntries)
      .where(eq(catalogEntries.userId, userId));

    for (const local of localEntries) {
      if (local.rkey && !pdsRecords.has(local.rkey)) {
        await db.delete(catalogEntries).where(eq(catalogEntries.id, local.id));
      }
    }
  } else {
    log.debug("[sync] skipping PDS pruning (fetch incomplete)");
  }
}
