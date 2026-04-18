#!/usr/bin/env bun
import { daemonRun, daemonRunOnce } from "./daemon";

const once = process.argv.includes("--once");
const schedule =
  process.argv.find((arg) => arg.startsWith("--schedule="))?.slice(11) || "0 2 * * *";

function getMemoryUsage(): string {
  const usage = process.memoryUsage();
  return `RSS: ${(usage.rss / 1024 / 1024).toFixed(1)}MB, Heap: ${(usage.heapUsed / 1024 / 1024).toFixed(1)}MB/${(usage.heapTotal / 1024 / 1024).toFixed(1)}MB`;
}

function flushAndExit(code: number) {
  const flush = () => {
    try {
      if (process.stdout.writable) {
        try {
          process.stdout.destroy();
        } catch {}
      }
    } catch {}
    try {
      if (process.stderr.writable) {
        try {
          process.stderr.destroy();
        } catch {}
      }
    } catch {}
  };

  flush();
  setTimeout(() => {
    flush();
    process.exit(code);
  }, 50);
}

let currentStage = "initialization";

try {
  if (once) {
    console.error("[info] Running import daemon once");
    console.error("[info] Timestamp:", new Date().toISOString());
    console.error(`[info] Memory: ${getMemoryUsage()}`);

    currentStage = "import execution";
    await daemonRunOnce(schedule);

    currentStage = "completion";
    console.error("[info] Import completed successfully");
    console.error("[info] Timestamp:", new Date().toISOString());
    console.error(`[info] Memory: ${getMemoryUsage()}`);
    flushAndExit(0);
  } else {
    console.error("[info] Starting import daemon");
    currentStage = "daemon execution";
    await daemonRun(schedule);
  }
} catch (error) {
  console.error("=".repeat(60));
  console.error("❌ CRITICAL ERROR IN IMPORT DAEMON");
  console.error("=".repeat(60));
  console.error(`[error] Stage: ${currentStage}`);
  console.error(`[error] Error: ${error instanceof Error ? error.message : String(error)}`);
  if (error instanceof Error) {
    console.error(`[error] Stack trace:`);
    console.error(error.stack);
  }
  console.error(`[info] Memory: ${getMemoryUsage()}`);
  console.error("[info] Timestamp:", new Date().toISOString());
  console.error("=".repeat(60));

  // Slight delay to allow logs to flush
  setTimeout(() => {
    flushAndExit(1);
  }, 100);
}

process.on("SIGTERM", () => {
  console.error("=".repeat(60));
  console.error("[info] Received SIGTERM, shutting down...");
  console.error(`[info] Stage: ${currentStage}`);
  console.error(`[info] Memory: ${getMemoryUsage()}`);
  console.error("[info] Timestamp:", new Date().toISOString());
  console.error("=".repeat(60));
  flushAndExit(0);
});

process.on("SIGINT", () => {
  console.error("=".repeat(60));
  console.error("[info] Received SIGINT, shutting down...");
  console.error(`[info] Stage: ${currentStage}`);
  console.error(`[info] Memory: ${getMemoryUsage()}`);
  console.error("[info] Timestamp:", new Date().toISOString());
  console.error("=".repeat(60));
  flushAndExit(0);
});

process.on("uncaughtException", (error) => {
  console.error("=".repeat(60));
  console.error("❌ UNCAUGHT EXCEPTION");
  console.error("=".repeat(60));
  console.error(`[error] Stage: ${currentStage}`);
  console.error(`[error] Error: ${error.message}`);
  console.error(`[error] Stack: ${error.stack}`);
  console.error(`[info] Memory: ${getMemoryUsage()}`);
  console.error("[info] Timestamp:", new Date().toISOString());
  console.error("=".repeat(60));
  flushAndExit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error("=".repeat(60));
  console.error("❌ UNHANDLED PROMISE REJECTION");
  console.error("=".repeat(60));
  console.error(`[error] Stage: ${currentStage}`);
  console.error(`[error] Reason: ${reason}`);
  if (reason instanceof Error) {
    console.error(`[error] Stack: ${reason.stack}`);
  }
  console.error(`[info] Memory: ${getMemoryUsage()}`);
  console.error("[info] Timestamp:", new Date().toISOString());
  console.error("=".repeat(60));
  flushAndExit(1);
});
