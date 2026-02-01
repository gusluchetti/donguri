import {
  WikidataEntity,
  WikidataProperties,
  MediaTypeQValues,
  MediaType,
  WikibaseEntityIdValue,
} from "./types";

const P = WikidataProperties;
const Q = MediaTypeQValues;

// All Q-values that indicate anime
const ANIME_TYPES = new Set<string>([
  Q.ANIME,
  Q.ANIME_SERIES,
  Q.ANIME_FILM,
  Q.ANIME_TV_SERIES,
  Q.OVA,
  Q.ONA,
]);

// All Q-values we're interested in
const MEDIA_TYPES = new Set<string>([Q.FILM, Q.TV_SERIES, ...ANIME_TYPES]);

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
        claim.mainsnak.datavalue?.type === "wikibase-entityid"
    )
    .map((claim) => {
      const value = claim.mainsnak.datavalue as WikibaseEntityIdValue;
      return value.value.id;
    });
}

/**
 * Determine the media type of an entity based on its P31 values
 * Returns null if the entity is not a media type we're interested in
 */
export function determineMediaType(entity: WikidataEntity): MediaType | null {
  const instanceOfValues = getInstanceOfValues(entity);

  // Check for anime first (more specific)
  for (const qValue of instanceOfValues) {
    if (ANIME_TYPES.has(qValue)) {
      return "anime";
    }
  }

  // Check for film
  if (instanceOfValues.includes(Q.FILM)) {
    return "movie";
  }

  // Check for TV series
  if (instanceOfValues.includes(Q.TV_SERIES)) {
    return "tv_series";
  }

  return null;
}

/**
 * Check if an entity is a media type we're interested in
 */
export function isMediaEntity(entity: WikidataEntity): boolean {
  const instanceOfValues = getInstanceOfValues(entity);
  return instanceOfValues.some((qValue) => MEDIA_TYPES.has(qValue));
}

/**
 * Get a string claim value (e.g., IMDb ID)
 */
export function getStringClaim(
  entity: WikidataEntity,
  property: string
): string | null {
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
    claim.mainsnak.datavalue?.type === "string"
  ) {
    return claim.mainsnak.datavalue.value;
  }

  return null;
}

/**
 * Check if entity has either IMDb ID or MAL ID (quality filter)
 */
export function hasExternalId(entity: WikidataEntity): boolean {
  const imdbId = getStringClaim(entity, P.IMDB_ID);
  const malId = getStringClaim(entity, P.MAL_ID);
  return imdbId !== null || malId !== null;
}

/**
 * Main filter function: checks if entity is a valid media item
 * Must be a media type AND have at least one external ID
 */
export function shouldImportEntity(entity: WikidataEntity): boolean {
  // Must be an item (not a property)
  if (entity.type !== "item") return false;

  // Must be a media type we care about
  if (!isMediaEntity(entity)) return false;

  // Must have at least one external ID for quality filtering
  if (!hasExternalId(entity)) return false;

  return true;
}
