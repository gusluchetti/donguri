#!/usr/bin/env bun
import fs from "node:fs";
import path from "node:path";
import { getDb } from "~/db";
import { getConfig } from "./config";
import { getLastFullDumpAt } from "./state";

/**
 * Set up file logging: write all console.log/error to both stdout and a dated file.
 */
function setupFileLogging(): void {
  const logsDir = "./logs";
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  const date = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  const logFile = path.join(logsDir, `import-${date}.log`);
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

async function main() {
  const startTime = Date.now();
  setupFileLogging();

  const config = getConfig();
  const db = getDb();

  console.log("[main] Starting import pipeline");
  console.log("[main] Timestamp:", new Date().toISOString());

  try {
    let mode: "full" | "incremental" = "full";
    // Determine mode: --full, --incremental, or auto
    let autoMode: "full" | "incremental" | "auto" = "auto";

    for (const arg of process.argv.slice(2)) {
      if (arg === "--full") autoMode = "full";
      else if (arg === "--incremental") autoMode = "incremental";
    }

    // Auto-decide if not explicitly set
    if (autoMode === "auto") {
      // eslint-disable-line @typescript-eslint/no-unnecessary-condition
      const { sql } = await import("drizzle-orm");
      const { media } = await import("~/db/schema");

      const result = await db.select({ count: sql<number>`COUNT(*)` }).from(media);
      const mediaCount = Number(result[0]?.count || 0);

      if (mediaCount === 0) {
        console.log("[main] Media table empty → full dump required");
        mode = "full";
      } else {
        const lastFull = getLastFullDumpAt();
        if (!lastFull) {
          console.log("[main] No previous full dump recorded → full dump required");
          mode = "full";
        } else {
          const daysSinceFull = (Date.now() - lastFull.getTime()) / (1000 * 60 * 60 * 24);
          if (daysSinceFull > config.dumpMaxAgeDays) {
            console.log(
              `[main] Last full dump was ${daysSinceFull.toFixed(1)} days ago → full dump required`,
            );
            mode = "full";
          } else {
            console.log(
              `[main] Recent full dump (${daysSinceFull.toFixed(1)} days ago) → incremental`,
            );
            mode = "incremental";
          }
        }
      }
    } else {
      mode = autoMode;
    }

    console.log(`[main] Mode: ${mode}`);
    console.log("");

    if (mode === "full") {
      const { runFullPipeline } = await import("./pipeline");
      await runFullPipeline(db, config);
    } else {
      const { runIncremental } = await import("./incremental");
      const needsFull = await runIncremental(db, config);
      if (needsFull) {
        console.log("[main] Incremental gap too large → falling back to full dump");
        const { runFullPipeline } = await import("./pipeline");
        await runFullPipeline(db, config);
      }
    }

    console.log("[main] Import completed successfully");

    try {
      console.log("");
      const { runQrank } = await import("./qrank");
      const { runAnimeOffline } = await import("./anime-offline");
      const { runCovers } = await import("./covers");

      await runQrank(db, config);
      await runAnimeOffline(db, config);
      await runCovers(db, config);
    } catch (suppError) {
      console.error("[main] Supplementary import step failed:", suppError);
      const { notifyWarning } = await import("./notify");
      await notifyWarning("supplementary step failed", suppError);
      // Continue rather than crashing, since main import succeeded
    }

    console.log("[main] Import pipeline fully complete");
    console.log("[main] Timestamp:", new Date().toISOString());
    const { notifySuccess } = await import("./notify");
    await notifySuccess(mode, Date.now() - startTime);
    process.exit(0);
  } catch (error) {
    console.error("[main] Import failed:", error);
    console.error("[main] Timestamp:", new Date().toISOString());
    const { notifyFailure } = await import("./notify");
    await notifyFailure(error);
    process.exit(1);
  }
}

main();
