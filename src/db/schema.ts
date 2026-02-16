import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { ulid } from "ulid";

// ─── Media ──────────────────────────────────────────────────────────────────

export const media = pgTable(
  "media",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => ulid()),
    wikidataId: text("wikidata_id").notNull().unique(),
    mediaType: text("media_type", {
      enum: ["movie", "tv_series", "anime", "game"],
    }).notNull(),

    // Titles & Description
    title: text("title").notNull(),
    originalTitle: text("original_title"),
    originalLanguage: text("original_language"),
    description: text("description"),

    // Dates
    startYear: integer("start_year"),
    endYear: integer("end_year"),

    // Video media fields (NULL for games)
    runtimeMinutes: integer("runtime_minutes"),
    seasonCount: integer("season_count"),
    episodeCount: integer("episode_count"),

    // Popularity
    sitelinksCount: integer("sitelinks_count").default(0),
    qrankPct: numeric("qrank_pct", { precision: 5, scale: 2 }),
    sitelinksPct: numeric("sitelinks_pct", { precision: 5, scale: 2 }),
    popularityScore: numeric("popularity_score", { precision: 5, scale: 2 }).generatedAlwaysAs(
      sql`CASE WHEN qrank_pct IS NOT NULL THEN 0.6 * qrank_pct + 0.4 * COALESCE(sitelinks_pct, 100) ELSE COALESCE(sitelinks_pct, 100) END`,
    ),

    // Country
    countryOfOrigin: text("country_of_origin"),

    // External IDs
    imdbId: text("imdb_id"),
    tmdbId: text("tmdb_id"),
    malId: text("mal_id"),
    anilistId: text("anilist_id"),
    anidbId: text("anidb_id"),
    igdbId: text("igdb_id"),
    annId: text("ann_id"),
    tvdbId: text("tvdb_id"),
    tvmazeId: text("tvmaze_id"),

    // Media image
    posterUrl: text("poster_url"),

    // Normalized search column
    searchTitle: text("search_title"),

    // Timestamps
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("idx_media_type").on(table.mediaType),
    index("idx_media_sitelinks").on(table.sitelinksCount),
    index("idx_media_start_year").on(table.startYear),
    index("idx_media_imdb").on(table.imdbId),
    index("idx_media_mal").on(table.malId),
    index("idx_media_igdb").on(table.igdbId),
    index("idx_media_tmdb").on(table.tmdbId),
    index("idx_media_tvmaze").on(table.tvmazeId),
    index("idx_media_popularity").on(table.popularityScore),
  ],
);

// ─── Genres ─────────────────────────────────────────────────────────────────

export const genres = pgTable("genres", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => ulid()),
  wikidataId: text("wikidata_id").notNull().unique(),
  name: text("name").notNull(),
});

export const mediaGenres = pgTable(
  "media_genres",
  {
    mediaId: text("media_id")
      .notNull()
      .references(() => media.id, { onDelete: "cascade" }),
    genreId: text("genre_id")
      .notNull()
      .references(() => genres.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.mediaId, table.genreId] })],
);

// ─── Canonical Genres (two-tier: main + sub-genres) ─────────────────────────

export const canonicalGenres = pgTable("canonical_genres", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => ulid()),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  parentId: text("parent_id"),
  sortOrder: integer("sort_order").default(0),
});

export const genreMappings = pgTable(
  "genre_mappings",
  {
    wikidataId: text("wikidata_id").notNull(),
    canonicalGenreId: text("canonical_genre_id")
      .notNull()
      .references(() => canonicalGenres.id, { onDelete: "cascade" }),
    source: text("source", { enum: ["manual", "p279_auto"] })
      .notNull()
      .default("manual"),
  },
  (table) => [
    primaryKey({ columns: [table.wikidataId, table.canonicalGenreId] }),
    index("idx_genre_mappings_wikidata").on(table.wikidataId),
  ],
);

// ─── Platforms (games) ──────────────────────────────────────────────────────

export const platforms = pgTable("platforms", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => ulid()),
  wikidataId: text("wikidata_id").notNull().unique(),
  name: text("name").notNull(),
});

export const mediaPlatforms = pgTable(
  "media_platforms",
  {
    mediaId: text("media_id")
      .notNull()
      .references(() => media.id, { onDelete: "cascade" }),
    platformId: text("platform_id")
      .notNull()
      .references(() => platforms.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.mediaId, table.platformId] })],
);

// ─── Users ──────────────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => ulid()),
  did: text("did").unique(), // nullable — only set for AT Protocol users
  googleId: text("google_id").unique(), // nullable — Google `sub` claim
  githubId: text("github_id").unique(), // nullable — GitHub user ID
  handle: text("handle").notNull(),
  email: text("email"), // from provider profile
  avatarUrl: text("avatar_url"), // from provider profile
  authMethod: text("auth_method", {
    enum: ["atproto", "google", "github"],
  }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// ─── Catalog Entries (user tracking data) ───────────────────────────────────

export const catalogEntries = pgTable(
  "catalog_entries",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => ulid()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    mediaWikidataId: text("media_wikidata_id").notNull(),
    mediaTitle: text("media_title"),
    mediaType: text("media_type", {
      enum: ["movie", "tv_series", "anime", "game"],
    }),
    status: text("status", {
      enum: ["planned", "in_progress", "on_hold", "completed", "dropped", "mastered"],
    }),
    rating: integer("rating"),
    note: text("note"),
    episodeProgress: integer("episode_progress"),
    isFavorite: boolean("is_favorite").default(false).notNull(),
    replayCount: integer("replay_count").default(0).notNull(),
    completedAt: timestamp("completed_at"),
    watchedEpisodes: jsonb("watched_episodes").$type<Record<string, number[]>>(),
    rkey: text("rkey"), // nullable — only set for AT Protocol users
    syncedAt: timestamp("synced_at"), // nullable — last PDS sync time
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("idx_catalog_entries_user").on(table.userId),
    index("idx_catalog_entries_media").on(table.mediaWikidataId),
    uniqueIndex("idx_catalog_entries_user_media").on(table.userId, table.mediaWikidataId),
  ],
);

