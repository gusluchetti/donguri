import fs from "node:fs";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import unbzip2Stream from "unbzip2-stream";
import split2 from "split2";
import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import { media, genres, mediaGenres, importProgress } from "../db/schema";
import { WikidataEntity } from "./types";
import { shouldImportEntity } from "./filters";
import { parseMediaEntity } from "./parser";
import type { ParsedMedia } from "./types";

const BATCH_SIZE = 1000;
const PROGRESS_LOG_INTERVAL = 10000;

interface ImportStats {
  entitiesProcessed: number;
  entitiesImported: number;
  errors: number;
  genresFound: number;
}

interface GenreCache {
  [wikidataId: string]: string; // Wikidata ID -> database UUID
}

/**
 * Parse a JSON line from the Wikidata dump
 * Each line is either a JSON object or array element with trailing comma
 */
function parseJsonLine(line: string): WikidataEntity | null {
  // Remove trailing comma if present
  let cleanLine = line.trim();
  if (cleanLine.endsWith(",")) {
    cleanLine = cleanLine.slice(0, -1);
  }

  // Skip array brackets
  if (cleanLine === "[" || cleanLine === "]") {
    return null;
  }

  // Skip empty lines
  if (!cleanLine) {
    return null;
  }

  try {
    return JSON.parse(cleanLine);
  } catch {
    return null;
  }
}

/**
 * Insert or get genre IDs
 */
async function getOrCreateGenreIds(
  genreWikidataIds: string[],
  cache: GenreCache
): Promise<string[]> {
  const result: string[] = [];

  for (const wikidataId of genreWikidataIds) {
    // Check cache first
    if (cache[wikidataId]) {
      result.push(cache[wikidataId]);
      continue;
    }

    // Try to find existing genre
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

    // Create new genre (we'll update the name later when we encounter the genre entity)
    const inserted = await db
      .insert(genres)
      .values({ wikidataId })
      .onConflictDoNothing()
      .returning({ id: genres.id });

    if (inserted.length > 0) {
      cache[wikidataId] = inserted[0].id;
      result.push(inserted[0].id);
    } else {
      // Race condition: another process inserted it
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

/**
 * Insert a batch of media items
 */
async function insertBatch(
  batch: ParsedMedia[],
  genreCache: GenreCache,
  stats: ImportStats
): Promise<void> {
  for (const item of batch) {
    try {
      // Insert media item
      const inserted = await db
        .insert(media)
        .values({
          wikidataId: item.wikidataId,
          mediaType: item.mediaType,
          titleEn: item.titleEn,
          titleJa: item.titleJa,
          descriptionEn: item.descriptionEn,
          descriptionJa: item.descriptionJa,
          startYear: item.startYear,
          endYear: item.endYear,
          imdbId: item.imdbId,
          malId: item.malId,
          seasonCount: item.seasonCount,
          episodeCount: item.episodeCount,
        })
        .onConflictDoNothing()
        .returning({ id: media.id });

      if (inserted.length > 0 && item.genreIds.length > 0) {
        // Get or create genre IDs
        const genreDbIds = await getOrCreateGenreIds(item.genreIds, genreCache);
        stats.genresFound += genreDbIds.length;

        // Insert media-genre relationships
        if (genreDbIds.length > 0) {
          await db
            .insert(mediaGenres)
            .values(
              genreDbIds.map((genreId) => ({
                mediaId: inserted[0].id,
                genreId,
              }))
            )
            .onConflictDoNothing();
        }
      }

      if (inserted.length > 0) {
        stats.entitiesImported++;
      }
    } catch (error) {
      stats.errors++;
      console.error(`Error inserting ${item.wikidataId}:`, error);
    }
  }
}

/**
 * Update import progress in the database
 */
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

/**
 * Main import function
 */
export async function importWikidataDump(
  filePath: string,
  options: {
    resumeFrom?: string;
    maxEntities?: number;
  } = {}
): Promise<ImportStats> {
  const { resumeFrom, maxEntities } = options;

  console.log(`Starting import from: ${filePath}`);
  if (resumeFrom) {
    console.log(`Resuming from entity: ${resumeFrom}`);
  }
  if (maxEntities) {
    console.log(`Max entities to process: ${maxEntities}`);
  }

  // Create progress record
  const [progressRecord] = await db
    .insert(importProgress)
    .values({
      sourceFile: filePath,
      status: "running",
      startedAt: new Date(),
    })
    .returning({ id: importProgress.id });

  const progressId = progressRecord.id;

  const stats: ImportStats = {
    entitiesProcessed: 0,
    entitiesImported: 0,
    errors: 0,
    genresFound: 0,
  };

  const genreCache: GenreCache = {};
  let batch: ParsedMedia[] = [];
  let lastEntityId: string | null = null;
  let skipping = !!resumeFrom;

  const processEntity = async (entity: WikidataEntity): Promise<void> => {
    stats.entitiesProcessed++;
    lastEntityId = entity.id;

    // If resuming, skip until we find the resume point
    if (skipping) {
      if (entity.id === resumeFrom) {
        skipping = false;
        console.log(`Found resume point: ${resumeFrom}`);
      }
      return;
    }

    // Check if we should import this entity
    if (!shouldImportEntity(entity)) {
      return;
    }

    // Parse the entity
    const parsed = parseMediaEntity(entity);
    if (!parsed) {
      return;
    }

    batch.push(parsed);

    // Insert batch when full
    if (batch.length >= BATCH_SIZE) {
      await insertBatch(batch, genreCache, stats);
      batch = [];
    }

    // Log progress
    if (stats.entitiesProcessed % PROGRESS_LOG_INTERVAL === 0) {
      console.log(
        `Processed: ${stats.entitiesProcessed}, Imported: ${stats.entitiesImported}, Errors: ${stats.errors}`
      );
      await updateProgress(progressId, stats, lastEntityId);
    }

    // Check max entities limit
    if (maxEntities && stats.entitiesProcessed >= maxEntities) {
      throw new Error("MAX_ENTITIES_REACHED");
    }
  };

  // Create transform stream for processing
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
    await pipeline(
      fs.createReadStream(filePath),
      unbzip2Stream(),
      split2(),
      processStream
    );
  } catch (error) {
    // Ignore pipeline destruction error when max entities reached
    if (!(error instanceof Error && (error as NodeJS.ErrnoException).code === "ERR_STREAM_PREMATURE_CLOSE")) {
      throw error;
    }
  }

  // Insert remaining batch
  if (batch.length > 0) {
    await insertBatch(batch, genreCache, stats);
  }

  // Update final progress
  await updateProgress(progressId, stats, lastEntityId, "completed");

  console.log("\n=== Import Complete ===");
  console.log(`Entities processed: ${stats.entitiesProcessed}`);
  console.log(`Entities imported: ${stats.entitiesImported}`);
  console.log(`Errors: ${stats.errors}`);
  console.log(`Genres found: ${stats.genresFound}`);

  return stats;
}

// CLI entry point
if (import.meta.main) {
  const args = process.argv.slice(2);
  const filePath = args[0] || "D:/latest-all.json.bz2";
  const maxEntities = args[1] ? parseInt(args[1], 10) : undefined;

  importWikidataDump(filePath, { maxEntities })
    .then((stats) => {
      console.log("Import finished successfully:", stats);
      process.exit(0);
    })
    .catch((error) => {
      console.error("Import failed:", error);
      process.exit(1);
    });
}
