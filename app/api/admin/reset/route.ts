export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { initDb, getDb } from '@/lib/db';
import { validateAdminRequest, unauthorized } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    await initDb();
    if (!await validateAdminRequest(req)) return unauthorized();

    const db = getDb();

    // Delete all data in reverse dependency order
    await db.execute(`DELETE FROM scores`);
    await db.execute(`DELETE FROM assignments`);
    await db.execute(`DELETE FROM graders`);
    await db.execute(`DELETE FROM applications`);
    await db.execute(`DELETE FROM config`);

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
