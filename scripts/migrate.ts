/**
 * Runs pending SQL migrations against whichever database `DATABASE_URL`
 * points at (or the embedded PGlite file when it is unset).
 */
import './load-env.mjs';

process.env.AUTO_MIGRATE = 'true';

const { getDb, closeDb } = await import('../src/lib/db/index');

const db = await getDb();
// Touching the connection is what triggers the migrator.
await db.execute('select 1');

// PGlite buffers writes: close before exiting or the migration is lost.
await closeDb();
console.log('✓ migrations applied');
process.exit(0);

export {};
