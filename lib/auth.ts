import { NextRequest, NextResponse } from 'next/server';
import { getDb, getConfig } from '@/lib/db';

export async function validateAdminRequest(req: NextRequest): Promise<string | null> {
  const cookie = req.cookies.get('admin_token');
  if (!cookie) return null;
  const config = await getConfig();
  if (!config) return null;
  if (cookie.value !== config.admin_token) return null;
  return cookie.value;
}

export async function validateGraderToken(token: string) {
  const db = getDb();
  const result = await db.execute({
    sql: `SELECT id, name, email, token FROM graders WHERE token = ?`,
    args: [token],
  });
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    id: row.id as number,
    name: row.name as string,
    email: row.email as string,
    token: row.token as string,
  };
}

export function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

export function notFound(msg = 'Not found') {
  return NextResponse.json({ error: msg }, { status: 404 });
}
