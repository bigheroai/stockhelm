'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getDb } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { isDomainError } from '@/lib/domain/errors';
import { createItem, setItemActive, updateItem, type ItemInput } from '@/lib/domain/items';
import { parseMoneyToCents } from '@/lib/money';
import { locations } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import type { ItemFormState, LocationState } from './state';

function readItem(formData: FormData) {
  const fieldErrors: Record<string, string> = {};
  const price = parseMoneyToCents(String(formData.get('price') ?? ''));
  const cost = parseMoneyToCents(String(formData.get('cost') ?? ''));

  if (price === null) fieldErrors.price = 'Enter a price like 12.50';
  if (cost === null) fieldErrors.cost = 'Enter a cost like 7.25';

  const reorderRaw = String(formData.get('reorderPoint') ?? '0').trim();
  const reorderPoint = reorderRaw === '' ? 0 : Number(reorderRaw);
  if (!Number.isInteger(reorderPoint) || reorderPoint < 0) {
    fieldErrors.reorderPoint = 'Reorder point must be zero or more';
  }

  const input: ItemInput = {
    sku: String(formData.get('sku') ?? ''),
    name: String(formData.get('name') ?? ''),
    description: String(formData.get('description') ?? ''),
    barcode: String(formData.get('barcode') ?? '') || null,
    unit: String(formData.get('unit') ?? 'ea'),
    priceCents: price ?? 0,
    costCents: cost ?? 0,
    reorderPoint: Number.isFinite(reorderPoint) ? reorderPoint : 0,
  };
  return { input, fieldErrors };
}

function fail(error: unknown): ItemFormState {
  if (isDomainError(error)) {
    if (error.code === 'DUPLICATE_SKU') {
      return { ok: false, error: null, fieldErrors: { sku: error.message } };
    }
    if (error.code === 'DUPLICATE_BARCODE') {
      return { ok: false, error: null, fieldErrors: { barcode: error.message } };
    }
    return { ok: false, error: error.message, fieldErrors: {} };
  }
  console.error('[item action]', error);
  return { ok: false, error: 'Could not save the item.', fieldErrors: {} };
}

export async function createItemAction(
  _prev: ItemFormState,
  formData: FormData,
): Promise<ItemFormState> {
  const { input, fieldErrors } = readItem(formData);
  if (Object.keys(fieldErrors).length > 0) return { ok: false, error: null, fieldErrors };

  let id: string;
  try {
    const db = await getDb();
    await requireUser(db);
    const item = await createItem(db, input);
    id = item.id;
  } catch (error) {
    return fail(error);
  }

  revalidatePath('/items');
  revalidatePath('/');
  redirect(`/items/${id}`);
}

export async function updateItemAction(
  _prev: ItemFormState,
  formData: FormData,
): Promise<ItemFormState> {
  const id = String(formData.get('id') ?? '');
  const { input, fieldErrors } = readItem(formData);
  if (Object.keys(fieldErrors).length > 0) return { ok: false, error: null, fieldErrors };

  try {
    const db = await getDb();
    await requireUser(db);
    await updateItem(db, id, input);
  } catch (error) {
    return fail(error);
  }

  revalidatePath('/items');
  revalidatePath(`/items/${id}`);
  return { ok: true, error: null, fieldErrors: {} };
}

export async function toggleItemAction(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '');
  const active = String(formData.get('active') ?? '') === 'true';
  const db = await getDb();
  await requireUser(db);
  await setItemActive(db, id, active);
  revalidatePath('/items');
  revalidatePath(`/items/${id}`);
}

export async function createLocationAction(
  _prev: LocationState,
  formData: FormData,
): Promise<LocationState> {
  const code = String(formData.get('code') ?? '').trim().toUpperCase();
  const name = String(formData.get('name') ?? '').trim();
  const kind = String(formData.get('kind') ?? 'bin');

  if (!code || !name) return { ok: false, error: 'Code and name are required.' };
  if (!/^[A-Z0-9][A-Z0-9-]*$/.test(code)) {
    return { ok: false, error: 'Codes may contain letters, numbers and dashes.' };
  }
  if (!['bin', 'counter', 'staging', 'virtual'].includes(kind)) {
    return { ok: false, error: 'Unknown location kind.' };
  }

  try {
    const db = await getDb();
    await requireUser(db);
    const [existing] = await db.select().from(locations).where(eq(locations.code, code)).limit(1);
    if (existing) return { ok: false, error: `Location ${code} already exists.` };
    await db.insert(locations).values({ code, name, kind: kind as 'bin' });
  } catch (error) {
    if (isDomainError(error)) return { ok: false, error: error.message };
    console.error('[location action]', error);
    return { ok: false, error: 'Could not create the location.' };
  }

  revalidatePath('/settings');
  revalidatePath('/receive');
  revalidatePath('/transfer');
  return { ok: true, error: null };
}
