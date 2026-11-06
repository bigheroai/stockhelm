'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { eq, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { users } from '@/lib/db/schema';
import {
  SESSION_COOKIE,
  createSession,
  destroySession,
  sessionCookieOptions,
  verifyPassword,
} from '@/lib/auth';

export interface LoginState {
  error: string | null;
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  if (!email || !password) {
    return { error: 'Enter your email and password.' };
  }

  const db = await getDb();
  const [user] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = ${email.toLowerCase()}`)
    .limit(1);

  // Always run a comparison so a missing account and a wrong password take
  // the same amount of time.
  const stored = user?.passwordHash ?? 'scrypt$00$00';
  const ok = await verifyPassword(password, stored);

  if (!user || !ok) {
    return { error: 'Those credentials do not match.' };
  }

  const token = await createSession(db, user.id);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, sessionCookieOptions());
  redirect('/');
}

export async function logout() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    const db = await getDb();
    await destroySession(db, token);
  }
  jar.delete(SESSION_COOKIE);
  redirect('/login');
}
