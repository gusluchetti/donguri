/**
 * Non-destructive "refresh everything" script.
 * Runs all additive import steps without touching media entities.
 *
 * Usage:
 *   bun run import:update --qrank=data/qrank.csv.gz --anime-offline=data/anime-offline-database.jsonl
 *   bun run import:update --qrank=data/qrank.csv.gz   # skip anime-offline if not provided
 *
 * Steps (in order):
 *   1. QRank + sitelinks percentiles (via index.ts with --limit=0)
 *   2. TVMaze season gap-fill
 *   3. anime-offline season gap-fill (JSONL)
 *   4. Cover art resolution
 *
 * All steps are additive — no deletes, no --clean, ON CONFLICT DO NOTHING / DO UPDATE.
 */

import { execSync } from "node:child_process";
import fs from "node:fs";

const STEP_MAX_RETRIES = 3;
const STEP_RETRY_DELAY_MS = 5_000;

const args = process.argv.slice(2);

const qrankArg = args.find((a) => a.startsWith("--qrank="));
const qrankPath = qrankArg?.split("=")[1];
const animeArg = args.find((a) => a.startsWith("--anime-offline="));
const animePath = animeArg?.split("=")[1];

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL required");
  process.exit(1);
}

// Validate paths early
if (qrankPath && !fs.existsSync(qrankPath)) {
  console.error(`QRank file not found: ${qrankPath}`);
  process.exit(1);
}
if (animePath && !fs.existsSync(animePath)) {
  console.error(`anime-offline file not found: ${animePath}`);
  process.exit(1);
}

interface Step {
  label: string;
  cmd: string;
  skip?: boolean;
}

// Step 1: QRank + sitelinks percentiles via the media importer with --limit=0
// (imports zero media entities but still runs QRank + sitelinks percentile computation)
const steps: Step[] = [
  {
    label: "1. QRank + sitelinks percentiles",
    cmd: `bun run src/import/index.ts /dev/null --full --limit=0${qrankPath ? ` --qrank=${qrankPath}` : ""}`,
    skip: !qrankPath,
  },
  {
    label: "2. TVMaze season gap-fill",
    cmd: "bun run src/import/import-seasons.ts tvmaze",
  },
  {
    label: "3. anime-offline season gap-fill",
    cmd: `bun run src/import/import-seasons.ts anime-offline ${animePath}`,
    skip: !animePath,
  },
  {
    label: "4. Cover art resolution",
    cmd: "bun run src/import/covers.ts",
  },
];

interface StepResult {
  label: string;
  status: "ok" | "skipped" | "failed";
  elapsed: string;
}

function formatElapsed(ms: number): string {
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  return `${(s / 60).toFixed(1)}m`;
}

const startTime = Date.now();
const results: StepResult[] = [];

for (const step of steps) {
  if (step.skip) {
    console.log(`\nSkipping: ${step.label}`);
    results.push({ label: step.label, status: "skipped", elapsed: "-" });
    continue;
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(step.label);
  console.log("=".repeat(60));

  const stepStart = Date.now();
  let succeeded = false;
  for (let attempt = 1; attempt <= STEP_MAX_RETRIES; attempt++) {
    try {
      execSync(step.cmd, { stdio: "inherit", env: process.env });
      succeeded = true;
      break;
    } catch {
      if (attempt < STEP_MAX_RETRIES) {
        console.warn(
          `\n"${step.label}" failed (attempt ${attempt}/${STEP_MAX_RETRIES}), retrying in ${STEP_RETRY_DELAY_MS / 1000}s...`,
        );
        execSync(`sleep ${STEP_RETRY_DELAY_MS / 1000}`);
      }
    }
  }

  const stepElapsed = formatElapsed(Date.now() - stepStart);

  if (!succeeded) {
    results.push({ label: step.label, status: "failed", elapsed: stepElapsed });
    console.error(`\n"${step.label}" failed after ${STEP_MAX_RETRIES} attempts. Aborting.`);
    // Print partial summary before exiting
    printSummary(results, startTime);
    process.exit(1);
  }

  console.log(`\n  -> ${step.label} completed in ${stepElapsed}`);
  results.push({ label: step.label, status: "ok", elapsed: stepElapsed });
}

printSummary(results, startTime);

function printSummary(results: StepResult[], startTime: number) {
  const totalElapsed = formatElapsed(Date.now() - startTime);
  console.log(`\n${"=".repeat(60)}`);
  console.log("  SUMMARY");
  console.log("=".repeat(60));
  for (const r of results) {
    const icon = r.status === "ok" ? "+" : r.status === "skipped" ? "-" : "!";
    const tag = r.status === "ok" ? "OK" : r.status === "skipped" ? "SKIP" : "FAIL";
    console.log(`  [${icon}] ${tag.padEnd(4)} ${r.elapsed.padStart(7)}  ${r.label}`);
  }
  console.log("-".repeat(60));
  console.log(`  Total: ${totalElapsed}`);
  console.log("=".repeat(60));
}
