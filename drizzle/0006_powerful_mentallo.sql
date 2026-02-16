CREATE TABLE "canonical_genres" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"parent_id" text,
	"sort_order" integer DEFAULT 0,
	CONSTRAINT "canonical_genres_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "genre_mappings" (
	"wikidata_id" text NOT NULL,
	"canonical_genre_id" text NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	CONSTRAINT "genre_mappings_wikidata_id_canonical_genre_id_pk" PRIMARY KEY("wikidata_id","canonical_genre_id")
);
--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "qrank_pct" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "sitelinks_pct" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "popularity_score" numeric(5, 2) GENERATED ALWAYS AS (CASE WHEN qrank_pct IS NOT NULL THEN 0.6 * qrank_pct + 0.4 * COALESCE(sitelinks_pct, 100) ELSE COALESCE(sitelinks_pct, 100) END) STORED;--> statement-breakpoint
ALTER TABLE "seasons" ADD COLUMN "updated_at" timestamp DEFAULT now();--> statement-breakpoint
ALTER TABLE "genre_mappings" ADD CONSTRAINT "genre_mappings_canonical_genre_id_canonical_genres_id_fk" FOREIGN KEY ("canonical_genre_id") REFERENCES "public"."canonical_genres"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_genre_mappings_wikidata" ON "genre_mappings" USING btree ("wikidata_id");--> statement-breakpoint
CREATE INDEX "idx_media_popularity" ON "media" USING btree ("popularity_score");