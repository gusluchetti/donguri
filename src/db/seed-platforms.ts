import { sql } from "drizzle-orm";
import { getDb } from "./index";
import { CANONICAL_PLATFORMS, PLATFORM_MAPPINGS } from "./platform-data";
import { canonicalPlatforms, platformMappings } from "./schema";

const db = getDb();

async function seed() {
  const topLevel = CANONICAL_PLATFORMS.filter((p) => p.parentSlug === null);
  for (const p of topLevel) {
    await db
      .insert(canonicalPlatforms)
      .values({ slug: p.slug, name: p.name, parentId: null, sortOrder: p.sortOrder })
      .onConflictDoNothing({ target: canonicalPlatforms.slug });
  }

  const allPlatforms = await db.select().from(canonicalPlatforms);
  const slugToId = new Map(allPlatforms.map((p) => [p.slug, p.id]));

  const children = CANONICAL_PLATFORMS.filter((p) => p.parentSlug !== null);
  for (const p of children) {
    if (!p.parentSlug) continue;
    const parentId = slugToId.get(p.parentSlug);
    if (!parentId) {
      console.warn(`  WARN: parent slug "${p.parentSlug}" not found for "${p.slug}"`);
      continue;
    }
    await db
      .insert(canonicalPlatforms)
      .values({ slug: p.slug, name: p.name, parentId, sortOrder: p.sortOrder })
      .onConflictDoNothing({ target: canonicalPlatforms.slug });
  }

  const allPlatformsNow = await db.select().from(canonicalPlatforms);
  const slugToIdNow = new Map(allPlatformsNow.map((p) => [p.slug, p.id]));

  let _mapped = 0;
  let _skipped = 0;
  for (const m of PLATFORM_MAPPINGS) {
    const canonicalPlatformId = slugToIdNow.get(m.canonicalSlug);
    if (!canonicalPlatformId) {
      console.warn(
        `  WARN: canonical slug "${m.canonicalSlug}" not found for Q-ID "${m.wikidataId}"`,
      );
      _skipped++;
      continue;
    }
    await db
      .insert(platformMappings)
      .values({ wikidataId: m.wikidataId, canonicalPlatformId, source: "manual" })
      .onConflictDoNothing();
    _mapped++;
  }
  await db.execute(sql`SELECT 1`).then(() => process.exit(0));
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
