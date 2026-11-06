import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { recordSale, type SaleLineInput, type SalePaymentInput } from '@/lib/domain/sales';
import { isDomainError } from '@/lib/domain/errors';

export const dynamic = 'force-dynamic';

interface Body {
  lines?: SaleLineInput[];
  payments?: SalePaymentInput[];
  customerName?: string;
  note?: string;
  idempotencyKey?: string;
}

/**
 * Counter checkout endpoint. Kept as a plain JSON route (rather than a server
 * action) so handhelds and a future offline client can call the same contract.
 */
export async function POST(request: Request) {
  const db = await getDb();
  const user = await getCurrentUser(db);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  try {
    const result = await recordSale(db, {
      lines: body.lines ?? [],
      payments: body.payments ?? [],
      customerName: body.customerName,
      note: body.note,
      actor: { id: user.id },
      idempotencyKey: body.idempotencyKey ?? null,
    });
    return NextResponse.json(result, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    if (isDomainError(error)) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error('[pos sale]', error);
    return NextResponse.json({ error: 'Could not complete the sale.' }, { status: 500 });
  }
}
