import { createServerFn } from "@tanstack/react-start";
import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "~/db";
import { catalogEntries, media, subscriptions, users } from "~/db/schema";
import { requireAuth } from "~/features/auth/auth.session";
import type { StatusValue } from "~/features/media/media-types";
import type { Plan } from "~/features/subscription/subscription.provider";

export type ProfileStats = {
  totalEntries: number;
  favoritesCount: number;
  totalReplays: number;
  avgRating: number | null;
  ratedCount: number;
  statusCounts: Record<StatusValue, number>;
  typeCounts: Record<string, number>;
  completedTypeCounts: Record<string, number>;
  statusByType: Record<string, Record<string, number>>;
};

export type RecentEntry = {
  mediaWikidataId: string;
  mediaTitle: string | null;
  mediaType: string | null;
  animationOrigin: string | null;
  status: StatusValue | null;
  rating: number | null;
  isFavorite: boolean;
  updatedAt: string | null;
  posterUrl: string | null;
};

export type ProfileSubscription = {
  plan: Plan;
  status: string;
  tier: string;
  createdAt: string | null;
} | null;

export type ProfileData = {
  stats: ProfileStats;
  recent: RecentEntry[];
  user: {
    handle: string;
    avatarUrl: string | null;
    authMethod: string;
    createdAt: string | null;
  };
  daysActive: number;
  subscription: ProfileSubscription;
};

