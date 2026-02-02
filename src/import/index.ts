import fs from "node:fs";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import split2 from "split2";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { media, genres, mediaGenres, importProgress } from "../db/schema";
import { WikidataEntity } from "./types";
import { shouldImportEntity, isMediaEntity, hasExternalId, determineMediaType } from "./filters";
import { parseMediaEntity } from "./parser";
import type { ParsedMedia } from "./types";

const BATCH_SIZE = 500;
const PROGRESS_LOG_INTERVAL = 10000;

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000) % 60;
  const minutes = Math.floor(ms / 60000) % 60;
  const hours = Math.floor(ms / 3600000);
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

interface ImportStats {
  entitiesProcessed: number;
  entitiesImported: number;
  errors: number;
  genresFound: number;
}

interface GenreCache {
  [wikidataId: string]: string;
}

function parseJsonLine(line: string): WikidataEntity | null {
  let cleanLine = line.trim();
  if (cleanLine.endsWith(",")) cleanLine = cleanLine.slice(0, -1);
  if (cleanLine === "[" || cleanLine === "]" || !cleanLine) return null;
  try {
    return JSON.parse(cleanLine);
  } catch {
    return null;
  }
}

async function getOrCreateGenreIds(genreWikidataIds: string[], cache: GenreCache): Promise<string[]> {
  const result: string[] = [];

  for (const wikidataId of genreWikidataIds) {
    if (cache[wikidataId]) {
      result.push(cache[wikidataId]);
      continue;
    }

    const existing = await db
      .select({ id: genres.id })
      .from(genres)
      .where(eq(genres.wikidataId, wikidataId))
      .limit(1);

    if (existing.length > 0) {
      cache[wikidataId] = existing[0].id;
      result.push(existing[0].id);
      continue;
    }

    const inserted = await db
      .insert(genres)
      .values({ wikidataId })
      .onConflictDoNothing()
      .returning({ id: genres.id });

    if (inserted.length > 0) {
      cache[wikidataId] = inserted[0].id;
      result.push(inserted[0].id);
    } else {
      const refetch = await db
        .select({ id: genres.id })
        .from(genres)
        .where(eq(genres.wikidataId, wikidataId))
        .limit(1);
      if (refetch.length > 0) {
        cache[wikidataId] = refetch[0].id;
        result.push(refetch[0].id);
      }
    }
  }

  return result;
}

async function insertBatch(batch: ParsedMedia[], genreCache: GenreCache, stats: ImportStats): Promise<void> {
  if (batch.length === 0) return;

  try {
    // Bulk insert all media items
    const mediaValues = batch.map((item) => ({
      wikidataId: item.wikidataId,
      mediaType: item.mediaType,
      titleEn: item.titleEn,
      titleOriginal: item.titleOriginal,
      originalLanguage: item.originalLanguage,
      descriptionEn: item.descriptionEn,
      startYear: item.startYear,
      endYear: item.endYear,
      imdbId: item.imdbId,
      malId: item.malId,
      seasonCount: item.seasonCount,
      episodeCount: item.episodeCount,
    }));

    const inserted = await db.insert(media).values(mediaValues).onConflictDoNothing().returning({ id: media.id, wikidataId: media.wikidataId });

    stats.entitiesImported += inserted.length;

    // Build wikidataId -> dbId map for genre linking
    const wikidataToDbId = new Map(inserted.map((r) => [r.wikidataId, r.id]));

    // Collect all genre relationships
    const genreRelations: { mediaId: string; genreId: string }[] = [];

    for (const item of batch) {
      const mediaId = wikidataToDbId.get(item.wikidataId);
      if (!mediaId || item.genreIds.length === 0) continue;

      const genreDbIds = await getOrCreateGenreIds(item.genreIds, genreCache);
      stats.genresFound += genreDbIds.length;

      for (const genreId of genreDbIds) {
        genreRelations.push({ mediaId, genreId });
      }
    }

    // Bulk insert genre relationships
    if (genreRelations.length > 0) {
      await db.insert(mediaGenres).values(genreRelations).onConflictDoNothing();
    }
  } catch (error) {
    stats.errors += batch.length;
    console.error("Batch insert error:", error);
  }
}

