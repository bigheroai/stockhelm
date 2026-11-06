import './load-env.mjs';

/**
 * Dev utility: resolves a session token to its user, straight from the
 * database. Useful when a cookie "does not work" — this tells you whether the
 * problem is the session row or the HTTP layer.
 *
 *   node --import ./scripts/register.mjs scripts/whoami.ts <token>
 */
const { count } = await import('drizzle-orm');

const { getDb, closeDb } = await import('../src/lib/db/index');
const { sessions } = await import('../src/lib/db/schema');
const { userForToken } = await import('../src/lib/sessions');

const token = process.argv[2];
const db = await getDb();

const [{ n }] = await db.select({ n: count() }).from(sessions);
console.log(`session rows: ${n}`);

if (token) {
  const user = await userForToken(db, token);
  console.log(user ? `token resolves to: ${user.email}` : 'token resolves to: nobody');
}

await closeDb();
process.exit(0);

export {};
