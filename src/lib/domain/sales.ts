import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '@/lib/db';
import { items, locations, movements, payments, saleLines, sales } from '@/lib/db/schema';
import { config } from '@/lib/config';
import { DomainError, invalid, notFound } from './errors';
import { applyDelta, extractRows, resolveSaleLocationId, type Actor } from './stock';

export interface SaleLineInput {
  itemId: string;
  qty: number;
  /** Defaults to the item's list price when omitted. */
  unitPriceCents?: number;
}

export interface SalePaymentInput {
  method: 'cash' | 'card' | 'transfer';
  amountCents: number;
}

export interface RecordSaleInput {
  lines: SaleLineInput[];
  payments?: SalePaymentInput[];
  customerName?: string;
  note?: string;
  taxRateBps?: number;
  /** Overrides the configured counter location. */
  locationId?: string;
  actor: Actor;
  idempotencyKey?: string | null;
}

export interface RecordSaleResult {
  saleId: string;
  number: string;
  totalCents: number;
  changeCents: number;
  duplicate: boolean;
}

function mergeLines(lines: SaleLineInput[]): SaleLineInput[] {
  const byItem = new Map<string, SaleLineInput>();
  for (const line of lines) {
    if (!Number.isInteger(line.qty) || line.qty <= 0) {
      throw invalid('Every line needs a whole quantity greater than zero');
    }
    const existing = byItem.get(line.itemId);
    if (existing) {
      existing.qty += line.qty;
      if (line.unitPriceCents !== undefined) existing.unitPriceCents = line.unitPriceCents;
    } else {
      byItem.set(line.itemId, { ...line });
    }
  }
  const merged = [...byItem.values()];
  // Deterministic order keeps concurrent tills from deadlocking on row locks.
  merged.sort((a, b) => a.itemId.localeCompare(b.itemId));
  return merged;
}

async function nextSaleNumber(db: Db): Promise<string> {
  const result = await db.execute(sql`select nextval('sale_number_seq') as n`);
  const [row] = extractRows(result);
  if (!row) throw new DomainError('SEQUENCE_FAILED', 'Could not allocate a receipt number', 500);
  return `S-${String(row.n)}`;
}

/**
 * Records a counter sale: prices the basket, takes stock out of the sales
 * location, writes the ledger entries, and captures payment — all in one
 * transaction. Supports a client-supplied idempotency key so a double-tapped
 * "Pay" button cannot produce two receipts.
 */
export async function recordSale(db: Db, input: RecordSaleInput): Promise<RecordSaleResult> {
  if (!input.lines?.length) throw invalid('Add at least one item to the sale');
  const merged = mergeLines(input.lines);

  return db.transaction(async (tx) => {
    if (input.idempotencyKey) {
      const [dupe] = await tx
        .select()
        .from(sales)
        .where(eq(sales.idempotencyKey, input.idempotencyKey))
        .limit(1);
      if (dupe) {
        return {
          saleId: dupe.id,
          number: dupe.number,
          totalCents: dupe.totalCents,
          changeCents: 0,
          duplicate: true,
        };
      }
    }

    const itemIds = merged.map((l) => l.itemId);
    const itemRows = await tx.select().from(items).where(inArray(items.id, itemIds));
    const itemById = new Map(itemRows.map((row) => [row.id, row]));
    if (itemRows.length !== itemIds.length) {
      throw notFound('One of the items in the sale');
    }

    const priced = merged.map((line) => {
      const item = itemById.get(line.itemId)!;
      if (!item.active) throw invalid(`"${item.name}" is not available for sale`);
      const unitPriceCents = line.unitPriceCents ?? item.priceCents;
      if (!Number.isInteger(unitPriceCents) || unitPriceCents < 0) {
        throw invalid(`Invalid price for "${item.name}"`);
      }
      return {
        itemId: line.itemId,
        name: item.name,
        qty: line.qty,
        unitPriceCents,
        lineTotalCents: unitPriceCents * line.qty,
      };
    });

    const subtotalCents = priced.reduce((sum, l) => sum + l.lineTotalCents, 0);
    const taxRateBps = input.taxRateBps ?? config.taxRateBps;
    const taxCents = Math.round((subtotalCents * taxRateBps) / 10_000);
    const totalCents = subtotalCents + taxCents;

    const locationId = input.locationId ?? (await resolveSaleLocationId(tx));

    const paymentsIn = input.payments ?? [];
    const paidCents = paymentsIn.reduce((sum, p) => sum + p.amountCents, 0);
    if (totalCents > 0 && paidCents < totalCents) {
      throw new DomainError(
        'PAYMENT_INCOMPLETE',
        `Payment of ${(paidCents / 100).toFixed(2)} does not cover the total`,
        409,
      );
    }
    for (const p of paymentsIn) {
      if (!Number.isInteger(p.amountCents) || p.amountCents <= 0) {
        throw invalid('Payment amounts must be positive');
      }
    }

    const number = await nextSaleNumber(tx);
    const now = new Date();

    const [sale] = await tx
      .insert(sales)
      .values({
        number,
        customerName: input.customerName?.trim() ?? '',
        status: 'paid',
        subtotalCents,
        taxCents,
        totalCents,
        taxRateBps,
        note: input.note?.trim() ?? '',
        actorId: input.actor?.id ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
        paidAt: now,
      })
      .returning();

    await tx.insert(saleLines).values(
      priced.map((line) => ({
        saleId: sale.id,
        itemId: line.itemId,
        qty: line.qty,
        unitPriceCents: line.unitPriceCents,
        lineTotalCents: line.lineTotalCents,
      })),
    );

    if (paymentsIn.length > 0) {
      await tx.insert(payments).values(
        paymentsIn.map((p) => ({
          saleId: sale.id,
          method: p.method,
          amountCents: p.amountCents,
        })),
      );
    }

    for (const line of priced) {
      try {
        await applyDelta(tx, line.itemId, locationId, -line.qty);
      } catch (err) {
        if (err instanceof DomainError && err.code === 'INSUFFICIENT_STOCK') {
          throw new DomainError(
            'INSUFFICIENT_STOCK',
            `Not enough "${line.name}" at the counter to sell ${line.qty}`,
            409,
          );
        }
        throw err;
      }
      await tx.insert(movements).values({
        itemId: line.itemId,
        fromLocationId: locationId,
        toLocationId: null,
        qty: line.qty,
        kind: 'sale',
        refType: 'sale',
        refId: sale.id,
        actorId: input.actor?.id ?? null,
      });
    }

    return {
      saleId: sale.id,
      number: sale.number,
      totalCents,
      changeCents: Math.max(0, paidCents - totalCents),
      duplicate: false,
    };
  });
}

