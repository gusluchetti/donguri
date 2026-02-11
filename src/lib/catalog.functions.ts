import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db";
import type { CatalogEntry } from "../db/schema";
import { catalogEntries, media } from "../db/schema";
import { getAuthenticatedAgent } from "./auth/agent";
import { requireAuth } from "./auth/session";
import { deleteCatalogEntry, putCatalogEntry } from "./sync";

const StatusEnum = z.enum(["watching", "completed", "dropped", "plan_to_watch", "paused"]);

export const getCatalogEntry = createServerFn({ method: "GET" })
  .inputValidator(z.object({ wikidataId: z.string() }))
  .handler(async ({ data }): Promise<CatalogEntry | null> => {
    const { userId } = await requireAuth();
    console.debug("[catalog] getCatalogEntry wikidataId=%s userId=%s", data.wikidataId, userId);
    const db = getDb();

    const [entry] = await db
      .select()
      .from(catalogEntries)
      .where(
        and(eq(catalogEntries.userId, userId), eq(catalogEntries.mediaWikidataId, data.wikidataId)),
      )
      .limit(1);

    const result = entry ?? null;
    console.debug("[catalog] getCatalogEntry → %s", result ? `found (status=${result.status})` : "null");
    return result;
  });

export const getUserCatalogEntries = createServerFn({ method: "GET" }).handler(async () => {
  const { userId } = await requireAuth();
  console.debug("[catalog] getUserCatalogEntries userId=%s", userId);
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

  console.debug("[catalog] getUserCatalogEntries → %d entries", entries.length);
  return entries;
});

export const getUserTrackedIds = createServerFn({ method: "GET" }).handler(async () => {
  const { userId } = await requireAuth();
  console.debug("[catalog] getUserTrackedIds userId=%s", userId);
  const db = getDb();

  const entries = await db
    .select({
      mediaWikidataId: catalogEntries.mediaWikidataId,
      status: catalogEntries.status,
    })
    .from(catalogEntries)
    .where(eq(catalogEntries.userId, userId));

  console.debug("[catalog] getUserTrackedIds → %d tracked", entries.length);
  return Object.fromEntries(entries.map((e) => [e.mediaWikidataId, e.status]));
});

/** PDS-first write, then mirror to DB. */
export const setCatalogEntry = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      wikidataId: z.string(),
      status: StatusEnum,
      rating: z.number().min(0).max(10).nullish(),
      note: z.string().max(10000).nullish(),
      episodeProgress: z.number().int().min(0).nullish(),
    }),
  )
  .handler(async ({ data }) => {
    console.debug("[catalog] setCatalogEntry wikidataId=%s status=%s rating=%s", data.wikidataId, data.status, data.rating ?? "null");
    try {
      const { userId, did } = await requireAuth();
      console.debug("[catalog] setCatalogEntry auth ok userId=%s did=%s", userId, did);
      const agent = await getAuthenticatedAgent(did);
      console.debug("[catalog] setCatalogEntry agent obtained");

      const now = new Date().toISOString();

      const db = getDb();
      const [existing] = await db
        .select({ createdAt: catalogEntries.createdAt })
        .from(catalogEntries)
        .where(
          and(eq(catalogEntries.userId, userId), eq(catalogEntries.mediaWikidataId, data.wikidataId)),
        )
        .limit(1);

      console.debug("[catalog] setCatalogEntry existing entry: %s", existing ? `yes (created ${existing.createdAt?.toISOString()})` : "no");
      console.debug("[catalog] setCatalogEntry → calling putCatalogEntry");

      await putCatalogEntry(agent, userId, did, {
        mediaRef: data.wikidataId,
        status: data.status,
        rating: data.rating ?? undefined,
        note: data.note ?? undefined,
        episodeProgress: data.episodeProgress ?? undefined,
        createdAt: existing?.createdAt?.toISOString() ?? now,
        updatedAt: now,
      });

      console.debug("[catalog] setCatalogEntry → ok");
      return { ok: true };
    } catch (err) {
      console.error("[catalog] setCatalogEntry FAILED:", err);
      throw err;
    }
  });

export const removeCatalogEntry = createServerFn({ method: "POST" })
  .inputValidator(z.object({ wikidataId: z.string() }))
  .handler(async ({ data }) => {
    console.debug("[catalog] removeCatalogEntry wikidataId=%s", data.wikidataId);
    try {
      const { userId, did } = await requireAuth();
      console.debug("[catalog] removeCatalogEntry auth ok userId=%s did=%s", userId, did);
      const agent = await getAuthenticatedAgent(did);
      console.debug("[catalog] removeCatalogEntry → calling deleteCatalogEntry");

      await deleteCatalogEntry(agent, userId, did, data.wikidataId);

      console.debug("[catalog] removeCatalogEntry → ok");
      return { ok: true };
    } catch (err) {
      console.error("[catalog] removeCatalogEntry FAILED:", err);
      throw err;
    }
  });
