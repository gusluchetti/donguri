import { spawn } from "node:child_process";
import { existsSync, renameSync, statSync, unlinkSync } from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import * as Resend from "resend";
import { Aria2Streamer } from "./_aria2-stream";
import { getConfig, isDumpFreshEnough } from "./config";
import type { SparqlBinding } from "./incremental";
import { fetchChangedEntities, hashEntity, shouldUpdateEntity } from "./incremental";
import {
  close,
  getLastFullDumpAt,
  getLastIncrementalAt,
  setLastFullDumpAt,
  setLastIncrementalAt,
  trackEntity,
} from "./state";

export interface ImportNotificationParams {
  stats: {
    processed: number;
    imported: number;
    new: number;
    updated: number;
    errors: number;
    duration: number;
  };
  type: "success" | "failure" | "warning";
  error?: Error;
  warnings?: string[];
}

function generateSuccessHtml(stats: ImportNotificationParams["stats"]): string {
  return `
    <h2>Import Completed Successfully</h2>
    <ul>
      <li>Processed: ${stats.processed.toLocaleString()}</li>
      <li>Imported: ${stats.imported.toLocaleString()}</li>
      <li>New: ${stats.new.toLocaleString()}</li>
      <li>Updated: ${stats.updated.toLocaleString()}</li>
      <li>Errors: ${stats.errors}</li>
      <li>Duration: ${(stats.duration / 1000).toFixed(1)}s</li>
    </ul>
  `;
}

function generateFailureHtml(
  error: Error | undefined,
  stats: ImportNotificationParams["stats"],
): string {
  return `
    <h2>Import Failed</h2>
    <p><strong>Error:</strong> ${error?.message || "Unknown error"}</p>
    <ul>
      <li>Processed: ${stats.processed.toLocaleString()}</li>
      <li>Errors: ${stats.errors}</li>
    </ul>
  `;
}

function generateWarningHtml(warnings: string[], stats: ImportNotificationParams["stats"]): string {
  return `
    <h2>Import Completed with Warnings</h2>
    <ul>
      <li>Processed: ${stats.processed.toLocaleString()}</li>
      <li>Errors: ${stats.errors}</li>
    </ul>
    <h3>Warnings</h3>
    <ul>
      ${warnings
        .slice(0, 10)
        .map((w) => `<li>${w}</li>`)
        .join("")}
      ${warnings.length > 10 ? `<li>... and ${warnings.length - 10} more</li>` : ""}
    </ul>
  `;
}

async function sendNotification(params: ImportNotificationParams): Promise<void> {
  const to = process.env.EMAIL_TO || "gustavo@luchetti.dev";
  const subject =
    params.type === "success"
      ? `✅ Import completed (${params.stats.imported} entities)`
      : params.type === "failure"
        ? `❌ Import failed: ${params.error?.message}`
        : `⚠️ Import completed with ${params.stats.errors} errors`;

  const html =
    params.type === "success"
      ? generateSuccessHtml(params.stats)
      : params.type === "failure"
        ? generateFailureHtml(params.error, params.stats)
        : generateWarningHtml(params.warnings || [], params.stats);

  const resend = new Resend.Resend(process.env.RESEND_API_KEY);
  await resend.emails.send({
    from: "donotreply@donguri.app",
    to,
    subject,
    html,
  });
}

async function acquireLock(): Promise<() => Promise<void>> {
  const config = getConfig();
  const lockPath = config.lockFilePath;

  try {
    const handle = await fsPromises.open(lockPath, "wx");
    await handle.write(`${process.pid}\n`);
    return async () => {
      await handle.close().catch(() => {});
      await fsPromises.unlink(lockPath).catch(() => {});
    };
  } catch {
    const pid = await fsPromises.readFile(lockPath, "utf8");
    try {
      process.kill(parseInt(pid, 10), 0);
      throw new Error(`Import daemon already running as PID ${pid}`);
    } catch {
      await fsPromises.unlink(lockPath);
      const handle = await fsPromises.open(lockPath, "wx");
      await handle.write(`${process.pid}\n`);
      return async () => {
        await handle.close().catch(() => {});
        await fsPromises.unlink(lockPath).catch(() => {});
      };
    }
  }
}

