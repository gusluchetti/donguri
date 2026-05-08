#!/usr/bin/env bun
import fs from "node:fs";
import path from "node:path";
import { and, isNotNull, isNull, or } from "drizzle-orm";
import { media } from "~/db/schema";
import type { DbType } from "./_upsert";
import type { ImportConfig } from "./config";
import { downloadIfNeeded } from "./download";

export interface AnimeOfflineStats {
  enriched: number;
  durationMs: number;
}

interface AnimeOfflineEntry {
  title: string;
  sources: string[];
  anilistId?: string;
  malId?: string;
  anidbId?: string;
}

interface AnimeOfflineDatabase {
  data: AnimeOfflineEntry[];
}

async function downloadAnimeOfflineIfNeeded(config: ImportConfig): Promise<string> {
  const targetPath = path.join(config.dataDir, "anime-offline-database.json");
  await downloadIfNeeded(
    "https://github.com/manami-project/anime-offline-database/releases/latest/download/anime-offline-database-minified.json",
    targetPath,
    config.supplementaryMaxAgeDays,
    "anime offline",
  );
  return targetPath;
}

function extractIdsFromSources(entry: AnimeOfflineEntry): {
  anilistId?: string;
  malId?: string;
  anidbId?: string;
} {
  const result: { anilistId?: string; malId?: string; anidbId?: string } = {};
  for (const source of entry.sources) {
    // AniList: https://anilist.co/anime/{id}
    const anilistMatch = source.match(/anilist\.co\/anime\/(\d+)/);
    if (anilistMatch) {
      result.anilistId = anilistMatch[1];
    }
    // MyAnimeList: https://myanimelist.net/anime/{id}
    const malMatch = source.match(/myanimelist\.net\/anime\/(\d+)/);
    if (malMatch) {
      result.malId = malMatch[1];
    }
    // AniDB: https://anidb.net/anime/{id} or /a{id}
    const anidbMatch1 = source.match(/anidb\.net\/anime\/(\d+)/);
    const anidbMatch2 = source.match(/\/a(\d+)/);
    if (anidbMatch1) {
      result.anidbId = anidbMatch1[1];
    } else if (anidbMatch2) {
      result.anidbId = anidbMatch2[1];
    }
  }
  return result;
}

async function parseAnimeOfflineDatabase(filePath: string): Promise<{
  byAnilistId: Map<string, AnimeOfflineEntry>;
  byMalId: Map<string, AnimeOfflineEntry>;
  byAnidbId: Map<string, AnimeOfflineEntry>;
}> {
  const content = fs.readFileSync(filePath, "utf-8");
  const db = JSON.parse(content) as AnimeOfflineDatabase;
  console.log(`[anime offline] Parsed ${db.data.length} entries`);

  const byAnilistId = new Map<string, AnimeOfflineEntry>();
  const byMalId = new Map<string, AnimeOfflineEntry>();
  const byAnidbId = new Map<string, AnimeOfflineEntry>();

  for (const entry of db.data) {
    const ids = extractIdsFromSources(entry);
    if (ids.anilistId) byAnilistId.set(ids.anilistId, { ...entry, ...ids });
    if (ids.malId) byMalId.set(ids.malId, { ...entry, ...ids });
    if (ids.anidbId) byAnidbId.set(ids.anidbId, { ...entry, ...ids });
  }

  console.log(
    `[anime offline] Built maps: AniList=${byAnilistId.size}, MAL=${byMalId.size}, AniDB=${byAnidbId.size}`,
  );
  return { byAnilistId, byMalId, byAnidbId };
}

async function findMediaNeedingEnrichment(db: DbType): Promise<
  Array<{
    id: string;
    wikidataId: string;
    title: string;
    anilistId: string | null;
    malId: string | null;
    anidbId: string | null;
  }>
