-- Migrate catalog_entries status values to new vocabulary
UPDATE catalog_entries SET status = 'in_progress' WHERE status = 'watching';
UPDATE catalog_entries SET status = 'planned' WHERE status = 'plan_to_watch';
UPDATE catalog_entries SET status = 'on_hold' WHERE status = 'paused';
--> statement-breakpoint
CREATE TABLE "seasons" (
	"id" text PRIMARY KEY NOT NULL,
	"media_id" text NOT NULL,
	"season_number" integer NOT NULL,
	"episode_count" integer,
	"title" text,
	"data_source" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "catalog_entries" ADD COLUMN "is_favorite" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "catalog_entries" ADD COLUMN "replay_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "catalog_entries" ADD COLUMN "completed_at" timestamp;--> statement-breakpoint
ALTER TABLE "catalog_entries" ADD COLUMN "watched_episodes" jsonb;--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "tvmaze_id" text;--> statement-breakpoint
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_seasons_media_number" ON "seasons" USING btree ("media_id","season_number");--> statement-breakpoint
CREATE INDEX "idx_seasons_media" ON "seasons" USING btree ("media_id");--> statement-breakpoint
CREATE INDEX "idx_media_tvmaze" ON "media" USING btree ("tvmaze_id");--> statement-breakpoint
ALTER TABLE "media" DROP COLUMN "status";