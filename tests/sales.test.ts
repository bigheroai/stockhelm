import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import { movements, payments, saleLines, sales } from '../src/lib/db/schema';
import { receiveStock } from '../src/lib/domain/stock';
import { recordSale, voidSale } from '../src/lib/domain/sales';
import { DomainError } from '../src/lib/domain/errors';
import { ACTOR, balanceAt, makeShelf, makeTestDb } from './helpers';

async function stocked(qty = 10) {
  const { db, close } = await makeTestDb();
  const shelf = await makeShelf(db);
  await receiveStock(db, { itemId: shelf.item.id, locationId: shelf.counter.id, qty, actor: ACTOR });
  return { db, close, ...shelf };
}

describe('counter sales', () => {
  test('takes stock out of the counter and records the receipt', async () => {
    const { db, close, item, counter } = await stocked(10);
    try {
      const result = await recordSale(db, {
        lines: [{ itemId: item.id, qty: 3 }],
        payments: [{ method: 'cash', amountCents: 3000 }],
        actor: ACTOR,
      });

      assert.equal(result.totalCents, 3000);
      assert.equal(result.changeCents, 0);
      assert.equal(await balanceAt(db, item.id, counter.id), 7);

      const [sale] = await db.select().from(sales);
      assert.equal(sale.status, 'paid');
      assert.equal(sale.number, result.number);
      assert.match(sale.number, /^S-\d+$/);

      const lines = await db.select().from(saleLines);
      assert.equal(lines.length, 1);
      assert.equal(lines[0].unitPriceCents, 1000);
      assert.equal(lines[0].lineTotalCents, 3000);

      const saleMovements = await db.select().from(movements).where(eq(movements.kind, 'sale'));
      assert.equal(saleMovements.length, 1);
      assert.equal(saleMovements[0].toLocationId, null);
      assert.equal(saleMovements[0].qty, 3);
    } finally {
      await close();
    }
  });

  test('applies tax in basis points and rounds to the cent', async () => {
    const { db, close, item } = await stocked(10);
    try {
      const result = await recordSale(db, {
        lines: [{ itemId: item.id, qty: 1, unitPriceCents: 999 }],
        payments: [{ method: 'card', amountCents: 1079 }],
        taxRateBps: 800,
        actor: ACTOR,
      });

      // 999 * 8% = 79.92 → 80 cents
      assert.equal(result.totalCents, 1079);
      const [sale] = await db.select().from(sales);
      assert.equal(sale.subtotalCents, 999);
      assert.equal(sale.taxCents, 80);
      assert.equal(sale.taxRateBps, 800);
    } finally {
      await close();
    }
  });

  test('refuses to oversell and writes nothing', async () => {
    const { db, close, item, counter } = await stocked(2);
    try {
      await assert.rejects(
        recordSale(db, {
          lines: [{ itemId: item.id, qty: 5 }],
          payments: [{ method: 'cash', amountCents: 5000 }],
          actor: ACTOR,
        }),
        (err: unknown) => err instanceof DomainError && err.code === 'INSUFFICIENT_STOCK',
      );

      assert.equal(await balanceAt(db, item.id, counter.id), 2);
      assert.equal((await db.select().from(sales)).length, 0);
      assert.equal((await db.select().from(saleLines)).length, 0);
      assert.equal((await db.select().from(payments)).length, 0);
      assert.equal((await db.select().from(movements).where(eq(movements.kind, 'sale'))).length, 0);
    } finally {
      await close();
    }
  });

  test('rolls back the whole basket when one line is short', async () => {
    const { db, close, item, counter } = await stocked(5);
    try {
      const [second] = await db
        .insert((await import('../src/lib/db/schema')).items)
        .values({ sku: 'TEST-2', name: 'Second Widget', priceCents: 500, costCents: 100 })
        .returning();
      await receiveStock(db, { itemId: second.id, locationId: counter.id, qty: 1, actor: ACTOR });

      await assert.rejects(
        recordSale(db, {
          lines: [
            { itemId: item.id, qty: 1 },
            { itemId: second.id, qty: 4 },
          ],
          payments: [{ method: 'cash', amountCents: 3000 }],
          actor: ACTOR,
        }),
        (err: unknown) => err instanceof DomainError && err.code === 'INSUFFICIENT_STOCK',
      );

      assert.equal(await balanceAt(db, item.id, counter.id), 5, 'first line restored');
      assert.equal(await balanceAt(db, second.id, counter.id), 1, 'second line untouched');
      assert.equal((await db.select().from(sales)).length, 0);
    } finally {
      await close();
    }
  });

  test('requires payment to cover the total', async () => {
    const { db, close, item } = await stocked(5);
    try {
      await assert.rejects(
        recordSale(db, {
          lines: [{ itemId: item.id, qty: 2 }],
          payments: [{ method: 'cash', amountCents: 1500 }],
          actor: ACTOR,
        }),
        (err: unknown) => err instanceof DomainError && err.code === 'PAYMENT_INCOMPLETE',
      );
    } finally {
      await close();
    }
  });

  test('returns the same receipt for a repeated idempotency key', async () => {
    const { db, close, item, counter } = await stocked(10);
    try {
      const key = 'till-1-0001';
      const first = await recordSale(db, {
        lines: [{ itemId: item.id, qty: 2 }],
        payments: [{ method: 'cash', amountCents: 2000 }],
        actor: ACTOR,
        idempotencyKey: key,
      });
      const second = await recordSale(db, {
        lines: [{ itemId: item.id, qty: 2 }],
        payments: [{ method: 'cash', amountCents: 2000 }],
        actor: ACTOR,
        idempotencyKey: key,
      });

      assert.equal(second.duplicate, true);
      assert.equal(second.saleId, first.saleId);
      assert.equal((await db.select().from(sales)).length, 1);
      assert.equal(await balanceAt(db, item.id, counter.id), 8, 'charged once only');
    } finally {
      await close();
    }
  });

  test('gives change when the customer overpays', async () => {
    const { db, close, item } = await stocked(10);
    try {
      const result = await recordSale(db, {
        lines: [{ itemId: item.id, qty: 1 }],
        payments: [{ method: 'cash', amountCents: 5000 }],
        actor: ACTOR,
      });
      assert.equal(result.totalCents, 1000);
      assert.equal(result.changeCents, 4000);
    } finally {
      await close();
    }
  });

  test('voiding returns the goods and keeps the audit trail', async () => {
    const { db, close, item, counter } = await stocked(10);
    try {
      const sale = await recordSale(db, {
        lines: [{ itemId: item.id, qty: 4 }],
        payments: [{ method: 'card', amountCents: 4000 }],
        actor: ACTOR,
      });

      assert.equal(await balanceAt(db, item.id, counter.id), 6);
      await voidSale(db, sale.saleId, ACTOR, 'Customer cancelled');

      assert.equal(await balanceAt(db, item.id, counter.id), 10);

      const [row] = await db.select().from(sales).where(eq(sales.id, sale.saleId));
      assert.equal(row.status, 'void');
      assert.ok(row.voidedAt);

      const voidMovements = await db.select().from(movements).where(eq(movements.kind, 'void'));
      assert.equal(voidMovements.length, 1);
      assert.equal(voidMovements[0].qty, 4);

      // The original sale movement is still in the ledger.
      assert.equal((await db.select().from(movements).where(eq(movements.kind, 'sale'))).length, 1);
    } finally {
      await close();
    }
  });

  test('a sale cannot be voided twice', async () => {
    const { db, close, item } = await stocked(5);
    try {
      const sale = await recordSale(db, {
        lines: [{ itemId: item.id, qty: 1 }],
        payments: [{ method: 'cash', amountCents: 1000 }],
        actor: ACTOR,
      });
      await voidSale(db, sale.saleId, ACTOR, 'first');
      await assert.rejects(
        voidSale(db, sale.saleId, ACTOR, 'second'),
        (err: unknown) => err instanceof DomainError && err.code === 'ALREADY_VOID',
      );
    } finally {
      await close();
    }
  });

  test('merges duplicate lines for the same item', async () => {
    const { db, close, item, counter } = await stocked(10);
    try {
      const result = await recordSale(db, {
        lines: [
          { itemId: item.id, qty: 1 },
          { itemId: item.id, qty: 2 },
        ],
        payments: [{ method: 'cash', amountCents: 3000 }],
        actor: ACTOR,
      });
      assert.equal(result.totalCents, 3000);
      assert.equal((await db.select().from(saleLines)).length, 1);
      assert.equal(await balanceAt(db, item.id, counter.id), 7);
    } finally {
      await close();
    }
  });

  test('rejects an empty basket', async () => {
    const { db, close } = await stocked(1);
    try {
      await assert.rejects(
        recordSale(db, { lines: [], payments: [], actor: ACTOR }),
        (err: unknown) => err instanceof DomainError,
      );
    } finally {
      await close();
    }
  });
});
