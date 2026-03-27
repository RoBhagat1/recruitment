export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { initDb, getConfig } from '@/lib/db';

export default async function RootPage() {
  try {
    await initDb();
    const config = await getConfig();
    if (config && config.status !== 'setup') {
      redirect('/admin/login');
    }
  } catch {
    // DB not configured yet — fall through to setup
  }
  redirect('/setup');
}
