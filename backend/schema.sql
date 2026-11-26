PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 3000;
PRAGMA cache_size = -4096;
CREATE TABLE IF NOT EXISTS players (
  id INTEGER PRIMARY KEY,
  role TEXT NOT NULL DEFAULT 'student' CHECK(role IN ('student','teacher')),
  name TEXT NOT NULL DEFAULT '',
  grade INTEGER CHECK(grade BETWEEN 1 AND 3),
  class_no INTEGER CHECK(class_no BETWEEN 1 AND 99),
  number INTEGER CHECK(number BETWEEN 1 AND 99),
  pin_salt TEXT NOT NULL, pin_hash TEXT NOT NULL,
  failed_attempts INTEGER NOT NULL DEFAULT 0, locked_until INTEGER NOT NULL DEFAULT 0,
  crop_id TEXT DEFAULT 'rice', progress INTEGER NOT NULL DEFAULT 0 CHECK(progress BETWEEN 0 AND 100),
  water_day TEXT NOT NULL DEFAULT '', mission_day TEXT NOT NULL DEFAULT '',
  revision INTEGER NOT NULL DEFAULT 0,
  UNIQUE(grade, class_no, number),
  CHECK((role='student' AND grade IS NOT NULL AND class_no IS NOT NULL AND number IS NOT NULL)
    OR (role='teacher' AND grade IS NULL AND class_no IS NULL AND number IS NULL AND length(name)>0))
) STRICT;
CREATE UNIQUE INDEX IF NOT EXISTS players_teacher_name ON players(name) WHERE role='teacher';
CREATE TABLE IF NOT EXISTS student_roster (
  grade INTEGER NOT NULL CHECK(grade BETWEEN 1 AND 3),
  class_no INTEGER NOT NULL CHECK(class_no BETWEEN 1 AND 99),
  number INTEGER NOT NULL CHECK(number BETWEEN 1 AND 99),
  name TEXT NOT NULL CHECK(length(name)>0),
  PRIMARY KEY(grade,class_no,number)
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
CREATE TABLE IF NOT EXISTS quiz_sets (
  id TEXT PRIMARY KEY, subject TEXT NOT NULL, title TEXT NOT NULL,
  questions_json TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1))
) STRICT;
CREATE TABLE IF NOT EXISTS quiz_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  day TEXT NOT NULL, subject TEXT NOT NULL, set_id TEXT NOT NULL REFERENCES quiz_sets(id),
  questions_json TEXT NOT NULL, result_json TEXT,
  claimed INTEGER NOT NULL DEFAULT 0 CHECK(claimed IN (0,1)),
  reward_remaining INTEGER NOT NULL DEFAULT 0 CHECK(reward_remaining BETWEEN 0 AND 100),
  UNIQUE(player_id, subject, day)
) STRICT;
CREATE INDEX IF NOT EXISTS quiz_runs_history ON quiz_runs(player_id, set_id);
CREATE INDEX IF NOT EXISTS quiz_runs_pending_growth ON quiz_runs(player_id) WHERE reward_remaining>0;
CREATE TABLE IF NOT EXISTS special_campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK(kind IN ('gratitude','patriots','farmers','student-independence','custom','off')),
  title TEXT NOT NULL, description TEXT NOT NULL, created_at TEXT NOT NULL,
  content_json TEXT
) STRICT;
CREATE TABLE IF NOT EXISTS gratitude_messages (
  id TEXT PRIMARY KEY,
  campaign_id INTEGER NOT NULL REFERENCES special_campaigns(id),
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  request_id TEXT NOT NULL,
  sender_json TEXT NOT NULL,
  recipient_role TEXT NOT NULL DEFAULT 'student' CHECK(recipient_role IN ('student','teacher')),
  recipient_grade INTEGER, recipient_class INTEGER,
  recipient_number INTEGER, recipient_name TEXT NOT NULL,
  body TEXT NOT NULL, char_count INTEGER NOT NULL,
  created_at TEXT NOT NULL, delivered_at TEXT NOT NULL DEFAULT '', read_at TEXT NOT NULL DEFAULT '',
  reward_remaining INTEGER NOT NULL DEFAULT 25 CHECK(reward_remaining BETWEEN 0 AND 25),
  notion_page_id TEXT NOT NULL DEFAULT '', notion_delivered INTEGER NOT NULL DEFAULT 0,
  sync_after INTEGER NOT NULL DEFAULT 0,
  UNIQUE(player_id,request_id),
  UNIQUE(campaign_id,player_id,recipient_grade,recipient_class,recipient_number),
  CHECK((recipient_role='student' AND recipient_grade IS NOT NULL AND recipient_class IS NOT NULL AND recipient_number IS NOT NULL)
    OR (recipient_role='teacher' AND recipient_grade IS NULL AND recipient_class IS NULL AND recipient_number IS NULL AND length(recipient_name)>0))
) STRICT;
CREATE INDEX IF NOT EXISTS gratitude_inbox ON gratitude_messages(recipient_grade,recipient_class,recipient_number,delivered_at);
CREATE UNIQUE INDEX IF NOT EXISTS gratitude_teacher_recipient ON gratitude_messages(campaign_id,player_id,recipient_name) WHERE recipient_role='teacher';
CREATE INDEX IF NOT EXISTS gratitude_sender ON gratitude_messages(player_id,campaign_id);
CREATE TABLE IF NOT EXISTS gratitude_teacher_deliveries (
  message_id TEXT NOT NULL REFERENCES gratitude_messages(id) ON DELETE CASCADE,
  teacher_name TEXT NOT NULL,
  read_at TEXT NOT NULL DEFAULT '',
  PRIMARY KEY(message_id,teacher_name)
) STRICT;
CREATE INDEX IF NOT EXISTS gratitude_teacher_inbox_deliveries ON gratitude_teacher_deliveries(teacher_name,message_id);
CREATE TABLE IF NOT EXISTS special_quiz_results (
  campaign_id INTEGER NOT NULL REFERENCES special_campaigns(id),
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  result_json TEXT NOT NULL,
  reward_remaining INTEGER NOT NULL CHECK(reward_remaining BETWEEN 0 AND 100),
  created_at TEXT NOT NULL,
  PRIMARY KEY(campaign_id,player_id)
) STRICT;
CREATE INDEX IF NOT EXISTS special_quiz_pending_growth ON special_quiz_results(player_id) WHERE reward_remaining>0;
CREATE TABLE IF NOT EXISTS special_completions (
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  mission_key TEXT NOT NULL,
  PRIMARY KEY(player_id,mission_key)
) STRICT;
CREATE TABLE IF NOT EXISTS admin_messages (
  id TEXT PRIMARY KEY,
  recipient_json TEXT NOT NULL, body TEXT NOT NULL,
  sent_at TEXT NOT NULL
) STRICT;
CREATE INDEX IF NOT EXISTS admin_messages_target ON admin_messages(recipient_json,sent_at);
CREATE TABLE IF NOT EXISTS admin_message_reads (
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL REFERENCES admin_messages(id),
  read_at TEXT NOT NULL,
  PRIMARY KEY(player_id,message_id)
) STRICT;
CREATE TABLE IF NOT EXISTS inbox_deletions (
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL,
  PRIMARY KEY(player_id,message_id)
) STRICT;
