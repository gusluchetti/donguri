import {
  pgTable,
  varchar,
  text,
  smallint,
  integer,
  timestamp,
  pgEnum,
  primaryKey,
  index,
  uuid,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { uuidv7 } from "uuidv7";

export const mediaTypeEnum = pgEnum("media_type", [
  "movie",
  "tv_series",
  "anime",
]);

export const media = pgTable(
  "media",
  {
    id: uuid("id").primaryKey().$defaultFn(uuidv7),
    wikidataId: varchar("wikidata_id", { length: 20 }).notNull().unique(),
    mediaType: mediaTypeEnum("media_type").notNull(),
    titleEn: text("title_en"),
    titleJa: text("title_ja"),
    descriptionEn: text("description_en"),
    descriptionJa: text("description_ja"),
    startYear: smallint("start_year"),
    endYear: smallint("end_year"),
    imdbId: varchar("imdb_id", { length: 20 }),
    malId: integer("mal_id"),
    seasonCount: smallint("season_count"),
    episodeCount: integer("episode_count"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_media_imdb").on(table.imdbId),
    index("idx_media_mal").on(table.malId),
    index("idx_media_type").on(table.mediaType),
  ]
);

export const genres = pgTable("genres", {
  id: uuid("id").primaryKey().$defaultFn(uuidv7),
  wikidataId: varchar("wikidata_id", { length: 20 }).notNull().unique(),
  nameEn: text("name_en"),
  nameJa: text("name_ja"),
});

export const mediaGenres = pgTable(
  "media_genres",
  {
    mediaId: uuid("media_id")
      .notNull()
      .references(() => media.id, { onDelete: "cascade" }),
    genreId: uuid("genre_id")
      .notNull()
      .references(() => genres.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.mediaId, table.genreId] })]
);

export const importProgress = pgTable("import_progress", {
  id: uuid("id").primaryKey().$defaultFn(uuidv7),
  sourceFile: varchar("source_file", { length: 500 }),
  entitiesProcessed: integer("entities_processed").default(0),
  entitiesImported: integer("entities_imported").default(0),
  lastEntityId: varchar("last_entity_id", { length: 20 }),
  status: varchar("status", { length: 20 }).default("pending"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

// Relations
export const mediaRelations = relations(media, ({ many }) => ({
  mediaGenres: many(mediaGenres),
}));

export const genresRelations = relations(genres, ({ many }) => ({
  mediaGenres: many(mediaGenres),
}));

export const mediaGenresRelations = relations(mediaGenres, ({ one }) => ({
  media: one(media, {
    fields: [mediaGenres.mediaId],
    references: [media.id],
  }),
  genre: one(genres, {
    fields: [mediaGenres.genreId],
    references: [genres.id],
  }),
}));

// Types
export type Media = typeof media.$inferSelect;
export type NewMedia = typeof media.$inferInsert;
export type Genre = typeof genres.$inferSelect;
export type NewGenre = typeof genres.$inferInsert;
export type MediaGenre = typeof mediaGenres.$inferSelect;
export type ImportProgress = typeof importProgress.$inferSelect;
