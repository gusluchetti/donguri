import { sql } from "drizzle-orm";
import { CANONICAL_GENRES, GENRE_MAPPINGS } from "./genre-data";
import { cleanEnv, createImportDb } from "./index";
import { canonicalGenres, genreMappings } from "./schema";

const url = cleanEnv(process.env.DATABASE_URL);
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const { db } = createImportDb(url);

async function seed() {
  console.log("Seeding canonical genres...");

  // 1. Insert top-level genres (no parent)
  const topLevel = CANONICAL_GENRES.filter((g) => g.parentSlug === null);
  for (const g of topLevel) {
    await db
      .insert(canonicalGenres)
      .values({ slug: g.slug, name: g.name, parentId: null, sortOrder: g.sortOrder })
      .onConflictDoNothing({ target: canonicalGenres.slug });
  }
  console.log(`  ${topLevel.length} top-level genres`);

  // 2. Fetch all top-level IDs to resolve parentSlug → parentId
  const allGenres = await db.select().from(canonicalGenres);
  const slugToId = new Map(allGenres.map((g) => [g.slug, g.id]));

  // 3. Insert sub-genres
  const subGenres = CANONICAL_GENRES.filter((g) => g.parentSlug !== null);
  for (const g of subGenres) {
    if (!g.parentSlug) continue;
    const parentId = slugToId.get(g.parentSlug);
    if (!parentId) {
      console.warn(`  WARN: parent slug "${g.parentSlug}" not found for "${g.slug}"`);
      continue;
    }
    await db
      .insert(canonicalGenres)
      .values({ slug: g.slug, name: g.name, parentId, sortOrder: g.sortOrder })
      .onConflictDoNothing({ target: canonicalGenres.slug });
  }
  console.log(`  ${subGenres.length} sub-genres`);

  // 4. Re-fetch all genres (now includes sub-genres)
  const allGenresNow = await db.select().from(canonicalGenres);
  const slugToIdNow = new Map(allGenresNow.map((g) => [g.slug, g.id]));

  // 5. Insert genre mappings
  let mapped = 0;
  let skipped = 0;
  for (const m of GENRE_MAPPINGS) {
    const canonicalGenreId = slugToIdNow.get(m.canonicalSlug);
    if (!canonicalGenreId) {
      console.warn(
        `  WARN: canonical slug "${m.canonicalSlug}" not found for Q-ID "${m.wikidataId}"`,
      );
      skipped++;
      continue;
    }
    await db
      .insert(genreMappings)
      .values({ wikidataId: m.wikidataId, canonicalGenreId, source: "manual" })
      .onConflictDoNothing();
    mapped++;
  }
  console.log(`  ${mapped} mappings inserted (${skipped} skipped)`);

  console.log("Done!");
  await db.execute(sql`SELECT 1`).then(() => process.exit(0));
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
