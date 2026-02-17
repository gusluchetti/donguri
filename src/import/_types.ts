// Wikidata entity structure types

export interface WikidataEntity {
  id: string;
  type: "item" | "property";
  labels?: Record<string, LanguageValue>;
  descriptions?: Record<string, LanguageValue>;
  aliases?: Record<string, LanguageValue[]>;
  claims?: Record<string, Claim[]>;
  sitelinks?: Record<string, SiteLink>;
}

export interface LanguageValue {
  language: string;
  value: string;
}

export interface Claim {
  mainsnak: Snak;
  type: string;
  id: string;
  rank: "preferred" | "normal" | "deprecated";
  qualifiers?: Record<string, Snak[]>;
  "qualifiers-order"?: string[];
  references?: Reference[];
}

export interface Snak {
  snaktype: "value" | "novalue" | "somevalue";
  property: string;
  datatype?: string;
  datavalue?: DataValue;
}

export interface Reference {
  hash: string;
  snaks: Record<string, Snak[]>;
  "snaks-order": string[];
}

export type DataValue =
  | StringDataValue
  | WikibaseEntityIdValue
  | TimeDataValue
  | QuantityDataValue
  | MonolingualTextValue
  | GlobeCoordinateValue;

export interface StringDataValue {
  type: "string";
  value: string;
}

export interface WikibaseEntityIdValue {
  type: "wikibase-entityid";
  value: {
    "entity-type": "item" | "property";
    "numeric-id": number;
    id: string;
  };
}

export interface TimeDataValue {
  type: "time";
  value: {
    time: string;
    timezone: number;
    before: number;
    after: number;
    precision: number;
    calendarmodel: string;
  };
}

export interface QuantityDataValue {
  type: "quantity";
  value: {
    amount: string;
    unit: string;
    upperBound?: string;
    lowerBound?: string;
  };
}

export interface MonolingualTextValue {
  type: "monolingualtext";
  value: {
    text: string;
    language: string;
  };
}

export interface GlobeCoordinateValue {
  type: "globecoordinate";
  value: {
    latitude: number;
    longitude: number;
    altitude: number | null;
    precision: number;
    globe: string;
  };
}

export interface SiteLink {
  site: string;
  title: string;
  badges: string[];
}

// ─── Property & Q-value constants ───────────────────────────────────────────

export const WikidataProperties = {
  INSTANCE_OF: "P31",

  // External IDs
  IMDB_ID: "P345",
  TMDB_MOVIE_ID: "P4947",
  TMDB_TV_ID: "P4983",
  MAL_ID: "P4086",
  ANILIST_ID: "P8729",
  ANIDB_ID: "P5646",
  IGDB_ID: "P5794",
  ANN_ID: "P1985",
  TVDB_ID: "P4835",
  TVMAZE_ID: "P4372",

  // Dates
  START_TIME: "P580",
  END_TIME: "P582",
  PUBLICATION_DATE: "P577",

  // Counts & duration
  EPISODE_COUNT: "P1113",
  SEASON_COUNT: "P2437",
  DURATION: "P2047",

  // Series / Season
  PART_OF_SERIES: "P179",
  SERIES_ORDINAL: "P1545",

  // Classification
  GENRE: "P136",
  COUNTRY_OF_ORIGIN: "P495",
  PLATFORM: "P400",

  // Title/Language
  TITLE: "P1476",
  ORIGINAL_LANGUAGE: "P364",
} as const;

export const MediaTypeQValues = {
  FILM: "Q11424",
  ANIMATED_FILM: "Q202866",
  TV_FILM: "Q506240",
  TV_SERIES: "Q5398426",
  ANIMATED_TV_SERIES: "Q117467246",
  ANIME_TV_SERIES: "Q63952888",
  ANIME_FILM: "Q20650540",
  OVA: "Q220898",
  ONA: "Q1047299",
  ANIME: "Q1107",
  ANIME_TV_SERIES_ALT: "Q11086742",
  VIDEO_GAME: "Q7889",
  TV_SEASON: "Q3464665",
  ANIME_SEASON: "Q100269041",
} as const;

export type MediaType = "movie" | "tv_series" | "anime" | "game";

export interface ParsedMedia {
  wikidataId: string;
  mediaType: MediaType;
  title: string;
  originalTitle: string | null;
  originalLanguage: string | null;
  description: string | null;
  startYear: number | null;
  endYear: number | null;
  runtimeMinutes: number | null;
  seasonCount: number | null;
  episodeCount: number | null;
  sitelinksCount: number;
  countryOfOrigin: string | null;
  imdbId: string | null;
  tmdbId: string | null;
  malId: string | null;
  anilistId: string | null;
  anidbId: string | null;
  igdbId: string | null;
  annId: string | null;
  tvdbId: string | null;
  tvmazeId: string | null;
  genreIds: string[];
  platformIds: string[];
  searchTitle: string;
}

export interface ParsedSeason {
  seriesWikidataId: string;
  seasonNumber: number;
  episodeCount: number | null;
  title: string | null;
}
