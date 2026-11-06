import { count, sql } from 'drizzle-orm';
import type { Db } from '@/lib/db';
import { locations, users, type User } from '@/lib/db/schema';
import { config } from '@/lib/config';
import { hashPassword } from '@/lib/password';
import { DomainError, invalid } from './errors';

/** True until the first account exists: the app then offers first-run setup. */
export async function needsSetup(db: Db): Promise<boolean> {
  const [{ n }] = await db.select({ n: count() }).from(users);
  return Number(n) === 0;
}

export interface FirstAdminInput {
  name: string;
  email: string;
  password: string;
}

/**
 * Creates the very first administrator plus the locations the app needs to
 * work (the sales counter and an inbound staging area).
 *
 * Only ever succeeds once: the check and the insert share a transaction
 * guarded by an advisory lock, so two people racing through setup cannot both
 * become administrator.
 */
export async function createFirstAdmin(db: Db, input: FirstAdminInput): Promise<User> {
  const name = input.name.trim();
  const email = input.email.trim();
  if (!name) throw invalid('Enter your name.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw invalid('Enter a valid email address.');
  if (input.password.length < 8) throw invalid('Use a password of at least 8 characters.');

  const passwordHash = await hashPassword(input.password);

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('stockroom:first-admin'))`);
    const [{ n }] = await tx.select({ n: count() }).from(users);
    if (Number(n) > 0) {
      throw new DomainError('ALREADY_SET_UP', 'Setup is already complete. Sign in instead.', 409);
    }

    const [admin] = await tx
      .insert(users)
      .values({ name, email, role: 'admin', passwordHash })
      .returning();

    await tx
      .insert(locations)
      .values([
        { code: config.saleLocationCode, name: 'Sales counter', kind: 'counter' },
        { code: 'STAGING', name: 'Inbound staging', kind: 'staging' },
      ])
      .onConflictDoNothing();

    return admin;
  });
}
