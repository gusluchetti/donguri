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
import { getInstanceOfValues, isCollectionEntity, isMediaEntity, isSeasonEntity } from "./_filters";
import type { WikidataEntity } from "./_types";

let totalLines = 0;
let mediaFound = 0;
let seasonsFound = 0;
let collectionsFound = 0;
let parseErrors = 0;
let errors = 0;
let noP31Count = 0;
const p31Sample = new Set<string>();
const matchSample: Array<{ id: string; p31: string[] }> = [];

const PROGRESS_INTERVAL = 25_000;
const SAMPLE_MAX = 10;

function formatLog(level: string, message: string): string {
  const timestamp = new Date().toISOString();
  return `${timestamp} ${level.toUpperCase().padEnd(5)} [subset] ${message}\n`;
}

function writeStderr(level: string, message: string): void {
  process.stderr.write(formatLog(level, message));
}

function parseJsonLine(line: string): WikidataEntity | null {
  let cleanLine = line.trim();
  if (cleanLine.endsWith(",")) cleanLine = cleanLine.slice(0, -1);
  if (cleanLine === "[" || cleanLine === "]" || !cleanLine) return null;
  try {
    return JSON.parse(cleanLine);
  } catch {
    parseErrors++;
    if (parseErrors <= 5) {
      writeStderr("warn", `parse error at line ~${totalLines}: ${cleanLine.slice(0, 100)}...`);
    }
    return null;
  }
}

function recordP31Sample(entity: WikidataEntity): void {
  const p31Values = getInstanceOfValues(entity);
  if (p31Values.length === 0) {
    noP31Count++;
    return;
  }
  for (const val of p31Values) {
    p31Sample.add(val);
  }
  if (matchSample.length < SAMPLE_MAX) {
    matchSample.push({ id: entity.id, p31: p31Values });
  }
}

const rl = createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
});

const startTime = Date.now();
let lastProgressTime = startTime;

writeStderr("info", `starting subset extraction from stdin, writing NDJSON to stdout`);
writeStderr("info", `progress interval: every ${PROGRESS_INTERVAL.toLocaleString()} entities`);

for await (const line of rl) {
  const entity = parseJsonLine(line);
  if (!entity) continue;

  totalLines++;

  recordP31Sample(entity);

  if (totalLines % PROGRESS_INTERVAL === 0) {
    const now = Date.now();
    const _elapsed = ((now - startTime) / 1000).toFixed(0);
    const chunkTime = (now - lastProgressTime) / 1000;
    const rate = (PROGRESS_INTERVAL / chunkTime).toFixed(0);
    writeStderr(
      "info",
      `processed ${totalLines.toLocaleString()} entities, found ${mediaFound.toLocaleString()} media + ${seasonsFound.toLocaleString()} seasons + ${collectionsFound.toLocaleString()} collections (${rate}/s)`,
    );
    lastProgressTime = now;

    if (totalLines === PROGRESS_INTERVAL * 1) {
      const sampleArr = Array.from(p31Sample).slice(0, 5);
      writeStderr("debug", `early P31 sample (first 5): ${sampleArr.join(", ")}`);
    }
  }

  try {
    if (isMediaEntity(entity)) {
      mediaFound++;
      process.stdout.write(`${JSON.stringify(entity)}\n`);
    } else if (isSeasonEntity(entity)) {
      seasonsFound++;
      process.stdout.write(`${JSON.stringify(entity)}\n`);
    } else if (isCollectionEntity(entity)) {
      collectionsFound++;
      process.stdout.write(`${JSON.stringify(entity)}\n`);
    }
  } catch {
    errors++;
  }
}

const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
writeStderr("info", `subset extraction completed in ${elapsed}s`);
writeStderr("info", `processed: ${totalLines.toLocaleString()}`);
writeStderr("info", `no P31: ${noP31Count}`);
writeStderr("info", `parse errors: ${parseErrors}`);
writeStderr("info", `media entities: ${mediaFound.toLocaleString()}`);
writeStderr("info", `season entities: ${seasonsFound.toLocaleString()}`);
writeStderr("info", `collection entities: ${collectionsFound.toLocaleString()}`);
writeStderr("info", `errors: ${errors}`);

if (p31Sample.size > 0) {
  writeStderr(
    "debug",
    `P31 Q-values seen (${p31Sample.size}): ${Array.from(p31Sample).join(", ")}`,
  );
}
if (matchSample.length > 0) {
  writeStderr("debug", `matched entity samples:`);
  for (const sample of matchSample) {
    writeStderr("debug", `  ${sample.id}: P31=${sample.p31.join(",")}`);
  }
}

if (parseErrors > 0) {
  writeStderr("warn", `had ${parseErrors} parse errors, first 5 lines were logged`);
}
