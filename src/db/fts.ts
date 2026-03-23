export const TRGM_SETUP_SQL = [
  `CREATE EXTENSION IF NOT EXISTS pg_trgm`,
  `CREATE INDEX IF NOT EXISTS idx_media_title_trgm ON media USING gin (title gin_trgm_ops)`,
  `CREATE INDEX IF NOT EXISTS idx_media_original_title_trgm ON media USING gin (original_title gin_trgm_ops)`,
  `CREATE INDEX IF NOT EXISTS idx_media_search_title_trgm ON media USING gin (search_title gin_trgm_ops)`,
  `CREATE INDEX IF NOT EXISTS idx_media_aliases_trgm ON media USING gin (aliases gin_trgm_ops)`,
];
