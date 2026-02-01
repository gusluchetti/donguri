/**
 * Test script to explore the Wikidata dump structure
 * Reads first N entities and finds sample media entities
 */

import fs from "node:fs";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import unbzip2Stream from "unbzip2-stream";
import split2 from "split2";
import { WikidataEntity, WikidataProperties, MediaTypeQValues } from "../import/types";
import { isMediaEntity, hasExternalId, determineMediaType } from "../import/filters";
import { parseMediaEntity } from "../import/parser";

const P = WikidataProperties;
const Q = MediaTypeQValues;

const MAX_ENTITIES = 100;
const MAX_MEDIA_SAMPLES = 10;

interface TestStats {
  totalEntities: number;
  mediaEntities: number;
  mediaWithExternalIds: number;
  byType: {
    movies: number;
    tvSeries: number;
    anime: number;
  };
}

function parseJsonLine(line: string): WikidataEntity | null {
  let cleanLine = line.trim();
  if (cleanLine.endsWith(",")) {
    cleanLine = cleanLine.slice(0, -1);
  }
  if (cleanLine === "[" || cleanLine === "]" || !cleanLine) {
    return null;
  }
  try {
    return JSON.parse(cleanLine);
  } catch {
    return null;
  }
}

async function testDump(filePath: string): Promise<void> {
  console.log(`Testing dump file: ${filePath}`);
  console.log(`Will process first ${MAX_ENTITIES} entities\n`);

  const stats: TestStats = {
    totalEntities: 0,
    mediaEntities: 0,
    mediaWithExternalIds: 0,
    byType: {
      movies: 0,
      tvSeries: 0,
      anime: 0,
    },
  };

  const mediaSamples: Array<{
    id: string;
    type: string;
    labels: string[];
    hasImdb: boolean;
    hasMal: boolean;
  }> = [];

  let done = false;

  const processStream = new Transform({
    objectMode: true,
    transform(line: string, _encoding, callback) {
      if (done) {
        callback();
        return;
      }

      const entity = parseJsonLine(line);
      if (!entity) {
        callback();
        return;
      }

      stats.totalEntities++;

      // Check if it's a media entity
      if (isMediaEntity(entity)) {
        stats.mediaEntities++;

        const mediaType = determineMediaType(entity);
        if (mediaType === "movie") stats.byType.movies++;
        else if (mediaType === "tv_series") stats.byType.tvSeries++;
        else if (mediaType === "anime") stats.byType.anime++;

        if (hasExternalId(entity)) {
          stats.mediaWithExternalIds++;
        }

        // Collect sample
        if (mediaSamples.length < MAX_MEDIA_SAMPLES) {
          const hasImdb = !!entity.claims?.[P.IMDB_ID]?.length;
          const hasMal = !!entity.claims?.[P.MAL_ID]?.length;

          mediaSamples.push({
            id: entity.id,
            type: mediaType || "unknown",
            labels: [
              entity.labels?.en?.value,
              entity.labels?.ja?.value,
            ].filter(Boolean) as string[],
            hasImdb,
            hasMal,
          });
        }
      }

      // Stop after MAX_ENTITIES
      if (stats.totalEntities >= MAX_ENTITIES) {
        done = true;
        this.destroy();
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
    // Ignore premature close when we hit our limit
    if (!(error instanceof Error && (error as NodeJS.ErrnoException).code === "ERR_STREAM_PREMATURE_CLOSE")) {
      throw error;
    }
  }

  // Print results
  console.log("=== Test Results ===\n");
  console.log(`Total entities processed: ${stats.totalEntities}`);
  console.log(`Media entities found: ${stats.mediaEntities}`);
  console.log(`Media with external IDs: ${stats.mediaWithExternalIds}`);
  console.log("\nBy type:");
  console.log(`  Movies: ${stats.byType.movies}`);
  console.log(`  TV Series: ${stats.byType.tvSeries}`);
  console.log(`  Anime: ${stats.byType.anime}`);

  if (mediaSamples.length > 0) {
    console.log("\n=== Media Samples ===\n");
    for (const sample of mediaSamples) {
      console.log(`${sample.id} (${sample.type})`);
      console.log(`  Labels: ${sample.labels.join(", ") || "(none)"}`);
      console.log(`  IMDb: ${sample.hasImdb ? "Yes" : "No"}, MAL: ${sample.hasMal ? "Yes" : "No"}`);
      console.log();
    }
  }
}

async function testParseFirstMediaEntity(filePath: string): Promise<void> {
  console.log("\n=== Testing Parser on First Media Entity with External ID ===\n");

  let found = false;
  let processed = 0;
  const MAX_SEARCH = 100000; // Search up to 100k entities to find one

  const processStream = new Transform({
    objectMode: true,
    transform(line: string, _encoding, callback) {
      if (found || processed >= MAX_SEARCH) {
        callback();
        return;
      }

      const entity = parseJsonLine(line);
      if (!entity) {
        callback();
        return;
      }

      processed++;

      if (isMediaEntity(entity) && hasExternalId(entity)) {
        found = true;

        console.log("Raw entity structure:");
        console.log(JSON.stringify(entity, null, 2).slice(0, 3000) + "...\n");

        const parsed = parseMediaEntity(entity);
        console.log("Parsed result:");
        console.log(JSON.stringify(parsed, null, 2));

        this.destroy();
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
    if (!(error instanceof Error && (error as NodeJS.ErrnoException).code === "ERR_STREAM_PREMATURE_CLOSE")) {
      throw error;
    }
  }

  if (!found) {
    console.log(`No media entity with external ID found in first ${MAX_SEARCH} entities`);
  } else {
    console.log(`\nFound after processing ${processed} entities`);
  }
}

// Main execution
const filePath = process.argv[2] || "D:/latest-all.json.bz2";

testDump(filePath)
  .then(() => testParseFirstMediaEntity(filePath))
  .then(() => {
    console.log("\nTest complete!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Test failed:", error);
    process.exit(1);
  });
