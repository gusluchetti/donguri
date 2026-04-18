export interface ImportConfig {
  dataDir: string;
  stateDbPath: string;
  dumpMaxAgeDays: number;
  dumpUrl: string;
  requiredDiskSpaceGB: number;
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
  };
}
