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
ALTER TABLE "genre_mappings" ADD CONSTRAINT "genre_mappings_canonical_genre_id_canonical_genres_id_fk" FOREIGN KEY ("canonical_genre_id") REFERENCES "public"."canonical_genres"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_genre_mappings_wikidata" ON "genre_mappings" USING btree ("wikidata_id");