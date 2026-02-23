/**
 * Shared COPY → temp table → upsert logic for bulk media import.
 *
 * Used by both the full import (index.ts) and incremental updates (incremental.ts).
 */

import { Writable } from "node:stream";
import { inArray } from "drizzle-orm";
import { ulid } from "ulid";
import type { getDb } from "../db";
import { genres, mediaGenres, mediaPlatforms, platforms } from "../db/schema";
import { withRetry } from "./_retry";
import type { ParsedMedia } from "./_types";

export type DbType = ReturnType<typeof getDb>;

export interface ImportStats {
  entitiesProcessed: number;
  entitiesImported: number;
  entitiesNew: number;
  entitiesUpdated: number;
  errors: number;
  genresFound: number;
  platformsFound: number;
  byType: Record<string, number>;
}

// ─── Staging table columns (matches media table layout) ─────────────────────

export const STAGING_COLUMNS = [
  "id",
  "wikidata_id",
  "media_type",
  "title",
  "original_title",
  "original_language",
  "description",
  "start_year",
  "end_year",
  "runtime_minutes",
  "season_count",
  "episode_count",
  "sitelinks_count",
  "country_of_origin",
  "imdb_id",
  "tmdb_id",
  "mal_id",
  "anilist_id",
  "anidb_id",
  "igdb_id",
  "ann_id",
  "tvdb_id",
  "tvmaze_id",
  "search_title",
] as const;

// ─── TSV escaping for COPY ──────────────────────────────────────────────────

/** Escape a string value for tab-delimited COPY format. */
export function escapeTsv(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\t/g, "\\t")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r");
}

/** Format a single row as a TSV line for COPY. */
export function toTsvRow(item: ParsedMedia, rowId: string): string {
  const fields: string[] = [
    rowId,
    item.wikidataId,
    item.mediaType,
    escapeTsv(item.title),
    item.originalTitle != null ? escapeTsv(item.originalTitle) : "\\N",
    item.originalLanguage ?? "\\N",
    item.description != null ? escapeTsv(item.description) : "\\N",
    item.startYear != null ? String(item.startYear) : "\\N",
    item.endYear != null ? String(item.endYear) : "\\N",
    item.runtimeMinutes != null ? String(item.runtimeMinutes) : "\\N",
    item.seasonCount != null ? String(item.seasonCount) : "\\N",
    item.episodeCount != null ? String(item.episodeCount) : "\\N",
    String(item.sitelinksCount),
    item.countryOfOrigin ?? "\\N",
    item.imdbId ?? "\\N",
    item.tmdbId ?? "\\N",
    item.malId ?? "\\N",
    item.anilistId ?? "\\N",
    item.anidbId ?? "\\N",
    item.igdbId ?? "\\N",
    item.annId ?? "\\N",
    item.tvdbId ?? "\\N",
    item.tvmazeId ?? "\\N",
    escapeTsv(item.searchTitle),
  ];
  return fields.join("\t");
}

// ─── DB helpers ─────────────────────────────────────────────────────────────

/**
 * Batch-ensure genres exist, returning a map of wikidataId → dbId.
 */
export async function ensureGenres(
  db: DbType,
  wikidataIds: string[],
  cache: Record<string, string>,
): Promise<void> {
  const uncached = wikidataIds.filter((id) => !cache[id]);
  if (uncached.length === 0) return;

  const values = uncached.map((wikidataId) => ({ wikidataId, name: wikidataId }));
  await db.insert(genres).values(values).onConflictDoNothing();

  const rows = await db
    .select({ id: genres.id, wikidataId: genres.wikidataId })
    .from(genres)
    .where(inArray(genres.wikidataId, uncached));

  for (const row of rows) {
    cache[row.wikidataId] = row.id;
  }
}

/**
 * Batch-ensure platforms exist, same pattern as genres.
 */
