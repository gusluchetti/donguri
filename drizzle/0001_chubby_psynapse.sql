CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE INDEX "idx_media_title_en_trgm" ON "media" USING gin ("title_en" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_media_title_original_trgm" ON "media" USING gin ("title_original" gin_trgm_ops);