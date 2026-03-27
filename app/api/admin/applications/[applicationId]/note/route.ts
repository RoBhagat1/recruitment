export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { initDb, getDb } from '@/lib/db';
import { validateAdminRequest, unauthorized } from '@/lib/auth';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ applicationId: string }> }
) {
  try {
    await initDb();
    if (!await validateAdminRequest(req)) return unauthorized();

    const { applicationId } = await params;
    const appId = parseInt(applicationId, 10);
    const { note } = await req.json();

    const db = getDb();
    await db.execute({
      sql: `UPDATE applications SET admin_note = ? WHERE id = ?`,
      args: [typeof note === 'string' ? note.trim() || null : null, appId],
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
