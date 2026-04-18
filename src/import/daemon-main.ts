#!/usr/bin/env bun
import { daemonRun, daemonRunOnce } from "./daemon";

const once = process.argv.includes("--once");
const schedule =
  process.argv.find((arg) => arg.startsWith("--schedule="))?.slice(11) || "0 2 * * *";

try {
  if (once) {
    console.error("[info] Running import daemon once");
    await daemonRunOnce(schedule);
    console.error("[info] Import completed successfully");
    process.exit(0);
  } else {
    console.error("[info] Starting import daemon");
    await daemonRun(schedule);
  }
} catch (error) {
  console.error(`[error] Import failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
