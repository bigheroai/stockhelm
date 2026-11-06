import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { eq, and } from 'drizzle-orm';
import { movements, stockLevels } from '../src/lib/db/schema';
import {
  adjustStock,
  applyDelta,
  receiveStock,
  rebuildStockLevels,
  transferStock,
} from '../src/lib/domain/stock';
import { DomainError } from '../src/lib/domain/errors';
import { ACTOR, balanceAt, makeShelf, makeTestDb } from './helpers';

describe('receiving', () => {
  test('adds stock and writes one ledger row', async () => {
    const { db, close } = await makeTestDb();
    try {
      const { item, bin } = await makeShelf(db);
      await receiveStock(db, { itemId: item.id, locationId: bin.id, qty: 10, actor: ACTOR });

      assert.equal(await balanceAt(db, item.id, bin.id), 10);

      const rows = await db.select().from(movements);
      assert.equal(rows.length, 1);
      assert.equal(rows[0].kind, 'receive');
      assert.equal(rows[0].fromLocationId, null);
      assert.equal(rows[0].toLocationId, bin.id);
      assert.equal(rows[0].qty, 10);
    } finally {
      await close();
    }
  });

  test('is idempotent for a repeated key', async () => {
    const { db, close } = await makeTestDb();
    try {
      const { item, bin } = await makeShelf(db);
      const key = 'delivery-77';
      await receiveStock(db, { itemId: item.id, locationId: bin.id, qty: 5, actor: ACTOR, idempotencyKey: key });
      const second = await receiveStock(db, {
        itemId: item.id,
        locationId: bin.id,
        qty: 5,
        actor: ACTOR,
        idempotencyKey: key,
      });

      assert.equal(second.duplicate, true);
      assert.equal(await balanceAt(db, item.id, bin.id), 5);
      assert.equal((await db.select().from(movements)).length, 1);
    } finally {
      await close();
    }
  });

  test('rejects zero and fractional quantities', async () => {
    const { db, close } = await makeTestDb();
    try {
      const { item, bin } = await makeShelf(db);
      await assert.rejects(
        receiveStock(db, { itemId: item.id, locationId: bin.id, qty: 0, actor: ACTOR }),
        (err: unknown) => err instanceof DomainError && err.code === 'INVALID_INPUT',
      );
      await assert.rejects(
        receiveStock(db, { itemId: item.id, locationId: bin.id, qty: 1.5, actor: ACTOR }),
        (err: unknown) => err instanceof DomainError,
      );
    } finally {
      await close();
    }
  });
});

describe('transfers', () => {
  test('moves units without changing the total', async () => {
    const { db, close } = await makeTestDb();
    try {
      const { item, bin, bin2 } = await makeShelf(db);
      await receiveStock(db, { itemId: item.id, locationId: bin.id, qty: 10, actor: ACTOR });
      await transferStock(db, {
        itemId: item.id,
        fromLocationId: bin.id,
        toLocationId: bin2.id,
        qty: 4,
        actor: ACTOR,
      });

      assert.equal(await balanceAt(db, item.id, bin.id), 6);
      assert.equal(await balanceAt(db, item.id, bin2.id), 4);
      assert.equal(await balanceAt(db, item.id, bin.id) + await balanceAt(db, item.id, bin2.id), 10);
    } finally {
      await close();
    }
  });

  test('refuses to overdraw a bin and leaves both sides untouched', async () => {
    const { db, close } = await makeTestDb();
    try {
      const { item, bin, bin2 } = await makeShelf(db);
      await receiveStock(db, { itemId: item.id, locationId: bin.id, qty: 3, actor: ACTOR });

      await assert.rejects(
        transferStock(db, {
          itemId: item.id,
          fromLocationId: bin.id,
          toLocationId: bin2.id,
          qty: 5,
          actor: ACTOR,
        }),
        (err: unknown) => err instanceof DomainError && err.code === 'INSUFFICIENT_STOCK',
      );

      assert.equal(await balanceAt(db, item.id, bin.id), 3);
      assert.equal(await balanceAt(db, item.id, bin2.id), 0);
      assert.equal((await db.select().from(movements)).length, 1, 'no partial movement row');
    } finally {
      await close();
    }
  });

  test('rejects a transfer to the same location', async () => {
    const { db, close } = await makeTestDb();
    try {
      const { item, bin } = await makeShelf(db);
      await assert.rejects(
        transferStock(db, {
          itemId: item.id,
          fromLocationId: bin.id,
          toLocationId: bin.id,
          qty: 1,
          actor: ACTOR,
        }),
        (err: unknown) => err instanceof DomainError,
      );
    } finally {
      await close();
    }
  });
});

