/**
 * Full dump pipeline: download → subset → import
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import readline from "node:readline";
import { eq, sql } from "drizzle-orm";
import { TRGM_SETUP_SQL } from "~/db/fts";
import { CANONICAL_GENRES, GENRE_MAPPINGS } from "~/db/genre-data";
import { CANONICAL_PLATFORMS, PLATFORM_MAPPINGS } from "~/db/platform-data";
import {
  canonicalGenres,
  canonicalPlatforms,
  genreMappings,
  importProgress,
  platformMappings,
} from "~/db/schema";
import { parseMediaEntity, shouldImportEntity } from "./_filters";
import { formatDuration } from "./_retry";
import type { ParsedMedia, WikidataEntity } from "./_types";
import { type CanonicalLookup, type DbType, type ImportStats, processSuperBatch } from "./_upsert";
import type { ImportConfig } from "./config";
import { downloadDump } from "./download";
import { setLastFullDumpAt } from "./state";

const DEFAULT_BATCH_SIZE = 5_000;
const PROGRESS_LOG_INTERVAL = 10_000;

interface MediaImportOpts {
  subsetPath: string;
  limit?: number;
  batchSize?: number;
}

function parseJsonLine(line: string): WikidataEntity | null {
  let cleanLine = line.trim();
  if (cleanLine.endsWith(",")) cleanLine = cleanLine.slice(0, -1);
  if (cleanLine === "[" || cleanLine === "]" || !cleanLine) return null;
  try {
    return JSON.parse(cleanLine);
  } catch {
    return null;
  }
}

async function seedCanonicalMappings(db: DbType): Promise<void> {
  console.log("[mappings] Syncing canonical genres/platforms...");

  const topGenres = CANONICAL_GENRES.filter((g) => g.parentSlug === null);
  for (const g of topGenres) {
    await db
      .insert(canonicalGenres)
      .values({ slug: g.slug, name: g.name, parentId: null, sortOrder: g.sortOrder })
      .onConflictDoNothing({ target: canonicalGenres.slug });
  }
  const allGenres = await db.select().from(canonicalGenres);
  const genreSlugToId = new Map(allGenres.map((g) => [g.slug, g.id]));

  for (const g of CANONICAL_GENRES.filter(
    (g): g is typeof g & { parentSlug: string } => g.parentSlug !== null,
  )) {
    const parentId = genreSlugToId.get(g.parentSlug);
    if (!parentId) continue;
    await db
      .insert(canonicalGenres)
      .values({ slug: g.slug, name: g.name, parentId, sortOrder: g.sortOrder })
      .onConflictDoNothing({ target: canonicalGenres.slug });
  }
  const allGenresNow = await db.select().from(canonicalGenres);
  const genreSlugToIdNow = new Map(allGenresNow.map((g) => [g.slug, g.id]));

  for (const m of GENRE_MAPPINGS) {
    const id = genreSlugToIdNow.get(m.canonicalSlug);
    if (!id) continue;
    await db
      .insert(genreMappings)
      .values({ wikidataId: m.wikidataId, canonicalGenreId: id, source: "manual" })
      .onConflictDoNothing();
  }

  const topPlatforms = CANONICAL_PLATFORMS.filter((p) => p.parentSlug === null);
  for (const p of topPlatforms) {
    await db
      .insert(canonicalPlatforms)
      .values({ slug: p.slug, name: p.name, parentId: null, sortOrder: p.sortOrder })
      .onConflictDoNothing({ target: canonicalPlatforms.slug });
  }
  const allPlatforms = await db.select().from(canonicalPlatforms);
  const platSlugToId = new Map(allPlatforms.map((p) => [p.slug, p.id]));

  for (const p of CANONICAL_PLATFORMS.filter(
    (p): p is typeof p & { parentSlug: string } => p.parentSlug !== null,
  )) {
    const parentId = platSlugToId.get(p.parentSlug);
    if (!parentId) continue;
    await db
      .insert(canonicalPlatforms)
      .values({ slug: p.slug, name: p.name, parentId, sortOrder: p.sortOrder })
      .onConflictDoNothing({ target: canonicalPlatforms.slug });
  }
  const allPlatformsNow = await db.select().from(canonicalPlatforms);
  const platSlugToIdNow = new Map(allPlatformsNow.map((p) => [p.slug, p.id]));

  for (const m of PLATFORM_MAPPINGS) {
    const id = platSlugToIdNow.get(m.canonicalSlug);
    if (!id) continue;
    await db
      .insert(platformMappings)
      .values({ wikidataId: m.wikidataId, canonicalPlatformId: id, source: "manual" })
      .onConflictDoNothing();
  }

  console.log("[mappings] Completed");
}

async function runMediaImport(db: DbType, opts: MediaImportOpts): Promise<void> {
  const { subsetPath, limit = Infinity, batchSize = DEFAULT_BATCH_SIZE } = opts;
  const startTime = Date.now();

  console.log(`[import] Importing from: ${subsetPath}`);
  console.log(`[import] Batch size: ${batchSize}, Limit: ${limit === Infinity ? "none" : limit}`);

  console.log("[import] Setting up trigram indexes...");
  for (const stmt of TRGM_SETUP_SQL) {
    await db.execute(sql.raw(stmt));
  }

  const stats: ImportStats = {
    entitiesProcessed: 0,
    entitiesImported: 0,
    entitiesNew: 0,
    entitiesUpdated: 0,
    errors: 0,
    genresFound: 0,
    platformsFound: 0,
    byType: {},
  };

  const [progressRecord] = await db
    .insert(importProgress)
    .values({ sourceFile: subsetPath, status: "running", startedAt: new Date() })
    .returning({ id: importProgress.id });

  await seedCanonicalMappings(db);

  console.log("[import] Loading canonical genre/platform mappings...");
  const genreLookup: CanonicalLookup = {};
  const platformLookup: CanonicalLookup = {};

  const [gmRows, pmRows] = await Promise.all([
    db
      .select({ wikidataId: genreMappings.wikidataId, canonicalId: genreMappings.canonicalGenreId })
      .from(genreMappings),
    db
      .select({
        wikidataId: platformMappings.wikidataId,
        canonicalId: platformMappings.canonicalPlatformId,
      })
      .from(platformMappings),
  ]);
  for (const row of gmRows) {
    if (!genreLookup[row.wikidataId]) genreLookup[row.wikidataId] = [];
    genreLookup[row.wikidataId].push(row.canonicalId);
  }
  for (const row of pmRows) {
    if (!platformLookup[row.wikidataId]) platformLookup[row.wikidataId] = [];
    platformLookup[row.wikidataId].push(row.canonicalId);
  }
  console.log(
    `  Genre mappings: ${gmRows.length} entries, Platform mappings: ${pmRows.length} entries`,
  );

  let batch: ParsedMedia[] = [];

  try {
    const rl = readline.createInterface({
      input: fs.createReadStream(subsetPath, { encoding: "utf-8" }),
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      if (stats.entitiesImported >= limit) break;

      const entity = parseJsonLine(line);
      if (!entity) continue;

      stats.entitiesProcessed++;

      if (stats.entitiesProcessed % PROGRESS_LOG_INTERVAL === 0) {
        const elapsed = formatDuration(Date.now() - startTime);
        const rate = (stats.entitiesProcessed / ((Date.now() - startTime) / 1000)).toFixed(0);
        console.log(
          `[${elapsed}] Processed: ${stats.entitiesProcessed.toLocaleString()}, ` +
            `Imported: ${stats.entitiesImported.toLocaleString()}, ` +
            `Errors: ${stats.errors}, Rate: ${rate}/s`,
        );

        await db
          .update(importProgress)
          .set({
            entitiesProcessed: stats.entitiesProcessed,
            entitiesImported: stats.entitiesImported,
            lastEntityId: entity.id,
          })
          .where(eq(importProgress.id, progressRecord.id));
      }

      if (!shouldImportEntity(entity)) continue;

      const parsed = parseMediaEntity(entity);
      if (!parsed) continue;

      stats.byType[parsed.mediaType] = (stats.byType[parsed.mediaType] || 0) + 1;
      batch.push(parsed);

      if (batch.length >= batchSize) {
        await processSuperBatch(db, batch, genreLookup, platformLookup, stats);
        batch = [];
      }
    }

    if (batch.length > 0) {
      await processSuperBatch(db, batch, genreLookup, platformLookup, stats);
    }

    console.log(`\n[import] Completed in ${formatDuration(Date.now() - startTime)}`);
    console.log(
      `  Processed: ${stats.entitiesProcessed.toLocaleString()}, ` +
        `Imported: ${stats.entitiesImported.toLocaleString()} ` +
        `(${stats.entitiesNew.toLocaleString()} new, ${stats.entitiesUpdated.toLocaleString()} updated)`,
    );
    console.log(`  Genres: ${stats.genresFound.toLocaleString()} links`);
    console.log(`  Platforms: ${stats.platformsFound.toLocaleString()} links`);
    console.log(`  Errors: ${stats.errors}`);
    console.log(`  By type:`);
    for (const [type, count] of Object.entries(stats.byType)) {
      if (count > 0) console.log(`    ${type}: ${count.toLocaleString()}`);
    }

    await db
      .update(importProgress)
      .set({
        entitiesProcessed: stats.entitiesProcessed,
        entitiesImported: stats.entitiesImported,
        status: "completed",
        completedAt: new Date(),
      })
      .where(eq(importProgress.id, progressRecord.id));
  } catch (err) {
    try {
      await db
        .update(importProgress)
        .set({
          entitiesProcessed: stats.entitiesProcessed,
          entitiesImported: stats.entitiesImported,
          status: "failed",
        })
        .where(eq(importProgress.id, progressRecord.id));
    } catch {
      /* best-effort */
    }
    throw err;
  }
}

