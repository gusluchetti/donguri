/**
 * Full dump pipeline: download → subset → import
 */

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import readline from "node:readline";
import { eq, sql } from "drizzle-orm";
import { TRGM_SETUP_SQL } from "~/db/fts";
import { importProgress } from "~/db/schema";
import { log } from "~/lib/logger";
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

  log.info("pipeline", "media import started", { subsetPath, batchSize, limit });

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
  log.info("pipeline", `import progress record created: id=${progressRecord.id}`);

  await log.step("pipeline", "seedCanonicalMappings", async () => {
    await seedCanonicalMappings(db);
  });

  const { genreLookup, platformLookup } = await log.step(
    "pipeline",
    "loadCanonicalLookups",
    async () => {
      return await loadCanonicalLookups(db);
    },
  );

  log.info("pipeline", "lookups loaded", {
    genreCount: Object.keys(genreLookup).length,
    platformCount: Object.keys(platformLookup).length,
  });

  let batch: ParsedMedia[] = [];
  let lastEntityId: string | null = null;

  try {
    const fileStats = fs.statSync(subsetPath);
    const fileSizeMB = fileStats.size / 1024 / 1024;
    log.info("pipeline", `subset file stats: size=${fileSizeMB.toFixed(2)}MB`);

    const rl = readline.createInterface({
      input: fs.createReadStream(subsetPath, { encoding: "utf-8" }),
      crlfDelay: Infinity,
    });

    let linePosition = 0;
    const startStreamTime = Date.now();

    for await (const line of rl) {
      if (stats.entitiesImported >= limit) break;
      linePosition += Buffer.byteLength(line, "utf-8") + 1; // +1 for newline

      const entity = parseJsonLine(line);
      if (!entity) continue;
      lastEntityId = entity.id;

      stats.entitiesProcessed++;

      if (stats.entitiesProcessed % PROGRESS_LOG_INTERVAL === 0) {
        const elapsed = formatDuration(Date.now() - startTime);
        const rate = (stats.entitiesProcessed / ((Date.now() - startTime) / 1000)).toFixed(0);

        // Calculate ETA
        const progressPercent = (linePosition / fileStats.size) * 100;
        const elapsedMs = Date.now() - startStreamTime;
        const estimatedTotalMs = elapsedMs / (linePosition / fileStats.size);
        const etaMs = estimatedTotalMs - elapsedMs;
        const etaFormatted = formatDuration(etaMs);

        log.info(
          "pipeline",
          `progress: processed=${stats.entitiesProcessed} imported=${stats.entitiesImported} elapsed=${elapsed} rate=${rate}/s progress=${progressPercent.toFixed(1)}% eta=${etaFormatted}`,
          stats.byType,
        );

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
        const batchQids = batch.map((p) => p.wikidataId);
        log.qids("pipeline", "upsert batch", batchQids);
        await processSuperBatch(db, batch, genreLookup, platformLookup, stats);
        batch = [];
      }
    }

    if (batch.length > 0) {
      const batchQids = batch.map((p) => p.wikidataId);
      log.qids("pipeline", "upsert final batch", batchQids);
      await processSuperBatch(db, batch, genreLookup, platformLookup, stats);
    }

    const totalDuration = Date.now() - startTime;
    log.info("pipeline", "import completed", {
      duration: formatDuration(totalDuration),
      entitiesProcessed: stats.entitiesProcessed,
      entitiesImported: stats.entitiesImported,
      entitiesNew: stats.entitiesNew,
      entitiesUpdated: stats.entitiesUpdated,
      errors: stats.errors,
      byType: stats.byType,
      rate: `${(stats.entitiesProcessed / (totalDuration / 1000)).toFixed(1)}/s`,
    });

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
    log.error("pipeline", "import failed", {
      lastEntityId,
      batchSize: batch.length,
      stats,
      error: err,
    });

    try {
      await db
        .update(importProgress)
        .set({
          entitiesProcessed: stats.entitiesProcessed,
          entitiesImported: stats.entitiesImported,
          status: "failed",
        })
        .where(eq(importProgress.id, progressRecord.id));
    } catch {}
    throw err;
  }
}

async function checkDiskSpace(dataDir: string, requiredGB: number): Promise<boolean> {
  return log.step("pipeline", "checkDiskSpace", async () => {
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
    log.info(
      "pipeline",
      `disk space check: available=${availGB.toFixed(2)}GB required=${requiredGB}GB`,
    );

    if (availGB < requiredGB) {
      log.error("pipeline", `insufficient disk space: ${availGB.toFixed(2)}GB < ${requiredGB}GB`);
      return false;
    }
    return true;
  });
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
        log.info(
          "pipeline",
          `found existing dump: path=${path} size=${sizeGB}GB age=${ageDays}days mtime=${new Date(stats.mtimeMs).toISOString()}`,
        );

        log.debug("pipeline", `dump candidates checked: ${candidates.join(", ")}`);
        log.info("pipeline", `selected dump: ${path}`);
        return path;
      }
      log.debug("pipeline", `dump not found: ${path}`);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
        log.warn("pipeline", "could not stat dump file", e);
      }
    }
  }
  log.info("pipeline", "no existing dump found, will download fresh");
  return null;
}

