import { and, eq } from 'drizzle-orm';
import Link from 'next/link';
import { getDb } from '@/lib/db';
import { items, stockLevels } from '@/lib/db/schema';
import { listActiveBins, listItems } from '@/lib/queries';
import { CountForm } from './CountForm';

export const dynamic = 'force-dynamic';

export default async function CountPage({
  searchParams,
}: {
  searchParams: Promise<{ item?: string; location?: string }>;
}) {
  const { item: itemId, location: locationId } = await searchParams;
  const db = await getDb();
  const [allItems, locations] = await Promise.all([listItems(db, ''), listActiveBins(db)]);

  const item = itemId ? allItems.find((i) => i.id === itemId) : undefined;
  const location = locationId ? locations.find((l) => l.id === locationId) : undefined;

  let currentQty = 0;
  if (item && location) {
    const [row] = await db
      .select({ qty: stockLevels.qty })
      .from(stockLevels)
      .where(and(eq(stockLevels.itemId, item.id), eq(stockLevels.locationId, location.id)))
      .limit(1);
    currentQty = row?.qty ?? 0;
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Cycle count</h1>
          <p className="sub">Verify what is on the shelf and post the difference to the ledger.</p>
        </div>
      </div>

      <div className="grid-2">
        <div className="stack">
          <section className="card">
            <div className="card-head"><h2>1 · Pick a shelf</h2></div>
            <div className="card-body">
              <form action="/count" method="get">
                <div className="field-row">
                  <div className="field">
                    <label htmlFor="item">Item</label>
                    <select id="item" name="item" defaultValue={itemId ?? ''} required>
                      <option value="" disabled>Choose an item…</option>
                      {allItems.map((i) => (
                        <option key={i.id} value={i.id}>{i.sku} — {i.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="location">Location</label>
                    <select id="location" name="location" defaultValue={locationId ?? ''} required>
                      <option value="" disabled>Choose a location…</option>
                      {locations.map((l) => (
                        <option key={l.id} value={l.id}>{l.code} — {l.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <button type="submit" className="btn btn-ghost">Load shelf</button>
              </form>
            </div>
          </section>

          {item && location ? (
            <CountForm
              itemId={item.id}
              locationId={location.id}
              currentQty={currentQty}
              unit={item.unit}
            />
          ) : (
            <section className="card">
              <div className="empty">
                <strong>Nothing selected yet</strong>
                Choose an item and a location above to load the current balance.
              </div>
            </section>
          )}
        </div>

        <section className="card">
          <div className="card-head"><h2>Why count</h2></div>
          <div className="card-body">
            <p className="small muted" style={{ marginTop: 0 }}>
              A count sets the balance to what you physically found, and writes the difference — positive or
              negative — as an <span className="code-chip">adjust</span> movement with your reason attached.
            </p>
            <p className="small muted">
              Nothing is deleted. The original receipts, transfers and sales stay in the ledger, so you can
              always reconstruct how a bin got to its current number.
            </p>
            <div className="divider" />
            <Link href="/movements?kind=adjust" className="small">View past adjustments →</Link>
          </div>
        </section>
      </div>
    </>
  );
}
