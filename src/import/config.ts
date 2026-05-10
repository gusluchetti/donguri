export interface ImportConfig {
  dataDir: string;
  stateDbPath: string;
  dumpMaxAgeDays: number;
  dumpUrl: string;
  requiredDiskSpaceGB: number;
  supplementaryMaxAgeDays: number;
  resendApiKey: string | null;
  emailFrom: string;
  emailTo: string;
  emailOnSuccess: boolean;
  emailOnFailure: boolean;
  emailOnWarning: boolean;
  logLevel: string;
}

export function getConfig(): ImportConfig {
  return {
    dataDir: process.env.DATA_DIR || "./data",
    stateDbPath: process.env.STATE_DB_PATH || "./data/import-state.db",
    dumpMaxAgeDays: Number.parseInt(process.env.DUMP_MAX_AGE_DAYS || "14", 10),
    dumpUrl:
      process.env.DUMP_URL ||
      "https://dumps.wikimedia.org/wikidatawiki/entities/latest-all.json.bz2",
    requiredDiskSpaceGB: Number.parseInt(process.env.REQUIRED_DISK_SPACE_GB || "100", 10),
    supplementaryMaxAgeDays: Number.parseInt(process.env.SUPPLEMENTARY_MAX_AGE_DAYS || "7", 10),
    resendApiKey: process.env.RESEND_API_KEY || null,
    emailFrom: process.env.EMAIL_FROM || "gustavo@luchetti.dev",
    emailTo: process.env.EMAIL_TO || "gustavo@luchetti.dev",
    emailOnSuccess: process.env.EMAIL_ON_SUCCESS !== "false",
    emailOnFailure: process.env.EMAIL_ON_FAILURE !== "false",
    emailOnWarning: process.env.EMAIL_ON_WARNING !== "false",
    logLevel: process.env.LOG_LEVEL || "info",
  };
}

export function redactedConfig(config: ImportConfig): Record<string, unknown> {
  return {
    ...config,
    resendApiKey: config.resendApiKey ? "***set***" : "***unset***",
  };
}
