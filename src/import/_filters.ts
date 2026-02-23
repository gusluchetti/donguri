import { normalizeForSearch } from "~/lib/search";
import {
  type MediaType,
  MediaTypeQValues,
  type MonolingualTextValue,
  type ParsedMedia,
  type QuantityDataValue,
  type TimeDataValue,
  type WikibaseEntityIdValue,
  type WikidataEntity,
  WikidataProperties,
} from "./_types";

const P = WikidataProperties;
const Q = MediaTypeQValues;

// All Q-values that indicate anime
const ANIME_TYPES = new Set<string>([
  Q.ANIME,
  Q.ANIME_TV_SERIES,
  Q.ANIME_FILM,
  Q.ANIME_TV_SERIES_ALT,
  Q.OVA,
  Q.ONA,
]);

// All Q-values we're interested in
const ALL_MEDIA_TYPES = new Set<string>([
  Q.FILM,
  Q.ANIMATED_FILM,
  Q.TV_FILM,
  Q.TV_SERIES,
  Q.ANIMATED_TV_SERIES,
  Q.VIDEO_GAME,
  ...ANIME_TYPES,
]);

// External ID properties to check for quality filter
const EXTERNAL_ID_PROPERTIES = [
  P.IMDB_ID,
  P.TMDB_MOVIE_ID,
  P.TMDB_TV_ID,
  P.MAL_ID,
  P.ANILIST_ID,
  P.ANIDB_ID,
  P.IGDB_ID,
  P.ANN_ID,
  P.TVDB_ID,
  P.TVMAZE_ID,
];

/**
 * Get all P31 (instance of) values for an entity
 */
export function getInstanceOfValues(entity: WikidataEntity): string[] {
  const claims = entity.claims?.[P.INSTANCE_OF];
  if (!claims) return [];

  return claims
    .filter(
      (claim) =>
        claim.mainsnak.snaktype === "value" &&
        claim.mainsnak.datavalue?.type === "wikibase-entityid",
    )
    .map((claim) => {
      const value = claim.mainsnak.datavalue as WikibaseEntityIdValue;
      return value.value.id;
    });
}

/**
 * Determine media type with priority: anime > game > movie > tv_series
 */
export function determineMediaType(entity: WikidataEntity): MediaType | null {
  const instanceOfValues = getInstanceOfValues(entity);

  // 1. Anime first (most specific)
  for (const qValue of instanceOfValues) {
    if (ANIME_TYPES.has(qValue)) return "anime";
  }

  // 2. Video game
  if (instanceOfValues.includes(Q.VIDEO_GAME)) return "game";

  // 3. Film (includes TV film and animated film)
  if (
    instanceOfValues.includes(Q.FILM) ||
    instanceOfValues.includes(Q.ANIMATED_FILM) ||
    instanceOfValues.includes(Q.TV_FILM)
  ) {
    return "movie";
  }

  // 4. TV series (includes animated TV series)
  if (instanceOfValues.includes(Q.TV_SERIES) || instanceOfValues.includes(Q.ANIMATED_TV_SERIES)) {
    return "tv_series";
  }

  return null;
}

/**
 * Check if an entity is a media type we're interested in
 */
export function isMediaEntity(entity: WikidataEntity): boolean {
  const instanceOfValues = getInstanceOfValues(entity);
  return instanceOfValues.some((qValue) => ALL_MEDIA_TYPES.has(qValue));
}

// Season Q-values (TV season + anime season)
const SEASON_TYPES = new Set<string>([Q.TV_SEASON, Q.ANIME_SEASON]);

/**
 * Check if an entity is a TV/anime season (P31 = Q3464665 or Q100269041) with P179 (part of series)
 */
export function isSeasonEntity(entity: WikidataEntity): boolean {
  const instanceOfValues = getInstanceOfValues(entity);
  if (!instanceOfValues.some((qValue) => SEASON_TYPES.has(qValue))) return false;
  // Must have P179 (part of series) to be linkable to a parent show
  if (!entity.claims?.[P.PART_OF_SERIES]) return false;
  return true;
}

/**
 * Get a string claim value (e.g., external IDs)
 */
