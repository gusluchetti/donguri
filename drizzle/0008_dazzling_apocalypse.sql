ALTER TABLE "media" ADD COLUMN "qrank_score" integer;--> statement-breakpoint
CREATE INDEX "idx_media_qrank" ON "media" USING btree ("qrank_score");