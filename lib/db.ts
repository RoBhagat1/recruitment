import { createClient, type Client, type ResultSet } from '@libsql/client';

let client: Client | null = null;

export function getDb(): Client {
  if (!client) {
    const rawUrl = process.env.TURSO_DATABASE_URL;
    const authToken = process.env.TURSO_AUTH_TOKEN;

    if (!rawUrl) {
      throw new Error('TURSO_DATABASE_URL environment variable is required');
    }

    // Force HTTPS transport — libsql:// tries WebSocket/hrana-v3 which fails
    // in serverless environments (Vercel). https:// uses plain HTTP.
    const url = rawUrl.startsWith('libsql://')
      ? rawUrl.replace('libsql://', 'https://')
      : rawUrl;

    client = createClient({ url, authToken, fetch: globalThis.fetch });
  }
  return client;
}

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    admin_token TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'setup' CHECK (status IN ('setup', 'active', 'finalized')),
    csv_headers TEXT NOT NULL DEFAULT '[]',
    score_fields TEXT NOT NULL DEFAULT '[]',
    normalization_factors TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`,
  `CREATE TABLE IF NOT EXISTS applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    row_index INTEGER NOT NULL UNIQUE,
    fields TEXT NOT NULL,
    admin_note TEXT,
    final_score REAL,
    rank INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`,
  `CREATE TABLE IF NOT EXISTS graders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    token TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  )`,
  `CREATE TABLE IF NOT EXISTS assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    grader_id INTEGER NOT NULL REFERENCES graders(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
    completed_at INTEGER,
    comment TEXT,
    UNIQUE (application_id, grader_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_assignments_grader ON assignments(grader_id)`,
  `CREATE INDEX IF NOT EXISTS idx_assignments_application ON assignments(application_id)`,
  `CREATE TABLE IF NOT EXISTS scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
    field_name TEXT NOT NULL,
    score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 5),
    UNIQUE (assignment_id, field_name)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_scores_assignment ON scores(assignment_id)`,
];

export async function initDb(): Promise<void> {
  const db = getDb();

  for (let i = 0; i < SCHEMA_STATEMENTS.length; i++) {
    try {
      await db.execute(SCHEMA_STATEMENTS[i]);
    } catch (e) {
      console.error(`initDb: statement ${i} failed:`, SCHEMA_STATEMENTS[i].slice(0, 80), e);
      throw e;
    }
  }

  // Migrations for existing databases
  try {
    await db.execute(`ALTER TABLE assignments ADD COLUMN comment TEXT`);
  } catch {
    // Column already exists
  }
  try {
    await db.execute(`ALTER TABLE config ADD COLUMN normalization_factors TEXT`);
  } catch {
    // Column already exists
  }
  try {
    await db.execute(`ALTER TABLE applications ADD COLUMN admin_note TEXT`);
  } catch {
    // Column already exists
  }
}

// Typed helpers

export async function getConfig() {
  const db = getDb();
  const result = await db.execute('SELECT * FROM config WHERE id = 1');
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    id: row.id as number,
    admin_token: row.admin_token as string,
    status: row.status as 'setup' | 'active' | 'finalized',
    csv_headers: JSON.parse(row.csv_headers as string) as string[],
    score_fields: JSON.parse(row.score_fields as string) as string[],
    normalization_factors: row.normalization_factors
      ? (JSON.parse(row.normalization_factors as string) as NormalizationFactor[])
      : null,
    created_at: row.created_at as number,
  };
}

export async function isSetupComplete(): Promise<boolean> {
  const config = await getConfig();
  return config !== null && config.status !== 'setup';
}

export interface NormalizationFactor {
  graderId: number;
  graderName: string;
  rawMean: number;
  adjustment: number;
}

export type { ResultSet };
