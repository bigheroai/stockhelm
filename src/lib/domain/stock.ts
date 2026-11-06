import { and, eq, gte, sql } from 'drizzle-orm';
import type { Db } from '@/lib/db';
import { items, locations, movements, stockLevels } from '@/lib/db/schema';
import { config } from '@/lib/config';
import { DomainError, invalid, notFound } from './errors';

export type Actor = { id: string } | null;

function assertPositiveInt(value: number, field: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw invalid(`${field} must be a whole number greater than zero`);
  }
}

/**
 * Applies `delta` to the balance row for (item, location).
 *
 * Negative deltas use a guarded UPDATE (`qty >= n`) so that two concurrent
 * pickers can never take the same unit twice: the loser matches zero rows and
 * the whole transaction fails. Inserts of new balance rows are upserted so a
 * fresh bin does not need to be pre-created.
 */
export async function applyDelta(
  db: Db,
  itemId: string,
  locationId: string,
  delta: number,
): Promise<void> {
  if (delta === 0) return;

  if (delta > 0) {
    await db
      .insert(stockLevels)
      .values({ itemId, locationId, qty: delta })
      .onConflictDoUpdate({
        target: [stockLevels.itemId, stockLevels.locationId],
        set: { qty: sql`${stockLevels.qty} + ${delta}`, updatedAt: new Date() },
      });
    return;
  }

  const needed = -delta;
  const updated = await db
    .update(stockLevels)
    .set({ qty: sql`${stockLevels.qty} - ${needed}`, updatedAt: new Date() })
    .where(
      and(
        eq(stockLevels.itemId, itemId),
        eq(stockLevels.locationId, locationId),
        gte(stockLevels.qty, needed),
      ),
    )
    .returning({ qty: stockLevels.qty });

  if (updated.length === 0) {
    throw new DomainError(
      'INSUFFICIENT_STOCK',
      'Not enough stock in that bin for this operation',
      409,
    );
  }
}

export async function resolveSaleLocationId(db: Db): Promise<string> {
  const [loc] = await db
    .select({ id: locations.id })
    .from(locations)
    .where(and(eq(locations.code, config.saleLocationCode), eq(locations.active, true)))
    .limit(1);
  if (!loc) {
    throw new DomainError(
      'NO_SALE_LOCATION',
      `Sales location "${config.saleLocationCode}" is missing or inactive. Create it under Settings.`,
      500,
    );
  }
  return loc.id;
}

async function assertItemExists(db: Db, itemId: string): Promise<void> {
  const [row] = await db.select({ id: items.id }).from(items).where(eq(items.id, itemId)).limit(1);
  if (!row) throw notFound('Item');
}

async function assertLocationExists(db: Db, locationId: string): Promise<void> {
  const [row] = await db
    .select({ id: locations.id })
    .from(locations)
    .where(eq(locations.id, locationId))
    .limit(1);
  if (!row) throw notFound('Location');
}

export interface ReceiveInput {
  itemId: string;
  locationId: string;
  qty: number;
  note?: string;
  actor: Actor;
  idempotencyKey?: string | null;
}

/** Stock arriving from outside the warehouse (supplier delivery, returns). */
export async function receiveStock(db: Db, input: ReceiveInput) {
  assertPositiveInt(input.qty, 'Quantity');

  return db.transaction(async (tx) => {
    if (input.idempotencyKey) {
      const [dupe] = await tx
        .select({ id: movements.id })
        .from(movements)
        .where(eq(movements.idempotencyKey, input.idempotencyKey))
        .limit(1);
      if (dupe) return { movementId: dupe.id, duplicate: true as const };
    }

    await assertItemExists(tx, input.itemId);
    await assertLocationExists(tx, input.locationId);
    await applyDelta(tx, input.itemId, input.locationId, input.qty);

    const [movement] = await tx
      .insert(movements)
      .values({
        itemId: input.itemId,
        fromLocationId: null,
        toLocationId: input.locationId,
        qty: input.qty,
        kind: 'receive',
        note: input.note ?? null,
        actorId: input.actor?.id ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
      })
      .returning({ id: movements.id });

    return { movementId: movement.id, duplicate: false as const };
  });
}

export interface TransferInput {
  itemId: string;
  fromLocationId: string;
  toLocationId: string;
  qty: number;
  note?: string;
  actor: Actor;
  idempotencyKey?: string | null;
}

