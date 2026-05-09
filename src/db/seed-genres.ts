import { sql } from "drizzle-orm";
import { CANONICAL_GENRES, GENRE_MAPPINGS } from "./genre-data";
import { getDb } from "./index";
import { canonicalGenres, genreMappings } from "./schema";

const db = getDb();

async function seed() {
  const topLevel = CANONICAL_GENRES.filter((g) => g.parentSlug === null);
  for (const g of topLevel) {
    await db
      .insert(canonicalGenres)
      .values({ slug: g.slug, name: g.name, parentId: null, sortOrder: g.sortOrder })
      .onConflictDoNothing({ target: canonicalGenres.slug });
  }

  const allGenres = await db.select().from(canonicalGenres);
  const slugToId = new Map(allGenres.map((g) => [g.slug, g.id]));

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

  const allGenresNow = await db.select().from(canonicalGenres);
  const slugToIdNow = new Map(allGenresNow.map((g) => [g.slug, g.id]));

  let _mapped = 0;
  let _skipped = 0;
  for (const m of GENRE_MAPPINGS) {
    const canonicalGenreId = slugToIdNow.get(m.canonicalSlug);
    if (!canonicalGenreId) {
      console.warn(
        `  WARN: canonical slug "${m.canonicalSlug}" not found for Q-ID "${m.wikidataId}"`,
      );
      _skipped++;
      continue;
    }
    await db
      .insert(genreMappings)
      .values({ wikidataId: m.wikidataId, canonicalGenreId, source: "manual" })
      .onConflictDoNothing();
    _mapped++;
  }
  await db.execute(sql`SELECT 1`).then(() => process.exit(0));
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