// ─── Seasons ────────────────────────────────────────────────────────────────

export const seasons = pgTable(
  "seasons",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => ulid()),
    mediaId: text("media_id")
      .notNull()
      .references(() => media.id, { onDelete: "cascade" }),
    seasonNumber: integer("season_number").notNull(),
    episodeCount: integer("episode_count"),
    title: text("title"),
    dataSource: text("data_source", { enum: ["wikidata", "tvmaze", "anime_offline_db"] }).notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_seasons_media_number").on(table.mediaId, table.seasonNumber),
    index("idx_seasons_media").on(table.mediaId),
  ],
);

// ─── OAuth State (replaces KV) ──────────────────────────────────────────────

export const oauthStates = pgTable("oauth_states", {
  key: text("key").primaryKey(),
  value: text("value").notNull(), // JSON string
  expiresAt: timestamp("expires_at").notNull(),
});

// ─── OAuth Sessions (replaces KV) ──────────────────────────────────────────

export const oauthSessions = pgTable("oauth_sessions", {
  sub: text("sub").primaryKey(), // DID
  session: text("session").notNull(), // JSON string
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ─── Import Progress ────────────────────────────────────────────────────────

export const importProgress = pgTable("import_progress", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => ulid()),
  sourceFile: text("source_file"),
  entitiesProcessed: integer("entities_processed").default(0),
  entitiesImported: integer("entities_imported").default(0),
  lastEntityId: text("last_entity_id"),
  status: text("status", {
    enum: ["running", "completed", "failed"],
  }),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
});

// ─── Relations ──────────────────────────────────────────────────────────────

export const mediaRelations = relations(media, ({ many }) => ({
  mediaGenres: many(mediaGenres),
  mediaPlatforms: many(mediaPlatforms),
  seasons: many(seasons),
}));

export const genresRelations = relations(genres, ({ many }) => ({
  mediaGenres: many(mediaGenres),
}));

export const mediaGenresRelations = relations(mediaGenres, ({ one }) => ({
  media: one(media, { fields: [mediaGenres.mediaId], references: [media.id] }),
  genre: one(genres, {
    fields: [mediaGenres.genreId],
    references: [genres.id],
  }),
}));

export const canonicalGenresRelations = relations(canonicalGenres, ({ one, many }) => ({
  parent: one(canonicalGenres, {
    fields: [canonicalGenres.parentId],
    references: [canonicalGenres.id],
    relationName: "parentChild",
  }),
  children: many(canonicalGenres, { relationName: "parentChild" }),
  mappings: many(genreMappings),
}));

export const genreMappingsRelations = relations(genreMappings, ({ one }) => ({
  canonicalGenre: one(canonicalGenres, {
    fields: [genreMappings.canonicalGenreId],
    references: [canonicalGenres.id],
  }),
}));

export const platformsRelations = relations(platforms, ({ many }) => ({
  mediaPlatforms: many(mediaPlatforms),
}));

export const mediaPlatformsRelations = relations(mediaPlatforms, ({ one }) => ({
  media: one(media, {
    fields: [mediaPlatforms.mediaId],
    references: [media.id],
  }),
  platform: one(platforms, {
    fields: [mediaPlatforms.platformId],
    references: [platforms.id],
  }),
}));

export const usersRelations = relations(users, ({ many }) => ({
  catalogEntries: many(catalogEntries),
}));

export const catalogEntriesRelations = relations(catalogEntries, ({ one }) => ({
  user: one(users, {
    fields: [catalogEntries.userId],
    references: [users.id],
  }),
}));

export const seasonsRelations = relations(seasons, ({ one }) => ({
  media: one(media, {
    fields: [seasons.mediaId],
    references: [media.id],
  }),
}));

// ─── Types ──────────────────────────────────────────────────────────────────

export type Media = typeof media.$inferSelect;
export type NewMedia = typeof media.$inferInsert;
export type Genre = typeof genres.$inferSelect;
export type Platform = typeof platforms.$inferSelect;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type CatalogEntry = typeof catalogEntries.$inferSelect;
export type NewCatalogEntry = typeof catalogEntries.$inferInsert;
export type ImportProgress = typeof importProgress.$inferSelect;
export type Season = typeof seasons.$inferSelect;
export type NewSeason = typeof seasons.$inferInsert;
export type CanonicalGenre = typeof canonicalGenres.$inferSelect;
export type GenreMapping = typeof genreMappings.$inferSelect;
