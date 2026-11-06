import './load-env.mjs';

/**
 * CI-friendly integrity check. Exits non-zero when the cached balances and the
 * movement ledger disagree, so a bad deploy fails loudly.
 */
const { getDb, closeDb } = await import('../src/lib/db/index');
const { ledgerDrift } = await import('../src/lib/queries');

const db = await getDb();
const drift = await ledgerDrift(db);

console.log(`balance rows:        ${drift.levelRows}`);
console.log(`rows from ledger:    ${drift.ledgerRows}`);
console.log(`mismatched rows:     ${drift.mismatched}`);
await closeDb();

if (drift.mismatched > 0) {
  console.error('\nLedger drift detected. Run the rebuild in Settings, or `rebuildStockLevels`.');
  process.exit(1);
}

console.log('\n✓ ledger balanced');
process.exit(0);

export {};