export function getStringClaim(entity: WikidataEntity, property: string): string | null {
  const claims = entity.claims?.[property];
  if (!claims || claims.length === 0) return null;

  const sortedClaims = [...claims].sort((a, b) => {
    if (a.rank === "preferred" && b.rank !== "preferred") return -1;
    if (b.rank === "preferred" && a.rank !== "preferred") return 1;
    return 0;
  });

  const claim = sortedClaims[0];
  if (claim.mainsnak.snaktype === "value" && claim.mainsnak.datavalue?.type === "string") {
    return claim.mainsnak.datavalue.value;
  }

  return null;
}

/**
 * Check if entity has at least one external ID
 */
export function hasExternalId(entity: WikidataEntity): boolean {
  return EXTERNAL_ID_PROPERTIES.some((prop) => getStringClaim(entity, prop) !== null);
}

/**
 * Get sitelinks count
 */
export function getSitelinksCount(entity: WikidataEntity): number {
  if (!entity.sitelinks) return 0;
  return Object.keys(entity.sitelinks).length;
}

/**
 * Quality filter: must be media + have ≥1 sitelink OR ≥1 external ID
 */
export function shouldImportEntity(entity: WikidataEntity): boolean {
  if (entity.type !== "item") return false;
  if (!isMediaEntity(entity)) return false;
  if (getSitelinksCount(entity) < 1 && !hasExternalId(entity)) return false;
  return true;
}

// ═══ Entity property extraction (merged from _parser.ts) ════════════════════

// Common language Q-IDs to ISO 639-1 codes
const LANGUAGE_MAP: Record<string, string> = {
  Q5287: "ja",
  Q9176: "ko",
  Q7850: "zh",
  Q1860: "en",
  Q150: "fr",
  Q188: "de",
  Q652: "it",
  Q1321: "es",
  Q5146: "pt",
  Q7737: "ru",
  Q9288: "he",
  Q13955: "ar",
  Q1571: "hi",
  Q9217: "th",
  Q9199: "tl",
  Q9252: "id",
  Q9237: "ms",
  Q9296: "vi",
  Q7411: "nl",
  Q9043: "no",
  Q9027: "sv",
  Q7026: "ca",
  Q9610: "bn",
  Q9063: "pl",
  Q809: "cs",
  Q9067: "hu",
  Q9078: "ro",
  Q7918: "bg",
  Q9035: "fi",
  Q9091: "uk",
  Q36510: "da",
  Q9240: "tl",
};

// Common country Q-IDs to names
const COUNTRY_MAP: Record<string, string> = {
  Q30: "United States",
  Q17: "Japan",
  Q145: "United Kingdom",
  Q142: "France",
  Q183: "Germany",
  Q148: "China",
  Q884: "South Korea",
  Q38: "Italy",
  Q29: "Spain",
  Q55: "Netherlands",
  Q16: "Canada",
  Q408: "Australia",
  Q668: "India",
  Q155: "Brazil",
  Q159: "Russia",
  Q801: "Israel",
  Q36: "Poland",
  Q20: "Norway",
  Q34: "Sweden",
  Q39: "Switzerland",
  Q40: "Austria",
  Q45: "Portugal",
  Q37: "Ireland",
  Q33: "Finland",
  Q35: "Denmark",
  Q212: "Ukraine",
  Q218: "Romania",
  Q214: "Slovakia",
  Q213: "Czech Republic",
  Q219: "Bulgaria",
  Q28: "Hungary",
  Q865: "Taiwan",
  Q928: "Philippines",
  Q334: "Singapore",
  Q869: "Thailand",
  Q252: "Indonesia",
  Q833: "Malaysia",
  Q711: "Mongolia",
  Q574: "East Timor",
  Q96: "Mexico",
  Q414: "Argentina",
  Q298: "Chile",
  Q733: "Paraguay",
  Q77: "Uruguay",
  Q736: "Ecuador",
  Q739: "Colombia",
  Q717: "Venezuela",
  Q419: "Peru",
  Q750: "Bolivia",
  Q1036: "Nigeria",
  Q258: "South Africa",
  Q115: "Ethiopia",
  Q114: "Kenya",
  Q79: "Egypt",
  Q1028: "Morocco",
  Q1033: "Nigeria",
  Q43: "Turkey",
  Q796: "Iraq",
  Q794: "Iran",
  Q851: "Saudi Arabia",
  Q842: "Oman",
  Q846: "Qatar",
  Q878: "United Arab Emirates",
  Q233: "Malta",
  Q31: "Belgium",
  Q32: "Luxembourg",
  Q191: "Estonia",
  Q211: "Latvia",
  Q37417: "Lithuania",
  Q215: "Slovenia",
  Q224: "Croatia",
  Q225: "Bosnia and Herzegovina",
  Q236: "Montenegro",
  Q241: "Cuba",
  Q229: "Cyprus",
  Q227: "Azerbaijan",
  Q230: "Georgia",
  Q399: "Armenia",
  Q232: "Kazakhstan",
  Q189: "Iceland",
  Q184: "Belarus",
  Q15180: "Soviet Union",
  Q756617: "Kingdom of Denmark",
  Q174: "New Zealand",
};

