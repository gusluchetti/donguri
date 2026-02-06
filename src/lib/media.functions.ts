import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { eq, desc, and, sql, like, inArray } from "drizzle-orm";
import { getDb } from "../db";
import { media, genres, mediaGenres, platforms, mediaPlatforms } from "../db/schema";

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

// ─── Server functions ───────────────────────────────────────────────────────

/**
 * List media with cursor-based pagination, optional type filter and search.
 * Default sort: sitelinks_count DESC (popularity).
 */
export const listMedia = createServerFn({ method: "GET" })
  .validator(ListMediaInput)
  .handler(async ({ data }) => {
    const db = getDb();
    const { cursor, limit, mediaType, search } = data;

    // Search mode: FTS5 or LIKE fallback
    if (search && search.trim()) {
      const searchTerm = search.trim();
      let matchingIds: string[] = [];

      // Try FTS5 first
      try {
        const ftsQuery = searchTerm
          .split(/\s+/)
          .map((word) => `"${word}"*`)
          .join(" ");
        const ftsResults = await db.all(
          sql`SELECT m.id FROM media m JOIN media_fts f ON m.rowid = f.rowid WHERE media_fts MATCH ${ftsQuery} LIMIT ${limit + 1}`,
        );
        matchingIds = (ftsResults as { id: string }[]).map((r) => r.id);
      } catch {
        // FTS fallback: LIKE on search_title
        const normalized = searchTerm
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .replace(/[^\w\s]/g, "")
          .trim();

        const conditions = [like(media.searchTitle, `%${normalized}%`)];
        if (mediaType) conditions.push(eq(media.mediaType, mediaType));

        const results = await db
          .select({ id: media.id })
          .from(media)
          .where(and(...conditions))
          .orderBy(desc(media.sitelinksCount))
          .limit(limit + 1);

        matchingIds = results.map((r) => r.id);
      }

      if (matchingIds.length === 0) {
        return { items: [], nextCursor: null };
      }

      // Apply type filter and fetch full records
      const conditions = [inArray(media.id, matchingIds)];
      if (mediaType) conditions.push(eq(media.mediaType, mediaType));

      const items = await db
        .select()
        .from(media)
        .where(and(...conditions))
        .orderBy(desc(media.sitelinksCount))
        .limit(limit + 1);

      const hasMore = items.length > limit;
      const page = hasMore ? items.slice(0, limit) : items;

      return {
        items: page,
        nextCursor: hasMore ? page[page.length - 1].id : null,
      };
    }

    // Standard browse mode: cursor-based pagination by sitelinks_count
    const conditions = [];
    if (mediaType) conditions.push(eq(media.mediaType, mediaType));

    if (cursor) {
      // Get the sitelinks count of the cursor item for keyset pagination
      const cursorItem = await db
        .select({ sitelinksCount: media.sitelinksCount, id: media.id })
        .from(media)
        .where(eq(media.id, cursor))
        .limit(1);

      if (cursorItem.length > 0) {
        const sc = cursorItem[0].sitelinksCount ?? 0;
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
  .validator(GetMediaInput)
  .handler(async ({ data }) => {
    const db = getDb();

    const item = await db
      .select()
      .from(media)
      .where(eq(media.wikidataId, data.wikidataId))
      .limit(1);

    if (item.length === 0) return null;

    // Fetch genres
    const itemGenres = await db
      .select({ id: genres.id, name: genres.name, wikidataId: genres.wikidataId })
      .from(mediaGenres)
      .innerJoin(genres, eq(mediaGenres.genreId, genres.id))
      .where(eq(mediaGenres.mediaId, item[0].id));

    // Fetch platforms
    const itemPlatforms = await db
      .select({ id: platforms.id, name: platforms.name, wikidataId: platforms.wikidataId })
      .from(mediaPlatforms)
      .innerJoin(platforms, eq(mediaPlatforms.platformId, platforms.id))
      .where(eq(mediaPlatforms.mediaId, item[0].id));

    return {
      ...item[0],
      genres: itemGenres,
      platforms: itemPlatforms,
    };
  });

/**
 * Get media by external ID (IMDb, TMDB, MAL, IGDB).
 */
export const getMediaByExternalId = createServerFn({ method: "GET" })
  .validator(GetMediaByExternalIdInput)
  .handler(async ({ data }) => {
    const db = getDb();

    const fieldMap = {
      imdb: media.imdbId,
      tmdb: media.tmdbId,
      mal: media.malId,
      igdb: media.igdbId,
    } as const;

    const column = fieldMap[data.field];
    const item = await db
      .select()
      .from(media)
      .where(eq(column, data.value))
      .limit(1);

    return item[0] ?? null;
  });

/**
 * Get collection stats.
 */
export const getMediaStats = createServerFn({ method: "GET" }).handler(
  async () => {
    const db = getDb();

    const [totalResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(media);

    const typeCounts = await db
      .select({
        mediaType: media.mediaType,
        count: sql<number>`count(*)`,
      })
      .from(media)
      .groupBy(media.mediaType);

    return {
      total: totalResult.count,
      byType: Object.fromEntries(
        typeCounts.map((r) => [r.mediaType, r.count]),
      ),
    };
  },
);