async function updateProgress(
  progressId: string,
  stats: ImportStats,
  lastEntityId: string | null,
  status: string = "running"
): Promise<void> {
  await db
    .update(importProgress)
    .set({
      entitiesProcessed: stats.entitiesProcessed,
      entitiesImported: stats.entitiesImported,
      lastEntityId,
      status,
      ...(status === "completed" ? { completedAt: new Date() } : {}),
    })
    .where(eq(importProgress.id, progressId));
}

// ============ Test Mode ============

interface TestStats {
  totalEntities: number;
  mediaEntities: number;
  mediaWithExternalIds: number;
  byType: { movies: number; tvSeries: number; anime: number };
}

async function runTest(filePath: string, limit: number = 100): Promise<void> {
  console.log(`Testing dump: ${filePath}`);
  console.log(`Processing first ${limit} entities\n`);

  const stats: TestStats = {
    totalEntities: 0,
    mediaEntities: 0,
    mediaWithExternalIds: 0,
    byType: { movies: 0, tvSeries: 0, anime: 0 },
  };

  const samples: Array<{ id: string; type: string; titles: string[]; imdb: boolean; mal: boolean }> = [];
  let done = false;

  const processStream = new Transform({
    objectMode: true,
    transform(line: string, _encoding, callback) {
      if (done) return callback();

      const entity = parseJsonLine(line);
      if (!entity) return callback();

      stats.totalEntities++;

      if (isMediaEntity(entity)) {
        stats.mediaEntities++;
        const type = determineMediaType(entity);
        if (type === "movie") stats.byType.movies++;
        else if (type === "tv_series") stats.byType.tvSeries++;
        else if (type === "anime") stats.byType.anime++;

        if (hasExternalId(entity)) stats.mediaWithExternalIds++;

        if (samples.length < 10) {
          samples.push({
            id: entity.id,
            type: type || "unknown",
            titles: [entity.labels?.en?.value, entity.labels?.ja?.value].filter(Boolean) as string[],
            imdb: !!entity.claims?.P345?.length,
            mal: !!entity.claims?.P4086?.length,
          });
        }
      }

      if (stats.totalEntities >= limit) {
        done = true;
        this.destroy();
      }

      callback();
    },
  });

  try {
    await pipeline(fs.createReadStream(filePath), split2(), processStream);
  } catch (error) {
    if (!(error instanceof Error && (error as NodeJS.ErrnoException).code === "ERR_STREAM_PREMATURE_CLOSE")) {
      throw error;
    }
  }

  console.log("=== Results ===\n");
  console.log(`Total: ${stats.totalEntities}`);
  console.log(`Media: ${stats.mediaEntities}`);
  console.log(`With external IDs: ${stats.mediaWithExternalIds}`);
  console.log(`\nBy type: Movies=${stats.byType.movies}, TV=${stats.byType.tvSeries}, Anime=${stats.byType.anime}`);

  if (samples.length > 0) {
    console.log("\n=== Samples ===\n");
    for (const s of samples) {
      console.log(`${s.id} (${s.type}) - ${s.titles.join(" / ") || "(no title)"} [IMDb:${s.imdb}, MAL:${s.mal}]`);
    }
  }
}

// ============ Full Import ============

async function cleanTables(): Promise<void> {
  console.log("Cleaning tables...");
  await db.delete(mediaGenres);
  await db.delete(media);
  await db.delete(genres);
  await db.delete(importProgress);
  console.log("Tables cleaned.\n");
}

