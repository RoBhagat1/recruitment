import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

async function getAdminToken() {
  const cookieStore = await cookies();
  return cookieStore.get('admin_token')?.value ?? null;
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const token = await getAdminToken();
  if (!token) redirect('/admin/login');
  return <>{children}</>;
}
