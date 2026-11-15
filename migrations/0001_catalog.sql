-- Optional Cloudflare D1 schema. The initial static deployment reads the versioned
-- JSON catalog; apply this only when enabling a server-backed catalog/share service.
PRAGMA foreign_keys = ON;
CREATE TABLE artists (id TEXT PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE albums (id TEXT PRIMARY KEY, title TEXT NOT NULL, release_year INTEGER NOT NULL, cover_key TEXT, release_kind TEXT NOT NULL DEFAULT 'studio', default_selected INTEGER NOT NULL DEFAULT 1);
CREATE TABLE album_artists (album_id TEXT NOT NULL REFERENCES albums(id), artist_id TEXT NOT NULL REFERENCES artists(id), PRIMARY KEY (album_id,artist_id));
CREATE TABLE songs (id TEXT PRIMARY KEY, title TEXT NOT NULL, canonical_album_id TEXT REFERENCES albums(id), duration_seconds INTEGER, kind TEXT NOT NULL DEFAULT 'song' CHECK(kind IN ('song','skit','interlude')));
CREATE TABLE song_artists (song_id TEXT NOT NULL REFERENCES songs(id), artist_id TEXT NOT NULL REFERENCES artists(id), PRIMARY KEY(song_id,artist_id));
CREATE TABLE album_tracks (album_id TEXT NOT NULL REFERENCES albums(id), song_id TEXT NOT NULL REFERENCES songs(id), track_number INTEGER, PRIMARY KEY(album_id,song_id));
CREATE TABLE song_scores (song_id TEXT NOT NULL REFERENCES songs(id), dimension TEXT NOT NULL CHECK(dimension IN ('quality','popularity')), value REAL NOT NULL CHECK(value BETWEEN 0 AND 100), raw_value REAL, rating_count INTEGER, source_url TEXT, estimated INTEGER NOT NULL DEFAULT 1, retrieved_at TEXT NOT NULL, PRIMARY KEY(song_id,dimension));
CREATE TABLE video_sources (song_id TEXT NOT NULL REFERENCES songs(id), priority INTEGER NOT NULL CHECK(priority IN (0,1)), video_id TEXT NOT NULL, preview_seconds INTEGER NOT NULL DEFAULT 0, verified_at TEXT, evidence TEXT, PRIMARY KEY(song_id,priority));
-- Immutable, versioned bracket definitions contain an entrant snapshot and topology.
-- Store public tokens only after an explicit share action; never expose local run ids.
CREATE TABLE bracket_definitions (id TEXT PRIMARY KEY, schema_version INTEGER NOT NULL, definition_json TEXT NOT NULL CHECK(json_valid(definition_json)), created_at TEXT NOT NULL);
CREATE TABLE shared_brackets (token TEXT PRIMARY KEY, definition_id TEXT NOT NULL REFERENCES bracket_definitions(id), created_at TEXT NOT NULL, expires_at TEXT);
-- Future authenticated sync. Browser-local saves require no users or backend today.
CREATE TABLE runs (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, definition_id TEXT NOT NULL REFERENCES bracket_definitions(id), picks_json TEXT NOT NULL CHECK(json_valid(picks_json)), revision INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL);
CREATE INDEX runs_by_owner ON runs(owner_id,updated_at);
CREATE TABLE result_images (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, title TEXT NOT NULL, winner_title TEXT NOT NULL, full_r2_key TEXT NOT NULL, top16_r2_key TEXT NOT NULL, completed_at TEXT NOT NULL);
-- Dormant future integration: authentication, rate limits, signed provider events and
-- per-match vote deadlines are required before exposing chat endpoints.
CREATE TABLE chat_sessions (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, run_id TEXT NOT NULL REFERENCES runs(id), provider TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
