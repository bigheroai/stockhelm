import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt } from 'drizzle-orm';
import type { Db } from '@/lib/db';
import { sessions, users, type User } from '@/lib/db/schema';

/**
 * Session persistence, deliberately free of any Next.js imports so scripts and
 * tests can mint or revoke sessions without a request context.
 */

export const SESSION_COOKIE = 'stockroom_session';
export const SESSION_DAYS = 7;

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/** Creates a session row and returns the raw token to put in the cookie. */
export async function createSession(db: Db, userId: string): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(sessions).values({ tokenHash: sha256(token), userId, expiresAt });
  return token;
}

export async function destroySession(db: Db, token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.tokenHash, sha256(token)));
}

export async function userForToken(db: Db, token: string): Promise<User | null> {
  const [row] = await db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, sha256(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  return row?.user ?? null;
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  };
}
