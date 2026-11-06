/**
 * Pre-flight check for a hosted database (Supabase, Neon, RDS, a VPS…).
 * Answers the questions that actually break deployments:
 *   1. Can we connect, and over which transport?
 *   2. Is the pooler in transaction mode (no prepared statements)?
 *   3. Are the tables there, and is RLS locked down?
 *   4. Does the ledger still balance?
 *
 *   pnpm db:doctor
 */
import './load-env.mjs';

const { getDb, closeDb } = await import('../src/lib/db/index');
const { ledgerDrift } = await import('../src/lib/queries');
const { extractRows } = await import('../src/lib/domain/stock');

const url = process.env.DATABASE_URL?.trim();
console.log(`mode:        ${url ? 'hosted Postgres' : 'embedded PGlite (development)'}`);

if (url) {
  const port = url.match(/:(\d+)(?:\/|\?|$)/)?.[1];
  const pooler = /pooler\.supabase\.com/.test(url);
  console.log(`transport:   ${pooler ? 'Supavisor pooler' : 'direct'}${port ? ` (port ${port})` : ''}`);
  if (port === '6543') console.log('             transaction mode → prepared statements disabled');
}

const db = await getDb();

const versionRows = extractRows(await db.execute('select version() as v'));
console.log(`server:      ${String(versionRows[0]?.v ?? 'unknown').split(',')[0]}`);

const whoRows = extractRows(await db.execute('select current_database() as db, current_user as usr'));
console.log(`database:    ${whoRows[0]?.db} as ${whoRows[0]?.usr}`);

const tables = extractRows(
  await db.execute(
    `select tablename, rowsecurity from pg_tables
      where schemaname = 'public' and tablename in
        ('users','sessions','locations','items','stock_levels','movements','sales','sale_lines','payments')
      order by tablename`,
  ),
);

const secured = tables.filter((t) => t.rowsecurity).length;
console.log(`tables:      ${tables.length}/9 present`);
console.log(`rls:         ${secured}/${tables.length || 9} enabled`);

for (const t of tables) {
  if (!t.rowsecurity) {
    console.log(`             ⚠ ${t.tablename} has RLS disabled — reachable via the Supabase Data API`);
  }
}

if (tables.length < 9) {
  await closeDb();
  console.log('\n⚠ schema not migrated yet — run `pnpm db:migrate`');
  process.exit(0);
}

const drift = await ledgerDrift(db);
console.log(`balances:    ${drift.levelRows} rows, ${drift.mismatched} mismatched`);

const counts = extractRows(
  await db.execute('select (select count(*) from items) as items, (select count(*) from sales) as sales'),
);
console.log(`content:     ${counts[0]?.items} items, ${counts[0]?.sales} sales`);

await closeDb();

if (drift.mismatched > 0) {
  console.error('\n✗ ledger drift — rebuild balances before serving traffic');
  process.exit(1);
}
console.log('\n✓ database is ready');
process.exit(0);

export {};
