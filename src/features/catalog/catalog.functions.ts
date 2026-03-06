import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "~/db";
import type { CatalogEntry } from "~/db/schema";
import { catalogEntries, media } from "~/db/schema";
import { getAuthenticatedAgent, isSessionExpired } from "~/features/auth/auth.agent";
import { clearSessionCookie, getSessionData, requireAuth } from "~/features/auth/auth.session";
import { deleteCatalogEntry, putCatalogEntry } from "~/features/auth/auth.sync";
import {
  countEpisodesFromRaw,
  STATUS_ORDER,
  watchedEpisodesSchema,
} from "~/features/media/media-types";

function throwIfSessionExpired(err: unknown): void {
  if (isSessionExpired(err)) {
    console.warn("[catalog] AT Protocol session expired, forcing logout");
    clearSessionCookie();
    throw new Error("SESSION_EXPIRED");
  }
}

const StatusEnum = z.enum(STATUS_ORDER);

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
    console.debug(
      "[catalog] getCatalogEntry → %s",
      result ? `found (status=${result.status})` : "null",
    );
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

      episodeProgress: catalogEntries.episodeProgress,
      isFavorite: catalogEntries.isFavorite,
      replayCount: catalogEntries.replayCount,
      updatedAt: catalogEntries.updatedAt,
      mediaTitle: sql<string | null>`COALESCE(${catalogEntries.mediaTitle}, ${media.title})`,
      mediaType: sql<string | null>`COALESCE(${catalogEntries.mediaType}, ${media.mediaType})`,
      animationOrigin: media.animationOrigin,
      watchedEpisodes: catalogEntries.watchedEpisodes,
      episodeCount: media.episodeCount,
      seasonCount: media.seasonCount,
      posterUrl: media.posterUrl,
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

/** Write catalog entry — PDS-first for AT Protocol users, direct DB for others. */
export const setCatalogEntry = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      wikidataId: z.string(),
      status: StatusEnum,
      rating: z.number().int().min(0).max(100).nullish(),

      episodeProgress: z.number().int().min(0).nullish(),
      isFavorite: z.boolean().nullish(),
      replayCount: z.number().int().min(0).nullish(),
      watchedEpisodes: watchedEpisodesSchema.nullish(),
      watchedAt: z.string().max(10).nullish(),
    }),
  )
  .handler(async ({ data }) => {
    console.debug(
      "[catalog] setCatalogEntry wikidataId=%s status=%s rating=%s",
      data.wikidataId,
      data.status,
      data.rating ?? "null",
    );
    try {
      const auth = await requireAuth();
      const { userId } = auth;
      console.debug(
        "[catalog] setCatalogEntry auth ok userId=%s method=%s",
        userId,
        auth.authMethod,
      );

      const now = new Date().toISOString();
      const db = getDb();

      const [existing] = await db
        .select({
          createdAt: catalogEntries.createdAt,
          mediaTitle: catalogEntries.mediaTitle,
          mediaType: catalogEntries.mediaType,
          animationOrigin: catalogEntries.animationOrigin,
          status: catalogEntries.status,
          completedAt: catalogEntries.completedAt,
        })
        .from(catalogEntries)
        .where(
          and(
            eq(catalogEntries.userId, userId),
            eq(catalogEntries.mediaWikidataId, data.wikidataId),
          ),
        )
        .limit(1);

      // Resolve title/mediaType/animationOrigin: prefer catalog_entry, fall back to media table
      let title = existing?.mediaTitle ?? undefined;
      let entryMediaType = existing?.mediaType ?? undefined;
      let entryAnimationOrigin = existing?.animationOrigin ?? undefined;
      if (!title || !entryMediaType) {
        const [mediaRow] = await db
          .select({
            title: media.title,
            mediaType: media.mediaType,
            animationOrigin: media.animationOrigin,
          })
          .from(media)
          .where(eq(media.wikidataId, data.wikidataId))
          .limit(1);
        if (mediaRow) {
          title = title ?? mediaRow.title;
          entryMediaType = entryMediaType ?? mediaRow.mediaType;
          entryAnimationOrigin = entryAnimationOrigin ?? mediaRow.animationOrigin ?? undefined;
        }
      }

      const epProgress = data.watchedEpisodes
        ? countEpisodesFromRaw(data.watchedEpisodes)
        : data.episodeProgress;

      if (auth.authMethod === "atproto" && auth.did) {
        // PDS-first flow for AT Protocol users
        const agent = await getAuthenticatedAgent(auth.did);

        await putCatalogEntry(agent, userId, auth.did, {
          mediaRef: data.wikidataId,
          status: data.status,
          rating: data.rating ?? undefined,

          episodeProgress: epProgress ?? undefined,
          isFavorite: data.isFavorite ?? undefined,
          replayCount: data.replayCount ?? undefined,
          watchedEpisodes: data.watchedEpisodes ?? undefined,
          watchedAt: data.watchedAt ?? undefined,
          title,
          mediaType: entryMediaType,
          createdAt: existing?.createdAt?.toISOString() ?? now,
          updatedAt: now,
        });
      } else {
        // Direct DB upsert for Google/GitHub users
        const completedAt =
          data.status === "completed"
            ? existing?.status === "completed"
              ? (existing.completedAt ?? new Date(now))
              : new Date(now)
            : null;

        const values = {
          userId,
          mediaWikidataId: data.wikidataId,
          mediaTitle: title ?? null,
          mediaType: (entryMediaType ?? null) as typeof catalogEntries.$inferInsert.mediaType,
          animationOrigin: entryAnimationOrigin ?? null,
          status: data.status,
          rating: data.rating ?? null,

          episodeProgress: epProgress ?? null,
          isFavorite: data.isFavorite ?? false,
          replayCount: data.replayCount ?? 0,
          completedAt,
          watchedEpisodes: data.watchedEpisodes ?? null,
          watchedAt: data.watchedAt ?? null,
          updatedAt: new Date(now),
        };

        await db
          .insert(catalogEntries)
          .values(values)
          .onConflictDoUpdate({
            target: [catalogEntries.userId, catalogEntries.mediaWikidataId],
            set: values,
          });
      }

      console.debug("[catalog] setCatalogEntry → ok");
      return { ok: true };
    } catch (err) {
      throwIfSessionExpired(err);
      console.error("[catalog] setCatalogEntry FAILED:", err);
      throw err;
    }
  });

