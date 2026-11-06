import { redirect } from 'next/navigation';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { Sidebar } from '@/components/Sidebar';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const db = await getDb();
  const user = await getCurrentUser(db);
  if (!user) redirect('/login');

  return (
    <div className="shell">
      <Sidebar user={{ name: user.name, role: user.role }} />
      <main className="main">{children}</main>
    </div>
  );
}
