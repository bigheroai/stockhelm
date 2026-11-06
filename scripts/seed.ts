import './load-env.mjs';

/**
 * Seeds a demo warehouse: staff accounts, bin locations, a catalogue, opening
 * stock, and a few counter sales so the dashboard has something to show.
 *
 * Safe to run once. Re-running against a populated database is a no-op.
 */
import { count } from 'drizzle-orm';

const { getDb, closeDb } = await import('../src/lib/db/index');
const { items, locations, users } = await import('../src/lib/db/schema');
const { hashPassword } = await import('../src/lib/password');
const { receiveStock, transferStock } = await import('../src/lib/domain/stock');
const { recordSale } = await import('../src/lib/domain/sales');

const db = await getDb();

/**
 * Production runs should not get a fake catalogue. Set SEED_DEMO=false to
 * create only the administrator and the starter locations.
 */
const demo = (process.env.SEED_DEMO ?? 'true').trim().toLowerCase() !== 'false';

const [{ n: existing }] = await db.select({ n: count() }).from(items);
if (Number(existing) > 0) {
  console.log('Database already has items — nothing to seed.');
  await closeDb();
  process.exit(0);
}

/* ── Staff ──────────────────────────────────────────────────────────────── */
const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com').trim();
const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'change-me-now';

const [admin] = await db
  .insert(users)
  .values({
    email: adminEmail,
    name: 'Warehouse Admin',
    role: 'admin',
    passwordHash: await hashPassword(adminPassword),
  })
  .onConflictDoNothing()
  .returning();

// The clerk account exists only so the demo has a second role to look at.
const clerk = demo
  ? (
      await db
        .insert(users)
        .values({
          email: 'clerk@example.com',
          name: 'Counter Clerk',
          role: 'clerk',
          passwordHash: await hashPassword('counter-demo-1'),
        })
        .onConflictDoNothing()
        .returning()
    )[0]
  : undefined;

const actor = { id: admin?.id ?? clerk?.id ?? '' };

/* ── Locations ──────────────────────────────────────────────────────────── */
const locationSeed = [
  { code: 'COUNTER', name: 'Sales counter', kind: 'counter' as const },
  { code: 'A-01', name: 'Aisle A · Bay 1', kind: 'bin' as const },
  { code: 'A-02', name: 'Aisle A · Bay 2', kind: 'bin' as const },
  { code: 'B-01', name: 'Aisle B · Bay 1', kind: 'bin' as const },
  { code: 'STAGING', name: 'Inbound staging', kind: 'staging' as const },
];

const locRows = await db.insert(locations).values(locationSeed).onConflictDoNothing().returning();
const loc = Object.fromEntries(locRows.map((l) => [l.code, l.id]));

if (!demo) {
  console.log('✓ seeded staff and locations (demo catalogue skipped)');
  console.log(`  admin: ${adminEmail}`);
  await closeDb();
  process.exit(0);
}

/* ── Catalogue ──────────────────────────────────────────────────────────── */
const catalogue = [
  ['TL-1001', 'Cordless Drill 18V', '8901234500017', 12900, 7800, 6, 'ea', '2 batteries, charger, case'],
  ['TL-1002', 'Angle Grinder 125mm', '8901234500024', 8900, 5400, 4, 'ea', ''],
  ['TL-1003', 'Tape Measure 8m', '8901234500031', 1450, 620, 20, 'ea', ''],
  ['PP-2001', 'Safety Glasses (clear)', '8901234500048', 450, 180, 50, 'ea', 'ANSI Z87.1'],
  ['PP-2002', 'Nitrile Gloves · L', '8901234500055', 1200, 610, 40, 'box', '100 per box'],
  ['PP-2003', 'Hi-Vis Vest · L', '8901234500062', 950, 420, 25, 'ea', ''],
  ['FA-3001', 'Hex Bolt M10×60', '8901234500079', 35, 14, 500, 'ea', 'Zinc plated'],
  ['FA-3002', 'Hex Nut M10', '8901234500086', 18, 6, 500, 'ea', ''],
  ['FA-3003', 'Washer M10', '8901234500093', 9, 3, 800, 'ea', ''],
  ['EL-4001', 'Extension Cord 10m', '8901234500109', 2450, 1350, 12, 'ea', ''],
  ['EL-4002', 'LED Work Light 30W', '8901234500116', 3900, 2100, 8, 'ea', ''],
  ['PK-5001', 'Stretch Wrap 500mm', '8901234500123', 890, 480, 30, 'roll', ''],
  ['PK-5002', 'Carton Box 400×300×300', '8901234500130', 165, 95, 150, 'ea', ''],
  ['PK-5003', 'Packing Tape 48mm', '8901234500147', 120, 55, 100, 'roll', ''],
] as const;

