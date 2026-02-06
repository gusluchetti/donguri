/**
 * Pass 1: Subset extraction from full Wikidata dump.
 *
 * Streams the full compressed dump, filters to media entities,
 * and writes matching entities as NDJSON to stdout.
 *
 * Usage:
 *   lbzip2 -dc /path/to/latest-all.json.bz2 | bun run src/import/subset.ts > media-subset.ndjson
 *   # Or with gzip:
 *   gzip -dc /path/to/latest-all.json.gz | bun run src/import/subset.ts > media-subset.ndjson
 */

import { createInterface } from "node:readline";
import { isMediaEntity } from "./filters";
import type { WikidataEntity } from "./types";

let totalLines = 0;
let mediaFound = 0;
let errors = 0;

const PROGRESS_INTERVAL = 100_000;

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
      `[${elapsed}s] Processed ${totalLines.toLocaleString()} entities, found ${mediaFound.toLocaleString()} media (${rate}/s)\n`,
    );
  }

  try {
    if (isMediaEntity(entity)) {
      mediaFound++;
      process.stdout.write(JSON.stringify(entity) + "\n");
    }
  } catch {
    errors++;
  }
}

const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
process.stderr.write(
  `\nDone in ${elapsed}s. Total: ${totalLines.toLocaleString()}, Media: ${mediaFound.toLocaleString()}, Errors: ${errors}\n`,
);
