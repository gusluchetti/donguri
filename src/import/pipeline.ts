/**
 * Full dump pipeline: download → subset → import
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import readline from "node:readline";
import { eq, sql } from "drizzle-orm";
import { TRGM_SETUP_SQL } from "~/db/fts";
import { importProgress } from "~/db/schema";
import { parseMediaEntity, shouldImportEntity } from "./_filters";
import { loadCanonicalLookups, seedCanonicalMappings } from "./_mappings";
import { formatDuration } from "./_retry";
import type { ParsedMedia, WikidataEntity } from "./_types";
import { type DbType, type ImportStats, processSuperBatch } from "./_upsert";
import type { ImportConfig } from "./config";
import { downloadDump } from "./download";
import { setLastFullDumpAt } from "./state";

const DEFAULT_BATCH_SIZE = 5000;
const PROGRESS_LOG_INTERVAL = 10_000;

interface MediaImportOpts {
  subsetPath: string;
  limit?: number;
  batchSize?: number;
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

export async function runMediaImport(db: DbType, opts: MediaImportOpts): Promise<void> {
  const { subsetPath, limit = Infinity, batchSize = DEFAULT_BATCH_SIZE } = opts;
  const startTime = Date.now();
  for (const stmt of TRGM_SETUP_SQL) {
    await db.execute(sql.raw(stmt));
  }

  const stats: ImportStats = {
    entitiesProcessed: 0,
    entitiesImported: 0,
    entitiesNew: 0,
    entitiesUpdated: 0,
    errors: 0,
    genresFound: 0,
    platformsFound: 0,
    byType: {},
  };

  const [progressRecord] = await db
    .insert(importProgress)
    .values({ sourceFile: subsetPath, status: "running", startedAt: new Date() })
    .returning({ id: importProgress.id });

  await seedCanonicalMappings(db);
  const { genreLookup, platformLookup } = await loadCanonicalLookups(db);

  let batch: ParsedMedia[] = [];

  try {
    const rl = readline.createInterface({
      input: fs.createReadStream(subsetPath, { encoding: "utf-8" }),
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      if (stats.entitiesImported >= limit) break;

      const entity = parseJsonLine(line);
      if (!entity) continue;

      stats.entitiesProcessed++;

      if (stats.entitiesProcessed % PROGRESS_LOG_INTERVAL === 0) {
        const elapsed = formatDuration(Date.now() - startTime);
        const rate = (stats.entitiesProcessed / ((Date.now() - startTime) / 1000)).toFixed(0);
        console.info(`[pipeline] ${stats.entitiesProcessed} processed in ${elapsed} (${rate}/s)`);

        await db
          .update(importProgress)
          .set({
            entitiesProcessed: stats.entitiesProcessed,
            entitiesImported: stats.entitiesImported,
            lastEntityId: entity.id,
          })
          .where(eq(importProgress.id, progressRecord.id));
      }

      if (!shouldImportEntity(entity)) continue;

      const parsed = parseMediaEntity(entity);
      if (!parsed) continue;

      stats.byType[parsed.mediaType] = (stats.byType[parsed.mediaType] || 0) + 1;
      batch.push(parsed);

      if (batch.length >= batchSize) {
        await processSuperBatch(db, batch, genreLookup, platformLookup, stats);
        batch = [];
      }
    }

    if (batch.length > 0) {
      await processSuperBatch(db, batch, genreLookup, platformLookup, stats);
    }
    console.info("[pipeline] by type:", stats.byType);

    await db
      .update(importProgress)
      .set({
        entitiesProcessed: stats.entitiesProcessed,
        entitiesImported: stats.entitiesImported,
        status: "completed",
        completedAt: new Date(),
      })
      .where(eq(importProgress.id, progressRecord.id));
  } catch (err) {
    try {
      await db
        .update(importProgress)
        .set({
          entitiesProcessed: stats.entitiesProcessed,
          entitiesImported: stats.entitiesImported,
          status: "failed",
        })
        .where(eq(importProgress.id, progressRecord.id));
    } catch {
      /* best-effort */
    }
    throw err;
  }
}

function checkDiskSpace(dataDir: string, requiredGB: number): boolean {
  try {
    const { status, stdout } = spawnSync("df", ["-B1", dataDir]);

    if (status !== 0) {
      throw new Error(`df command failed with code ${status}`);
    }

    const stdoutStr = stdout.toString();
    const lines = stdoutStr.split("\n");
    if (lines.length < 2) {
      throw new Error("Could not parse disk space output");
    }

    const parts = lines[1].split(/\s+/);
    if (parts.length < 4) {
      throw new Error("Could not parse disk space output");
    }

    const availBytes = Number.parseInt(parts[3], 10);
    const availGB = availBytes / (1024 * 1024 * 1024);

    if (availGB < requiredGB) {
      return false;
    }
    return true;
  } catch (error) {
    console.error("[check] Disk space check failed:", error);
    throw error;
  }
}