export const removeCatalogEntry = createServerFn({ method: "POST" })
  .inputValidator(z.object({ wikidataId: z.string() }))
  .handler(async ({ data }) => {
    console.debug("[catalog] removeCatalogEntry wikidataId=%s", data.wikidataId);
    try {
      const auth = await requireAuth();
      const { userId } = auth;
      console.debug(
        "[catalog] removeCatalogEntry auth ok userId=%s method=%s",
        userId,
        auth.authMethod,
      );

      if (auth.authMethod === "atproto" && auth.did) {
        // PDS-first flow for AT Protocol users
        const agent = await getAuthenticatedAgent(auth.did);
        await deleteCatalogEntry(agent, userId, auth.did, data.wikidataId);
      } else {
        // Direct DB delete for Google/GitHub users
        const db = getDb();
        await db
          .delete(catalogEntries)
          .where(
            and(
              eq(catalogEntries.userId, userId),
              eq(catalogEntries.mediaWikidataId, data.wikidataId),
            ),
          );
      }

      console.debug("[catalog] removeCatalogEntry → ok");
      return { ok: true };
    } catch (err) {
      throwIfSessionExpired(err);
      console.error("[catalog] removeCatalogEntry FAILED:", err);
      throw err;
    }
  });

/** Lightweight fingerprint for cache invalidation — count + max(updated_at). */
export const getCatalogFingerprint = createServerFn({ method: "GET" }).handler(
  async (): Promise<string | null> => {
    const session = await getSessionData();
    if (!session?.userId) return null;
    const db = getDb();
    const [row] = await db
      .select({
        count: sql<number>`count(*)`,
        maxUpdated: sql<string>`max(${catalogEntries.updatedAt})`,
      })
      .from(catalogEntries)
      .where(eq(catalogEntries.userId, session.userId));
    return `${row.count}:${row.maxUpdated ?? ""}`;
  },
);

/** No-auth stub: look up mediaTitle/mediaType from any catalog_entry for a wikidataId. */
export const getMediaStub = createServerFn({ method: "GET" })
  .inputValidator(z.object({ wikidataId: z.string() }))
  .handler(async ({ data }) => {
    const db = getDb();
    const [entry] = await db
      .select({
        mediaTitle: catalogEntries.mediaTitle,
        mediaType: catalogEntries.mediaType,
        animationOrigin: catalogEntries.animationOrigin,
      })
      .from(catalogEntries)
      .where(eq(catalogEntries.mediaWikidataId, data.wikidataId))
      .limit(1);

    if (!entry?.mediaTitle) return null;
    return {
      wikidataId: data.wikidataId,
      title: entry.mediaTitle,
      mediaType: entry.mediaType,
      animationOrigin: entry.animationOrigin,
    };
  });
