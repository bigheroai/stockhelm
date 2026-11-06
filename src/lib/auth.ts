import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Db } from '@/lib/db';
import type { User } from '@/lib/db/schema';
import { SESSION_COOKIE, userForToken } from '@/lib/sessions';

export { hashPassword, verifyPassword } from '@/lib/password';
export {
  SESSION_COOKIE,
  createSession,
  destroySession,
  sessionCookieOptions,
  userForToken,
} from '@/lib/sessions';

export async function getCurrentUser(db: Db): Promise<User | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return userForToken(db, token);
}

export async function requireUser(db: Db): Promise<User> {
  const user = await getCurrentUser(db);
  if (!user) redirect('/login');
  return user;
}
