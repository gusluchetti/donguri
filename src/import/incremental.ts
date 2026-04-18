/**
 * Incremental updates via SPARQL: fetch entities modified since last incremental run,
 * then batch-load full Wikidata JSON and upsert.
 */

import { eq, sql } from "drizzle-orm";
import { fetch } from "undici";
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
import { formatDuration, withRetry } from "./_retry";
import type { ParsedMedia, WikidataEntity } from "./_types";
import { type CanonicalLookup, type DbType, type ImportStats, processSuperBatch } from "./_upsert";
import type { ImportConfig } from "./config";
import { getLastIncrementalAt, setLastIncrementalAt } from "./state";

const SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";
const WIKIDATA_API = "https://www.wikidata.org/w/api.php";

// Our 10 media types
const _MEDIA_TYPES = [
  "Q11424", // film
  "Q5398426", // TV series
  "Q202866", // animated film
  "Q506240", // TV film
  "Q117467246", // animated TV series
  "Q7889", // video game
  "Q63952888", // anime TV series
  "Q20650540", // anime film
  "Q220898", // OVA
  "Q1047299", // ONA
];

interface ParsedIncremental {
  parsed: ParsedMedia[];
  errors: number;
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

/**
 * Query SPARQL for Q-IDs of media type entities modified since `since`.
 * Paginated with LIMIT 500 OFFSET.
 */
async function querySparqlForModified(since: Date): Promise<string[]> {
  const sinceIso = since.toISOString();
  const qids: string[] = [];

  console.log(`[sparql] Querying for entities modified since ${sinceIso}...`);

  let offset = 0;
  let pageCount = 0;

  while (true) {
    pageCount++;
    console.log(`[sparql] Page ${pageCount} (offset ${offset})...`);

    const query = `
SELECT DISTINCT ?entity ?modified WHERE {
  ?entity wdt:P31 ?type .
  VALUES ?type { wd:Q11424 wd:Q5398426 wd:Q202866 wd:Q506240
                 wd:Q117467246 wd:Q7889 wd:Q63952888 wd:Q20650540
                 wd:Q220898 wd:Q1047299 }
  ?entity schema:dateModified ?modified .
  FILTER(?modified > "${sinceIso}"^^xsd:dateTime)
}
ORDER BY ?modified
LIMIT 500
OFFSET ${offset}
    `;

    const response = await withRetry(
      () =>
        fetch(SPARQL_ENDPOINT, {
          method: "POST",
          headers: {
            "Content-Type": "application/sparql-query",
            Accept: "application/json",
          },
          body: query,
        }),
      `SPARQL query page ${pageCount}`,
    );

    if (!response.ok) {
      throw new Error(`SPARQL failed: HTTP ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as {
      results?: { bindings?: Array<{ entity?: { value?: string } }> };
    };

    const bindings = data.results?.bindings ?? [];
    console.log(`[sparql] Page ${pageCount}: ${bindings.length} results`);

    for (const binding of bindings) {
      const entityUrl = binding.entity?.value;
      if (entityUrl) {
        const qid = entityUrl.split("/").pop();
        if (qid) qids.push(qid);
      }
    }

    // End of results
    if (bindings.length < 500) {
      break;
    }

    offset += 500;
  }

  const uniqueQids = [...new Set(qids)];
  console.log(`[sparql] Total unique Q-IDs: ${uniqueQids.length}`);

  return uniqueQids;
}

/**
 * Fetch full entity JSON from Wikidata API for a batch of Q-IDs.
 * Max 50 per request.
 */
async function fetchEntitiesFromWikidata(qids: string[]): Promise<WikidataEntity[]> {
  const entities: WikidataEntity[] = [];
  const BATCH_SIZE = 50;

  for (let i = 0; i < qids.length; i += BATCH_SIZE) {
    const batch = qids.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(qids.length / BATCH_SIZE);

    console.log(`[wikidata] Fetching batch ${batchNum}/${totalBatches} (${batch.length} items)...`);

    const params = new URLSearchParams({
      action: "wbgetentities",
      ids: batch.join("|"),
      format: "json",
      props: "labels|descriptions|aliases|claims|sitelinks",
    });

    const response = await withRetry(
      () =>
        fetch(`${WIKIDATA_API}?${params}`, {
          headers: { "User-Agent": "donguri-import-bot/1.0" },
        }),
      `Wikidata API batch ${batchNum}`,
    );

    if (!response.ok) {
      throw new Error(`Wikidata API failed: HTTP ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as {
      entities?: Record<string, WikidataEntity>;
    };

    if (data.entities) {
      for (const entity of Object.values(data.entities)) {
        if (entity.id) entities.push(entity);
      }
    }
  }

  return entities;
}

/**
 * Parse and filter entities, same as full pipeline.
 */
async function parseEntities(entities: WikidataEntity[]): Promise<ParsedIncremental> {
  console.log(`[parse] Parsing ${entities.length} entities...`);

  const parsed: ParsedMedia[] = [];
  let errors = 0;

  for (const entity of entities) {
    try {
      if (!shouldImportEntity(entity)) continue;
      const media = parseMediaEntity(entity);
      if (!media) continue;
      parsed.push(media);
    } catch {
      errors++;
    }
  }

  console.log(`[parse] Parsed: ${parsed.length}, Errors: ${errors}`);
  return { parsed, errors };
}

/**
 * Main incremental update function.
 * Returns true if full dump is needed (gap too large), false otherwise.
 */
export async function runIncremental(db: DbType, _config: ImportConfig): Promise<boolean> {
  const startTime = Date.now();

  console.log(`\n${"=".repeat(60)}`);
  console.log("INCREMENTAL UPDATE PIPELINE");
  console.log(`${"=".repeat(60)}\n`);

  console.log("[incremental] Setting up trigram indexes...");
  for (const stmt of TRGM_SETUP_SQL) {
    await db.execute(sql.raw(stmt));
  }

  // Determine since date
  let since = getLastIncrementalAt();
  if (!since) {
    // Never run incremental before — default to 30 days ago
    since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    console.log(
      `[incremental] No previous incremental record. Defaulting to 30 days ago: ${since.toISOString()}`,
    );
  }

  const daysSince = (Date.now() - since.getTime()) / (1000 * 60 * 60 * 24);
  console.log(`[incremental] Gap since last update: ${daysSince.toFixed(1)} days`);

  // Gap too large — signal to full pipeline
  if (daysSince > 30) {
    console.log("[incremental] Gap > 30 days — need full dump");
    return true;
  }

  // Fetch modified Q-IDs from SPARQL
  const qids = await querySparqlForModified(since);

  if (qids.length === 0) {
    console.log("[incremental] No changes found — skipping import");
    setLastIncrementalAt(new Date());
    return false;
  }

  // Fetch full entities
  const entities = await fetchEntitiesFromWikidata(qids);
  console.log(`[incremental] Fetched ${entities.length} full entities`);

  // Parse
  const { parsed } = await parseEntities(entities);

  if (parsed.length === 0) {
    console.log("[incremental] No valid entities to import");
    setLastIncrementalAt(new Date());
    return false;
  }

  // Prepare for upsert
  console.log("[incremental] Preparing import...");
  const [progressRecord] = await db
    .insert(importProgress)
    .values({
      sourceFile: "incremental-sparql",
      status: "running",
      startedAt: new Date(),
    })
    .returning({ id: importProgress.id });

  await seedCanonicalMappings(db);

  console.log("[incremental] Loading canonical genre/platform mappings...");
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

  // Upsert in batches
  console.log("[incremental] Upserting entities...");
  const stats: ImportStats = {
    entitiesProcessed: parsed.length,
    entitiesImported: 0,
    entitiesNew: 0,
    entitiesUpdated: 0,
    errors: 0,
    genresFound: 0,
    platformsFound: 0,
    byType: {},
  };

  const BATCH_SIZE = 5_000;
  for (let i = 0; i < parsed.length; i += BATCH_SIZE) {
    const batch = parsed.slice(i, i + BATCH_SIZE);
    await processSuperBatch(db, batch, genreLookup, platformLookup, stats);
  }

  // Mark complete
  await db
    .update(importProgress)
    .set({
      entitiesProcessed: stats.entitiesProcessed,
      entitiesImported: stats.entitiesImported,
      status: "completed",
      completedAt: new Date(),
    })
    .where(eq(importProgress.id, progressRecord.id));

  setLastIncrementalAt(new Date());

  const totalTime = formatDuration(Date.now() - startTime);
  console.log(`\n[incremental] Completed in ${totalTime}`);
  console.log(
    `  Processed: ${stats.entitiesProcessed}, Imported: ${stats.entitiesImported} ` +
      `(${stats.entitiesNew} new, ${stats.entitiesUpdated} updated)`,
  );

  return false;
}
