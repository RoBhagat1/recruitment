import { createClient, type Client, type ResultSet } from '@libsql/client';
import { readFileSync } from 'fs';
import { join } from 'path';

let client: Client | null = null;

export function getDb(): Client {
  if (!client) {
    const url = process.env.TURSO_DATABASE_URL;
    const authToken = process.env.TURSO_AUTH_TOKEN;

    if (!url) {
      throw new Error('TURSO_DATABASE_URL environment variable is required');
    }

    client = createClient({ url, authToken });
  }
  return client;
}

export async function initDb(): Promise<void> {
  const db = getDb();
  const schemaPath = join(process.cwd(), 'lib', 'schema.sql');
  const schema = readFileSync(schemaPath, 'utf-8');

  // Split on semicolons and run each statement
  const statements = schema
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const stmt of statements) {
    await db.execute(stmt);
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
