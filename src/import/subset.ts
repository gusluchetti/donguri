/**
 * Pass 1: Subset extraction from full Wikidata dump.
 *
 * Streams the full compressed dump, filters to media AND season entities,
 * and writes matching entities as NDJSON to stdout.
 *
 * Media entities: movies, TV, anime, games (10 P31 types)
 * Season entities: TV seasons (Q3464665) and anime seasons (Q100269041) with P179
 *
 * Downstream consumers self-filter:
 *   - index.ts (media import) checks isMediaEntity() → skips seasons
 *   - import-seasons.ts wikidata checks for P179 → skips media
 *
 * Usage:
 *   lbzip2 -dc /path/to/latest-all.json.bz2 | bun run src/import/subset.ts > subset.ndjson
 *   # Or with gzip:
 *   gzip -dc /path/to/latest-all.json.gz | bun run src/import/subset.ts > subset.ndjson
 */

import { createInterface } from "node:readline";
import { isMediaEntity, isSeasonEntity } from "./filters";
import type { WikidataEntity } from "./types";

let totalLines = 0;
let mediaFound = 0;
let seasonsFound = 0;
let errors = 0;

const PROGRESS_INTERVAL = 25_000;

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

const rl = createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
});

const startTime = Date.now();

for await (const line of rl) {
  const entity = parseJsonLine(line);
  if (!entity) continue;

  totalLines++;

  if (totalLines % PROGRESS_INTERVAL === 0) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    const rate = (totalLines / ((Date.now() - startTime) / 1000)).toFixed(0);
    process.stderr.write(
      `[${elapsed}s] Processed ${totalLines.toLocaleString()} entities, found ${mediaFound.toLocaleString()} media + ${seasonsFound.toLocaleString()} seasons (${rate}/s)\n`,
    );
  }

  try {
    if (isMediaEntity(entity)) {
      mediaFound++;
      process.stdout.write(`${JSON.stringify(entity)}\n`);
    } else if (isSeasonEntity(entity)) {
      seasonsFound++;
      process.stdout.write(`${JSON.stringify(entity)}\n`);
    }
  } catch {
    errors++;
  }
}

const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
process.stderr.write(
  `\nDone in ${elapsed}s. Total: ${totalLines.toLocaleString()}, Media: ${mediaFound.toLocaleString()}, Seasons: ${seasonsFound.toLocaleString()}, Errors: ${errors}\n`,
);
