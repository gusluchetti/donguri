#!/usr/bin/env bun
import { daemonRun, daemonRunOnce } from "./daemon";

const once = process.argv.includes("--once");
const schedule =
  process.argv.find((arg) => arg.startsWith("--schedule="))?.slice(11) || "0 2 * * *";

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

try {
  if (once) {
    console.error("[info] Running import daemon once");
    console.error("[info] Timestamp:", new Date().toISOString());

    await daemonRunOnce(schedule);

    console.error("[info] Import completed successfully");
    console.error("[info] Timestamp:", new Date().toISOString());
    flushAndExit(0);
  } else {
    console.error("[info] Starting import daemon");
    await daemonRun(schedule);
  }
} catch (error) {
  console.error(`[error] Import failed: ${error instanceof Error ? error.message : String(error)}`);
  if (error instanceof Error) {
    console.error(`[error] Stack trace:`);
    console.error(error.stack);
  }
  console.error("[info] Timestamp:", new Date().toISOString());

  // Slight delay to allow logs to flush
  setTimeout(() => {
    flushAndExit(1);
  }, 100);
}

process.on("SIGTERM", () => {
  console.error("[info] Received SIGTERM, shutting down...");
  console.error("[info] Timestamp:", new Date().toISOString());
  flushAndExit(0);
});

process.on("SIGINT", () => {
  console.error("[info] Received SIGINT, shutting down...");
  console.error("[info] Timestamp:", new Date().toISOString());
  flushAndExit(0);
});

process.on("uncaughtException", (error) => {
  console.error(`[error] Uncaught exception: ${error.message}`);
  console.error(`[error] Stack: ${error.stack}`);
  console.error("[info] Timestamp:", new Date().toISOString());
  flushAndExit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error(`[error] Unhandled rejection: ${reason}`);
  if (reason instanceof Error) {
    console.error(`[error] Stack: ${reason.stack}`);
  }
  console.error("[info] Timestamp:", new Date().toISOString());
  flushAndExit(1);
});
