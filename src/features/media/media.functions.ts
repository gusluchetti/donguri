import { createServerFn } from "@tanstack/react-start";
import { and, asc, desc, eq, getTableColumns, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { getDb } from "~/db";
import {
  canonicalGenres,
  genreMappings,
  genres,
  type Media,
  media,
  mediaGenres,
  mediaPlatforms,
  platforms,
  seasons,
} from "~/db/schema";
import { getSessionData } from "~/features/auth/auth.session";
import { getPopularPage, getPopularStats, searchPopular } from "./popular-cache";

const parentGenres = alias(canonicalGenres, "parent_genres");

/** Return type of getMedia (defined explicitly to break circular inference). */
type MediaDetail = Media & {
  genres: {
    id: string;
    slug: string;
    name: string;
    parentId: string | null;
    sortOrder: number | null;
    parentName: string | null;
  }[];
  platforms: { id: string; name: string; wikidataId: string }[];
  seasons: {
    id: string;
    seasonNumber: number;
    episodeCount: number | null;
    title: string | null;
    dataSource: string;
  }[];
};

// ─── Input schemas ──────────────────────────────────────────────────────────

const ListMediaInput = z.object({
  cursor: z.string().optional(),
  limit: z.number().min(1).max(100).default(50),
  mediaType: z.enum(["movie", "tv_series", "anime", "game"]).optional(),
  search: z.string().optional(),
});

const GetMediaInput = z.object({
  wikidataId: z.string(),
});

// ─── Helpers ────────────────────────────────────────────────────────────────

async function searchMedia(
  db: ReturnType<typeof getDb>,
  searchTerm: string,
  cursor: string | undefined,
  limit: number,
  mediaType?: string,
) {
  const offset = cursor ? Number.parseInt(cursor, 10) : 0;
  const ilikeTerm = `%${searchTerm.replace(/[%_\\]/g, "\\$&")}%`;

  const relevance = sql<number>`GREATEST(
    word_similarity(${searchTerm}, ${media.title}),
    word_similarity(${searchTerm}, COALESCE(${media.originalTitle}, ''))
  )`;

  const fuzzyCondition = sql`(
    ${searchTerm} <% ${media.title}
    OR ${searchTerm} <% COALESCE(${media.originalTitle}, '')
    OR ${media.title} ILIKE ${ilikeTerm}
    OR ${media.originalTitle} ILIKE ${ilikeTerm}
  )`;

  const conditions = [fuzzyCondition];
  if (mediaType)
    conditions.push(eq(media.mediaType, mediaType as "movie" | "tv_series" | "anime" | "game"));

  const results = await db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL pg_trgm.word_similarity_threshold = 0.2`);
    return tx
      .select(getTableColumns(media))
      .from(media)
      .where(and(...conditions))
      .orderBy(
        desc(relevance),
        sql`${media.popularityScore} ASC NULLS LAST`,
        desc(media.sitelinksCount),
        asc(media.id),
      )
      .limit(limit + 1)
      .offset(offset);
  });

  const hasMore = results.length > limit;
  const page = hasMore ? results.slice(0, limit) : results;
  return {
    items: page,
    nextCursor: hasMore ? String(offset + limit) : null,
  };
}

// ─── Server functions ───────────────────────────────────────────────────────

/**
 * List media with cursor-based pagination, optional type filter and search.
 * Browse mode: keyset pagination sorted by popularity.
 * Search mode: fuzzy matching via pg_trgm with offset pagination sorted by relevance.
 */
export const listMedia = createServerFn({ method: "GET" })
  .inputValidator(ListMediaInput)
  .handler(async ({ data }) => {
    const { cursor, limit, mediaType, search } = data;
    const trimmedSearch = search?.trim();

    // Non-logged users get served from the in-memory popular cache
    const session = await getSessionData();
    if (!session?.userId) {
      if (trimmedSearch) return searchPopular(trimmedSearch, mediaType, cursor, limit);
      return getPopularPage(mediaType, cursor, limit);
    }

    const db = getDb();

    if (trimmedSearch) {
      return searchMedia(db, trimmedSearch, cursor, limit, mediaType);
    }

    // ── Browse mode (no search) ─────────────────────────────────────────
    const conditions = [];

    // Type filter
    if (mediaType) conditions.push(eq(media.mediaType, mediaType));

    // Keyset cursor pagination (popularity_score ASC NULLS LAST, sitelinks_count DESC, id ASC)
    if (cursor) {
      const [cursorItem] = await db
        .select({
          popularityScore: media.popularityScore,
          sitelinksCount: media.sitelinksCount,
          id: media.id,
        })
        .from(media)
        .where(eq(media.id, cursor))
        .limit(1);

      if (cursorItem) {
        const ps = cursorItem.popularityScore;
        const sc = cursorItem.sitelinksCount ?? 0;
        if (ps != null) {
          conditions.push(
            sql`(
              (${media.popularityScore} IS NOT NULL AND (
                ${media.popularityScore} > ${ps}
                OR (${media.popularityScore} = ${ps} AND COALESCE(${media.sitelinksCount}, 0) < ${sc})
                OR (${media.popularityScore} = ${ps} AND COALESCE(${media.sitelinksCount}, 0) = ${sc} AND ${media.id} > ${cursor})
              ))
              OR ${media.popularityScore} IS NULL
            )`,
          );
        } else {
          conditions.push(
            sql`(
              ${media.popularityScore} IS NULL AND (
                COALESCE(${media.sitelinksCount}, 0) < ${sc}
                OR (COALESCE(${media.sitelinksCount}, 0) = ${sc} AND ${media.id} > ${cursor})
              )
            )`,
          );
        }
      }
    }

    const items = await db
      .select()
      .from(media)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(
        sql`${media.popularityScore} ASC NULLS LAST`,
        desc(media.sitelinksCount),
        asc(media.id),
      )
      .limit(limit + 1);

    const hasMore = items.length > limit;
    const page = hasMore ? items.slice(0, limit) : items;

    return {
      items: page,
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  });

/**
 * Get a single media item by Wikidata ID, including genres and platforms.
 */
export const getMedia = createServerFn({ method: "GET" })
  .inputValidator(GetMediaInput)
  .handler(async ({ data }): Promise<MediaDetail | null> => {
    const db = getDb();

    const item = await db
      .select()
      .from(media)
      .where(eq(media.wikidataId, data.wikidataId))
      .limit(1);

    if (item.length === 0) return null;

    // Fetch genres (with parent names via self-join), platforms, and seasons in parallel
    const [itemGenres, itemPlatforms, itemSeasons] = await Promise.all([
      db
        .selectDistinct({
          id: canonicalGenres.id,
          slug: canonicalGenres.slug,
          name: canonicalGenres.name,
          parentId: canonicalGenres.parentId,
          sortOrder: canonicalGenres.sortOrder,
          parentName: parentGenres.name,
        })
        .from(mediaGenres)
        .innerJoin(genres, eq(mediaGenres.genreId, genres.id))
        .innerJoin(genreMappings, eq(genres.wikidataId, genreMappings.wikidataId))
        .innerJoin(canonicalGenres, eq(genreMappings.canonicalGenreId, canonicalGenres.id))
        .leftJoin(parentGenres, eq(canonicalGenres.parentId, parentGenres.id))
        .where(eq(mediaGenres.mediaId, item[0].id))
        .orderBy(canonicalGenres.sortOrder),
      db
        .select({ id: platforms.id, name: platforms.name, wikidataId: platforms.wikidataId })
        .from(mediaPlatforms)
        .innerJoin(platforms, eq(mediaPlatforms.platformId, platforms.id))
        .where(eq(mediaPlatforms.mediaId, item[0].id)),
      db
        .select({
          id: seasons.id,
          seasonNumber: seasons.seasonNumber,
          episodeCount: seasons.episodeCount,
          title: seasons.title,
          dataSource: seasons.dataSource,
        })
        .from(seasons)
        .where(eq(seasons.mediaId, item[0].id))
        .orderBy(seasons.seasonNumber),
    ]);

    // TEMP: hide episode tracking for non-consecutive seasons
    const isConsecutive =
      itemSeasons.length === 0 || itemSeasons.every((s, i) => s.seasonNumber === i + 1);

    const result = {
      ...item[0],
      genres: itemGenres.map((g) => ({
        id: g.id,
        slug: g.slug,
        name: g.name,
        parentId: g.parentId,
        sortOrder: g.sortOrder,
        parentName: g.parentName ?? null,
      })),
      platforms: itemPlatforms,
      seasons: isConsecutive ? itemSeasons : [],
    };

    return result;
  });

/**
 * Get collection stats.
 */
export const getMediaStats = createServerFn({ method: "GET" }).handler(async () => {
  // Non-logged users get cached stats from the popular subset
  const session = await getSessionData();
  if (!session?.userId) return getPopularStats();

  const db = getDb();

  const [totalResult] = await db.select({ count: sql<number>`count(*)` }).from(media);

  const typeCounts = await db
    .select({
      mediaType: media.mediaType,
      count: sql<number>`count(*)`,
    })
    .from(media)
    .groupBy(media.mediaType);

  const result = {
    total: totalResult.count,
    byType: Object.fromEntries(typeCounts.map((r) => [r.mediaType, r.count])),
  };

  return result;
});
