import { createServerFn } from "@tanstack/react-start";
import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "~/db";
import { catalogEntries, media, subscriptions, users } from "~/db/schema";
import { requireAuth } from "~/features/auth/auth.session";
import type { StatusValue } from "~/features/media/media-types";

export type ProfileStats = {
  totalEntries: number;
  favoritesCount: number;
  totalReplays: number;
  avgRating: number | null;
  ratedCount: number;
  statusCounts: Record<StatusValue, number>;
  typeCounts: Record<string, number>;
  completedTypeCounts: Record<string, number>;
};

export type RecentEntry = {
  mediaWikidataId: string;
  mediaTitle: string | null;
  mediaType: string | null;
  animationOrigin: string | null;
  status: string | null;
  rating: number | null;
  isFavorite: boolean;
  updatedAt: string | null;
  posterUrl: string | null;
};

export type ProfileSubscription = {
  plan: string;
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
  topTerritory: string | null;
  daysActive: number;
  subscription: ProfileSubscription;
};

export const getProfileData = createServerFn({ method: "GET" }).handler(
  async (): Promise<ProfileData> => {
    const auth = await requireAuth();
    const db = getDb();

    // All three queries in parallel
    const [aggregates, recent, userRow] = await Promise.all([
      // Aggregate stats — single pass with FILTER
      db
        .select({
          totalEntries: sql<number>`count(*)::int`,
          favoritesCount: sql<number>`count(*) FILTER (WHERE ${catalogEntries.isFavorite})::int`,
          totalReplays: sql<number>`COALESCE(sum(${catalogEntries.replayCount}), 0)::int`,
          avgRating: sql<
            number | null
          >`avg(${catalogEntries.rating}) FILTER (WHERE ${catalogEntries.rating} IS NOT NULL)`,
          ratedCount: sql<number>`count(*) FILTER (WHERE ${catalogEntries.rating} IS NOT NULL)::int`,
          // Status counts
          planned: sql<number>`count(*) FILTER (WHERE ${catalogEntries.status} = 'planned')::int`,
          in_progress: sql<number>`count(*) FILTER (WHERE ${catalogEntries.status} = 'in_progress')::int`,
          on_hold: sql<number>`count(*) FILTER (WHERE ${catalogEntries.status} = 'on_hold')::int`,
          completed: sql<number>`count(*) FILTER (WHERE ${catalogEntries.status} = 'completed')::int`,
          mastered: sql<number>`count(*) FILTER (WHERE ${catalogEntries.status} = 'mastered')::int`,
          dropped: sql<number>`count(*) FILTER (WHERE ${catalogEntries.status} = 'dropped')::int`,
          // Type counts — anime = animationOrigin IS NOT NULL
          movieCount: sql<number>`count(*) FILTER (WHERE ${catalogEntries.mediaType} = 'movie' AND ${catalogEntries.animationOrigin} IS NULL)::int`,
          tvCount: sql<number>`count(*) FILTER (WHERE ${catalogEntries.mediaType} = 'tv_series' AND ${catalogEntries.animationOrigin} IS NULL)::int`,
          animeCount: sql<number>`count(*) FILTER (WHERE ${catalogEntries.animationOrigin} IS NOT NULL)::int`,
          gameCount: sql<number>`count(*) FILTER (WHERE ${catalogEntries.mediaType} = 'game')::int`,
          // Completed (completed + mastered) by type
          completedMovie: sql<number>`count(*) FILTER (WHERE ${catalogEntries.status} IN ('completed','mastered') AND ${catalogEntries.mediaType} = 'movie' AND ${catalogEntries.animationOrigin} IS NULL)::int`,
          completedTv: sql<number>`count(*) FILTER (WHERE ${catalogEntries.status} IN ('completed','mastered') AND ${catalogEntries.mediaType} = 'tv_series' AND ${catalogEntries.animationOrigin} IS NULL)::int`,
          completedAnime: sql<number>`count(*) FILTER (WHERE ${catalogEntries.status} IN ('completed','mastered') AND ${catalogEntries.animationOrigin} IS NOT NULL)::int`,
          completedGame: sql<number>`count(*) FILTER (WHERE ${catalogEntries.status} IN ('completed','mastered') AND ${catalogEntries.mediaType} = 'game')::int`,
        })
        .from(catalogEntries)
        .where(eq(catalogEntries.userId, auth.userId)),

      // Recent activity — last 10 by updatedAt
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

      // User row + subscription
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
    ]);

    const agg = aggregates[0];
    const user = userRow[0];

    const typeCounts: Record<string, number> = {
      movie: agg.movieCount,
      tv_series: agg.tvCount,
      anime: agg.animeCount,
      game: agg.gameCount,
    };

    const completedTypeCounts: Record<string, number> = {
      movie: agg.completedMovie,
      tv_series: agg.completedTv,
      anime: agg.completedAnime,
      game: agg.completedGame,
    };

    // Top territory = type with highest count
    let topTerritory: string | null = null;
    let maxCount = 0;
    for (const [type, count] of Object.entries(typeCounts)) {
      if (count > maxCount) {
        maxCount = count;
        topTerritory = type;
      }
    }

    // Days active since account creation
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
      },
      recent,
      user: {
        handle: user?.handle ?? auth.handle,
        avatarUrl: user?.avatarUrl ?? null,
        authMethod: user?.authMethod ?? auth.authMethod,
        createdAt: user?.createdAt ?? null,
      },
      topTerritory,
      daysActive,
      subscription,
    };
  },
);
