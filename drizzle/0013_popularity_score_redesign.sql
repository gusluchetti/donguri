-- Drop generated column and its index first (generated columns block renames of their dependencies)
DROP INDEX IF EXISTS "idx_media_popularity";--> statement-breakpoint
ALTER TABLE "media" DROP COLUMN "popularity_score";--> statement-breakpoint

-- Rename component columns (pct → score, 0–100 → 0.00000–1.00000)
ALTER TABLE "media" RENAME COLUMN "qrank_pct" TO "qrank_score";--> statement-breakpoint
ALTER TABLE "media" RENAME COLUMN "sitelinks_pct" TO "sitelinks_score";--> statement-breakpoint

-- Widen precision to 6 significant digits, 5 decimal places
ALTER TABLE "media" ALTER COLUMN "qrank_score" TYPE numeric(6,5);--> statement-breakpoint
ALTER TABLE "media" ALTER COLUMN "sitelinks_score" TYPE numeric(6,5);--> statement-breakpoint

-- Convert existing data in-place
--   old qrank_pct:     0=unpopular → 100=popular   → divide by 100
--   old sitelinks_pct: 0=popular   → 100=unpopular → 1 - old/100
UPDATE "media" SET qrank_score = qrank_score / 100.0 WHERE qrank_score IS NOT NULL;--> statement-breakpoint
UPDATE "media" SET sitelinks_score = 1.0 - sitelinks_score / 100.0 WHERE sitelinks_score IS NOT NULL;--> statement-breakpoint

-- Re-add generated column with corrected formula (1.00000 = most popular)
-- qrank NULL treated as 0.0 → no-QRank items capped at 0.40000; both NULL → 0.00000
ALTER TABLE "media" ADD COLUMN "popularity_score" numeric(6,5) GENERATED ALWAYS AS (0.6 * COALESCE(qrank_score, 0.0) + 0.4 * COALESCE(sitelinks_score, 0.0)) STORED;--> statement-breakpoint

CREATE INDEX "idx_media_popularity" ON "media" USING btree ("popularity_score");
