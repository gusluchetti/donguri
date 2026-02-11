CREATE TABLE "catalog_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"media_wikidata_id" text NOT NULL,
	"status" text,
	"rating" integer,
	"note" text,
	"episode_progress" integer,
	"rkey" text,
	"synced_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "genres" (
	"id" text PRIMARY KEY NOT NULL,
	"wikidata_id" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "genres_wikidata_id_unique" UNIQUE("wikidata_id")
);
--> statement-breakpoint
CREATE TABLE "import_progress" (
	"id" text PRIMARY KEY NOT NULL,
	"source_file" text,
	"entities_processed" integer DEFAULT 0,
	"entities_imported" integer DEFAULT 0,
	"last_entity_id" text,
	"status" text,
	"started_at" timestamp,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "media" (
	"id" text PRIMARY KEY NOT NULL,
	"wikidata_id" text NOT NULL,
	"media_type" text NOT NULL,
	"title" text NOT NULL,
	"original_title" text,
	"original_language" text,
	"description" text,
	"start_year" integer,
	"end_year" integer,
	"runtime_minutes" integer,
	"season_count" integer,
	"episode_count" integer,
	"status" text,
	"sitelinks_count" integer DEFAULT 0,
	"country_of_origin" text,
	"imdb_id" text,
	"tmdb_id" text,
	"mal_id" text,
	"anilist_id" text,
	"anidb_id" text,
	"igdb_id" text,
	"ann_id" text,
	"tvdb_id" text,
	"poster_url" text,
	"search_title" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "media_wikidata_id_unique" UNIQUE("wikidata_id")
);
--> statement-breakpoint
CREATE TABLE "media_genres" (
	"media_id" text NOT NULL,
	"genre_id" text NOT NULL,
	CONSTRAINT "media_genres_media_id_genre_id_pk" PRIMARY KEY("media_id","genre_id")
);
--> statement-breakpoint
CREATE TABLE "media_platforms" (
	"media_id" text NOT NULL,
	"platform_id" text NOT NULL,
	CONSTRAINT "media_platforms_media_id_platform_id_pk" PRIMARY KEY("media_id","platform_id")
);
--> statement-breakpoint
CREATE TABLE "oauth_sessions" (
	"sub" text PRIMARY KEY NOT NULL,
	"session" text NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "oauth_states" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platforms" (
	"id" text PRIMARY KEY NOT NULL,
	"wikidata_id" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "platforms_wikidata_id_unique" UNIQUE("wikidata_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"did" text,
	"handle" text NOT NULL,
	"auth_method" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "users_did_unique" UNIQUE("did")
);
--> statement-breakpoint
ALTER TABLE "catalog_entries" ADD CONSTRAINT "catalog_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_genres" ADD CONSTRAINT "media_genres_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_genres" ADD CONSTRAINT "media_genres_genre_id_genres_id_fk" FOREIGN KEY ("genre_id") REFERENCES "public"."genres"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_platforms" ADD CONSTRAINT "media_platforms_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_platforms" ADD CONSTRAINT "media_platforms_platform_id_platforms_id_fk" FOREIGN KEY ("platform_id") REFERENCES "public"."platforms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_catalog_entries_user" ON "catalog_entries" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_catalog_entries_media" ON "catalog_entries" USING btree ("media_wikidata_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_catalog_entries_user_media" ON "catalog_entries" USING btree ("user_id","media_wikidata_id");--> statement-breakpoint
CREATE INDEX "idx_media_type" ON "media" USING btree ("media_type");--> statement-breakpoint
CREATE INDEX "idx_media_sitelinks" ON "media" USING btree ("sitelinks_count");--> statement-breakpoint
CREATE INDEX "idx_media_start_year" ON "media" USING btree ("start_year");--> statement-breakpoint
CREATE INDEX "idx_media_imdb" ON "media" USING btree ("imdb_id");--> statement-breakpoint
CREATE INDEX "idx_media_mal" ON "media" USING btree ("mal_id");--> statement-breakpoint
CREATE INDEX "idx_media_igdb" ON "media" USING btree ("igdb_id");--> statement-breakpoint
CREATE INDEX "idx_media_tmdb" ON "media" USING btree ("tmdb_id");