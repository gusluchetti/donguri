// Import configuration

import fs from "node:fs";
import path from "node:path";

const CONTAINERIZED = process.env.CONTAINERIZED || "false";
const DATA_DIR = process.env.DATA_DIR || "./data";
const LOGS_DIR = process.env.LOGS_DIR || "./logs";
const STATE_DB_PATH = process.env.STATE_DB_PATH || "./data/import-state.db";
const IMPORT_FULL_INTERVAL = process.env.IMPORT_FULL_INTERVAL || "3"; // days
const IMPORT_INCREMENTAL_INTERVAL = process.env.IMPORT_INCREMENTAL_INTERVAL || "3"; // days
const COVER_ART_INTERVAL = process.env.COVER_ART_INTERVAL || "3"; // days
const COVER_ART_BACKOFF_BASE = process.env.COVER_ART_BACKOFF_BASE || "3"; // days
const COVER_ART_BACKOFF_MULTIPLIER = process.env.COVER_ART_BACKOFF_MULTIPLIER || "1"; // linear backoff
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;

function isContainerized(): boolean {
  // Check environment variable
  if (CONTAINERIZED === "true") return true;

  // Check if we're running in Docker
  try {
    const content = fs.readFileSync("/proc/1/cgroup", "utf8");
    return content.includes("docker");
  } catch {
    return false;
  }
}

const AUTO_PATHS = {
  qrank: ["qrank.csv.gz", "qrank.csv"],
  animeOffline: ["anime-offline-database.jsonl"],
  subset: ["subset.ndjson"],
};

function autoDetect(candidates: string[]): string | null {
  for (const candidate of candidates) {
    const fullPath = path.join(DATA_DIR, candidate);
    if (fs.existsSync(fullPath)) return fullPath;
  }
  return null;
}

export interface ImportConfig {
  containerized: boolean;
  automated: boolean;

  dataDir: string;
  logsDir: string;
  stateDbPath: string;

  fullIntervalDays: number;
  incrementalIntervalDays: number;

  coverArtIntervalDays: number;
  coverArtBackoffBaseDays: number;
  coverArtBackoffMultiplier: number;

  tmdbApiKey: string | undefined;
  twitchClientId: string | undefined;
  twitchClientSecret: string | undefined;

  subsetPath: string | null;
  qrankPath: string | null;
  animeOfflinePath: string | null;

  importJobId: string | null;
  lockFilePath: string;
  daemonMode: boolean;
  healthCheckInterval: number;
  emailNotificationEnabled: boolean;
  emailNotificationAddress: string | null;
  emailOnSuccess: boolean;
  emailOnFailure: boolean;
  emailOnWarning: boolean;
}

export function getConfig(): ImportConfig {
  const containerized = isContainerized();
  const automated = process.argv.includes("--automated") || containerized;

  const IMPORT_JOB_ID = process.env.IMPORT_JOB_ID;
  const LOCK_FILE_PATH = process.env.LOCK_FILE_PATH;
  const IMPORT_DAEMON_MODE = process.env.IMPORT_DAEMON_MODE;
  const HEALTH_CHECK_INTERVAL = process.env.HEALTH_CHECK_INTERVAL;
  const EMAIL_NOTIFICATION_ENABLED = process.env.EMAIL_NOTIFICATION_ENABLED;
  const EMAIL_TO = process.env.EMAIL_TO;
  const EMAIL_ON_SUCCESS = process.env.EMAIL_ON_SUCCESS;
  const EMAIL_ON_FAILURE = process.env.EMAIL_ON_FAILURE;
  const EMAIL_ON_WARNING = process.env.EMAIL_ON_WARNING;

  const config: ImportConfig = {
    containerized,
    automated,

    dataDir: DATA_DIR,
    logsDir: LOGS_DIR,
    stateDbPath: STATE_DB_PATH,

    fullIntervalDays: Number.parseInt(IMPORT_FULL_INTERVAL, 10),
    incrementalIntervalDays: Number.parseInt(IMPORT_INCREMENTAL_INTERVAL, 10),

    coverArtIntervalDays: Number.parseInt(COVER_ART_INTERVAL, 10),
    coverArtBackoffBaseDays: Number.parseInt(COVER_ART_BACKOFF_BASE, 10),
    coverArtBackoffMultiplier: Number.parseInt(COVER_ART_BACKOFF_MULTIPLIER, 10),

    tmdbApiKey: TMDB_API_KEY,
    twitchClientId: TWITCH_CLIENT_ID,
    twitchClientSecret: TWITCH_CLIENT_SECRET,

    subsetPath: autoDetect(AUTO_PATHS.subset),
    qrankPath: autoDetect(AUTO_PATHS.qrank),
    animeOfflinePath: autoDetect(AUTO_PATHS.animeOffline),

    importJobId: IMPORT_JOB_ID || null,
    lockFilePath: LOCK_FILE_PATH || "/tmp/donguri-import.pid",
    daemonMode: IMPORT_DAEMON_MODE === "true",
    healthCheckInterval: Number.parseInt(HEALTH_CHECK_INTERVAL || "300", 10),
    emailNotificationEnabled: EMAIL_NOTIFICATION_ENABLED === "true",
    emailNotificationAddress: EMAIL_TO || null,
    emailOnSuccess: EMAIL_ON_SUCCESS === "true",
    emailOnFailure: EMAIL_ON_FAILURE === "true",
    emailOnWarning: EMAIL_ON_WARNING === "true",
  };

  return config;
}

export function getFeaturesToRun(config: ImportConfig): string[] {
  const features: string[] = [];

  // Always run percentiles and seasons if we have the data
  features.push("percentiles", "seasons");

  // Run media import if we have subset data
  if (config.subsetPath) {
    features.push("media");
  }

  // Always try to run cover art (will skip if no API keys)
  features.push("covers");

  return features;
}
