#!/usr/bin/env bun
import { getDb } from "~/db";
import { getConfig } from "./config";
import { getLastFullDumpAt } from "./state";

async function main() {
  const config = getConfig();
  const db = getDb();

  console.log("[main] Starting import pipeline");
  console.log("[main] Timestamp:", new Date().toISOString());

  try {
    // Determine mode: --full, --incremental, or auto
    let mode: "full" | "incremental" | "auto" = "auto";

    for (const arg of process.argv.slice(2)) {
      if (arg === "--full") mode = "full";
      else if (arg === "--incremental") mode = "incremental";
    }

    // Auto-decide if not explicitly set
    if (mode === "auto") {
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
    console.log("[main] Timestamp:", new Date().toISOString());
    process.exit(0);
  } catch (error) {
    console.error("[main] Import failed:", error);
    console.error("[main] Timestamp:", new Date().toISOString());
    process.exit(1);
  }
}

main();
