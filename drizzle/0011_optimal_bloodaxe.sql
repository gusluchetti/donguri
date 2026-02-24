ALTER TABLE "catalog_entries" ADD COLUMN "animation_origin" text;--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "animation_origin" text;--> statement-breakpoint
CREATE INDEX "idx_media_animation_origin" ON "media" USING btree ("animation_origin");