export const getProfileData = createServerFn({ method: "GET" }).handler(
  async (): Promise<ProfileData> => {
    const auth = await requireAuth();
    const db = getDb();

    const [aggregates, recent, userRow, statusByTypeRows] = await Promise.all([
      db
        .select({
          totalEntries: sql<number>`count(*)::int`,
          favoritesCount: sql<number>`count(*) FILTER (WHERE ${catalogEntries.isFavorite})::int`,
          totalReplays: sql<number>`COALESCE(sum(${catalogEntries.replayCount}), 0)::int`,
          avgRating: sql<
            number | null
          >`avg(${catalogEntries.rating}) FILTER (WHERE ${catalogEntries.rating} IS NOT NULL)`,
          ratedCount: sql<number>`count(*) FILTER (WHERE ${catalogEntries.rating} IS NOT NULL)::int`,
          planned: sql<number>`count(*) FILTER (WHERE ${catalogEntries.status} = 'planned')::int`,
          in_progress: sql<number>`count(*) FILTER (WHERE ${catalogEntries.status} = 'in_progress')::int`,
          on_hold: sql<number>`count(*) FILTER (WHERE ${catalogEntries.status} = 'on_hold')::int`,
          completed: sql<number>`count(*) FILTER (WHERE ${catalogEntries.status} = 'completed')::int`,
          mastered: sql<number>`count(*) FILTER (WHERE ${catalogEntries.status} = 'mastered')::int`,
          dropped: sql<number>`count(*) FILTER (WHERE ${catalogEntries.status} = 'dropped')::int`,
        })
        .from(catalogEntries)
        .where(eq(catalogEntries.userId, auth.userId)),

      db
        .select({
          mediaWikidataId: catalogEntries.mediaWikidataId,
          mediaTitle: sql<string | null>`COALESCE(${catalogEntries.mediaTitle}, ${media.title})`,
          mediaType: sql<string | null>`COALESCE(${catalogEntries.mediaType}, ${media.mediaType})`,
          animationOrigin: sql<
            string | null
          >`COALESCE(${catalogEntries.animationOrigin}, ${media.animationOrigin})`,
          status: catalogEntries.status,
          rating: catalogEntries.rating,
          isFavorite: catalogEntries.isFavorite,
          updatedAt: sql<string | null>`${catalogEntries.updatedAt}::text`,
          posterUrl: media.posterUrl,
        })
        .from(catalogEntries)
        .leftJoin(media, eq(catalogEntries.mediaWikidataId, media.wikidataId))
        .where(eq(catalogEntries.userId, auth.userId))
        .orderBy(desc(catalogEntries.updatedAt))
        .limit(10),

      db
        .select({
          handle: users.handle,
          avatarUrl: users.avatarUrl,
          authMethod: users.authMethod,
          createdAt: sql<string | null>`${users.createdAt}::text`,
          subPlan: subscriptions.plan,
          subStatus: subscriptions.status,
          subTier: subscriptions.tier,
          subCreatedAt: sql<string | null>`${subscriptions.createdAt}::text`,
        })
        .from(users)
        .leftJoin(subscriptions, eq(users.subscriptionId, subscriptions.id))
        .where(eq(users.id, auth.userId))
        .limit(1),

      db
        .select({
          resolvedType: sql<string>`CASE
            WHEN ${catalogEntries.animationOrigin} IS NOT NULL THEN 'anime'
            WHEN ${catalogEntries.mediaType} = 'game' THEN 'game'
            WHEN ${catalogEntries.mediaType} = 'movie' THEN 'movie'
            WHEN ${catalogEntries.mediaType} = 'tv_series' THEN 'tv_series'
          END`,
          status: sql<string>`${catalogEntries.status}`,
          count: sql<number>`count(*)::int`,
        })
        .from(catalogEntries)
        .where(eq(catalogEntries.userId, auth.userId))
        .groupBy(
          sql`CASE
            WHEN ${catalogEntries.animationOrigin} IS NOT NULL THEN 'anime'
            WHEN ${catalogEntries.mediaType} = 'game' THEN 'game'
            WHEN ${catalogEntries.mediaType} = 'movie' THEN 'movie'
            WHEN ${catalogEntries.mediaType} = 'tv_series' THEN 'tv_series'
          END`,
          catalogEntries.status,
        ),
    ]);

    const agg = aggregates[0];
    const user = userRow[0];

    const statusByType: Record<string, Record<string, number>> = {};
    for (const row of statusByTypeRows) {
      if (!row.resolvedType || !row.status) continue;
      statusByType[row.resolvedType] ??= {};
      statusByType[row.resolvedType][row.status] = row.count;
    }

    const typeCounts: Record<string, number> = {};
    const completedTypeCounts: Record<string, number> = {};
    for (const [type, statuses] of Object.entries(statusByType)) {
      typeCounts[type] = Object.values(statuses).reduce((a, b) => a + b, 0);
      completedTypeCounts[type] = (statuses.completed ?? 0) + (statuses.mastered ?? 0);
    }

    const createdDate = user?.createdAt ? new Date(user.createdAt) : new Date();
    const daysActive = Math.max(
      1,
      Math.floor((Date.now() - createdDate.getTime()) / (1000 * 60 * 60 * 24)),
    );

    const subscription: ProfileSubscription =
      user?.subPlan && user.subStatus && user.subTier
        ? {
            plan: user.subPlan,
            status: user.subStatus,
            tier: user.subTier,
            createdAt: user.subCreatedAt ?? null,
          }
        : null;

    return {
      stats: {
        totalEntries: agg.totalEntries,
        favoritesCount: agg.favoritesCount,
        totalReplays: agg.totalReplays,
        avgRating: agg.avgRating != null ? Math.round(Number(agg.avgRating)) : null,
        ratedCount: agg.ratedCount,
        statusCounts: {
          planned: agg.planned,
          in_progress: agg.in_progress,
          on_hold: agg.on_hold,
          completed: agg.completed,
          mastered: agg.mastered,
          dropped: agg.dropped,
        },
        typeCounts,
        completedTypeCounts,
        statusByType,
      },
      recent,
      user: {
        handle: user?.handle ?? auth.handle,
        avatarUrl: user?.avatarUrl ?? null,
        authMethod: user?.authMethod ?? auth.authMethod,
        createdAt: user?.createdAt ?? null,
      },
      daysActive,
      subscription,
    };
  },
);
