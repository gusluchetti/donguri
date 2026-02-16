/**
 * Full import pipeline: media → genres → seasons, from a single subset NDJSON file.
 *
 * Usage:
 *   bun run src/import/import-all.ts <subset.ndjson> [--full] [--limit=N] [--clean]
 *
 * Steps (in order):
 *   1. Media import  — movies, TV, anime, games (skips season entities)
 *   2. Genre seed    — canonical genres + Wikidata Q-ID mappings
 *   3. Season import — Wikidata seasons from the same file (skips media entities)
 */

import { execSync } from "node:child_process";
import fs from "node:fs";

const args = process.argv.slice(2);
const filePath = args.find((a) => !a.startsWith("--"));

if (!filePath) {
  console.error(
    "Usage: bun run src/import/import-all.ts <subset.ndjson> [--full] [--limit=N] [--clean]",
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
const flags = args.filter((a) => a.startsWith("--")).join(" ");

const steps = [
  {
    label: "1/3 Media import",
    cmd: `bun run src/import/index.ts ${filePath} ${flags}`,
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

  try {
    execSync(step.cmd, {
      stdio: "inherit",
      env: process.env,
    });
  } catch {
    console.error(`\nStep "${step.label}" failed. Aborting.`);
    process.exit(1);
  }
}

const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
console.log(`\n${"=".repeat(60)}`);
console.log(`All steps completed in ${elapsed} min`);
console.log("=".repeat(60));