function getLanguageString(
  record: Record<string, { language: string; value: string }> | undefined,
  language: string,
): string | null {
  return record?.[language]?.value ?? null;
}

function getOriginalTitle(entity: WikidataEntity): { title: string; language: string } | null {
  const claims = entity.claims?.[P.TITLE];
  if (!claims || claims.length === 0) return null;

  const sortedClaims = [...claims].sort((a, b) => {
    if (a.rank === "preferred" && b.rank !== "preferred") return -1;
    if (b.rank === "preferred" && a.rank !== "preferred") return 1;
    return 0;
  });

  const claim = sortedClaims[0];
  if (claim.mainsnak.snaktype === "value" && claim.mainsnak.datavalue?.type === "monolingualtext") {
    const data = claim.mainsnak.datavalue as MonolingualTextValue;
    return { title: data.value.text, language: data.value.language };
  }

  return null;
}

function getOriginalLanguageQId(entity: WikidataEntity): string | null {
  const claims = entity.claims?.[P.ORIGINAL_LANGUAGE];
  if (!claims || claims.length === 0) return null;

  const claim = claims[0];
  if (
    claim.mainsnak.snaktype === "value" &&
    claim.mainsnak.datavalue?.type === "wikibase-entityid"
  ) {
    const data = claim.mainsnak.datavalue as WikibaseEntityIdValue;
    return data.value.id;
  }

  return null;
}

function getOriginalTitleAndLanguage(entity: WikidataEntity): {
  title: string | null;
  language: string | null;
} {
  const bestTitle = getBestTitle(entity);

  const titleClaim = getOriginalTitle(entity);
  if (titleClaim && titleClaim.title !== bestTitle) {
    return { title: titleClaim.title, language: titleClaim.language };
  }

  const langQId = getOriginalLanguageQId(entity);
  if (langQId) {
    const langCode = LANGUAGE_MAP[langQId];
    if (langCode && langCode !== "en") {
      const title = getLanguageString(entity.labels, langCode);
      if (title && title !== bestTitle) return { title, language: langCode };
    }
  }

  return { title: null, language: null };
}

function extractYear(timeValue: string): number | null {
  const match = timeValue.match(/^([+-]?\d+)-/);
  if (!match) return null;
  const year = parseInt(match[1], 10);
  return Number.isNaN(year) ? null : year;
}

function getYearFromTimeClaim(entity: WikidataEntity, property: string): number | null {
  const claims = entity.claims?.[property];
  if (!claims || claims.length === 0) return null;

  const sortedClaims = [...claims].sort((a, b) => {
    if (a.rank === "preferred" && b.rank !== "preferred") return -1;
    if (b.rank === "preferred" && a.rank !== "preferred") return 1;
    return 0;
  });

  const claim = sortedClaims[0];
  if (claim.mainsnak.snaktype === "value" && claim.mainsnak.datavalue?.type === "time") {
    const timeData = claim.mainsnak.datavalue as TimeDataValue;
    return extractYear(timeData.value.time);
  }

  return null;
}

function getQuantityClaim(entity: WikidataEntity, property: string): number | null {
  const claims = entity.claims?.[property];
  if (!claims || claims.length === 0) return null;

  const sortedClaims = [...claims].sort((a, b) => {
    if (a.rank === "preferred" && b.rank !== "preferred") return -1;
    if (b.rank === "preferred" && a.rank !== "preferred") return 1;
    return 0;
  });

  const claim = sortedClaims[0];
  if (claim.mainsnak.snaktype === "value" && claim.mainsnak.datavalue?.type === "quantity") {
    const quantityData = claim.mainsnak.datavalue as QuantityDataValue;
    const amount = parseFloat(quantityData.value.amount);
    return Number.isNaN(amount) ? null : Math.round(amount);
  }

  return null;
}