export async function runImport(
  filePath: string,
  options: { resumeFrom?: string; maxEntities?: number; clean?: boolean } = {}
): Promise<ImportStats> {
  const { resumeFrom, maxEntities, clean } = options;

  if (clean) await cleanTables();

  console.log(`Importing from: ${filePath}`);
  if (resumeFrom) console.log(`Resuming from: ${resumeFrom}`);
  if (maxEntities) console.log(`Max entities: ${maxEntities}`);
  console.log();

  const [progressRecord] = await db
    .insert(importProgress)
    .values({ sourceFile: filePath, status: "running", startedAt: new Date() })
    .returning({ id: importProgress.id });

  const progressId = progressRecord.id;
  const stats: ImportStats = { entitiesProcessed: 0, entitiesImported: 0, errors: 0, genresFound: 0 };
  const genreCache: GenreCache = {};
  let batch: ParsedMedia[] = [];
  let lastEntityId: string | null = null;
  let skipping = !!resumeFrom;
  const startTime = Date.now();
  let lastLogTime = startTime;

  const processEntity = async (entity: WikidataEntity): Promise<void> => {
    stats.entitiesProcessed++;
    lastEntityId = entity.id;

    if (skipping) {
      if (entity.id === resumeFrom) {
        skipping = false;
        console.log(`Found resume point: ${resumeFrom}`);
      }
      return;
    }

    if (!shouldImportEntity(entity)) return;

    const parsed = parseMediaEntity(entity);
    if (!parsed) return;

    batch.push(parsed);

    if (batch.length >= BATCH_SIZE) {
      await insertBatch(batch, genreCache, stats);

      const now = Date.now();
      const elapsed = now - startTime;
      const intervalRate = BATCH_SIZE / ((now - lastLogTime) / 1000);
      lastLogTime = now;

      console.log(
        `[${formatDuration(elapsed)}] ${lastEntityId} | ` +
        `Processed: ${stats.entitiesProcessed.toLocaleString()} | ` +
        `Imported: ${stats.entitiesImported.toLocaleString()} | ` +
        `Rate: ${Math.round(intervalRate).toLocaleString()}/s`
      );

      batch = [];

      if (stats.entitiesProcessed % PROGRESS_LOG_INTERVAL === 0) {
        await updateProgress(progressId, stats, lastEntityId);
      }
    }

    if (maxEntities && stats.entitiesProcessed >= maxEntities) {
      throw new Error("MAX_ENTITIES_REACHED");
    }
  };

  const processStream = new Transform({
    objectMode: true,
    async transform(line: string, _encoding, callback) {
      const entity = parseJsonLine(line);
      if (entity) {
        try {
          await processEntity(entity);
        } catch (error) {
          if (error instanceof Error && error.message === "MAX_ENTITIES_REACHED") {
            this.destroy();
            return;
          }
          console.error("Error processing entity:", error);
        }
      }
      callback();
    },
  });

  try {
    await pipeline(fs.createReadStream(filePath), split2(), processStream);
  } catch (error) {
    if (!(error instanceof Error && (error as NodeJS.ErrnoException).code === "ERR_STREAM_PREMATURE_CLOSE")) {
      throw error;
    }
  }

  if (batch.length > 0) {
    await insertBatch(batch, genreCache, stats);
  }

  await updateProgress(progressId, stats, lastEntityId, "completed");

  const totalTime = Date.now() - startTime;
  const avgRate = stats.entitiesProcessed / (totalTime / 1000);

  console.log("\n=== Complete ===");
  console.log(`Time: ${formatDuration(totalTime)}`);
  console.log(`Processed: ${stats.entitiesProcessed.toLocaleString()}`);
  console.log(`Imported: ${stats.entitiesImported.toLocaleString()}`);
  console.log(`Genres: ${stats.genresFound.toLocaleString()}`);
  console.log(`Errors: ${stats.errors}`);
  console.log(`Avg rate: ${Math.round(avgRate).toLocaleString()}/s`);

  return stats;
}

// ============ CLI ============

if (import.meta.main) {
  const args = process.argv.slice(2);
  const isFull = args.includes("--full");
  const clean = args.includes("--clean");
  const filePath = args.find((a) => !a.startsWith("--"));
  if (!filePath) throw Error('Missing file path')
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : undefined;

  if (isFull) {
    runImport(filePath, { maxEntities: limit, clean })
      .then(() => process.exit(0))
      .catch((e) => {
        console.error(e);
        process.exit(1);
      });
  } else {
    runTest(filePath, limit || 100)
      .then(() => process.exit(0))
      .catch((e) => {
        console.error(e);
        process.exit(1);
      });
  }
}
