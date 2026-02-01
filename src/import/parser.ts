import {
  WikidataEntity,
  WikidataProperties,
  ParsedMedia,
  WikibaseEntityIdValue,
  TimeDataValue,
  QuantityDataValue,
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

  return {
    wikidataId: entity.id,
    mediaType,
    titleEn: getLanguageString(entity.labels, "en"),
    titleJa: getLanguageString(entity.labels, "ja"),
    descriptionEn: getLanguageString(entity.descriptions, "en"),
    descriptionJa: getLanguageString(entity.descriptions, "ja"),
    startYear,
    endYear: getYearFromTimeClaim(entity, P.END_TIME),
    imdbId: getStringClaim(entity, P.IMDB_ID),
    malId: parseMalId(entity),
    seasonCount: getQuantityClaim(entity, P.SEASON_COUNT),
    episodeCount: getQuantityClaim(entity, P.EPISODE_COUNT),
    genreIds: getGenreIds(entity),
  };
}
