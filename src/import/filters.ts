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
  Q.ANIME_TV_SERIES,
  Q.ANIME_FILM,
  Q.ANIME_TV_SERIES_ALT,
  Q.OVA,
  Q.ONA,
]);

// All Q-values we're interested in
const ALL_MEDIA_TYPES = new Set<string>([
  Q.FILM,
  Q.TV_FILM,
  Q.TV_SERIES,
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

  // 3. Film (includes TV film)
  if (
    instanceOfValues.includes(Q.FILM) ||
    instanceOfValues.includes(Q.TV_FILM)
  ) {
    return "movie";
  }

  // 4. TV series
  if (instanceOfValues.includes(Q.TV_SERIES)) return "tv_series";

  return null;
}

/**
 * Check if an entity is a media type we're interested in
 */
export function isMediaEntity(entity: WikidataEntity): boolean {
  const instanceOfValues = getInstanceOfValues(entity);
  return instanceOfValues.some((qValue) => ALL_MEDIA_TYPES.has(qValue));
}

/**
 * Get a string claim value (e.g., external IDs)
 */
export function getStringClaim(
  entity: WikidataEntity,
  property: string,
): string | null {
  const claims = entity.claims?.[property];
  if (!claims || claims.length === 0) return null;

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
 * Check if entity has at least one external ID
 */
export function hasExternalId(entity: WikidataEntity): boolean {
  return EXTERNAL_ID_PROPERTIES.some(
    (prop) => getStringClaim(entity, prop) !== null,
  );
}

/**
 * Get sitelinks count
 */
export function getSitelinksCount(entity: WikidataEntity): number {
  if (!entity.sitelinks) return 0;
  return Object.keys(entity.sitelinks).length;
}

/**
 * Quality filter: must be media + have external ID + have sitelinks
 */
export function shouldImportEntity(entity: WikidataEntity): boolean {
  if (entity.type !== "item") return false;
  if (!isMediaEntity(entity)) return false;
  if (!hasExternalId(entity)) return false;
  if (getSitelinksCount(entity) < 1) return false;
  return true;
}
