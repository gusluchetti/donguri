CREATE TYPE "public"."media_type" AS ENUM('movie', 'tv_series', 'anime');--> statement-breakpoint
CREATE TABLE "genres" (
	"id" uuid PRIMARY KEY NOT NULL,
	"wikidata_id" varchar(20) NOT NULL,
	"name_en" text,
	"name_ja" text,
	CONSTRAINT "genres_wikidata_id_unique" UNIQUE("wikidata_id")
);
--> statement-breakpoint
CREATE TABLE "import_progress" (
	"id" uuid PRIMARY KEY NOT NULL,
	"source_file" varchar(500),
	"entities_processed" integer DEFAULT 0,
	"entities_imported" integer DEFAULT 0,
	"last_entity_id" varchar(20),
	"status" varchar(20) DEFAULT 'pending',
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "media" (
	"id" uuid PRIMARY KEY NOT NULL,
	"wikidata_id" varchar(20) NOT NULL,
	"media_type" "media_type" NOT NULL,
	"title_en" text,
	"title_original" text,
	"original_language" varchar(10),
	"description_en" text,
	"start_year" smallint,
	"end_year" smallint,
	"imdb_id" varchar(20),
	"mal_id" integer,
	"season_count" smallint,
	"episode_count" integer,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "media_wikidata_id_unique" UNIQUE("wikidata_id")
);
--> statement-breakpoint
CREATE TABLE "media_genres" (
	"media_id" uuid NOT NULL,
	"genre_id" uuid NOT NULL,
	CONSTRAINT "media_genres_media_id_genre_id_pk" PRIMARY KEY("media_id","genre_id")
);
--> statement-breakpoint
ALTER TABLE "media_genres" ADD CONSTRAINT "media_genres_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_genres" ADD CONSTRAINT "media_genres_genre_id_genres_id_fk" FOREIGN KEY ("genre_id") REFERENCES "public"."genres"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_media_imdb" ON "media" USING btree ("imdb_id");--> statement-breakpoint
CREATE INDEX "idx_media_mal" ON "media" USING btree ("mal_id");--> statement-breakpoint
CREATE INDEX "idx_media_type" ON "media" USING btree ("media_type");