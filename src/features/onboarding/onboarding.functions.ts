import { createServerFn } from "@tanstack/react-start";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "~/db";
import { catalogEntries, media } from "~/db/schema";
import { getAuthenticatedAgent, isSessionExpired } from "~/features/auth/auth.agent";
import { clearSessionCookie, requireAuth } from "~/features/auth/auth.session";
import { putCatalogEntry } from "~/features/auth/auth.sync";
import { getCacheArrays } from "~/features/media/popular-cache";

type OnboardingPick = {
  wikidataId: string;
  title: string;
  mediaType: string;
  animationOrigin: string | null;
  posterUrl: string | null;
};

/** Return popular items per type from the in-memory cache. Zero DB hit. */
export const getOnboardingPicks = createServerFn({ method: "GET" }).handler(
  async (): Promise<Record<string, OnboardingPick[]>> => {
    const { byType } = await getCacheArrays();

    const result: Record<string, OnboardingPick[]> = {};
    for (const [type, items] of Object.entries(byType)) {
      result[type] = items.slice(0, 100).map((m) => ({
        wikidataId: m.wikidataId,
        title: m.title,
        mediaType: m.mediaType,
        animationOrigin: m.animationOrigin,
        posterUrl: m.posterUrl,
      }));
    }

    return result;
  },
);

/** Seed catalog entries from onboarding selections. */
export const completeOnboarding = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      selections: z.array(z.object({ wikidataId: z.string() })).min(1),
    }),
  )
  .handler(async ({ data }) => {
    try {
      const auth = await requireAuth();
      const { userId } = auth;

      const wikidataIds = data.selections.map((s) => s.wikidataId);
      const db = getDb();

      // Fetch metadata for all selections in one query
      const mediaRows = await db
        .select({
          wikidataId: media.wikidataId,
          title: media.title,
          mediaType: media.mediaType,
          animationOrigin: media.animationOrigin,
        })
        .from(media)
        .where(inArray(media.wikidataId, wikidataIds));

      const mediaMap = new Map(mediaRows.map((m) => [m.wikidataId, m]));
      const now = new Date().toISOString();

      if (auth.authMethod === "atproto" && auth.did) {
        // Sequential PDS writes for AT Protocol users
        const agent = await getAuthenticatedAgent(auth.did);

        for (const wid of wikidataIds) {
          const m = mediaMap.get(wid);
          await putCatalogEntry(agent, userId, auth.did, {
            mediaRef: wid,
            status: "completed",
            title: m?.title,
            mediaType: m?.mediaType,
            animationOrigin: m?.animationOrigin ?? undefined,
            createdAt: now,
            updatedAt: now,
          });
        }
      } else {
        // Batch insert for non-AT users
        const values = wikidataIds.map((wid) => {
          const m = mediaMap.get(wid);
          return {
            userId,
            mediaWikidataId: wid,
            mediaTitle: m?.title ?? null,
            mediaType: (m?.mediaType ?? null) as typeof catalogEntries.$inferInsert.mediaType,
            animationOrigin: m?.animationOrigin ?? null,
            status: "completed" as const,
            completedAt: new Date(now),
            updatedAt: new Date(now),
          };
        });

        // Filter out any items user already has
        const existing = await db
          .select({ mediaWikidataId: catalogEntries.mediaWikidataId })
          .from(catalogEntries)
          .where(
            and(
              eq(catalogEntries.userId, userId),
              inArray(catalogEntries.mediaWikidataId, wikidataIds),
            ),
          );
        const existingSet = new Set(existing.map((e) => e.mediaWikidataId));
        const newValues = values.filter((v) => !existingSet.has(v.mediaWikidataId));

        if (newValues.length > 0) {
          await db.insert(catalogEntries).values(newValues);
        }
      }

      return { ok: true };
    } catch (err) {
      if (isSessionExpired(err)) {
        clearSessionCookie();
        throw new Error("SESSION_EXPIRED");
      }
      throw err;
    }
  });