function getNextRunDelay(schedule: string): number {
  const parts = schedule.trim().split(/\s+/);
  const minute = Number.parseInt(parts[0] || "0", 10);
  const hour = Number.parseInt(parts[1] || "0", 10);

  const now = new Date();
  const next = new Date(now);
  next.setHours(hour, minute, 0, 0);

  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }

  return next.getTime() - now.getTime();
}

async function runFullDump(): Promise<void> {
  const startTime = Date.now();
  const config = getConfig();
  console.error("[info] Starting full dump");
  console.error("[info] Timestamp:", new Date().toISOString());

  let dumpPath: string;
  const needsDownload =
    !config.dumpPath || !isDumpFreshEnough(config.dumpPath, config.dumpMaxAgeDays);

  let aria2: Aria2Streamer | null = null;

  try {
    if (config.dumpPath && !needsDownload) {
      const stats = statSync(config.dumpPath);
      const age = ((Date.now() - stats.mtimeMs) / (1000 * 60 * 60 * 24)).toFixed(1);
      console.error(`[info] Using existing dump (${age} days old): ${config.dumpPath}`);
      dumpPath = config.dumpPath;
    } else {
      if (config.dumpPath && needsDownload) {
        console.error("[info] Dump file is too old, downloading fresh copy");
      } else {
        console.error("[info] No existing dump found, downloading");
      }
      console.error("[info] Downloading from:", config.dumpUrl);

      aria2 = new Aria2Streamer();
      dumpPath = await aria2.downloadDump(config.dumpUrl);

      if (!dumpPath) {
        throw new Error(`Failed to download dump from ${config.dumpUrl}`);
      }

      const finalPath = path.join(config.dataDir, "latest-all.json.bz2");

      if (config.dumpPath && existsSync(config.dumpPath)) {
        unlinkSync(config.dumpPath);
      }

      renameSync(dumpPath, finalPath);
      dumpPath = finalPath;
    }

    console.error("[info] Starting stream to subset creation...");
    console.error("[info] Timestamp:", new Date().toISOString());

    const streamer = aria2 || new Aria2Streamer();
    await streamer.streamToSubset(dumpPath);
    await aria2?.shutdown();

    console.error("[info] Running import pipeline");
    console.error("[info] Timestamp:", new Date().toISOString());

    await new Promise<void>((resolve, reject) => {
      const child = spawn("bun", ["run", "src/import/update.ts", "--all"], {
        stdio: ["ignore", "pipe", "pipe"],
      });

      child.stdout.on("data", (data) => {
        process.stdout.write(data);
      });

      child.stderr.on("data", (data) => {
        process.stderr.write(data);
      });

      child.on("close", (code) => {
        if (code === 0) {
          console.error("[info] Update pipeline completed successfully");
          resolve();
        } else {
          console.error(`[error] update.ts exited with code ${code}`);
          reject(new Error(`update.ts exited with code ${code}`));
        }
      });

      child.on("error", (err) => {
        console.error(`[error] Failed to spawn update: ${err.message}`);
        reject(new Error(`Failed to spawn update: ${err.message}`));
      });
    });

    setLastFullDumpAt(new Date());

    const stats = {
      entitiesProcessed: 0,
      entitiesImported: 0,
      entitiesNew: 0,
      entitiesUpdated: 0,
      errors: 0,
      genresFound: 0,
      platformsFound: 0,
      byType: {},
    };

    try {
      await sendNotification({
        stats: {
          processed: stats.entitiesProcessed,
          imported: stats.entitiesImported,
          new: stats.entitiesNew,
          updated: stats.entitiesUpdated,
          errors: stats.errors,
          duration: Date.now() - startTime,
        },
        type: "success",
      });
    } catch (err) {
      console.error(
        "[warning] Failed to send notification:",
        err instanceof Error ? err.message : String(err),
      );
    }

    const duration = Math.floor((Date.now() - startTime) / 1000);
    console.error(
      `[complete] Duration: ${duration}s, Total: ${stats.entitiesProcessed}, Errors: ${stats.errors}`,
    );
    console.error("[info] Timestamp:", new Date().toISOString());
  } catch (error) {
    console.error(
      `[error] Full dump failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    console.error(`[error] Stack: ${error instanceof Error ? error.stack : "No stack available"}`);
    console.error("[info] Timestamp:", new Date().toISOString());
    await aria2?.shutdown();
    throw error;
  }
}

async function runIncremental(): Promise<void> {
  const startTime = Date.now();
  console.error("[info] Starting incremental");
  console.error("[info] Timestamp:", new Date().toISOString());

  try {
    const lastInc = getLastIncrementalAt() || new Date("1970-01-01");
    const changes = await fetchChangedEntities(lastInc);

    if (changes.length === 0) {
      console.error("[info] No changes detected");
      console.error("[info] Timestamp:", new Date().toISOString());
      return;
    }

    console.error(`[info] Processing ${changes.length} changed entities`);

    const entitiesToProcess = changes.filter((c) => shouldUpdateEntity(c));
    const stats = {
      processed: entitiesToProcess.length,
      imported: entitiesToProcess.length,
      new: 0,
      updated: entitiesToProcess.length,
      errors: 0,
      duration: Date.now() - startTime,
      warnings: [],
    };

    for (const change of entitiesToProcess) {
      try {
        const entityHash = hashEntity(change.entity);
        trackEntity(change.entity.id, change.revisionId, entityHash, change.changedProperties);
      } catch (err) {
        console.error(
          `[error] Failed to process entity ${change.entity.id}:`,
          err instanceof Error ? err.message : String(err),
        );
        stats.errors++;
      }
    }

    setLastIncrementalAt(new Date());

    try {
      await sendNotification({
        stats: {
          processed: stats.processed,
          imported: stats.imported,
          new: stats.new,
          updated: stats.updated,
          errors: stats.errors,
          duration: stats.duration,
        },
        warnings: stats.warnings,
        type: stats.errors > 0 ? "warning" : "success",
      });
    } catch (err) {
      console.error(
        "[warning] Failed to send notification:",
        err instanceof Error ? err.message : String(err),
      );
    }

    console.error(
      `[complete] Duration: ${Math.floor(stats.duration / 1000)}s, Total: ${stats.processed}, Errors: ${stats.errors}`,
    );
    console.error("[info] Timestamp:", new Date().toISOString());
  } catch (error) {
    console.error(
      `[error] Incremental import failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    console.error(`[error] Stack: ${error instanceof Error ? error.stack : "No stack available"}`);
    console.error("[info] Timestamp:", new Date().toISOString());
    throw error;
  }
}

async function importRun(): Promise<void> {
  const releaseLock = await acquireLock();
  try {
    const lastFull = getLastFullDumpAt();
    const daysSinceFull = lastFull
      ? (Date.now() - lastFull.getTime()) / (1000 * 60 * 60 * 24)
      : Infinity;

    if (daysSinceFull >= 14) {
      await runFullDump();
    } else {
      await runIncremental();
    }
  } finally {
    await releaseLock();
    close();
  }
}

export async function daemonRun(schedule: string): Promise<void> {
  while (true) {
    try {
      await importRun();

      const delay = getNextRunDelay(schedule);
      console.error(`[info] Next run at ${new Date(Date.now() + delay).toLocaleString()}`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    } catch (error) {
      await sendNotification({
        stats: { processed: 0, imported: 0, new: 0, updated: 0, errors: 1, duration: 0 },
        type: "failure",
        error: error as Error,
      });
      await new Promise((resolve) => setTimeout(resolve, 300_000));
    }
  }
}

export async function daemonRunOnce(_schedule: string): Promise<void> {
  try {
    await importRun();
  } catch (error) {
    await sendNotification({
      stats: { processed: 0, imported: 0, new: 0, updated: 0, errors: 1, duration: 0 },
      type: "failure",
      error: error as Error,
    });
    throw error;
  }
}

export { Aria2Streamer };
export type { SparqlBinding };