function checkDiskSpace(dataDir: string, requiredGB: number): boolean {
  try {
    const { status, stdout } = spawnSync("df", ["-B1", dataDir]);

    if (status !== 0) {
      throw new Error(`df command failed with code ${status}`);
    }

    const stdoutStr = stdout.toString();
    const lines = stdoutStr.split("\n");
    if (lines.length < 2) {
      throw new Error("Could not parse disk space output");
    }

    const parts = lines[1].split(/\s+/);
    if (parts.length < 4) {
      throw new Error("Could not parse disk space output");
    }

    const availBytes = Number.parseInt(parts[3], 10);
    const availGB = availBytes / (1024 * 1024 * 1024);

    if (availGB < requiredGB) {
      console.log(
        `[check] Insufficient disk space: ${availGB.toFixed(1)}GB available, need ${requiredGB}GB`,
      );
      return false;
    }

    console.log(`[check] Disk space check passed: ${availGB.toFixed(1)}GB available`);
    return true;
  } catch (error) {
    console.error("[check] Disk space check failed:", error);
    throw error;
  }
}

function findDumpPath(dataDir: string): string | null {
  const candidates = [`${dataDir}/latest-all.json.bz2`, "/mnt/h/latest-all.json.bz2"];

  for (const path of candidates) {
    try {
      if (fs.existsSync(path)) {
        const stats = fs.statSync(path);
        const sizeGB = (stats.size / 1024 / 1024 / 1024).toFixed(1);
        const ageMs = Date.now() - stats.mtimeMs;
        const ageDays = (ageMs / (1000 * 60 * 60 * 24)).toFixed(1);

        console.log(`[check] Found dump: ${path} (${sizeGB}GB, ${ageDays} days old)`);

        // Only use if less than 14 days old (we'll check this in pipeline)
        return path;
      }
    } catch {}
  }

  console.log("[check] No existing dump found");
  return null;
}

