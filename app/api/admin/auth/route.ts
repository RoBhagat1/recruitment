export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { initDb, getConfig } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    await initDb();
    const { token } = await req.json();
    const config = await getConfig();

    if (!config || token !== config.admin_token) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const res = NextResponse.json({ success: true });
    res.cookies.set('admin_token', token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    });
    return res;
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
