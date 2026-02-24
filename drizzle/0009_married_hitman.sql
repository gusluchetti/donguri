-- 1. Create new tables
CREATE TABLE "canonical_platforms" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"parent_id" text,
	"sort_order" integer DEFAULT 0,
	CONSTRAINT "canonical_platforms_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "platform_mappings" (
	"wikidata_id" text NOT NULL,
	"canonical_platform_id" text NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	CONSTRAINT "platform_mappings_wikidata_id_canonical_platform_id_pk" PRIMARY KEY("wikidata_id","canonical_platform_id")
);
--> statement-breakpoint
-- 2. Drop old FK constraints (before dropping the tables they reference)
ALTER TABLE "media_genres" DROP CONSTRAINT "media_genres_genre_id_genres_id_fk";
--> statement-breakpoint
ALTER TABLE "media_platforms" DROP CONSTRAINT "media_platforms_platform_id_platforms_id_fk";
--> statement-breakpoint
-- 3. Drop old PK constraints
ALTER TABLE "media_genres" DROP CONSTRAINT "media_genres_media_id_genre_id_pk";--> statement-breakpoint
ALTER TABLE "media_platforms" DROP CONSTRAINT "media_platforms_media_id_platform_id_pk";--> statement-breakpoint
-- 4. Drop old columns + clear junction data (old rows referenced dropped tables)
ALTER TABLE "media_genres" DROP COLUMN "genre_id";--> statement-breakpoint
ALTER TABLE "media_platforms" DROP COLUMN "platform_id";--> statement-breakpoint
DELETE FROM "media_genres";--> statement-breakpoint
DELETE FROM "media_platforms";--> statement-breakpoint
-- 5. Add new columns
ALTER TABLE "media_genres" ADD COLUMN "canonical_genre_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "media_platforms" ADD COLUMN "canonical_platform_id" text NOT NULL;--> statement-breakpoint
-- 6. Add new PK constraints
ALTER TABLE "media_genres" ADD CONSTRAINT "media_genres_media_id_canonical_genre_id_pk" PRIMARY KEY("media_id","canonical_genre_id");--> statement-breakpoint
ALTER TABLE "media_platforms" ADD CONSTRAINT "media_platforms_media_id_canonical_platform_id_pk" PRIMARY KEY("media_id","canonical_platform_id");--> statement-breakpoint
-- 7. Drop old tables (FKs already removed, no CASCADE needed)
ALTER TABLE "genres" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "platforms" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "genres";--> statement-breakpoint
DROP TABLE "platforms";--> statement-breakpoint
-- 8. Add new FK constraints + indexes
ALTER TABLE "platform_mappings" ADD CONSTRAINT "platform_mappings_canonical_platform_id_canonical_platforms_id_fk" FOREIGN KEY ("canonical_platform_id") REFERENCES "public"."canonical_platforms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_platform_mappings_wikidata" ON "platform_mappings" USING btree ("wikidata_id");--> statement-breakpoint
ALTER TABLE "media_genres" ADD CONSTRAINT "media_genres_canonical_genre_id_canonical_genres_id_fk" FOREIGN KEY ("canonical_genre_id") REFERENCES "public"."canonical_genres"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_platforms" ADD CONSTRAINT "media_platforms_canonical_platform_id_canonical_platforms_id_fk" FOREIGN KEY ("canonical_platform_id") REFERENCES "public"."canonical_platforms"("id") ON DELETE cascade ON UPDATE no action;
