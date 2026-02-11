import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db";
import type { CatalogEntry } from "../db/schema";
import { catalogEntries, media } from "../db/schema";
import { getAuthenticatedAgent } from "./auth/agent";
import { requireAuth } from "./auth.functions";
import { deleteCatalogEntry, putCatalogEntry } from "./sync";

const StatusEnum = z.enum(["watching", "completed", "dropped", "plan_to_watch", "paused"]);

export const getCatalogEntry = createServerFn({ method: "GET" })
  .inputValidator(z.object({ wikidataId: z.string() }))
  .handler(async ({ data }): Promise<CatalogEntry | null> => {
    const { userId } = await requireAuth();
    const db = getDb();

    const [entry] = await db
      .select()
      .from(catalogEntries)
      .where(
        and(eq(catalogEntries.userId, userId), eq(catalogEntries.mediaWikidataId, data.wikidataId)),
      )
      .limit(1);

    return entry ?? null;
  });

export const getUserCatalogEntries = createServerFn({ method: "GET" }).handler(async () => {
  const { userId } = await requireAuth();
  const db = getDb();

  const entries = await db
    .select({
      id: catalogEntries.id,
      mediaWikidataId: catalogEntries.mediaWikidataId,
      status: catalogEntries.status,
      rating: catalogEntries.rating,
      note: catalogEntries.note,
      episodeProgress: catalogEntries.episodeProgress,
      updatedAt: catalogEntries.updatedAt,
      mediaTitle: media.title,
      mediaType: media.mediaType,
    })
    .from(catalogEntries)
    .leftJoin(media, eq(catalogEntries.mediaWikidataId, media.wikidataId))
    .where(eq(catalogEntries.userId, userId))
    .orderBy(desc(catalogEntries.updatedAt));

  return entries;
});

export const getUserTrackedIds = createServerFn({ method: "GET" }).handler(async () => {
  const { userId } = await requireAuth();
  const db = getDb();

  const entries = await db
    .select({
      mediaWikidataId: catalogEntries.mediaWikidataId,
      status: catalogEntries.status,
    })
    .from(catalogEntries)
    .where(eq(catalogEntries.userId, userId));

  return Object.fromEntries(entries.map((e) => [e.mediaWikidataId, e.status]));
});

/** PDS-first write, then mirror to DB. */
export const setCatalogEntry = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      wikidataId: z.string(),
      status: StatusEnum,
      rating: z.number().int().min(1).max(10).nullish(),
      note: z.string().max(10000).nullish(),
      episodeProgress: z.number().int().min(0).nullish(),
    }),
  )
  .handler(async ({ data }) => {
    const { userId, did } = await requireAuth();
    const agent = await getAuthenticatedAgent(did);

    const now = new Date().toISOString();

    const db = getDb();
    const [existing] = await db
      .select({ createdAt: catalogEntries.createdAt })
      .from(catalogEntries)
      .where(
        and(eq(catalogEntries.userId, userId), eq(catalogEntries.mediaWikidataId, data.wikidataId)),
      )
      .limit(1);

    await putCatalogEntry(agent, userId, did, {
      mediaRef: data.wikidataId,
      status: data.status,
      rating: data.rating ?? undefined,
      note: data.note ?? undefined,
      episodeProgress: data.episodeProgress ?? undefined,
      createdAt: existing?.createdAt?.toISOString() ?? now,
      updatedAt: now,
    });

    return { ok: true };
  });

export const removeCatalogEntry = createServerFn({ method: "POST" })
  .inputValidator(z.object({ wikidataId: z.string() }))
  .handler(async ({ data }) => {
    const { userId, did } = await requireAuth();
    const agent = await getAuthenticatedAgent(did);

    await deleteCatalogEntry(agent, userId, did, data.wikidataId);

    return { ok: true };
  });
