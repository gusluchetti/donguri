import { sql } from "drizzle-orm";
import { getDb } from "./index";
import { CANONICAL_PLATFORMS, PLATFORM_MAPPINGS } from "./platform-data";
import { canonicalPlatforms, platformMappings } from "./schema";

const db = getDb();

async function seed() {
  console.log("Seeding canonical platforms...");

  // 1. Insert top-level platforms (no parent)
  const topLevel = CANONICAL_PLATFORMS.filter((p) => p.parentSlug === null);
  for (const p of topLevel) {
    await db
      .insert(canonicalPlatforms)
      .values({ slug: p.slug, name: p.name, parentId: null, sortOrder: p.sortOrder })
      .onConflictDoNothing({ target: canonicalPlatforms.slug });
  }
  console.log(`  ${topLevel.length} top-level platforms`);

  // 2. Fetch all top-level IDs to resolve parentSlug → parentId
  const allPlatforms = await db.select().from(canonicalPlatforms);
  const slugToId = new Map(allPlatforms.map((p) => [p.slug, p.id]));

  // 3. Insert children with resolved parentId
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
  console.log(`  ${children.length} child platforms`);

  // 4. Re-fetch all platforms (now includes children)
  const allPlatformsNow = await db.select().from(canonicalPlatforms);
  const slugToIdNow = new Map(allPlatformsNow.map((p) => [p.slug, p.id]));

  // 5. Insert platform mappings
  let mapped = 0;
  let skipped = 0;
  for (const m of PLATFORM_MAPPINGS) {
    const canonicalPlatformId = slugToIdNow.get(m.canonicalSlug);
    if (!canonicalPlatformId) {
      console.warn(
        `  WARN: canonical slug "${m.canonicalSlug}" not found for Q-ID "${m.wikidataId}"`,
      );
      skipped++;
      continue;
    }
    await db
      .insert(platformMappings)
      .values({ wikidataId: m.wikidataId, canonicalPlatformId, source: "manual" })
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
