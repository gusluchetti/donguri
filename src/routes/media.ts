import { Elysia, t } from "elysia";
import { eq, or, sql, and, count } from "drizzle-orm";
import { db } from "../db";
import { media, genres, mediaGenres } from "../db/schema";

export const mediaRoutes = new Elysia({ prefix: "/media" })
  // List media with pagination, filtering, and search
  .get(
    "/",
    async ({ query, set }) => {
      set.headers['Cache-Control'] = 'public, max-age=1800';

      const {
        page = 1,
        limit = 20,
        type,
        search,
      } = query;

      const offset = (page - 1) * limit;

      const conditions = [];

      if (type) {
        conditions.push(eq(media.mediaType, type));
      }

      if (search) {
        // Use word_similarity operator (<<%) - finds search term within longer titles
        conditions.push(
          or(
            sql`${search} <<% ${media.titleEn}`,
            sql`${search} <<% ${media.titleOriginal}`
          )
        );
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [items, totalResult] = await Promise.all([
        db
          .select()
          .from(media)
          .where(whereClause)
          .orderBy(
            search
              ? sql`GREATEST(
                  COALESCE(word_similarity(${search}, ${media.titleEn}), 0),
                  COALESCE(word_similarity(${search}, ${media.titleOriginal}), 0)
                ) DESC`
              : media.id
          )
          .limit(limit)
          .offset(offset),
        db
          .select({ count: count() })
          .from(media)
          .where(whereClause),
      ]);

      const total = totalResult[0]?.count ?? 0;

      return {
        data: items,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    },
    {
      query: t.Object({
        page: t.Optional(t.Numeric({ minimum: 1, default: 1 })),
        limit: t.Optional(t.Numeric({ minimum: 1, maximum: 100, default: 20 })),
        type: t.Optional(t.Union([
          t.Literal("movie"),
          t.Literal("tv_series"),
          t.Literal("anime"),
        ])),
        search: t.Optional(t.String()),
      }),
    }
  )

  // Get statistics (must be before /:wikidataId to avoid matching "stats" as an ID)
  .get("/stats", async ({ set }) => {
    set.headers['Cache-Control'] = 'public, max-age=1800';

    const [
      totalMedia,
      movieCount,
      tvSeriesCount,
      animeCount,
      withImdb,
      withMal,
      genreCount,
    ] = await Promise.all([
      db.select({ count: count() }).from(media),
      db.select({ count: count() }).from(media).where(eq(media.mediaType, "movie")),
      db.select({ count: count() }).from(media).where(eq(media.mediaType, "tv_series")),
      db.select({ count: count() }).from(media).where(eq(media.mediaType, "anime")),
      db.select({ count: count() }).from(media).where(sql`${media.imdbId} IS NOT NULL`),
      db.select({ count: count() }).from(media).where(sql`${media.malId} IS NOT NULL`),
      db.select({ count: count() }).from(genres),
    ]);

    return {
      total: totalMedia[0]?.count ?? 0,
      byType: {
        movie: movieCount[0]?.count ?? 0,
        tv_series: tvSeriesCount[0]?.count ?? 0,
        anime: animeCount[0]?.count ?? 0,
      },
      withExternalIds: {
        imdb: withImdb[0]?.count ?? 0,
        mal: withMal[0]?.count ?? 0,
      },
      genres: genreCount[0]?.count ?? 0,
    };
  })

  // Get media by Wikidata ID
  .get(
    "/wikidata/:wikidataId",
    async ({ params, set }) => {
      set.headers['Cache-Control'] = 'public, max-age=1800';

      const item = await db
        .select()
        .from(media)
        .where(eq(media.wikidataId, params.wikidataId))
        .limit(1);

      if (item.length === 0) {
        set.status = 404;
        return { error: "Media not found" };
      }

      // Get genres for this media
      const mediaGenresList = await db
        .select({
          id: genres.id,
          wikidataId: genres.wikidataId,
          nameEn: genres.nameEn,
          nameJa: genres.nameJa,
        })
        .from(mediaGenres)
        .innerJoin(genres, eq(mediaGenres.genreId, genres.id))
        .where(eq(mediaGenres.mediaId, item[0].id));

      return {
        ...item[0],
        genres: mediaGenresList,
      };
    },
    {
      params: t.Object({
        wikidataId: t.String(),
      }),
    }
  )

  // Get media by IMDb ID
  .get(
    "/imdb/:imdbId",
    async ({ params, set }) => {
      set.headers['Cache-Control'] = 'public, max-age=1800';

      const item = await db
        .select()
        .from(media)
        .where(eq(media.imdbId, params.imdbId))
        .limit(1);

      if (item.length === 0) {
        set.status = 404;
        return { error: "Media not found" };
      }

      return item[0];
    },
    {
      params: t.Object({
        imdbId: t.String(),
      }),
    }
  )

  // Get media by MAL ID
  .get(
    "/mal/:malId",
    async ({ params, set }) => {
      set.headers['Cache-Control'] = 'public, max-age=1800';

      const malId = parseInt(params.malId, 10);
      if (isNaN(malId)) {
        set.status = 400;
        return { error: "Invalid MAL ID" };
      }

      const item = await db
        .select()
        .from(media)
        .where(eq(media.malId, malId))
        .limit(1);

      if (item.length === 0) {
        set.status = 404;
        return { error: "Media not found" };
      }

      return item[0];
    },
    {
      params: t.Object({
        malId: t.String(),
      }),
    }
  );
