import { spawn } from "node:child_process";
import fsPromises from "node:fs/promises";
import * as Resend from "resend";
import { Aria2Streamer } from "./_aria2-stream";
import { getConfig } from "./config";
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
  console.error("[info] Starting full dump");

  const aria2 = new Aria2Streamer();
  const url = "https://dumps.wikimedia.org/wikidatawiki/entities/latest-all.json.bz2";
  const dumpPath = await aria2.downloadDump(url);

  if (!dumpPath) {
    throw new Error("Failed to download dump");
  }

  const gid = dumpPath.split("/").pop();
  if (!gid) throw new Error("Invalid dump path");
  await aria2.waitForDownload(gid);
  await aria2.streamToSubset(dumpPath);

  console.error("[info] Running import pipeline");

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
        resolve();
      } else {
        reject(new Error(`update.ts exited with code ${code}`));
      }
    });

    child.on("error", (err) => {
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

  console.error(
    `[complete] Duration: ${Math.floor((Date.now() - startTime) / 1000)}s, Total: ${stats.entitiesProcessed}, Errors: ${stats.errors}`,
  );
  await aria2.shutdown();
}

async function runIncremental(): Promise<void> {
  const startTime = Date.now();
  console.error("[info] Starting incremental");

  const lastInc = getLastIncrementalAt() || new Date("1970-01-01");
  const changes = await fetchChangedEntities(lastInc);

  if (changes.length === 0) {
    console.error("[info] No changes detected");
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
    } catch {
      stats.errors++;
    }
  }

  setLastIncrementalAt(new Date());

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

  console.error(
    `[complete] Duration: ${Math.floor(stats.duration / 1000)}s, Total: ${stats.processed}, Errors: ${stats.errors}`,
  );
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

export { Aria2Streamer };
export type { SparqlBinding };
