#!/usr/bin/env bun
import fs from "node:fs";
import path from "node:path";
import { getDb } from "~/db";
import type { DbType } from "./_upsert";
import type { ImportConfig } from "./config";
import { getConfig } from "./config";
import { getLastFullDumpAt } from "./state";

/**
 * Set up file logging: write all console.log/error to both stdout and a dated file.
 */
function setupFileLogging(stage: string): void {
  const logsDir = "./logs";
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  const date = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  const logFile = path.join(logsDir, `import-${stage}-${date}.log`);
  const stream = fs.createWriteStream(logFile, { flags: "a" });

  const originalLog = console.log;
  const originalError = console.error;

  console.log = (...args: unknown[]) => {
    const msg = args
      .map((a) => (typeof a === "string" ? a : a instanceof Error ? String(a) : JSON.stringify(a)))
      .join(" ");
    originalLog(msg);
    stream.write(`${msg}\n`);
  };

  console.error = (...args: unknown[]) => {
    const msg = args
      .map((a) => (typeof a === "string" ? a : a instanceof Error ? String(a) : JSON.stringify(a)))
      .join(" ");
    originalError(msg);
    stream.write(`${msg}\n`);
  };
}

async function detectMode(db: DbType, config: ImportConfig): Promise<"full" | "incremental"> {
  const { sql } = await import("drizzle-orm");
  const { media } = await import("~/db/schema");

  const result = await db.select({ count: sql<number>`COUNT(*)` }).from(media);
  const mediaCount = Number(result[0]?.count || 0);

  if (mediaCount === 0) {
    return "full";
  }

  const lastFull = getLastFullDumpAt();
  if (!lastFull) {
    return "full";
  }

  const daysSinceFull = (Date.now() - lastFull.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSinceFull > config.dumpMaxAgeDays) {
    return "full";
  }
  return "incremental";
}

async function runSupplementary(
  db: DbType,
  config: ImportConfig,
): Promise<import("./notify").ImportReport> {
  const { runQrank } = await import("./qrank");
  const { runAnimeOffline } = await import("./anime-offline");
  const { runCovers } = await import("./covers");

  const report: import("./notify").ImportReport = {};

  try {
    report.qrank = await runQrank(db, config);
  } catch (err) {
    console.error("[supplementary] qrank failed:", err);
  }

  try {
    report.animeOffline = await runAnimeOffline(db, config);
  } catch (err) {
    console.error("[supplementary] anime-offline failed:", err);
  }

  try {
    report.covers = await runCovers(db, config);
  } catch (err) {
    console.error("[supplementary] covers failed:", err);
  }

  return report;
}

async function main() {
  const startTime = Date.now();
  const stage = process.argv[2] ?? "auto";
  setupFileLogging(stage);

  const config = getConfig();
  const db = getDb();

  try {
    switch (stage) {
      case "download": {
        const { downloadDump } = await import("./download");
        const targetPath = `${config.dataDir}/latest-all.json.bz2`;
        await downloadDump(config.dumpUrl, targetPath);
        break;
      }

      case "subset": {
        const { runSubset } = await import("./pipeline");
        await runSubset(config);
        break;
      }

      case "db": {
        const subsetPath = `${config.dataDir}/subset.ndjson`;
        if (!fs.existsSync(subsetPath)) {
          throw new Error(`No subset at ${subsetPath}. Run import:subset first.`);
        }
        const { runMediaImport } = await import("./pipeline");
        const { setLastFullDumpAt } = await import("./state");
        await runMediaImport(db, { subsetPath });
        setLastFullDumpAt(new Date());
        break;
      }

      case "full": {
        const { runFullPipeline } = await import("./pipeline");
        await runFullPipeline(db, config);
        break;
      }

      case "incremental": {
        const { runIncremental } = await import("./incremental");
        const needsFull = await runIncremental(db, config);
        if (needsFull) {
          const { runFullPipeline } = await import("./pipeline");
          await runFullPipeline(db, config);
        }
        break;
      }

      case "covers": {
        const { runCovers } = await import("./covers");
        await runCovers(db, config);
        break;
      }

      case "qrank": {
        const { runQrank } = await import("./qrank");
        await runQrank(db, config);
        break;
      }

      case "all": {
        const { runFullPipeline } = await import("./pipeline");
        await runFullPipeline(db, config);
        const report = await runSupplementary(db, config);
        const { notifySuccess } = await import("./notify");
        await notifySuccess(stage, Date.now() - startTime, report);
        process.exit(0);
        break;
      }

      case "auto": {
        const mode = await detectMode(db, config);

        if (mode === "full") {
          const { runFullPipeline } = await import("./pipeline");
          await runFullPipeline(db, config);
        } else {
          const { runIncremental } = await import("./incremental");
          const needsFull = await runIncremental(db, config);
          if (needsFull) {
            const { runFullPipeline } = await import("./pipeline");
            await runFullPipeline(db, config);
          }
        }

        const suppReport = await runSupplementary(db, config);
        const { notifySuccess } = await import("./notify");
        await notifySuccess(stage, Date.now() - startTime, suppReport);
        process.exit(0);
        break;
      }

      default:
        console.error(`[main] Unknown stage: ${stage}`);
        console.error(
          "Available stages: download, subset, db, full, incremental, covers, qrank, all, auto",
        );
        process.exit(1);
    }
    const { notifySuccess } = await import("./notify");
    await notifySuccess(stage, Date.now() - startTime);
    process.exit(0);
  } catch (error) {
    console.error(`[main] Stage "${stage}" failed:`, error);
    console.error("[main] Timestamp:", new Date().toISOString());
    const { notifyFailure } = await import("./notify");
    await notifyFailure(error);
    process.exit(1);
  }
}

main();
