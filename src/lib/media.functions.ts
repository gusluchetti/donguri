import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq, getTableColumns, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db";
import {
  canonicalGenres,
  genreMappings,
  genres,
  media,
  mediaGenres,
  mediaPlatforms,
  platforms,
} from "../db/schema";

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

const GetMediaByExternalIdInput = z.object({
  field: z.enum(["imdb", "tmdb", "mal", "igdb"]),
  value: z.string(),
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
  if (mediaType) conditions.push(eq(media.mediaType, mediaType));

  const results = await db.transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL pg_trgm.word_similarity_threshold = 0.2`);
    return tx
      .select(getTableColumns(media))
      .from(media)
      .where(and(...conditions))
      .orderBy(sql`${relevance} DESC`, desc(media.sitelinksCount), media.id)
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
    const db = getDb();
    const { cursor, limit, mediaType, search } = data;

    const trimmedSearch = search?.trim();
    if (trimmedSearch) {
      return searchMedia(db, trimmedSearch, cursor, limit, mediaType);
    }

    // ── Browse mode (no search) ─────────────────────────────────────────
    const conditions = [];

    // Type filter
    if (mediaType) conditions.push(eq(media.mediaType, mediaType));

    // Keyset cursor pagination
    if (cursor) {
      const [cursorItem] = await db
        .select({ sitelinksCount: media.sitelinksCount, id: media.id })
        .from(media)
        .where(eq(media.id, cursor))
        .limit(1);

      if (cursorItem) {
        const sc = cursorItem.sitelinksCount ?? 0;
        conditions.push(
          sql`(${media.sitelinksCount} < ${sc} OR (${media.sitelinksCount} = ${sc} AND ${media.id} > ${cursor}))`,
        );
      }
    }

    const items = await db
      .select()
      .from(media)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(media.sitelinksCount), media.id)
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
  .handler(async ({ data }) => {
    const db = getDb();

    const item = await db
      .select()
      .from(media)
      .where(eq(media.wikidataId, data.wikidataId))
      .limit(1);

    if (item.length === 0) return null;

    // Fetch canonical genres and platforms in parallel
    const [itemGenres, itemPlatforms] = await Promise.all([
      db
        .selectDistinct({
          id: canonicalGenres.id,
          slug: canonicalGenres.slug,
          name: canonicalGenres.name,
          parentId: canonicalGenres.parentId,
          sortOrder: canonicalGenres.sortOrder,
        })
        .from(mediaGenres)
        .innerJoin(genres, eq(mediaGenres.genreId, genres.id))
        .innerJoin(genreMappings, eq(genres.wikidataId, genreMappings.wikidataId))
        .innerJoin(canonicalGenres, eq(genreMappings.canonicalGenreId, canonicalGenres.id))
        .where(eq(mediaGenres.mediaId, item[0].id))
        .orderBy(canonicalGenres.sortOrder),
      db
        .select({ id: platforms.id, name: platforms.name, wikidataId: platforms.wikidataId })
        .from(mediaPlatforms)
        .innerJoin(platforms, eq(mediaPlatforms.platformId, platforms.id))
        .where(eq(mediaPlatforms.mediaId, item[0].id)),
    ]);

    // Resolve parent names for sub-genres
    const parentIds = [...new Set(itemGenres.filter((g) => g.parentId).map((g) => g.parentId!))];
    const parentMap = new Map<string, string>();
    if (parentIds.length > 0) {
      // Parents are likely already in itemGenres; check there first
      for (const g of itemGenres) {
        if (parentIds.includes(g.id)) parentMap.set(g.id, g.name);
      }
      // Fetch any missing parents
      const missing = parentIds.filter((id) => !parentMap.has(id));
      if (missing.length > 0) {
        const parents = await db
          .select({ id: canonicalGenres.id, name: canonicalGenres.name })
          .from(canonicalGenres)
          .where(
            sql`${canonicalGenres.id} IN (${sql.join(
              missing.map((id) => sql`${id}`),
              sql`, `,
            )})`,
          );
        for (const p of parents) parentMap.set(p.id, p.name);
      }
    }

    return {
      ...item[0],
      genres: itemGenres.map((g) => ({
        ...g,
        parentName: g.parentId ? (parentMap.get(g.parentId) ?? null) : null,
      })),
      platforms: itemPlatforms,
    };
  });

/**
 * Get media by external ID (IMDb, TMDB, MAL, IGDB).
 */
export const getMediaByExternalId = createServerFn({ method: "GET" })
  .inputValidator(GetMediaByExternalIdInput)
  .handler(async ({ data }) => {
    const db = getDb();

    const fieldMap = {
      imdb: media.imdbId,
      tmdb: media.tmdbId,
      mal: media.malId,
      igdb: media.igdbId,
    } as const;

    const column = fieldMap[data.field];
    const item = await db.select().from(media).where(eq(column, data.value)).limit(1);

    return item[0] ?? null;
  });

/**
 * Get collection stats.
 */
export const getMediaStats = createServerFn({ method: "GET" }).handler(async () => {
  const db = getDb();

  const [totalResult] = await db.select({ count: sql<number>`count(*)` }).from(media);

  const typeCounts = await db
    .select({
      mediaType: media.mediaType,
      count: sql<number>`count(*)`,
    })
    .from(media)
    .groupBy(media.mediaType);

  return {
    total: totalResult.count,
    byType: Object.fromEntries(typeCounts.map((r) => [r.mediaType, r.count])),
  };
});
