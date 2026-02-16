DROP INDEX "idx_media_qrank";--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "qrank_pct" numeric(5, 2);--> statement-breakpoint
CREATE INDEX "idx_media_qrank" ON "media" USING btree ("qrank_pct");--> statement-breakpoint
ALTER TABLE "media" DROP COLUMN "qrank_score";