/** Moves stock between two real locations inside the warehouse. */
export async function transferStock(db: Db, input: TransferInput) {
  assertPositiveInt(input.qty, 'Quantity');
  if (input.fromLocationId === input.toLocationId) {
    throw invalid('Source and destination must be different locations');
  }

  return db.transaction(async (tx) => {
    if (input.idempotencyKey) {
      const [dupe] = await tx
        .select({ id: movements.id })
        .from(movements)
        .where(eq(movements.idempotencyKey, input.idempotencyKey))
        .limit(1);
      if (dupe) return { movementId: dupe.id, duplicate: true as const };
    }

    await assertItemExists(tx, input.itemId);
    await assertLocationExists(tx, input.fromLocationId);
    await assertLocationExists(tx, input.toLocationId);

    // Decrement first: a failure here must abort before stock is duplicated.
    await applyDelta(tx, input.itemId, input.fromLocationId, -input.qty);
    await applyDelta(tx, input.itemId, input.toLocationId, input.qty);

    const [movement] = await tx
      .insert(movements)
      .values({
        itemId: input.itemId,
        fromLocationId: input.fromLocationId,
        toLocationId: input.toLocationId,
        qty: input.qty,
        kind: 'transfer',
        note: input.note ?? null,
        actorId: input.actor?.id ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
      })
      .returning({ id: movements.id });

    return { movementId: movement.id, duplicate: false as const };
  });
}

export interface AdjustInput {
  itemId: string;
  locationId: string;
  /** The quantity actually counted on the shelf. */
  countedQty: number;
  reason: string;
  actor: Actor;
}

/**
 * Cycle count: sets the shelf to the counted quantity and records the
 * difference. Locks the balance row so a concurrent pick cannot land between
 * the read and the write.
 */
export async function adjustStock(db: Db, input: AdjustInput) {
  if (!Number.isInteger(input.countedQty) || input.countedQty < 0) {
    throw invalid('Counted quantity must be zero or more');
  }
  if (!input.reason.trim()) throw invalid('A reason is required for a stock adjustment');

  return db.transaction(async (tx) => {
    await assertItemExists(tx, input.itemId);
    await assertLocationExists(tx, input.locationId);

    const [current] = await tx
      .select({ qty: stockLevels.qty })
      .from(stockLevels)
      .where(and(eq(stockLevels.itemId, input.itemId), eq(stockLevels.locationId, input.locationId)))
      .for('update');

    const currentQty = current?.qty ?? 0;
    const delta = input.countedQty - currentQty;
    if (delta === 0) {
      return { movementId: null, delta: 0, currentQty };
    }

    await tx
      .insert(stockLevels)
      .values({ itemId: input.itemId, locationId: input.locationId, qty: input.countedQty })
      .onConflictDoUpdate({
        target: [stockLevels.itemId, stockLevels.locationId],
        set: { qty: input.countedQty, updatedAt: new Date() },
      });

    const [movement] = await tx
      .insert(movements)
      .values({
        itemId: input.itemId,
        fromLocationId: delta < 0 ? input.locationId : null,
        toLocationId: delta > 0 ? input.locationId : null,
        qty: Math.abs(delta),
        kind: 'adjust',
        note: input.reason.trim(),
        actorId: input.actor?.id ?? null,
      })
      .returning({ id: movements.id });

    return { movementId: movement.id, delta, currentQty };
  });
}

/**
 * Recomputes every balance from the ledger. Used by the integrity check and
 * available as a break-glass repair if a bug ever corrupts the cache table.
 */
export async function rebuildStockLevels(db: Db): Promise<number> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`delete from stock_levels`);
    const result = await tx.execute(sql`
      insert into stock_levels (item_id, location_id, qty, updated_at)
      select item_id, location_id, sum(delta)::int, now()
      from (
        select item_id, to_location_id as location_id, qty as delta
          from movements where to_location_id is not null
        union all
        select item_id, from_location_id as location_id, -qty as delta
          from movements where from_location_id is not null
      ) flows
      group by item_id, location_id
      returning 1
    `);
    const rows = extractRows(result);
    return rows.length;
  });
}

/** Rows differ between drivers (postgres.js returns an array, PGlite an object). */
export function extractRows(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  const maybe = result as { rows?: Record<string, unknown>[] };
  return maybe?.rows ?? [];
}
