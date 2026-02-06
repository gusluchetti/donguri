/**
 * Raw SQL for FTS5 virtual table and sync triggers.
 * These must be executed via raw SQL since Drizzle doesn't support
 * virtual tables or triggers directly.
 */

export const FTS_SETUP_SQL = `
-- FTS5 virtual table for fast title search
CREATE VIRTUAL TABLE IF NOT EXISTS media_fts USING fts5(
  title,
  original_title,
  content=media,
  content_rowid=rowid
);

-- Trigger: keep FTS in sync on INSERT
CREATE TRIGGER IF NOT EXISTS media_fts_insert AFTER INSERT ON media BEGIN
  INSERT INTO media_fts(rowid, title, original_title)
  VALUES (NEW.rowid, NEW.title, NEW.original_title);
END;

-- Trigger: keep FTS in sync on UPDATE
CREATE TRIGGER IF NOT EXISTS media_fts_update AFTER UPDATE ON media BEGIN
  INSERT INTO media_fts(media_fts, rowid, title, original_title)
  VALUES ('delete', OLD.rowid, OLD.title, OLD.original_title);
  INSERT INTO media_fts(rowid, title, original_title)
  VALUES (NEW.rowid, NEW.title, NEW.original_title);
END;

-- Trigger: keep FTS in sync on DELETE
CREATE TRIGGER IF NOT EXISTS media_fts_delete AFTER DELETE ON media BEGIN
  INSERT INTO media_fts(media_fts, rowid, title, original_title)
  VALUES ('delete', OLD.rowid, OLD.title, OLD.original_title);
END;
`;

/** Rebuild the FTS index from scratch (useful after bulk import) */
export const FTS_REBUILD_SQL = `
INSERT INTO media_fts(media_fts) VALUES ('rebuild');
`;
