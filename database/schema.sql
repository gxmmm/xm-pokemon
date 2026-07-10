-- Pokemon Online - D1 schema
-- The Worker is a save server (frozen design: frontend computes, backend saves).
-- Player state is stored as a JSON blob in `saves.data`; static config is never
-- duplicated here (referenced by id in the JSON). Players/friends are relational
-- for auth and PVP team lookup.

CREATE TABLE IF NOT EXISTS players (
  id            TEXT PRIMARY KEY,
  username      TEXT UNIQUE NOT NULL COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  salt          TEXT NOT NULL,
  token         TEXT,
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS saves (
  player_id  TEXT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  data       TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS friends (
  player_id       TEXT NOT NULL,
  friend_username TEXT NOT NULL COLLATE NOCASE,
  created_at      INTEGER NOT NULL,
  PRIMARY KEY (player_id, friend_username)
);

CREATE INDEX IF NOT EXISTS idx_players_token    ON players(token);
CREATE INDEX IF NOT EXISTS idx_players_username ON players(username);
CREATE INDEX IF NOT EXISTS idx_saves_player     ON saves(player_id);
