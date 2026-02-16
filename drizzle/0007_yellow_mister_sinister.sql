ALTER TABLE "media" ADD COLUMN "qrank_pct" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "sitelinks_pct" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "popularity_score" numeric(5, 2) GENERATED ALWAYS AS (CASE WHEN qrank_pct IS NOT NULL THEN 0.6 * qrank_pct + 0.4 * COALESCE(sitelinks_pct, 100) ELSE COALESCE(sitelinks_pct, 100) END) STORED;--> statement-breakpoint
ALTER TABLE "seasons" ADD COLUMN "updated_at" timestamp DEFAULT now();--> statement-breakpoint
CREATE INDEX "idx_media_popularity" ON "media" USING btree ("popularity_score");