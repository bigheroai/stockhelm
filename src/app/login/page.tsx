import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { config } from '@/lib/config';
import { needsSetup } from '@/lib/domain/setup';
import { LoginForm } from './LoginForm';
import { SetupForm } from './SetupForm';

export const metadata: Metadata = { title: 'Sign in · Stockroom' };
export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const db = await getDb();
  const user = await getCurrentUser(db);
  if (user) redirect('/');
  const firstRun = await needsSetup(db);

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="brand" style={{ padding: 0, marginBottom: 20 }}>
          <div className="brand-mark">SR</div>
          <div>
            <div className="brand-name" style={{ color: 'var(--ink)' }}>{config.companyName}</div>
            <span className="brand-sub" style={{ color: 'var(--muted)' }}>Inventory</span>
          </div>
        </div>
        {firstRun ? (
          <>
            <h1>Set up {config.companyName}</h1>
            <p className="sub">
              No accounts exist yet. Create the administrator account to get started.
            </p>
            <SetupForm />
          </>
        ) : (
          <>
            <h1>Sign in</h1>
            <p className="sub">Warehouse and counter access.</p>
            <LoginForm />
          </>
        )}
      </div>
    </div>
  );
}
