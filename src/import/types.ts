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
    time: string; // e.g., "+2020-01-01T00:00:00Z"
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

// Wikidata property constants
export const WikidataProperties = {
  // Type identification
  INSTANCE_OF: "P31",

  // External IDs
  IMDB_ID: "P345",
  MAL_ID: "P4086",

  // Dates
  START_TIME: "P580",
  END_TIME: "P582",
  PUBLICATION_DATE: "P577",

  // Counts
  EPISODE_COUNT: "P1113",
  SEASON_COUNT: "P2437",

  // Classification
  GENRE: "P136",
} as const;

// Q-values for media types
export const MediaTypeQValues = {
  // Film
  FILM: "Q11424",

  // TV Series
  TV_SERIES: "Q5398426",

  // Anime-related
  ANIME: "Q1107",
  ANIME_SERIES: "Q63952888",
  ANIME_FILM: "Q20650540",
  ANIME_TV_SERIES: "Q11086742",
  OVA: "Q220898",
  ONA: "Q1047299",
} as const;

export type MediaType = "movie" | "tv_series" | "anime";

export interface ParsedMedia {
  wikidataId: string;
  mediaType: MediaType;
  titleEn: string | null;
  titleJa: string | null;
  descriptionEn: string | null;
  descriptionJa: string | null;
  startYear: number | null;
  endYear: number | null;
  imdbId: string | null;
  malId: number | null;
  seasonCount: number | null;
  episodeCount: number | null;
  genreIds: string[]; // Wikidata Q-IDs of genres
}
