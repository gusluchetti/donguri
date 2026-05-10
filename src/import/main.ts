#!/usr/bin/env bun
import fs from "node:fs";
import { getDb } from "~/db";
import { attachFileLogging, log, logShutdownBanner, logStartupBanner } from "~/lib/logger";
import type { DbType } from "./_upsert";
import type { ImportConfig } from "./config";
import { getConfig, redactedConfig } from "./config";
import { getLastFullDumpAt } from "./state";

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
    log.error("supplementary", "qrank failed", err);
  }

  try {
    report.animeOffline = await runAnimeOffline(db, config);
  } catch (err) {
    log.error("supplementary", "anime-offline failed", err);
  }

  try {
    report.covers = await runCovers(db, config);
  } catch (err) {
    log.error("supplementary", "covers failed", err);
  }

  return report;
}

async function main() {
  const startTime = new Date();
  const stage = process.argv[2] ?? "auto";

  const config = getConfig();
  const { runId } = attachFileLogging(stage);

  const envVarsToCheck = [
    "DATA_DIR",
    "STATE_DB_PATH",
    "DUMP_URL",
    "LOG_LEVEL",
    "TMDB_API_KEY",
    "TWITCH_CLIENT_ID",
    "TWITCH_CLIENT_SECRET",
  ];

  logStartupBanner(stage, runId, redactedConfig(config), envVarsToCheck);
  log.info("main", `stage selected: ${stage}`);

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
        log.info("main", "running incremental mode detection...");
        const needsFull = await runIncremental(db, config);
        if (needsFull) {
          log.info("main", "incremental gap > 30 days, falling back to full pipeline");
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
        await notifySuccess(stage, Date.now() - startTime.getTime(), report);
        process.exit(0);
        break;
      }

      case "auto": {
        const mode = await detectMode(db, config);
        log.info("main", `mode detected: ${mode}`, {
          mediaCount: await getMediaCount(db),
          daysSinceFull: await getDaysSinceFull(),
        });

        if (mode === "full") {
          const { runFullPipeline } = await import("./pipeline");
          await runFullPipeline(db, config);
        } else {
          const { runIncremental } = await import("./incremental");
          const needsFull = await runIncremental(db, config);
          if (needsFull) {
            log.info("main", "incremental gap > 30 days, falling back to full pipeline");
            const { runFullPipeline } = await import("./pipeline");
            await runFullPipeline(db, config);
          }
        }

        const suppReport = await runSupplementary(db, config);
        const { notifySuccess } = await import("./notify");
        await notifySuccess(stage, Date.now() - startTime.getTime(), suppReport);
        process.exit(0);
        break;
      }

      default:
        log.error("main", `Unknown stage: ${stage}`);
        log.error(
          "main",
          "Available stages: download, subset, db, full, incremental, covers, qrank, all, auto",
        );
        process.exit(1);
    }

    logShutdownBanner(stage, runId, startTime, 0);
    const { notifySuccess } = await import("./notify");
    await notifySuccess(stage, Date.now() - startTime.getTime());
    process.exit(0);
  } catch (error) {
    logShutdownBanner(stage, runId, startTime, 1, error as Error);
    log.error("main", `Stage "${stage}" failed`, error);
    const { notifyFailure } = await import("./notify");
    await notifyFailure(error as Error);
    process.exit(1);
  }
}

async function getMediaCount(db: DbType): Promise<number> {
  const { sql } = await import("drizzle-orm");
  const { media } = await import("~/db/schema");
  const result = await db.select({ count: sql<number>`COUNT(*)` }).from(media);
  return Number(result[0]?.count || 0);
}

async function getDaysSinceFull(): Promise<number> {
  const lastFull = getLastFullDumpAt();
  if (!lastFull) return Infinity;
  return (Date.now() - lastFull.getTime()) / (1000 * 60 * 60 * 24);
}

main();