> {
  const rows = await db
    .select({
      id: media.id,
      wikidataId: media.wikidataId,
      title: media.title,
      anilistId: media.anilistId,
      malId: media.malId,
      anidbId: media.anidbId,
    })
    .from(media)
    .where(
      or(
        and(isNull(media.anilistId), isNotNull(media.malId)),
        and(isNull(media.malId), isNotNull(media.anilistId)),
        and(isNull(media.anidbId), isNotNull(media.anilistId)),
        and(isNull(media.anidbId), isNotNull(media.malId)),
      ),
    );

  console.log(`[anime offline] Found ${rows.length} media items needing ID enrichment`);
  return rows;
}

async function enrichMediaIds(
  db: DbType,
  rows: Array<{
    id: string;
    wikidataId: string;
    title: string;
    anilistId: string | null;
    malId: string | null;
    anidbId: string | null;
  }>,
  byAnilistId: Map<string, AnimeOfflineEntry>,
  byMalId: Map<string, AnimeOfflineEntry>,
  byAnidbId: Map<string, AnimeOfflineEntry>,
): Promise<{ updated: number }> {
  const updates: Array<{
    id: string;
    newAnilistId: string | null;
    newMalId: string | null;
    newAnidbId: string | null;
  }> = [];

  for (const row of rows) {
    let entry: AnimeOfflineEntry | undefined;

    if (row.anilistId && byAnilistId.has(row.anilistId)) {
      entry = byAnilistId.get(row.anilistId);
    } else if (row.malId && byMalId.has(row.malId)) {
      entry = byMalId.get(row.malId);
    } else if (row.anidbId && byAnidbId.has(row.anidbId)) {
      entry = byAnidbId.get(row.anidbId);
    }

    if (!entry) continue;

    const newAnilistId = row.anilistId ?? entry.anilistId ?? null;
    const newMalId = row.malId ?? entry.malId ?? null;
    const newAnidbId = row.anidbId ?? entry.anidbId ?? null;

    const changed =
      newAnilistId !== row.anilistId || newMalId !== row.malId || newAnidbId !== row.anidbId;

    if (changed) {
      updates.push({
        id: row.id,
        newAnilistId,
        newMalId,
        newAnidbId,
      });
    }
  }

  if (updates.length === 0) {
    console.log("[anime offline] No ID updates needed");
    return { updated: 0 };
  }

  const batchSize = 500;
  for (let i = 0; i < updates.length; i += batchSize) {
    const batch = updates.slice(i, i + batchSize);
    const placeholders = batch
      .map((_, idx) => `($${idx * 4 + 1}, $${idx * 4 + 2}, $${idx * 4 + 3}, $${idx * 4 + 4})`)
      .join(",");
    const values = batch.flatMap(({ id, newAnilistId, newMalId, newAnidbId }) => [
      id,
      newAnilistId,
      newMalId,
      newAnidbId,
    ]);
    await db.$client.unsafe(
      `
			UPDATE media
			SET
				anilist_id = data.anilist_id,
				mal_id = data.mal_id,
				anidb_id = data.anidb_id,
				updated_at = now()
			FROM (VALUES ${placeholders}) AS data(id, anilist_id, mal_id, anidb_id)
			WHERE media.id = data.id
		`,
      values,
    );
    console.log(
      `[anime offline] Updated batch ${i / batchSize + 1} (${Math.min(i + batchSize, updates.length)}/${updates.length})`,
    );
  }

  console.log(`[anime offline] Enriched ${updates.length} media items`);
  return { updated: updates.length };
}

export async function runAnimeOffline(
  db: DbType,
  config: ImportConfig,
): Promise<AnimeOfflineStats> {
  console.log("[anime offline] Starting anime offline database enrichment");
  const startTime = Date.now();

  try {
    const filePath = await downloadAnimeOfflineIfNeeded(config);
    const { byAnilistId, byMalId, byAnidbId } = await parseAnimeOfflineDatabase(filePath);
    const rows = await findMediaNeedingEnrichment(db);
    const { updated } = await enrichMediaIds(db, rows, byAnilistId, byMalId, byAnidbId);

    const durationMs = Date.now() - startTime;
    console.log(
      `[anime offline] Enrichment completed in ${(durationMs / 1000).toFixed(1)}s, updated ${updated} items`,
    );
    return { enriched: updated, durationMs };
  } catch (error) {
    console.error("[anime offline] Enrichment failed:", error);
    throw error;
  }
}
