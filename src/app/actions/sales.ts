'use server';

import { revalidatePath } from 'next/cache';
import { getDb } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { isDomainError } from '@/lib/domain/errors';
import { voidSale } from '@/lib/domain/sales';
import type { VoidState } from './state';

export async function voidSaleAction(_prev: VoidState, formData: FormData): Promise<VoidState> {
  const saleId = String(formData.get('saleId') ?? '');
  const reason = String(formData.get('reason') ?? '');

  try {
    const db = await getDb();
    const user = await requireUser(db);
    await voidSale(db, saleId, { id: user.id }, reason);
  } catch (error) {
    if (isDomainError(error)) return { ok: false, error: error.message };
    console.error('[void sale]', error);
    return { ok: false, error: 'Could not void the sale.' };
  }

  revalidatePath('/sales');
  revalidatePath(`/sales/${saleId}`);
  revalidatePath('/');
  revalidatePath('/movements');
  revalidatePath('/items');
  return { ok: true, error: null };
}