/**
 * Reverses a paid sale. Every stock movement is read back from the ledger and
 * mirrored, so a void always restores exactly what the sale removed.
 */
export async function voidSale(db: Db, saleId: string, actor: Actor, reason: string) {
  return db.transaction(async (tx) => {
    const [sale] = await tx.select().from(sales).where(eq(sales.id, saleId)).limit(1).for('update');
    if (!sale) throw notFound('Sale');
    if (sale.status === 'void') throw new DomainError('ALREADY_VOID', 'This sale is already void', 409);
    if (sale.status !== 'paid') throw invalid('Only paid sales can be voided');

    const sold = await tx
      .select()
      .from(movements)
      .where(and(eq(movements.refType, 'sale'), eq(movements.refId, saleId), eq(movements.kind, 'sale')));

    for (const movement of sold) {
      if (!movement.fromLocationId) continue;
      await applyDelta(tx, movement.itemId, movement.fromLocationId, movement.qty);
      await tx.insert(movements).values({
        itemId: movement.itemId,
        fromLocationId: null,
        toLocationId: movement.fromLocationId,
        qty: movement.qty,
        kind: 'void',
        refType: 'sale',
        refId: saleId,
        note: reason.trim() || 'Sale voided',
        actorId: actor?.id ?? null,
      });
    }

    await tx
      .update(sales)
      .set({ status: 'void', voidedAt: new Date(), note: reason.trim() || sale.note })
      .where(eq(sales.id, saleId));

    return { saleId, restored: sold.length };
  });
}

export async function getSaleDetail(db: Db, saleId: string) {
  const [sale] = await db.select().from(sales).where(eq(sales.id, saleId)).limit(1);
  if (!sale) throw notFound('Sale');
  const lines = await db
    .select({
      id: saleLines.id,
      itemId: saleLines.itemId,
      sku: items.sku,
      name: items.name,
      unit: items.unit,
      qty: saleLines.qty,
      unitPriceCents: saleLines.unitPriceCents,
      lineTotalCents: saleLines.lineTotalCents,
    })
    .from(saleLines)
    .innerJoin(items, eq(items.id, saleLines.itemId))
    .where(eq(saleLines.saleId, saleId));
  const paid = await db.select().from(payments).where(eq(payments.saleId, saleId));
  const [loc] = await db.select({ code: locations.code }).from(locations).limit(1);
  return { sale, lines, payments: paid, locationCode: loc?.code ?? null };
}