async function createSubset(dumpPath: string, subsetPath: string): Promise<void> {
  return log.step("pipeline", "createSubset", async () => {
    const startTime = Date.now();

    log.info("pipeline", `dump_path=${dumpPath} subset_path=${subsetPath}`);
    log.info(
      "pipeline",
      `shell command: lbzip2 -dc -n2 "${dumpPath}" | bun src/import/subset.ts > "${subsetPath}"`,
    );

    // Clean up any previous .done sentinel in case we're retrying
    const donePath = `${subsetPath}.done`;
    try {
      fs.unlinkSync(donePath);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
        log.warn("pipeline", "could not remove sentinel", e);
      }
    }

    const subsetStream = fs.createWriteStream(subsetPath);

    const lbzip2 = spawn("lbzip2", ["-dc", "-n2", dumpPath]);
    const bun = spawn("bun", ["src/import/subset.ts"], {
      env: { ...process.env, LOG_LEVEL: process.env.LOG_LEVEL || "info" },
    });

    bun.stdout.pipe(subsetStream);

    let stderrBuffer = "";
    bun.stderr.on("data", (data) => {
      const lines = data.toString().split("\n");
      for (const line of lines.filter((l: string) => l.trim())) {
        log.info("subset", line.trim());
      }
      stderrBuffer += data.toString();
    });

    lbzip2.stdout.pipe(bun.stdin);

    const _exitCode = await new Promise<number>((resolve, reject) => {
      bun.on("close", (code) => {
        subsetStream.end();
        if (code === 0) {
          resolve(code);
        } else {
          reject(
            new Error(
              `Subset creation failed with exit code ${code}\nLast stderr:\n${stderrBuffer.slice(-2000)}`,
            ),
          );
        }
      });

      bun.on("error", reject);
      lbzip2.on("error", reject);
    });

    // Write sentinel file to signal successful completion
    fs.writeFileSync(donePath, `${startTime}\n${Date.now()}\n`);

    const stats = fs.statSync(subsetPath);
    log.info(
      "pipeline",
      `subset created successfully: size=${(stats.size / 1024 / 1024).toFixed(2)}MB duration_s=${((Date.now() - startTime) / 1000).toFixed(0)}`,
    );
  });
}

export async function runFullPipeline(db: DbType, config: ImportConfig): Promise<void> {
  const startTime = Date.now();

  log.info("pipeline", "full pipeline started", {
    dataDir: config.dataDir,
    requiredDiskSpaceGB: config.requiredDiskSpaceGB,
  });

  const hasSpace = await checkDiskSpace(config.dataDir, config.requiredDiskSpaceGB);
  if (!hasSpace) {
    throw new Error(`Insufficient disk space. Need ${config.requiredDiskSpaceGB}GB`);
  }

  let dumpPath = findDumpPath(config.dataDir);
  log.info("pipeline", "dump path result", { dumpPath });

  if (!dumpPath) {
    const targetPath = `${config.dataDir}/latest-all.json.bz2`;
    log.info("pipeline", "downloading fresh dump", { dumpUrl: config.dumpUrl, targetPath });
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
      log.info("pipeline", "reusing existing subset", {
        subsetMtime: new Date(subsetMtime).toISOString(),
        dumpMtime: new Date(dumpMtime).toISOString(),
        subsetSizeMB: (subsetSize / 1024 / 1024).toFixed(2),
      });
    }
  }

  if (!subsetExists) {
    await createSubset(dumpPath, subsetPath);
  }

  await setLastFullDumpAt(new Date());
  await runMediaImport(db, { subsetPath });

  const totalDuration = Date.now() - startTime;
  log.info("pipeline", "full pipeline completed", {
    duration: formatDuration(totalDuration),
    importProgressId: "see import_progress table",
  });
}

export async function runSubset(config: ImportConfig): Promise<void> {
  const startTime = Date.now();

  log.info("pipeline", "subset-only mode started", { dataDir: config.dataDir });

  const hasSpace = await checkDiskSpace(config.dataDir, config.requiredDiskSpaceGB);
  if (!hasSpace) {
    throw new Error(`Insufficient disk space. Need ${config.requiredDiskSpaceGB}GB`);
  }

  let dumpPath = findDumpPath(config.dataDir);
  log.info("pipeline", "dump path result", { dumpPath });

  if (!dumpPath) {
    const targetPath = `${config.dataDir}/latest-all.json.bz2`;
    log.info("pipeline", "downloading fresh dump for subset", {
      dumpUrl: config.dumpUrl,
      targetPath,
    });
    await downloadDump(config.dumpUrl, targetPath);
    dumpPath = targetPath;
  }

  const subsetPath = `${config.dataDir}/subset.ndjson`;
  await createSubset(dumpPath, subsetPath);

  const totalDuration = Date.now() - startTime;
  log.info("pipeline", "subset-only mode completed", {
    duration: formatDuration(totalDuration),
    subsetPath,
  });
}