function getEntityIdClaims(entity: WikidataEntity, property: string): string[] {
  const claims = entity.claims?.[property];
  if (!claims) return [];

  return claims
    .filter(
      (claim) =>
        claim.mainsnak.snaktype === "value" &&
        claim.mainsnak.datavalue?.type === "wikibase-entityid" &&
        claim.rank !== "deprecated",
    )
    .map((claim) => {
      const value = claim.mainsnak.datavalue as WikibaseEntityIdValue;
      return value.value.id;
    });
}

function getFirstEntityIdClaim(entity: WikidataEntity, property: string): string | null {
  const ids = getEntityIdClaims(entity, property);
  return ids[0] ?? null;
}

function getCountryOfOrigin(entity: WikidataEntity): string | null {
  const countryQId = getFirstEntityIdClaim(entity, P.COUNTRY_OF_ORIGIN);
  if (!countryQId) return null;
  return COUNTRY_MAP[countryQId] ?? null;
}

function getBestTitle(entity: WikidataEntity): string | null {
  return (
    getLanguageString(entity.labels, "en") ??
    getLanguageString(entity.labels, "mul") ??
    getOriginalTitle(entity)?.title ??
    null
  );
}

/**
 * Parse a Wikidata entity into our media format
 */
export function parseMediaEntity(entity: WikidataEntity): ParsedMedia | null {
  const mediaType = determineMediaType(entity);
  if (!mediaType) return null;

  const titleEn = getBestTitle(entity);
  if (!titleEn) return null;

  const startYear =
    getYearFromTimeClaim(entity, P.START_TIME) ?? getYearFromTimeClaim(entity, P.PUBLICATION_DATE);

  const { title: originalTitle, language: originalLanguage } = getOriginalTitleAndLanguage(entity);

  let tmdbId: string | null = null;
  if (mediaType === "movie") {
    tmdbId = getStringClaim(entity, P.TMDB_MOVIE_ID);
  } else if (mediaType === "tv_series" || mediaType === "anime") {
    tmdbId = getStringClaim(entity, P.TMDB_TV_ID) ?? getStringClaim(entity, P.TMDB_MOVIE_ID);
  }

  // Extract English aliases, filtering out duplicates of title/originalTitle and junk
  const titleLower = titleEn.toLowerCase();
  const origLower = originalTitle?.toLowerCase();
  const aliases: string[] = [];
  const seenLower = new Set<string>([titleLower]);
  if (origLower) seenLower.add(origLower);

  for (const aliasObj of entity.aliases?.en ?? []) {
    const v = aliasObj.value.trim();
    if (!v || v.length > 100) continue;
    const lo = v.toLowerCase();
    if (seenLower.has(lo)) continue;
    seenLower.add(lo);
    aliases.push(v);
    if (aliases.length >= 10) break;
  }

  const searchParts = [titleEn];
  if (originalTitle) searchParts.push(originalTitle);
  for (const a of aliases) searchParts.push(a);
  const searchTitle = normalizeForSearch(searchParts.join(" "));

  return {
    wikidataId: entity.id,
    mediaType,
    title: titleEn,
    originalTitle,
    originalLanguage,
    description: getLanguageString(entity.descriptions, "en"),
    startYear,
    endYear: getYearFromTimeClaim(entity, P.END_TIME),
    runtimeMinutes: getQuantityClaim(entity, P.DURATION),
    seasonCount: getQuantityClaim(entity, P.SEASON_COUNT),
    episodeCount: getQuantityClaim(entity, P.EPISODE_COUNT),
    sitelinksCount: getSitelinksCount(entity),
    countryOfOrigin: getCountryOfOrigin(entity),
    imdbId: getStringClaim(entity, P.IMDB_ID),
    tmdbId,
    malId: getStringClaim(entity, P.MAL_ID),
    anilistId: getStringClaim(entity, P.ANILIST_ID),
    anidbId: getStringClaim(entity, P.ANIDB_ID),
    igdbId: getStringClaim(entity, P.IGDB_ID),
    annId: getStringClaim(entity, P.ANN_ID),
    tvdbId: getStringClaim(entity, P.TVDB_ID),
    tvmazeId: getStringClaim(entity, P.TVMAZE_ID),
    genreIds: getEntityIdClaims(entity, P.GENRE),
    platformIds: getEntityIdClaims(entity, P.PLATFORM),
    searchTitle,
    aliases,
  };
}
