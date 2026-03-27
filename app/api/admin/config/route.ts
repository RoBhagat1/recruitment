export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { initDb, getDb } from '@/lib/db';
import { validateAdminRequest, unauthorized } from '@/lib/auth';

export async function PATCH(req: NextRequest) {
  try {
    await initDb();
    if (!await validateAdminRequest(req)) return unauthorized();

    const { graderInstructions } = await req.json();

    const db = getDb();
    await db.execute({
      sql: `UPDATE config SET grader_instructions = ? WHERE id = 1`,
      args: [typeof graderInstructions === 'string' ? graderInstructions.trim() || null : null],
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