const itemRows = await db
  .insert(items)
  .values(
    catalogue.map(([sku, name, barcode, priceCents, costCents, reorderPoint, unit, description]) => ({
      sku,
      name,
      barcode,
      priceCents,
      costCents,
      reorderPoint,
      unit,
      description,
    })),
  )
  .returning();

const itemBySku = Object.fromEntries(itemRows.map((i) => [i.sku, i]));

/* ── Opening stock ──────────────────────────────────────────────────────── */
// Receive everything into staging, then split it across the floor so the
// ledger reads like a real inbound day.
const inbound: Record<string, number> = {
  'TL-1001': 24, 'TL-1002': 12, 'TL-1003': 60,
  'PP-2001': 120, 'PP-2002': 48, 'PP-2003': 40,
  'FA-3001': 1200, 'FA-3002': 1200, 'FA-3003': 2000,
  'EL-4001': 30, 'EL-4002': 18, 'PK-5001': 72,
  'PK-5002': 300, 'PK-5003': 240,
};

for (const [sku, qty] of Object.entries(inbound)) {
  await receiveStock(db, {
    itemId: itemBySku[sku].id,
    locationId: loc.STAGING,
    qty,
    note: 'Opening stock',
    actor,
    idempotencyKey: `seed-receive-${sku}`,
  });
}

const split: Record<string, { bin: string; qty: number }[]> = {
  'TL-1001': [{ bin: 'A-01', qty: 10 }, { bin: 'COUNTER', qty: 6 }],
  'TL-1002': [{ bin: 'A-01', qty: 8 }],
  'TL-1003': [{ bin: 'A-01', qty: 40 }, { bin: 'COUNTER', qty: 12 }],
  'PP-2001': [{ bin: 'A-02', qty: 90 }, { bin: 'COUNTER', qty: 24 }],
  'PP-2002': [{ bin: 'A-02', qty: 32 }, { bin: 'COUNTER', qty: 8 }],
  'PP-2003': [{ bin: 'A-02', qty: 30 }, { bin: 'COUNTER', qty: 6 }],
  'FA-3001': [{ bin: 'B-01', qty: 1100 }, { bin: 'COUNTER', qty: 100 }],
  'FA-3002': [{ bin: 'B-01', qty: 1200 }],
  'FA-3003': [{ bin: 'B-01', qty: 2000 }],
  'EL-4001': [{ bin: 'A-01', qty: 20 }, { bin: 'COUNTER', qty: 4 }],
  'EL-4002': [{ bin: 'A-01', qty: 14 }],
  'PK-5001': [{ bin: 'A-02', qty: 50 }, { bin: 'COUNTER', qty: 10 }],
  'PK-5002': [{ bin: 'B-01', qty: 260 }, { bin: 'COUNTER', qty: 20 }],
  'PK-5003': [{ bin: 'B-01', qty: 200 }, { bin: 'COUNTER', qty: 20 }],
};

for (const [sku, targets] of Object.entries(split)) {
  for (const target of targets) {
    await transferStock(db, {
      itemId: itemBySku[sku].id,
      fromLocationId: loc.STAGING,
      toLocationId: loc[target.bin],
      qty: target.qty,
      note: 'Opening put-away',
      actor,
      idempotencyKey: `seed-move-${sku}-${target.bin}`,
    });
  }
}

/* ── Demo sales ─────────────────────────────────────────────────────────── */
const taxBps = Number(process.env.TAX_RATE_BPS ?? 0) || 0;
const baskets = [
  {
    method: 'cash' as const,
    customerName: 'Walk-in',
    lines: [{ sku: 'PP-2001', qty: 4 }, { sku: 'TL-1003', qty: 1 }],
  },
  {
    method: 'card' as const,
    customerName: '',
    lines: [{ sku: 'TL-1001', qty: 1 }, { sku: 'PK-5003', qty: 3 }],
  },
  {
    method: 'cash' as const,
    customerName: '',
    lines: [{ sku: 'PP-2002', qty: 2 }, { sku: 'PP-2003', qty: 2 }, { sku: 'FA-3001', qty: 50 }],
  },
];

for (const [index, basket] of baskets.entries()) {
  const lines = basket.lines.map((line) => ({
    itemId: itemBySku[line.sku].id,
    qty: line.qty,
  }));
  const subtotal = basket.lines.reduce(
    (sum, line) => sum + itemBySku[line.sku].priceCents * line.qty,
    0,
  );
  const total = subtotal + Math.round((subtotal * taxBps) / 10_000);

  await recordSale(db, {
    lines,
    payments: [{ method: basket.method, amountCents: total }],
    customerName: basket.customerName,
    actor,
    idempotencyKey: `seed-sale-${index}`,
  });
}

console.log('✓ seeded');
console.log(`  admin: ${adminEmail} / ${adminPassword}`);
console.log('  clerk: clerk@example.com / counter-demo-1');
console.log(`  ${itemRows.length} items, ${locRows.length} locations`);
await closeDb();
process.exit(0);
