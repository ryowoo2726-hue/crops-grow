PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 3000;
PRAGMA cache_size = -4096;
CREATE TABLE IF NOT EXISTS players (
  id INTEGER PRIMARY KEY,
  grade INTEGER NOT NULL CHECK(grade BETWEEN 1 AND 3),
  class_no INTEGER NOT NULL CHECK(class_no BETWEEN 1 AND 10),
  number INTEGER NOT NULL CHECK(number BETWEEN 1 AND 30),
  pin_salt TEXT NOT NULL, pin_hash TEXT NOT NULL,
  failed_attempts INTEGER NOT NULL DEFAULT 0, locked_until INTEGER NOT NULL DEFAULT 0,
  crop_id TEXT DEFAULT 'rice', progress INTEGER NOT NULL DEFAULT 0 CHECK(progress BETWEEN 0 AND 100),
  water_day TEXT NOT NULL DEFAULT '', mission_day TEXT NOT NULL DEFAULT '',
  revision INTEGER NOT NULL DEFAULT 0,
  UNIQUE(grade, class_no, number)
) STRICT;
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY, player_id INTEGER NOT NULL REFERENCES players(id), expires_at INTEGER NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS harvests (
  id INTEGER PRIMARY KEY, player_id INTEGER NOT NULL REFERENCES players(id), crop_id TEXT NOT NULL, created_at TEXT NOT NULL
) STRICT;
CREATE INDEX IF NOT EXISTS harvests_player ON harvests(player_id, id);
CREATE TABLE IF NOT EXISTS quiz_weeks (
  week TEXT PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 1
) STRICT;
CREATE TABLE IF NOT EXISTS quiz_questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT, week TEXT NOT NULL REFERENCES quiz_weeks(week), position INTEGER NOT NULL,
  question TEXT NOT NULL, choice_a TEXT NOT NULL, choice_b TEXT NOT NULL, choice_c TEXT NOT NULL, choice_d TEXT NOT NULL,
  correct_index INTEGER NOT NULL CHECK(correct_index BETWEEN 0 AND 3), explanation TEXT NOT NULL DEFAULT '',
  UNIQUE(week, position)
) STRICT;
CREATE TABLE IF NOT EXISTS quiz_answers (
  player_id INTEGER NOT NULL REFERENCES players(id), week TEXT NOT NULL, revision INTEGER NOT NULL,
  question_id INTEGER NOT NULL REFERENCES quiz_questions(id) ON DELETE CASCADE,
  PRIMARY KEY(player_id, week, revision, question_id)
) STRICT;
CREATE TABLE IF NOT EXISTS special_missions (
  week TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1
) STRICT;
CREATE TABLE IF NOT EXISTS action_receipts (
  player_id INTEGER NOT NULL REFERENCES players(id), request_id TEXT NOT NULL,
  fingerprint TEXT NOT NULL, outcome TEXT NOT NULL, created_at INTEGER NOT NULL,
  PRIMARY KEY(player_id, request_id)
) STRICT;
PRAGMA user_version = 1;
