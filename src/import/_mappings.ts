import { CANONICAL_GENRES, GENRE_MAPPINGS } from "~/db/genre-data";
import { CANONICAL_PLATFORMS, PLATFORM_MAPPINGS } from "~/db/platform-data";
import { canonicalGenres, canonicalPlatforms, genreMappings, platformMappings } from "~/db/schema";
import type { CanonicalLookup, DbType } from "./_upsert";

export async function seedCanonicalMappings(db: DbType): Promise<void> {
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

export async function loadCanonicalLookups(db: DbType): Promise<{
  genreLookup: CanonicalLookup;
  platformLookup: CanonicalLookup;
}> {
  console.log("[lookups] Loading canonical genre/platform mappings...");
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
  return { genreLookup, platformLookup };
}
