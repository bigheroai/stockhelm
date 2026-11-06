import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { saleLocationId, searchForSale } from '@/lib/queries';

export const dynamic = 'force-dynamic';

/** Powers the counter search box. Returns only what is sellable right now. */
export async function GET(request: Request) {
  const db = await getDb();
  const user = await getCurrentUser(db);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const q = url.searchParams.get('q') ?? '';

  const locationId = await saleLocationId(db);
  if (!locationId) {
    return NextResponse.json(
      { error: 'No sales location is configured. Create a location with kind "counter".' },
      { status: 409 },
    );
  }

  const rows = await searchForSale(db, q, locationId);
  return NextResponse.json({
    items: rows.map((r) => ({
      id: r.id,
      sku: r.sku,
      name: r.name,
      unit: r.unit,
      priceCents: r.priceCents,
      qty: r.qty,
    })),
  });
}
