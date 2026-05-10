/* biome-ignore-all lint/suspicious/noConsole: this is the sanctioned logger wrapper */

import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const isDev = process.env.NODE_ENV === "development";
const _noop = () => {};

type LogLevel = "debug" | "info" | "warn" | "error";
const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const logLevelFromEnv = (process.env.LOG_LEVEL?.toLowerCase() as LogLevel) || undefined;
const envLogLevel =
  logLevelFromEnv && LEVELS[logLevelFromEnv] !== undefined ? logLevelFromEnv : undefined;
const effectiveLevel: LogLevel = envLogLevel || (isDev ? "debug" : "warn");

const shouldLog = (level: LogLevel): boolean => LEVELS[level] >= LEVELS[effectiveLevel];

const formatMessage = (level: LogLevel, mod: string, ...args: unknown[]): string => {
  if (envLogLevel === undefined) {
    return args
      .map((a) => (typeof a === "string" ? a : a instanceof Error ? String(a) : JSON.stringify(a)))
      .join(" ");
  }

  const timestamp = new Date().toISOString();
  const msg = args
    .map((a) => (typeof a === "string" ? a : a instanceof Error ? String(a) : JSON.stringify(a)))
    .join(" ");
  return `${timestamp} ${level.toUpperCase().padEnd(5)} [${mod}] ${msg}`;
};

const logger = (level: LogLevel, mod: string, ...args: unknown[]) => {
  if (!shouldLog(level)) return;

  const formatted = formatMessage(level, mod, ...args);
  const method = console[level] || console.log;
  method(formatted);
};

/**
 * Application logger. Use instead of `console.*` everywhere except CLI scripts
 * under `src/import/**` and `src/db/seed-*.ts` (which have a Biome override).
 *
 * - `debug` / `info`: controlled by LOG_LEVEL env var (default: debug in dev, warn in prod)
 * - `warn` / `error`: always emit when LOG_LEVEL ≤ warn/error
 *
 * Methods are bound to `console` so the browser DevTools / terminal stack
 * trace points at the *caller*, not at this wrapper.
 *
 * When LOG_LEVEL is set (CLI mode), output is structured: ISO-timestamp LEVEL [module] message
 * When LOG_LEVEL is unset (browser/app dev), output passes through unchanged.
 */
export const log = {
  debug: (mod: string, ...args: unknown[]) => logger("debug", mod, ...args),
  info: (mod: string, ...args: unknown[]) => logger("info", mod, ...args),
  warn: (mod: string, ...args: unknown[]) => logger("warn", mod, ...args),
  error: (mod: string, ...args: unknown[]) => logger("error", mod, ...args),

  step: async <T>(mod: string, name: string, fn: () => Promise<T>): Promise<T> => {
    log.info(mod, `${name} started`);
    const start = Date.now();
    try {
      const result = await fn();
      const duration = Date.now() - start;
      log.info(mod, `${name} completed`, `duration_ms=${duration}`);
      return result;
    } catch (err) {
      const duration = Date.now() - start;
      log.error(mod, `${name} failed after ${duration}ms`, err);
      throw err;
    }
  },

  timer: (mod: string, name: string): (() => void) => {
    const start = Date.now();
    return () => {
      const duration = Date.now() - start;
      log.debug(mod, `${name} took ${duration}ms`);
    };
  },

  qids: (mod: string, label: string, qids: string[]): void => {
    if (qids.length === 0) {
      log.debug(mod, `${label}: empty`);
      return;
    }
    if (effectiveLevel === "debug") {
      log.debug(mod, `${label}:`, qids.map((q) => `qid=${q}`).join(" "));
    } else {
      const first = qids.slice(0, 3);
      const last = qids.slice(-3);
      const sample = first.length + last.length >= qids.length ? qids : [...first, "...", ...last];
      log.info(
        mod,
        `${label}: count=${qids.length} sample=`,
        sample.map((q) => `qid=${q}`).join(" "),
      );
    }
  },

  scoped: (mod: string) => ({
    debug: (...args: unknown[]) => log.debug(mod, ...args),
    info: (...args: unknown[]) => log.info(mod, ...args),
    warn: (...args: unknown[]) => log.warn(mod, ...args),
    error: (...args: unknown[]) => log.error(mod, ...args),
  }),
};

export interface FileLoggingOptions {
  logsDir?: string;
  symlinkLatest?: boolean;
}