export async function ensurePlatforms(
  db: DbType,
  wikidataIds: string[],
  cache: Record<string, string>,
): Promise<void> {
  const uncached = wikidataIds.filter((id) => !cache[id]);
  if (uncached.length === 0) return;

  const values = uncached.map((wikidataId) => ({ wikidataId, name: wikidataId }));
  await db.insert(platforms).values(values).onConflictDoNothing();

  const rows = await db
    .select({ id: platforms.id, wikidataId: platforms.wikidataId })
    .from(platforms)
    .where(inArray(platforms.wikidataId, uncached));

  for (const row of rows) {
    cache[row.wikidataId] = row.id;
  }
}

/**
 * COPY batch into a temp staging table, then merge into media via upsert.
 * Returns the wikidata_id → db id mapping for the batch.
 */
export async function processSuperBatch(
  db: DbType,
  batch: ParsedMedia[],
  genreCache: Record<string, string>,
  platformCache: Record<string, string>,
  stats: ImportStats,
): Promise<void> {
  if (batch.length === 0) return;

  try {
    // 1. Ensure genres and platforms exist (via Drizzle, cached)
    const allGenreIds = new Set<string>();
    const allPlatformIds = new Set<string>();
    for (const item of batch) {
      for (const id of item.genreIds) allGenreIds.add(id);
      for (const id of item.platformIds) allPlatformIds.add(id);
    }

    await withRetry(
      () =>
        Promise.all([
          allGenreIds.size > 0 ? ensureGenres(db, [...allGenreIds], genreCache) : undefined,
          allPlatformIds.size > 0
            ? ensurePlatforms(db, [...allPlatformIds], platformCache)
            : undefined,
        ]),
      "ensure genres/platforms",
    );

    // 2. Pre-generate ULIDs for each row
    const rowIds = batch.map(() => ulid());

    // 3. COPY → temp table → upsert merge, all in one transaction
    const upserted = await withRetry(
      () =>
        db.$client.begin(async (tx) => {
          // Create temp staging table (dropped on commit)
          await tx.unsafe(`
						CREATE TEMP TABLE _media_staging (
							id TEXT NOT NULL,
							wikidata_id TEXT NOT NULL,
							media_type TEXT NOT NULL,
							title TEXT NOT NULL,
							original_title TEXT,
							original_language TEXT,
							description TEXT,
							start_year INTEGER,
							end_year INTEGER,
							runtime_minutes INTEGER,
							season_count INTEGER,
							episode_count INTEGER,
							sitelinks_count INTEGER DEFAULT 0,
							country_of_origin TEXT,
							imdb_id TEXT,
							tmdb_id TEXT,
							mal_id TEXT,
							anilist_id TEXT,
							anidb_id TEXT,
							igdb_id TEXT,
							ann_id TEXT,
							tvdb_id TEXT,
							tvmaze_id TEXT,
							search_title TEXT
						) ON COMMIT DROP
					`);

          // COPY data into staging table
          const writable = await tx
            .unsafe(`COPY _media_staging (${STAGING_COLUMNS.join(", ")}) FROM STDIN`)
            .writable();

          await new Promise<void>((resolve, reject) => {
            // Build all TSV data at once and write it
            const lines: string[] = [];
            for (let i = 0; i < batch.length; i++) {
              lines.push(toTsvRow(batch[i], rowIds[i]));
            }
            const data = `${lines.join("\n")}\n`;

            const passThrough = new Writable({
              write(chunk, _encoding, callback) {
                writable.write(chunk, callback);
              },
              final(callback) {
                writable.end(callback);
              },
            });

            writable.on("error", reject);
            passThrough.on("error", reject);
            writable.on("close", resolve);

            passThrough.end(data);
          });

          // Merge staging → media with upsert
          const result = await tx.unsafe(`
						INSERT INTO media (
							id, wikidata_id, media_type, title, original_title, original_language,
							description, start_year, end_year, runtime_minutes, season_count,
							episode_count, sitelinks_count, country_of_origin,
							imdb_id, tmdb_id, mal_id, anilist_id, anidb_id, igdb_id,
							ann_id, tvdb_id, tvmaze_id, search_title, created_at, updated_at
						)
						SELECT
							s.id, s.wikidata_id, s.media_type, s.title, s.original_title,
							s.original_language, s.description, s.start_year, s.end_year,
							s.runtime_minutes, s.season_count, s.episode_count, s.sitelinks_count,
							s.country_of_origin, s.imdb_id, s.tmdb_id, s.mal_id, s.anilist_id,
							s.anidb_id, s.igdb_id, s.ann_id, s.tvdb_id, s.tvmaze_id,
							s.search_title, now(), now()
						FROM _media_staging s
						ON CONFLICT (wikidata_id) DO UPDATE SET
							title = COALESCE(EXCLUDED.title, media.title),
							original_title = COALESCE(EXCLUDED.original_title, media.original_title),
							original_language = COALESCE(EXCLUDED.original_language, media.original_language),
							description = COALESCE(EXCLUDED.description, media.description),
							start_year = COALESCE(EXCLUDED.start_year, media.start_year),
							end_year = COALESCE(EXCLUDED.end_year, media.end_year),
							runtime_minutes = COALESCE(EXCLUDED.runtime_minutes, media.runtime_minutes),
							season_count = COALESCE(EXCLUDED.season_count, media.season_count),
							episode_count = COALESCE(EXCLUDED.episode_count, media.episode_count),
							sitelinks_count = GREATEST(EXCLUDED.sitelinks_count, media.sitelinks_count),
							country_of_origin = COALESCE(EXCLUDED.country_of_origin, media.country_of_origin),
							imdb_id = COALESCE(EXCLUDED.imdb_id, media.imdb_id),
							tmdb_id = COALESCE(EXCLUDED.tmdb_id, media.tmdb_id),
							mal_id = COALESCE(EXCLUDED.mal_id, media.mal_id),
							anilist_id = COALESCE(EXCLUDED.anilist_id, media.anilist_id),
							anidb_id = COALESCE(EXCLUDED.anidb_id, media.anidb_id),
							igdb_id = COALESCE(EXCLUDED.igdb_id, media.igdb_id),
							ann_id = COALESCE(EXCLUDED.ann_id, media.ann_id),
							tvdb_id = COALESCE(EXCLUDED.tvdb_id, media.tvdb_id),
							tvmaze_id = COALESCE(EXCLUDED.tvmaze_id, media.tvmaze_id),
							search_title = COALESCE(EXCLUDED.search_title, media.search_title),
							updated_at = now()
						RETURNING id, wikidata_id, (xmax = 0) AS is_new
					`);

          return result as unknown as { id: string; wikidata_id: string; is_new: boolean }[];
        }),
      "COPY + upsert media",
    );

    const batchNew = upserted.filter((r) => r.is_new).length;
    const batchUpdated = upserted.length - batchNew;
    stats.entitiesImported += upserted.length;
    stats.entitiesNew += batchNew;
    stats.entitiesUpdated += batchUpdated;

    // 4. Build genre/platform relations from returned id mapping
    const wikidataToDbId = new Map(upserted.map((r) => [r.wikidata_id, r.id]));

    const genreRelations: { mediaId: string; genreId: string }[] = [];
    const platformRelations: { mediaId: string; platformId: string }[] = [];

    for (const item of batch) {
      const mediaId = wikidataToDbId.get(item.wikidataId);
      if (!mediaId) continue;

      for (const wikidataId of item.genreIds) {
        const genreId = genreCache[wikidataId];
        if (genreId) {
          genreRelations.push({ mediaId, genreId });
          stats.genresFound++;
        }
      }

      for (const wikidataId of item.platformIds) {
        const platformId = platformCache[wikidataId];
        if (platformId) {
          platformRelations.push({ mediaId, platformId });
          stats.platformsFound++;
        }
      }
    }

    // 5. Bulk insert relations via Drizzle (small, COPY overkill)
    await withRetry(
      () =>
        Promise.all([
          genreRelations.length > 0
            ? db.insert(mediaGenres).values(genreRelations).onConflictDoNothing()
            : undefined,
          platformRelations.length > 0
            ? db.insert(mediaPlatforms).values(platformRelations).onConflictDoNothing()
            : undefined,
        ]),
      "insert relations",
    );

    console.log(
      `  Batch: ${batchNew} new, ${batchUpdated} updated, ${genreRelations.length} genre links, ${platformRelations.length} platform links`,
    );
  } catch (error) {
    stats.errors += batch.length;
    console.error("Super-batch error:", error);
  }
}
