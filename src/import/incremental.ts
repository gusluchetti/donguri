/**
 * Incremental Wikidata updater: fetch recently modified media entities
 * via SPARQL + wbgetentities API, then upsert into the local DB.
 *
 * Usage:
 *   bun run src/import/incremental.ts --days=7           # last 7 days
 *   bun run src/import/incremental.ts --days=30          # last 30 days
 *   bun run src/import/incremental.ts --days=7 --dry-run # preview only
 */

import { createImportDb } from "../db";
import { shouldImportEntity } from "./_filters";
import { parseMediaEntity } from "./_parser";
import { formatDuration } from "./_retry";
import type { WikidataEntity } from "./_types";
import { MediaTypeQValues } from "./_types";
import { type ImportStats, processSuperBatch } from "./_upsert";

const SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";
const WIKIDATA_API = "https://www.wikidata.org/w/api.php";
const USER_AGENT = "donguri-import/1.0 (https://donguri.app)";
const ENTITIES_PER_REQUEST = 50; // wbgetentities max
const UPSERT_BATCH_SIZE = 500;
const SPARQL_DELAY_MS = 2_000; // be polite to SPARQL endpoint

// All media type Q-values we query SPARQL for
const MEDIA_Q_VALUES = [
  MediaTypeQValues.FILM,
  MediaTypeQValues.ANIMATED_FILM,
  MediaTypeQValues.TV_FILM,
  MediaTypeQValues.TV_SERIES,
  MediaTypeQValues.ANIMATED_TV_SERIES,
  MediaTypeQValues.ANIME_TV_SERIES,
  MediaTypeQValues.ANIME_FILM,
  MediaTypeQValues.OVA,
  MediaTypeQValues.ONA,
  MediaTypeQValues.ANIME,
  MediaTypeQValues.ANIME_TV_SERIES_ALT,
  MediaTypeQValues.VIDEO_GAME,
];

// ─── SPARQL ──────────────────────────────────────────────────────────────────

function buildSparqlQuery(qValue: string, sinceDate: string): string {
  return `SELECT ?item WHERE {
  ?item wdt:P31 wd:${qValue} .
  ?item schema:dateModified ?date .
  FILTER(?date > "${sinceDate}"^^xsd:dateTime)
}`;
}

