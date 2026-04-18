#!/usr/bin/env bun
import { daemonRun } from "./daemon";

const once = process.argv.includes("--once");
const schedule =
  process.argv.find((arg) => arg.startsWith("--schedule="))?.slice(11) || "0 2 * * *";

if (once) {
  await daemonRun(schedule);
} else {
  while (true) {
    await daemonRun(schedule);
    const delay = 300_000;
    console.error(`[info] Looping in ${delay / 1000} seconds...`);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}
