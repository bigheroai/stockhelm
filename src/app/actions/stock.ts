'use server';

import { revalidatePath } from 'next/cache';
import { getDb } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { isDomainError } from '@/lib/domain/errors';
import { adjustStock, receiveStock, transferStock, rebuildStockLevels } from '@/lib/domain/stock';
import type { ActionState } from './state';

function fail(error: unknown): ActionState {
  if (isDomainError(error)) return { ok: false, error: error.message, message: null };
  console.error('[action failed]', error);
  return { ok: false, error: 'Something went wrong. Nothing was saved.', message: null };
}

function text(formData: FormData, key: string): string {
  return String(formData.get(key) ?? '').trim();
}

function int(formData: FormData, key: string, fallback = 0): number {
  const raw = text(formData, key);
  const n = Number(raw);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

export async function receiveAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const db = await getDb();
    const user = await requireUser(db);
    const result = await receiveStock(db, {
      itemId: text(formData, 'itemId'),
      locationId: text(formData, 'locationId'),
      qty: int(formData, 'qty'),
      note: text(formData, 'note') || undefined,
      actor: { id: user.id },
      idempotencyKey: text(formData, 'idempotencyKey') || null,
    });
    revalidatePath('/');
    revalidatePath('/items');
    revalidatePath('/movements');
    revalidatePath('/receive');
    return {
      ok: true,
      error: null,
      message: result.duplicate ? 'That receipt was already recorded.' : 'Stock received.',
    };
  } catch (error) {
    return fail(error);
  }
}

export async function transferAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const db = await getDb();
    const user = await requireUser(db);
    const result = await transferStock(db, {
      itemId: text(formData, 'itemId'),
      fromLocationId: text(formData, 'fromLocationId'),
      toLocationId: text(formData, 'toLocationId'),
      qty: int(formData, 'qty'),
      note: text(formData, 'note') || undefined,
      actor: { id: user.id },
      idempotencyKey: text(formData, 'idempotencyKey') || null,
    });
    revalidatePath('/');
    revalidatePath('/items');
    revalidatePath('/movements');
    revalidatePath('/transfer');
    return {
      ok: true,
      error: null,
      message: result.duplicate ? 'That transfer was already recorded.' : 'Stock transferred.',
    };
  } catch (error) {
    return fail(error);
  }
}

export async function countAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const db = await getDb();
    const user = await requireUser(db);
    const result = await adjustStock(db, {
      itemId: text(formData, 'itemId'),
      locationId: text(formData, 'locationId'),
      countedQty: int(formData, 'countedQty'),
      reason: text(formData, 'reason'),
      actor: { id: user.id },
    });
    revalidatePath('/');
    revalidatePath('/items');
    revalidatePath('/movements');
    revalidatePath('/count');
    return {
      ok: true,
      error: null,
      message:
        result.delta === 0
          ? 'Shelf count matches the system. No adjustment needed.'
          : `Adjusted by ${result.delta > 0 ? '+' : ''}${result.delta}.`,
    };
  } catch (error) {
    return fail(error);
  }
}

/**
 * Break-glass repair: recompute every balance from the append-only ledger.
 * Safe to run at any time because the ledger is the source of truth.
 */
export async function reconcileAction(_prev: ActionState, _formData: FormData): Promise<ActionState> {
  try {
    const db = await getDb();
    await requireUser(db);
    const rows = await rebuildStockLevels(db);
    revalidatePath('/', 'layout');
    return {
      ok: true,
      error: null,
      message: `Rebuilt ${rows} balance row${rows === 1 ? '' : 's'} from the ledger.`,
    };
  } catch (error) {
    return fail(error);
  }
}
