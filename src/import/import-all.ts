/**
 * Full import pipeline: media → genres → seasons, from a single subset NDJSON file.
 *
 * Usage:
 *   bun run src/import/import-all.ts <subset.ndjson> [--full] [--limit=N] [--clean] [--batch=N]
 *
 * Steps (in order):
 *   1. Media import  — movies, TV, anime, games (skips season entities)
 *   2. Genre seed    — canonical genres + Wikidata Q-ID mappings
 *   3. Season import — Wikidata seasons from the same file (skips media entities)
 *
 * Each step retries up to 3 times. On retry of media import, --clean is stripped
 * and --resume is added to pick up where the previous attempt left off.
 */

import { execSync } from "node:child_process";
import fs from "node:fs";

const STEP_MAX_RETRIES = 3;
const STEP_RETRY_DELAY_MS = 5_000;

const args = process.argv.slice(2);
const filePath = args.find((a) => !a.startsWith("--"));

if (!filePath) {
  console.error(
    "Usage: bun run src/import/import-all.ts <subset.ndjson> [--full] [--limit=N] [--clean] [--batch=N]",
  );
  process.exit(1);
}

if (!fs.existsSync(filePath)) {
  console.error(`File not found: ${filePath}`);
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL required");
  process.exit(1);
}

// Forward flags to media import
const flags = args.filter((a) => a.startsWith("--"));

// Build the initial media import command flags
const mediaFlags = flags.join(" ");
// On retry: strip --clean (don't wipe progress), add --resume
const mediaRetryFlags = flags
  .filter((f) => f !== "--clean")
  .concat("--resume")
  .join(" ");

const steps = [
  {
    label: "1/3 Media import",
    cmd: `bun run src/import/index.ts ${filePath} ${mediaFlags}`,
    retryCmd: `bun run src/import/index.ts ${filePath} ${mediaRetryFlags}`,
  },
  {
    label: "2/3 Genre seed",
    cmd: "bun run src/db/seed-genres.ts",
  },
  {
    label: "3/3 Wikidata seasons",
    cmd: `bun run src/import/import-seasons.ts wikidata ${filePath}`,
  },
];

const startTime = Date.now();

for (const step of steps) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`${step.label}`);
  console.log("=".repeat(60));

  let succeeded = false;
  for (let attempt = 1; attempt <= STEP_MAX_RETRIES; attempt++) {
    try {
      const cmd = attempt > 1 && step.retryCmd ? step.retryCmd : step.cmd;
      execSync(cmd, {
        stdio: "inherit",
        env: process.env,
      });
      succeeded = true;
      break;
    } catch {
      if (attempt < STEP_MAX_RETRIES) {
        console.warn(
          `\nStep "${step.label}" failed (attempt ${attempt}/${STEP_MAX_RETRIES}), retrying in ${STEP_RETRY_DELAY_MS / 1000}s...`,
        );
        execSync(`sleep ${STEP_RETRY_DELAY_MS / 1000}`);
      }
    }
  }

  if (!succeeded) {
    console.error(`\nStep "${step.label}" failed after ${STEP_MAX_RETRIES} attempts. Aborting.`);
    process.exit(1);
  }
}

const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
console.log(`\n${"=".repeat(60)}`);
console.log(`All steps completed in ${elapsed} min`);
console.log("=".repeat(60));