async function querySparql(query: string): Promise<string[]> {
  const url = `${SPARQL_ENDPOINT}?query=${encodeURIComponent(query)}&format=json`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/sparql-results+json",
      "User-Agent": USER_AGENT,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`SPARQL query failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  const bindings = data.results?.bindings ?? [];
  return bindings.map((b: { item: { value: string } }) => {
    // Extract Q-ID from full URI: http://www.wikidata.org/entity/Q12345 → Q12345
    const uri = b.item.value;
    return uri.split("/").pop() ?? uri;
  });
}

async function fetchChangedEntityIds(days: number): Promise<Set<string>> {
  const sinceDate = `${new Date(Date.now() - days * 86_400_000).toISOString().split(".")[0]}Z`;
  console.log(`Querying SPARQL for entities modified since ${sinceDate}...`);

  const allIds = new Set<string>();

  for (const qValue of MEDIA_Q_VALUES) {
    const query = buildSparqlQuery(qValue, sinceDate);
    try {
      const ids = await querySparql(query);
      for (const id of ids) allIds.add(id);
      console.log(`  ${qValue}: ${ids.length} entities`);
    } catch (err) {
      console.warn(`  ${qValue}: SPARQL error — ${err instanceof Error ? err.message : err}`);
    }
    // Rate limit between queries
    await new Promise((r) => setTimeout(r, SPARQL_DELAY_MS));
  }

  console.log(`Total unique changed entities: ${allIds.size}`);
  return allIds;
}

// ─── Wikidata API ────────────────────────────────────────────────────────────

async function fetchEntities(ids: string[]): Promise<WikidataEntity[]> {
  const url = `${WIKIDATA_API}?action=wbgetentities&ids=${ids.join("|")}&format=json`;
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!res.ok) {
    throw new Error(`wbgetentities failed (${res.status})`);
  }
  const data = await res.json();
  if (data.error) {
    throw new Error(`wbgetentities error: ${data.error.info}`);
  }
  const entities: WikidataEntity[] = [];
  for (const entity of Object.values(data.entities ?? {})) {
    // wbgetentities returns { missing: "" } for deleted entities
    if ((entity as WikidataEntity).type === "item") {
      entities.push(entity as WikidataEntity);
    }
  }
  return entities;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const daysArg = args.find((a) => a.startsWith("--days="));
  const days = daysArg ? Number.parseInt(daysArg.split("=")[1], 10) : 7;
  const dryRun = args.includes("--dry-run");

  if (days <= 0 || Number.isNaN(days)) {
    console.error("--days must be a positive integer");
    process.exit(1);
  }

  const startTime = Date.now();
  console.log(`\nIncremental Wikidata update: last ${days} day(s)${dryRun ? " (DRY RUN)" : ""}\n`);

  // Step 1: Find changed entities via SPARQL
  const changedIds = await fetchChangedEntityIds(days);

  if (changedIds.size === 0) {
    console.log("No changed entities found.");
    return;
  }

  if (dryRun) {
    console.log(`\nDry run: would fetch and upsert ${changedIds.size} entities.`);
    const preview = [...changedIds].slice(0, 20).join(", ");
    console.log(`Sample: ${preview}${changedIds.size > 20 ? "..." : ""}`);
    return;
  }

  // Step 2: Fetch full entity data in batches of 50
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL required");
    process.exit(1);
  }

  const { db, client: rawClient } = createImportDb(url);
  const stats: ImportStats = {
    entitiesProcessed: 0,
    entitiesImported: 0,
    errors: 0,
    genresFound: 0,
    platformsFound: 0,
    byType: { movie: 0, tv_series: 0, anime: 0, game: 0 },
  };
  const genreCache: Record<string, string> = {};
  const platformCache: Record<string, string> = {};

  const idList = [...changedIds];
  let fetched = 0;
  let upsertBatch: ReturnType<typeof parseMediaEntity>[] = [];

  console.log(`\nFetching ${idList.length} entities from Wikidata API...`);

  for (let i = 0; i < idList.length; i += ENTITIES_PER_REQUEST) {
    const chunk = idList.slice(i, i + ENTITIES_PER_REQUEST);

    try {
      const entities = await fetchEntities(chunk);
      fetched += entities.length;

      for (const entity of entities) {
        stats.entitiesProcessed++;
        if (!shouldImportEntity(entity)) continue;
        const parsed = parseMediaEntity(entity);
        if (!parsed) continue;
        stats.byType[parsed.mediaType] = (stats.byType[parsed.mediaType] || 0) + 1;
        upsertBatch.push(parsed);
      }

      // Upsert when batch is full
      if (upsertBatch.length >= UPSERT_BATCH_SIZE) {
        await processSuperBatch(
          rawClient,
          db,
          upsertBatch as NonNullable<ReturnType<typeof parseMediaEntity>>[],
          genreCache,
          platformCache,
          stats,
        );
        upsertBatch = [];
      }
    } catch (err) {
      console.error(`Error fetching batch at offset ${i}:`, err);
      stats.errors += chunk.length;
    }

    if ((i / ENTITIES_PER_REQUEST) % 10 === 0 && i > 0) {
      console.log(
        `  [${formatDuration(Date.now() - startTime)}] Fetched: ${fetched}/${idList.length}, Imported: ${stats.entitiesImported}`,
      );
    }

    // Rate limit API requests
    await new Promise((r) => setTimeout(r, 100));
  }

  // Flush remaining batch
  if (upsertBatch.length > 0) {
    await processSuperBatch(
      rawClient,
      db,
      upsertBatch as NonNullable<ReturnType<typeof parseMediaEntity>>[],
      genreCache,
      platformCache,
      stats,
    );
  }

  await rawClient.end();

  const elapsed = formatDuration(Date.now() - startTime);
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Incremental update completed in ${elapsed}`);
  console.log(`Fetched: ${fetched}, Processed: ${stats.entitiesProcessed}`);
  console.log(`Imported/updated: ${stats.entitiesImported}`);
  console.log(`Genres linked: ${stats.genresFound}, Platforms linked: ${stats.platformsFound}`);
  console.log(`Errors: ${stats.errors}`);
  console.log("By type:");
  for (const [type, count] of Object.entries(stats.byType)) {
    if (count > 0) console.log(`  ${type}: ${count}`);
  }
  console.log("=".repeat(60));
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