function findDumpPath(dataDir: string): string | null {
  const candidates = [`${dataDir}/latest-all.json.bz2`, "/mnt/h/latest-all.json.bz2"];

  for (const path of candidates) {
    try {
      if (fs.existsSync(path)) {
        const stats = fs.statSync(path);
        const sizeGB = (stats.size / 1024 / 1024 / 1024).toFixed(1);
        const ageMs = Date.now() - stats.mtimeMs;
        const ageDays = (ageMs / (1000 * 60 * 60 * 24)).toFixed(1);
        console.info(`[pipeline] using existing dump: ${sizeGB} GB, ${ageDays} days old`);

        // Only use if less than 14 days old (we'll check this in pipeline)
        return path;
      }
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
        console.warn("[pipeline] could not stat dump file:", e);
      }
    }
  }
  return null;
}

async function createSubset(dumpPath: string, subsetPath: string): Promise<void> {
  const startTime = Date.now();

  // Clean up any previous .done sentinel in case we're retrying
  const donePath = `${subsetPath}.done`;
  try {
    fs.unlinkSync(donePath);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn("[pipeline] could not remove sentinel:", e);
    }
  }

  // Use shell pipeline with pipefail to detect early failures
  // Limit lbzip2 to 2 threads to match consumer speed
  const shellCmd = `set -o pipefail && lbzip2 -dc -n2 "${dumpPath}" | bun src/import/subset.ts > "${subsetPath}"`;
  const exitCode = spawnSync(shellCmd, {
    shell: true,
    stdio: "inherit",
    cwd: process.cwd(),
  }).status;

  if (exitCode !== 0) {
    throw new Error(`Subset creation failed with exit code ${exitCode}`);
  }

  // Write sentinel file to signal successful completion
  fs.writeFileSync(donePath, `${startTime}\n${Date.now()}\n`);

  const duration = ((Date.now() - startTime) / 1000).toFixed(0);
  console.info(`[pipeline] subset created in ${duration}s`);
}

export async function runFullPipeline(db: DbType, config: ImportConfig): Promise<void> {
  const startTime = Date.now();

  if (!checkDiskSpace(config.dataDir, config.requiredDiskSpaceGB)) {
    throw new Error(`Insufficient disk space. Need ${config.requiredDiskSpaceGB}GB`);
  }

  let dumpPath = findDumpPath(config.dataDir);

  if (!dumpPath) {
    const targetPath = `${config.dataDir}/latest-all.json.bz2`;
    await downloadDump(config.dumpUrl, targetPath);
    dumpPath = targetPath;
  }

  const subsetPath = `${config.dataDir}/subset.ndjson`;
  const donePath = `${subsetPath}.done`;

  let subsetExists = false;
  if (fs.existsSync(subsetPath) && fs.existsSync(donePath)) {
    const subsetMtime = fs.statSync(subsetPath).mtimeMs;
    const dumpMtime = fs.statSync(dumpPath).mtimeMs;
    const subsetSize = fs.statSync(subsetPath).size;
    const doneMtime = fs.statSync(donePath).mtimeMs;
    if (subsetMtime > dumpMtime && doneMtime > dumpMtime && subsetSize > 0) {
      subsetExists = true;
    }
  }

  if (!subsetExists) {
    // Clean up any stale sentinel file before regenerating
    try {
      fs.unlinkSync(donePath);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
        console.warn("[pipeline] could not remove sentinel:", e);
      }
    }
    await createSubset(dumpPath, subsetPath);
  }
  await runMediaImport(db, {
    subsetPath,
    limit: Infinity,
    batchSize: DEFAULT_BATCH_SIZE,
  });

  setLastFullDumpAt(new Date());

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(0);
  console.info(`[pipeline] import completed in ${totalTime}s`);
}

export type { MediaImportOpts };

export async function runSubset(config: ImportConfig): Promise<void> {
  const dumpPath = findDumpPath(config.dataDir);
  if (!dumpPath) {
    throw new Error(`No dump found in ${config.dataDir}`);
  }

  const subsetPath = `${config.dataDir}/subset.ndjson`;
  await createSubset(dumpPath, subsetPath);
}
