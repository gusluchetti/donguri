#!/usr/bin/env bun
import { createReadStream } from "node:fs";
import path from "node:path";
import { createGunzip } from "node:zlib";
import { parse } from "csv-parse";
import { media } from "~/db/schema";
import type { DbType } from "./_upsert";
import type { ImportConfig } from "./config";
import { downloadIfNeeded } from "./download";

export interface QrankStats {
  matched: number;
  updated: number;
  durationMs: number;
}

async function computeSitelinksPercentiles(db: DbType): Promise<void> {
  console.log("[qrank] Computing sitelinks_score...");
  await db.$client.unsafe(`
		WITH ranked AS (
			SELECT
				id,
				1.0 - PERCENT_RANK() OVER (ORDER BY sitelinks_count DESC) AS sitelinks_score
			FROM media
		)
		UPDATE media
		SET sitelinks_score = ranked.sitelinks_score
		FROM ranked
		WHERE media.id = ranked.id
	`);
  console.log("[qrank] sitelinks_score updated");
}

async function loadWikidataIds(db: DbType): Promise<Set<string>> {
  const rows = await db.select({ wikidataId: media.wikidataId }).from(media);
  const qids = new Set<string>(rows.map((r) => r.wikidataId.replace(/^Q/, "")));
  console.log(`[qrank] Loaded ${qids.size} Wikidata QIDs from media table`);
  return qids;
}

async function parseMatchesFromQrank(
  filePath: string,
  qidSet: Set<string>,
): Promise<Map<string, number>> {
  const matches = new Map<string, number>();

  return new Promise<Map<string, number>>((resolve, reject) => {
    createReadStream(filePath)
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
  // Sort descending: highest QRank score (most popular) gets index 0
  const sorted = Array.from(matches.entries()).sort((a, b) => b[1] - a[1]);
  const total = sorted.length;
  const percentiles = new Map<string, number>();
  if (total === 0) return percentiles;

  for (let i = 0; i < total; i++) {
    const [qid] = sorted[i];
    // 1.0 for most popular (i=0), 0.0 for least popular (i=total-1)
    const score = total === 1 ? 1.0 : 1.0 - i / (total - 1);
    percentiles.set(qid, Number(score.toFixed(5)));
  }
  console.log(
    `[qrank] Scores range: max=${percentiles.values().next().value}, min=${percentiles.get(sorted[total - 1][0])}`,
  );
  return percentiles;
}

async function updateQrankPercentiles(
  db: DbType,
  percentiles: Map<string, number>,
): Promise<number> {
  if (percentiles.size === 0) {
    console.log("[qrank] No percentiles to update");
    return 0;
  }

  const batchSize = 1000;
  const entries = Array.from(percentiles.entries());
  for (let i = 0; i < entries.length; i += batchSize) {
    const batch = entries.slice(i, i + batchSize);
    const placeholders = batch
      .map((_, idx) => `($${idx * 2 + 1}, $${idx * 2 + 2}::numeric)`)
      .join(",");
    const values = batch.flat();
    await db.$client.unsafe(
      `
			UPDATE media
			SET qrank_score = data.score
			FROM (VALUES ${placeholders}) AS data(qid, score)
			WHERE media.wikidata_id = 'Q' || data.qid
		`,
      values,
    );
    console.log(
      `[qrank] Updated batch ${i / batchSize + 1} (${Math.min(i + batchSize, entries.length)}/${entries.length})`,
    );
  }
  return entries.length;
}

export async function runQrank(db: DbType, config: ImportConfig): Promise<QrankStats> {
  console.log("[qrank] Starting QRank import");
  const startTime = Date.now();

  try {
    await computeSitelinksPercentiles(db);
    const qrankPath = path.join(config.dataDir, "qrank.csv.gz");
    await downloadIfNeeded(
      "https://qrank.wmcloud.org/download/qrank.csv.gz",
      qrankPath,
      config.supplementaryMaxAgeDays,
      "qrank",
    );
    const qidSet = await loadWikidataIds(db);
    const matches = await parseMatchesFromQrank(qrankPath, qidSet);
    const percentiles = computePercentiles(matches);
    const updated = await updateQrankPercentiles(db, percentiles);

    const durationMs = Date.now() - startTime;
    console.log(`[qrank] QRank import completed in ${(durationMs / 1000).toFixed(1)}s`);
    return { matched: matches.size, updated, durationMs };
  } catch (error) {
    console.error("[qrank] QRank import failed:", error);
    throw error;
  }
}
