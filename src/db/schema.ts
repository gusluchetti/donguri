import { relations } from "drizzle-orm";
import {
  index,
  integer,
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
    status: text("status", {
      enum: ["airing", "ended", "cancelled", "upcoming"],
    }),

    // Popularity
    sitelinksCount: integer("sitelinks_count").default(0),

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
      enum: ["watching", "completed", "dropped", "plan_to_watch", "paused"],
    }),
    rating: integer("rating"),
    note: text("note"),
    episodeProgress: integer("episode_progress"),
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
