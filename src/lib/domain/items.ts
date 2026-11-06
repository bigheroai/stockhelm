import { eq } from 'drizzle-orm';
import type { Db } from '@/lib/db';
import { items } from '@/lib/db/schema';
import { DomainError, invalid, notFound } from './errors';

export interface ItemInput {
  sku: string;
  name: string;
  description?: string;
  barcode?: string | null;
  unit?: string;
  priceCents: number;
  costCents: number;
  reorderPoint?: number;
}

function normalise(input: ItemInput) {
  const sku = input.sku.trim().toUpperCase();
  const name = input.name.trim();
  const barcode = input.barcode?.trim() || null;
  if (!sku) throw invalid('SKU is required');
  if (!name) throw invalid('Item name is required');
  if (sku.includes(' ')) throw invalid('SKU cannot contain spaces');
  if (!Number.isInteger(input.priceCents) || input.priceCents < 0) {
    throw invalid('Sell price must be zero or more');
  }
  if (!Number.isInteger(input.costCents) || input.costCents < 0) {
    throw invalid('Cost must be zero or more');
  }
  return {
    sku,
    name,
    barcode,
    description: input.description?.trim() ?? '',
    unit: input.unit?.trim() || 'ea',
    priceCents: input.priceCents,
    costCents: input.costCents,
    reorderPoint: Math.max(0, Math.trunc(input.reorderPoint ?? 0)),
  };
}

function rethrowDuplicate(err: unknown): never {
  const code = (err as { code?: string })?.code;
  const message = String((err as Error)?.message ?? '');
  if (code === '23505' || /duplicate key|unique constraint/i.test(message)) {
    if (/barcode/i.test(message)) {
      throw new DomainError('DUPLICATE_BARCODE', 'That barcode is already assigned to another item', 409);
    }
    throw new DomainError('DUPLICATE_SKU', 'An item with that SKU already exists', 409);
  }
  throw err;
}

export async function createItem(db: Db, input: ItemInput) {
  const values = normalise(input);
  try {
    const [row] = await db.insert(items).values(values).returning();
    return row;
  } catch (err) {
    rethrowDuplicate(err);
  }
}

export async function updateItem(db: Db, id: string, input: ItemInput) {
  const values = normalise(input);
  try {
    const [row] = await db
      .update(items)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(items.id, id))
      .returning();
    if (!row) throw notFound('Item');
    return row;
  } catch (err) {
    if (err instanceof DomainError) throw err;
    rethrowDuplicate(err);
  }
}

export async function setItemActive(db: Db, id: string, active: boolean) {
  const [row] = await db
    .update(items)
    .set({ active, updatedAt: new Date() })
    .where(eq(items.id, id))
    .returning();
  if (!row) throw notFound('Item');
  return row;
}

/** Scanner lookup: exact barcode first, then exact SKU. */
export async function findItemByCode(db: Db, code: string) {
  const needle = code.trim();
  if (!needle) return null;
  const [byBarcode] = await db.select().from(items).where(eq(items.barcode, needle)).limit(1);
  if (byBarcode) return byBarcode;
  const [bySku] = await db.select().from(items).where(eq(items.sku, needle.toUpperCase())).limit(1);
  return bySku ?? null;
}
