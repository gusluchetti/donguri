#!/usr/bin/env bun
import fs, { createReadStream } from "node:fs";
import path from "node:path";
import { createGunzip } from "node:zlib";
import { parse } from "csv-parse";
import { media } from "~/db/schema";
import type { DbType } from "./_upsert";
import type { ImportConfig } from "./config";
import { downloadDump } from "./download";

async function computeSitelinksPercentiles(db: DbType): Promise<void> {
  console.log("[qrank] Computing sitelinks_pct...");
  await db.$client.unsafe(`
		WITH ranked AS (
			SELECT
				id,
				PERCENT_RANK() OVER (ORDER BY sitelinks_count DESC) * 100 AS sitelinks_pct
			FROM media
		)
		UPDATE media
		SET sitelinks_pct = ranked.sitelinks_pct
		FROM ranked
		WHERE media.id = ranked.id
	`);
  console.log("[qrank] sitelinks_pct updated");
}

async function downloadQrankIfNeeded(config: ImportConfig): Promise<string> {
  const qrankPath = path.join(config.dataDir, "qrank.csv.gz");
  const exists = fs.existsSync(qrankPath);
  if (exists) {
    const stats = fs.statSync(qrankPath);
    const ageDays = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60 * 24);
    if (ageDays < config.supplementaryMaxAgeDays) {
      console.log(
        `[qrank] Cache age ${ageDays.toFixed(1)} days < ${config.supplementaryMaxAgeDays}, skipping download`,
      );
      return qrankPath;
    }
  }

  const qrankUrl = "https://qrank.wmcloud.org/download/qrank.csv.gz";
  console.log(`[qrank] Downloading qrank from ${qrankUrl}...`);
  await downloadDump(qrankUrl, qrankPath);
  return qrankPath;
}

async function loadWikidataIds(db: DbType): Promise<Set<string>> {
  const rows = await db.select({ wikidataId: media.wikidataId }).from(media);
  const qids = new Set<string>(rows.map((r) => r.wikidataId.replace(/^Q/, "")));
  console.log(`[qrank] Loaded ${qids.size} Wikidata QIDs from media table`);
  return qids;
}

async function parseMatchesFromQrank(
  path: string,
  qidSet: Set<string>,
): Promise<Map<string, number>> {
  const matches = new Map<string, number>();

  return new Promise<Map<string, number>>((resolve, reject) => {
    createReadStream(path)
      .pipe(createGunzip())
      .pipe(parse({ columns: ["QID", "score"] }))
      .on("data", (row: { QID: string; score: string }) => {
        const qid = row.QID.slice(1); // CSV has Q12345, set stores 12345
if (qidSet.has(qid)) {
  matches.set(qid, Number(row.score));
}
      })
      .on("end", () => {
        console.log(`[qrank] Parsed ${matches.size} QRank matched entries`);
        resolve(matches);
      })
      .on("error", reject);
  });
}

function computePercentiles(matches: Map<string, number>): Map<string, number> {
  const sorted = Array.from(matches.entries()).sort((a, b) => a[1] - b[1]);
  const total = sorted.length;
  const percentiles = new Map<string, number>();
  if (total === 0) return percentiles;
  
  for (let i = 0; i < total; i++) {
    const [qid] = sorted[i];
    const percentile = (i / total) * 100;
    percentiles.set(qid, Number(percentile.toFixed(2)));
  }
  console.log(
    `[qrank] Percentiles range: min=${percentiles.values().next().value}, max=${percentiles.get(sorted[total - 1][0])}`,
  );
  return percentiles;
}

async function updateQrankPercentiles(db: DbType, percentiles: Map<string, number>): Promise<void> {
  if (percentiles.size === 0) {
    console.log("[qrank] No percentiles to update");
    return;
  }

  const batchSize = 1000;
  const entries = Array.from(percentiles.entries());
  for (let i = 0; i < entries.length; i += batchSize) {
    const batch = entries.slice(i, i + batchSize);
    const placeholders = batch.map((_, idx) => `($${idx * 2 + 1}, $${idx * 2 + 2})`).join(",");
    const values = batch.flat();
    await db.$client.unsafe(
      `
			UPDATE media
			SET qrank_pct = data.pct
			FROM (VALUES ${placeholders}) AS data(qid, pct)
			WHERE media.wikidata_id = 'Q' || data.qid
		`,
      values,
    );
    console.log(
      `[qrank] Updated batch ${i / batchSize + 1} (${Math.min(i + batchSize, entries.length)}/${entries.length})`,
    );
  }
}

export async function runQrank(db: DbType, config: ImportConfig): Promise<void> {
  console.log("[qrank] Starting QRank import");
  const startTime = Date.now();

  try {
    await computeSitelinksPercentiles(db);
    const qrankPath = await downloadQrankIfNeeded(config);
    const qidSet = await loadWikidataIds(db);
    const matches = await parseMatchesFromQrank(qrankPath, qidSet);
    const percentiles = computePercentiles(matches);
    await updateQrankPercentiles(db, percentiles);

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[qrank] QRank import completed in ${duration}s`);
  } catch (error) {
    console.error("[qrank] QRank import failed:", error);
    throw error;
  }
}
