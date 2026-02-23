/**
 * MediaSource abstraction — unifies DB and in-memory cache access.
 *
 * DbSource: logged-in users → Postgres (full catalog, keyset pagination, pg_trgm search)
 * CacheSource: logged-out users → in-memory popular cache (top 1k/type, client-side search)
 */

import { and, asc, desc, eq, getTableColumns, sql } from "drizzle-orm";
import { getDb } from "~/db";
import { type Media, media } from "~/db/schema";
import type { SessionData } from "~/features/auth/auth.session";
import { normalizeForSearch } from "~/lib/search";
import { getCacheArrays } from "./popular-cache";

type MediaType = "movie" | "tv_series" | "anime" | "game";

type ListResult = {
  items: Media[];
  nextCursor: string | null;
};

export interface MediaSource {
  list(params: { cursor?: string; limit: number; mediaType?: MediaType }): Promise<ListResult>;
  search(
    query: string,
    params: { cursor?: string; limit: number; mediaType?: MediaType },
  ): Promise<ListResult>;
  randomId(mediaType?: MediaType): Promise<string | null>;
}

// ─── DbSource ───────────────────────────────────────────────────────────────

class DbSource implements MediaSource {
  async list({
    cursor,
    limit,
    mediaType,
  }: {
    cursor?: string;
    limit: number;
    mediaType?: MediaType;
  }): Promise<ListResult> {
    const db = getDb();
    const conditions = [];

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
  }

  async search(
    searchTerm: string,
    { cursor, limit, mediaType }: { cursor?: string; limit: number; mediaType?: MediaType },
  ): Promise<ListResult> {
    const db = getDb();
    const offset = cursor ? Number.parseInt(cursor, 10) : 0;
    const normalizedTerm = normalizeForSearch(searchTerm);
    const ilikeTerm = `%${searchTerm.replace(/[%_\\]/g, "\\$&")}%`;
    const normalizedIlike = `%${normalizedTerm.replace(/[%_\\]/g, "\\$&")}%`;
    const aliasExact = `%|${searchTerm}|%`;
    const aliasIlike = `%|${searchTerm}|%`;
    const aliasLikeTerm = `%${searchTerm.replace(/[%_\\]/g, "\\$&")}%`;

    const relevance = sql<number>`GREATEST(
      CASE WHEN ${media.aliases} IS NOT NULL AND '|' || ${media.aliases} || '|' LIKE ${aliasExact} THEN 2.0 ELSE 0 END,
      CASE WHEN ${media.aliases} IS NOT NULL AND '|' || ${media.aliases} || '|' ILIKE ${aliasIlike} THEN 1.9 ELSE 0 END,
      word_similarity(${searchTerm}, ${media.title}),
      word_similarity(${searchTerm}, COALESCE(${media.originalTitle}, '')),
      word_similarity(${normalizedTerm}, COALESCE(${media.searchTitle}, ''))
    )`;

    const fuzzyCondition = sql`(
      ${searchTerm} <% ${media.title}
      OR ${searchTerm} <% COALESCE(${media.originalTitle}, '')
      OR ${normalizedTerm} <% COALESCE(${media.searchTitle}, '')
      OR ${media.title} ILIKE ${ilikeTerm}
      OR ${media.originalTitle} ILIKE ${ilikeTerm}
      OR ${media.searchTitle} ILIKE ${normalizedIlike}
      OR ${media.aliases} ILIKE ${aliasLikeTerm}
    )`;

    const conditions = [fuzzyCondition];
    if (mediaType) conditions.push(eq(media.mediaType, mediaType));

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

  async randomId(mediaType?: MediaType): Promise<string | null> {
    const db = getDb();
    const condition = mediaType ? eq(media.mediaType, mediaType) : undefined;

    const [countRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(media)
      .where(condition);

    const total = Number(countRow.count);
    if (total === 0) return null;

    const offset = Math.floor(Math.random() * total);
    const [row] = await db
      .select({ wikidataId: media.wikidataId })
      .from(media)
      .where(condition)
      .offset(offset)
      .limit(1);

    return row?.wikidataId ?? null;
  }
}

// ─── CacheSource ────────────────────────────────────────────────────────────

class CacheSource implements MediaSource {
  async list({
    cursor,
    limit,
    mediaType,
  }: {
    cursor?: string;
    limit: number;
    mediaType?: MediaType;
  }): Promise<ListResult> {
    const { byType, all } = await getCacheArrays();
    const source = mediaType ? byType[mediaType] : all;
    const offset = cursor ? Number.parseInt(cursor, 10) : 0;
    const page = source.slice(offset, offset + limit);
    const hasMore = offset + limit < source.length;

    return {
      items: page,
      nextCursor: hasMore ? String(offset + limit) : null,
    };
  }

  async search(
    searchTerm: string,
    { cursor, limit, mediaType }: { cursor?: string; limit: number; mediaType?: MediaType },
  ): Promise<ListResult> {
    const { byType, all } = await getCacheArrays();
    const source = mediaType ? byType[mediaType] : all;
    const lower = searchTerm.toLowerCase();
    const normalized = normalizeForSearch(searchTerm);

    const scored: { item: Media; score: number }[] = [];
    for (const item of source) {
      const titleLower = item.title.toLowerCase();
      const origLower = item.originalTitle?.toLowerCase() ?? "";
      const itemAliases = item.aliases ? item.aliases.split("|") : [];
      const searchTitleVal = item.searchTitle ?? "";

      if (itemAliases.includes(searchTerm)) {
        scored.push({ item, score: 5 });
        continue;
      }
      if (itemAliases.some((a) => a.toLowerCase() === lower)) {
        scored.push({ item, score: 4 });
        continue;
      }
      if (titleLower === lower || origLower === lower) {
        scored.push({ item, score: 3 });
      } else if (titleLower.startsWith(lower) || origLower.startsWith(lower)) {
        scored.push({ item, score: 2 });
      } else if (
        titleLower.includes(lower) ||
        origLower.includes(lower) ||
        searchTitleVal.includes(normalized)
      ) {
        scored.push({ item, score: 1 });
      }
    }

    scored.sort((a, b) => b.score - a.score);

    const offset = cursor ? Number.parseInt(cursor, 10) : 0;
    const page = scored.slice(offset, offset + limit).map((s) => s.item);
    const hasMore = offset + limit < scored.length;

    return {
      items: page,
      nextCursor: hasMore ? String(offset + limit) : null,
    };
  }

  async randomId(mediaType?: MediaType): Promise<string | null> {
    const { byType, all } = await getCacheArrays();
    const source = mediaType ? byType[mediaType] : all;
    if (source.length === 0) return null;
    return source[Math.floor(Math.random() * source.length)].wikidataId;
  }
}

// ─── Factory ────────────────────────────────────────────────────────────────

const dbSource = new DbSource();
const cacheSource = new CacheSource();

export function getMediaSource(session: SessionData | null): MediaSource {
  return session?.userId ? dbSource : cacheSource;
}