describe('cycle counts', () => {
  test('sets the shelf to the counted quantity and records the shortfall', async () => {
    const { db, close } = await makeTestDb();
    try {
      const { item, bin } = await makeShelf(db);
      await receiveStock(db, { itemId: item.id, locationId: bin.id, qty: 10, actor: ACTOR });

      const result = await adjustStock(db, {
        itemId: item.id,
        locationId: bin.id,
        countedQty: 7,
        reason: 'Two damaged, one missing',
        actor: ACTOR,
      });

      assert.equal(result.delta, -3);
      assert.equal(await balanceAt(db, item.id, bin.id), 7);

      const adjustRows = await db.select().from(movements).where(eq(movements.kind, 'adjust'));
      assert.equal(adjustRows.length, 1);
      assert.equal(adjustRows[0].qty, 3);
      assert.equal(adjustRows[0].fromLocationId, bin.id);
      assert.equal(adjustRows[0].toLocationId, null);
    } finally {
      await close();
    }
  });

  test('records a surplus as an inbound adjustment', async () => {
    const { db, close } = await makeTestDb();
    try {
      const { item, bin } = await makeShelf(db);
      await receiveStock(db, { itemId: item.id, locationId: bin.id, qty: 2, actor: ACTOR });

      await adjustStock(db, {
        itemId: item.id,
        locationId: bin.id,
        countedQty: 5,
        reason: 'Found behind pallet',
        actor: ACTOR,
      });

      assert.equal(await balanceAt(db, item.id, bin.id), 5);
      const [row] = await db.select().from(movements).where(eq(movements.kind, 'adjust'));
      assert.equal(row.toLocationId, bin.id);
      assert.equal(row.qty, 3);
    } finally {
      await close();
    }
  });

  test('does nothing when the count matches', async () => {
    const { db, close } = await makeTestDb();
    try {
      const { item, bin } = await makeShelf(db);
      await receiveStock(db, { itemId: item.id, locationId: bin.id, qty: 4, actor: ACTOR });
      const result = await adjustStock(db, {
        itemId: item.id,
        locationId: bin.id,
        countedQty: 4,
        reason: 'Monthly count',
        actor: ACTOR,
      });
      assert.equal(result.movementId, null);
      assert.equal((await db.select().from(movements)).length, 1);
    } finally {
      await close();
    }
  });

  test('requires a reason', async () => {
    const { db, close } = await makeTestDb();
    try {
      const { item, bin } = await makeShelf(db);
      await assert.rejects(
        adjustStock(db, { itemId: item.id, locationId: bin.id, countedQty: 1, reason: '   ', actor: ACTOR }),
        (err: unknown) => err instanceof DomainError && err.code === 'INVALID_INPUT',
      );
    } finally {
      await close();
    }
  });
});

describe('ledger integrity', () => {
  test('rebuilding balances reproduces the ledger exactly', async () => {
    const { db, close } = await makeTestDb();
    try {
      const { item, bin, bin2 } = await makeShelf(db);
      await receiveStock(db, { itemId: item.id, locationId: bin.id, qty: 20, actor: ACTOR });
      await transferStock(db, {
        itemId: item.id,
        fromLocationId: bin.id,
        toLocationId: bin2.id,
        qty: 7,
        actor: ACTOR,
      });
      await adjustStock(db, {
        itemId: item.id,
        locationId: bin2.id,
        countedQty: 6,
        reason: 'Damaged in transit',
        actor: ACTOR,
      });

      const before = await db.select().from(stockLevels).orderBy(stockLevels.locationId);

      // Corrupt the cache on purpose.
      await db.update(stockLevels).set({ qty: 999 });
      await rebuildStockLevels(db);

      const after = await db.select().from(stockLevels).orderBy(stockLevels.locationId);
      assert.deepEqual(
        after.map((r) => ({ item: r.itemId, loc: r.locationId, qty: r.qty })),
        before.map((r) => ({ item: r.itemId, loc: r.locationId, qty: r.qty })),
      );
      assert.equal(await balanceAt(db, item.id, bin.id), 13);
      assert.equal(await balanceAt(db, item.id, bin2.id), 6);
    } finally {
      await close();
    }
  });

  test('the database itself refuses a negative balance', async () => {
    const { db, close } = await makeTestDb();
    try {
      const { item, bin } = await makeShelf(db);
      await receiveStock(db, { itemId: item.id, locationId: bin.id, qty: 1, actor: ACTOR });
      await assert.rejects(applyDelta(db, item.id, bin.id, -2));
      assert.equal(await balanceAt(db, item.id, bin.id), 1);
    } finally {
      await close();
    }
  });

  test('movements cannot be written with a zero quantity', async () => {
    const { db, close } = await makeTestDb();
    try {
      const { item, bin } = await makeShelf(db);
      await assert.rejects(
        db.insert(movements).values({
          itemId: item.id,
          toLocationId: bin.id,
          qty: 0,
          kind: 'receive',
        }),
      );
    } finally {
      await close();
    }
  });
});

describe('scan lookup', () => {
  test('finds an item by barcode and by SKU', async () => {
    const { db, close } = await makeTestDb();
    try {
      const { item } = await makeShelf(db);
      const { findItemByCode } = await import('../src/lib/domain/items');
      assert.equal((await findItemByCode(db, '0000000000017'))?.id, item.id);
      assert.equal((await findItemByCode(db, 'test-1'))?.id, item.id);
      assert.equal(await findItemByCode(db, 'nope'), null);
    } finally {
      await close();
    }
  });
});

describe('stock level cache', () => {
  test('a fresh bin is created on first receipt', async () => {
    const { db, close } = await makeTestDb();
    try {
      const { item, bin2 } = await makeShelf(db);
      await receiveStock(db, { itemId: item.id, locationId: bin2.id, qty: 3, actor: ACTOR });
      const rows = await db
        .select()
        .from(stockLevels)
        .where(and(eq(stockLevels.itemId, item.id), eq(stockLevels.locationId, bin2.id)));
      assert.equal(rows.length, 1);
      assert.equal(rows[0].qty, 3);
    } finally {
      await close();
    }
  });
});