async function createSubset(dumpPath: string, subsetPath: string): Promise<void> {
  const startTime = Date.now();

  console.log(`[subset] Decompressing and filtering ${dumpPath}`);

  // Use shell pipeline to avoid Node.js buffering
  // Limit lbzip2 to 2 threads to match consumer speed
  const exitCode = spawnSync(
    `lbzip2 -dc -n2 "${dumpPath}" | bun src/import/subset.ts > "${subsetPath}"`,
    { shell: true, stdio: "inherit", cwd: process.cwd() },
  ).status;

  if (exitCode !== 0) {
    throw new Error(`Subset creation failed with exit code ${exitCode}`);
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(0);
  console.log(`[subset] Completed in ${duration}s`);
  console.log(`[subset] Output: ${subsetPath}`);
}

export async function runFullPipeline(db: DbType, config: ImportConfig): Promise<void> {
  const startTime = Date.now();

  console.log(`\n${"=".repeat(60)}`);
  console.log("FULL DUMP PIPELINE");
  console.log("=".repeat(60));
  console.log(`Data dir: ${config.dataDir}`);
  console.log(`Dump URL: ${config.dumpUrl}`);
  console.log(`Required disk space: ${config.requiredDiskSpaceGB}GB`);
  console.log(`${"=".repeat(60)}\n`);

  if (!checkDiskSpace(config.dataDir, config.requiredDiskSpaceGB)) {
    throw new Error(`Insufficient disk space. Need ${config.requiredDiskSpaceGB}GB`);
  }

  let dumpPath = findDumpPath(config.dataDir);

  if (!dumpPath) {
    console.log(`\n[pipeline] Downloading dump from ${config.dumpUrl}...`);
    const targetPath = `${config.dataDir}/latest-all.json.bz2`;
    await downloadDump(config.dumpUrl, targetPath);
    dumpPath = targetPath;
  }

  console.log(`\n[pipeline] Creating subset from ${dumpPath}...`);
  const subsetPath = `${config.dataDir}/subset.ndjson`;
  await createSubset(dumpPath, subsetPath);

  console.log(`\n[pipeline] Importing subset to database...`);
  await runMediaImport(db, {
    subsetPath,
    limit: Infinity,
    batchSize: DEFAULT_BATCH_SIZE,
  });

  setLastFullDumpAt(new Date());

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(0);
  console.log(`\n[pipeline] Total pipeline completed in ${totalTime}s`);
}
