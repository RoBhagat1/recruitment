CREATE TABLE IF NOT EXISTS config (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  admin_token   TEXT    NOT NULL UNIQUE,
  status        TEXT    NOT NULL DEFAULT 'setup'
                        CHECK (status IN ('setup', 'active', 'finalized')),
  csv_headers             TEXT    NOT NULL DEFAULT '[]',
  score_fields            TEXT    NOT NULL DEFAULT '[]',
  normalization_factors   TEXT,
  created_at              INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS applications (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  row_index   INTEGER NOT NULL UNIQUE,
  fields      TEXT    NOT NULL,
  admin_note  TEXT,
  final_score REAL,
  rank        INTEGER,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS graders (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL UNIQUE,
  token      TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS assignments (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  grader_id      INTEGER NOT NULL REFERENCES graders(id) ON DELETE CASCADE,
  status         TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'completed')),
  completed_at   INTEGER,
  comment        TEXT,
  UNIQUE (application_id, grader_id)
);

CREATE INDEX IF NOT EXISTS idx_assignments_grader      ON assignments(grader_id);
CREATE INDEX IF NOT EXISTS idx_assignments_application ON assignments(application_id);

CREATE TABLE IF NOT EXISTS scores (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  field_name    TEXT    NOT NULL,
  score         INTEGER NOT NULL CHECK (score BETWEEN 1 AND 5),
  UNIQUE (assignment_id, field_name)
);

CREATE INDEX IF NOT EXISTS idx_scores_assignment ON scores(assignment_id);