export function attachFileLogging(
  stage: string,
  opts: FileLoggingOptions = {},
): { runId: string; logFilePath: string } {
  const logsDir = opts.logsDir || "./logs";
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  const isoTimestamp = new Date().toISOString().replace(/:/g, "-");
  const pid = process.pid;
  const runId = randomUUID();

  const logFileName = `import-${stage}-${isoTimestamp}-${pid}.log`;
  const logFilePath = path.join(logsDir, logFileName);
  const stream = fs.createWriteStream(logFilePath, { flags: "a" });

  const latestPath = path.join(logsDir, "latest.log");
  const latestPathTxt = path.join(logsDir, "latest-path.txt");

  const originalMethods = {
    debug: console.debug,
    info: console.info,
    log: console.log,
    warn: console.warn,
    error: console.error,
  };

  const intercept = (level: LogLevel, original: (...args: unknown[]) => void) => {
    return (...args: unknown[]) => {
      const msg = formatMessage(level, "console", ...args);
      original(msg);
      stream.write(`${msg}\n`);
    };
  };

  const wrappedMethods = {
    debug: intercept("debug", originalMethods.debug),
    info: intercept("info", originalMethods.info),
    log: intercept("info", originalMethods.log),
    warn: intercept("warn", originalMethods.warn),
    error: intercept("error", originalMethods.error),
  };

  console.debug = wrappedMethods.debug;
  console.info = wrappedMethods.info;
  console.log = wrappedMethods.log;
  console.warn = wrappedMethods.warn;
  console.error = wrappedMethods.error;

  process.on("beforeExit", () => {
    if (typeof stream.end === "function") {
      stream.end();
    }
  });

  process.on("SIGTERM", () => {
    if (typeof stream.end === "function") {
      stream.end();
    }
    process.exit(0);
  });

  process.on("SIGINT", () => {
    if (typeof stream.end === "function") {
      stream.end();
    }
    process.exit(0);
  });

  if (opts.symlinkLatest !== false) {
    try {
      if (fs.existsSync(latestPath)) {
        fs.unlinkSync(latestPath);
      }
      fs.symlinkSync(path.basename(logFilePath), latestPath);
    } catch (_err) {
      fs.writeFileSync(latestPathTxt, logFilePath);
    }
  }

  return { runId, logFilePath };
}

export function logStartupBanner(
  stage: string,
  runId: string,
  config: Record<string, unknown>,
  envVars: string[] = [],
): void {
  const hostname = os.hostname();
  const platform = os.platform();
  const arch = os.arch();
  const cwd = process.cwd();
  const bunVersion = process.versions.bun;
  const nodeVersion = process.versions.node;
  const pid = process.pid;
  const startTime = new Date().toISOString();

  let gitCommit = "unknown";
  let gitBranch = "unknown";
  try {
    const { execSync } = require("node:child_process");
    gitCommit = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
    gitBranch = execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf8" }).trim();
  } catch {}

  const totalMem = Math.round(os.totalmem() / 1024 / 1024);
  const freeMem = Math.round(os.freemem() / 1024 / 1024);

  console.info(
    `
=== IMPORT STARTUP BANNER ===
run_id: ${runId}
stage: ${stage}
start_time: ${startTime}
pid: ${pid}
hostname: ${hostname}
platform: ${platform}/${arch}
cwd: ${cwd}
bun_version: ${bunVersion}
node_version: ${nodeVersion}
git_commit: ${gitCommit}
git_branch: ${gitBranch}
memory_total_mb: ${totalMem}
memory_free_mb: ${freeMem}
config: ${JSON.stringify(config, null, 2)}
env_present: ${envVars.map((v) => `${v}=${process.env[v] ? "set" : "unset"}`).join(", ")}
=== END BANNER ===
`
      .trim()
      .replace(/\n{2,}/g, "\n"),
  );
}

export function logShutdownBanner(
  stage: string,
  runId: string,
  startTime: Date,
  exitCode?: number,
  error?: Error,
): void {
  const endTime = new Date();
  const duration = endTime.getTime() - startTime.getTime();

  console.info(
    `
=== IMPORT SHUTDOWN BANNER ===
run_id: ${runId}
stage: ${stage}
start_time: ${startTime.toISOString()}
end_time: ${endTime.toISOString()}
duration_ms: ${duration}
exit_code: ${exitCode ?? "unknown"}
${error ? `error: ${error.message}\n${error.stack}` : "status: success"}
=== END BANNER ===
`
      .trim()
      .replace(/\n{2,}/g, "\n"),
  );
}
