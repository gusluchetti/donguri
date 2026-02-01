import {
  WikidataEntity,
  WikidataProperties,
  ParsedMedia,
  WikibaseEntityIdValue,
  TimeDataValue,
  QuantityDataValue,
  MonolingualTextValue,
} from "./types";
import { determineMediaType, getStringClaim } from "./filters";

const P = WikidataProperties;

/**
 * Extract a label or description in the specified language
 */
function getLanguageString(
  record: Record<string, { language: string; value: string }> | undefined,
  language: string
): string | null {
  return record?.[language]?.value ?? null;
}

// Common language Q-IDs to ISO 639-1 codes
const LANGUAGE_MAP: Record<string, string> = {
  Q5287: "ja",    // Japanese
  Q9176: "ko",    // Korean
  Q7850: "zh",    // Chinese
  Q1860: "en",    // English
  Q150: "fr",     // French
  Q188: "de",     // German
  Q652: "it",     // Italian
  Q1321: "es",    // Spanish
  Q5146: "pt",    // Portuguese
  Q7737: "ru",    // Russian
  Q9288: "he",    // Hebrew
  Q13955: "ar",   // Arabic
  Q1571: "hi",    // Hindi
  Q9217: "th",    // Thai
  Q9199: "tl",    // Tagalog
  Q9252: "id",    // Indonesian
  Q9237: "ms",    // Malay
  Q9296: "vi",    // Vietnamese
};

/**
 * Get original title from P1476 (title property with monolingualtext)
 */
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

/**
 * Get original language Q-ID from P364
 */
function getOriginalLanguageQId(entity: WikidataEntity): string | null {
  const claims = entity.claims?.[P.ORIGINAL_LANGUAGE];
  if (!claims || claims.length === 0) return null;

  const claim = claims[0];
  if (claim.mainsnak.snaktype === "value" && claim.mainsnak.datavalue?.type === "wikibase-entityid") {
    const data = claim.mainsnak.datavalue as WikibaseEntityIdValue;
    return data.value.id;
  }

  return null;
}

/**
 * Get original title - tries P1476 first, then falls back to label in original language
 */
function getOriginalTitleAndLanguage(entity: WikidataEntity): { title: string | null; language: string | null } {
  // Try P1476 (title) first - it has the title in original language directly
  const titleClaim = getOriginalTitle(entity);
  if (titleClaim && titleClaim.title !== getLanguageString(entity.labels, "en")) {
    return { title: titleClaim.title, language: titleClaim.language };
  }

  // Fall back to P364 (original language) + label lookup
  const langQId = getOriginalLanguageQId(entity);
  if (langQId) {
    const langCode = LANGUAGE_MAP[langQId];
    if (langCode && langCode !== "en") {
      const title = getLanguageString(entity.labels, langCode);
      if (title) return { title, language: langCode };
    }
  }

  return { title: null, language: null };
}

/**
 * Extract year from a Wikidata time value
 * Time format: "+2020-01-01T00:00:00Z" or "-0500-01-01T00:00:00Z"
 */
function extractYear(timeValue: string): number | null {
  // Match the year portion, handling both positive and negative years
  const match = timeValue.match(/^([+-]?\d+)-/);
  if (!match) return null;

  const year = parseInt(match[1], 10);
  if (isNaN(year)) return null;

  return year;
}

/**
 * Get a time claim and extract the year
 */
function getYearFromTimeClaim(
  entity: WikidataEntity,
  property: string
): number | null {
  const claims = entity.claims?.[property];
  if (!claims || claims.length === 0) return null;

  // Prefer claims with "preferred" rank
  const sortedClaims = [...claims].sort((a, b) => {
    if (a.rank === "preferred" && b.rank !== "preferred") return -1;
    if (b.rank === "preferred" && a.rank !== "preferred") return 1;
    return 0;
  });

  const claim = sortedClaims[0];
  if (
    claim.mainsnak.snaktype === "value" &&
    claim.mainsnak.datavalue?.type === "time"
  ) {
    const timeData = claim.mainsnak.datavalue as TimeDataValue;
    return extractYear(timeData.value.time);
  }

  return null;
}

/**
 * Get a quantity claim value as a number
 */
function getQuantityClaim(
  entity: WikidataEntity,
  property: string
): number | null {
  const claims = entity.claims?.[property];
  if (!claims || claims.length === 0) return null;

  // Prefer claims with "preferred" rank
  const sortedClaims = [...claims].sort((a, b) => {
    if (a.rank === "preferred" && b.rank !== "preferred") return -1;
    if (b.rank === "preferred" && a.rank !== "preferred") return 1;
    return 0;
  });

  const claim = sortedClaims[0];
  if (
    claim.mainsnak.snaktype === "value" &&
    claim.mainsnak.datavalue?.type === "quantity"
  ) {
    const quantityData = claim.mainsnak.datavalue as QuantityDataValue;
    const amount = parseFloat(quantityData.value.amount);
    return isNaN(amount) ? null : Math.round(amount);
  }

  return null;
}

/**
 * Get all genre Q-IDs from the entity
 */
function getGenreIds(entity: WikidataEntity): string[] {
  const claims = entity.claims?.[P.GENRE];
  if (!claims) return [];

  return claims
    .filter(
      (claim) =>
        claim.mainsnak.snaktype === "value" &&
        claim.mainsnak.datavalue?.type === "wikibase-entityid" &&
        claim.rank !== "deprecated"
    )
    .map((claim) => {
      const value = claim.mainsnak.datavalue as WikibaseEntityIdValue;
      return value.value.id;
    });
}

/**
 * Parse MAL ID - it's stored as a string but we want it as a number
 */
function parseMalId(entity: WikidataEntity): number | null {
  const malIdStr = getStringClaim(entity, P.MAL_ID);
  if (!malIdStr) return null;

  const malId = parseInt(malIdStr, 10);
  return isNaN(malId) ? null : malId;
}

/**
 * Parse a Wikidata entity into our media format
 * Returns null if the entity cannot be parsed as a valid media item
 */
export function parseMediaEntity(entity: WikidataEntity): ParsedMedia | null {
  const mediaType = determineMediaType(entity);
  if (!mediaType) return null;

  const startYear =
    getYearFromTimeClaim(entity, P.START_TIME) ??
    getYearFromTimeClaim(entity, P.PUBLICATION_DATE);

  const { title: titleOriginal, language: originalLanguage } = getOriginalTitleAndLanguage(entity);

  return {
    wikidataId: entity.id,
    mediaType,
    titleEn: getLanguageString(entity.labels, "en"),
    titleOriginal,
    originalLanguage,
    descriptionEn: getLanguageString(entity.descriptions, "en"),
    startYear,
    endYear: getYearFromTimeClaim(entity, P.END_TIME),
    imdbId: getStringClaim(entity, P.IMDB_ID),
    malId: parseMalId(entity),
    seasonCount: getQuantityClaim(entity, P.SEASON_COUNT),
    episodeCount: getQuantityClaim(entity, P.EPISODE_COUNT),
    genreIds: getGenreIds(entity),
  };
}
