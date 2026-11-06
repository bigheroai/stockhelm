import './load-env.mjs';

/**
 * Dev utility: mints a session cookie value for an existing user so you can
 * smoke-test authenticated pages with curl/Postman.
 *
 *   node --import ./scripts/register.mjs scripts/mint-session.ts admin@example.com
 */
const { eq, sql } = await import('drizzle-orm');

const { getDb, closeDb } = await import('../src/lib/db/index');
const { users } = await import('../src/lib/db/schema');
const { createSession } = await import('../src/lib/sessions');

const email = process.argv[2] ?? process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com';

const db = await getDb();
const [user] = await db
  .select()
  .from(users)
  .where(sql`lower(${users.email}) = ${email.toLowerCase()}`)
  .limit(1);

if (!user) {
  console.error(`No user with email ${email}`);
  await closeDb();
  process.exit(1);
}

const token = await createSession(db, user.id);
await closeDb();
console.log(token);
process.exit(0);

export {};
