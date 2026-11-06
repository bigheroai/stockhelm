import Link from 'next/link';
import { getDb } from '@/lib/db';
import { config } from '@/lib/config';
import { saleLocationId, stockAtLocation } from '@/lib/queries';
import { PosClient } from './PosClient';

export const dynamic = 'force-dynamic';

export default async function PosPage() {
  const db = await getDb();
  const locationId = await saleLocationId(db);

  if (!locationId) {
    return (
      <>
        <div className="page-head">
          <div>
            <h1>Counter</h1>
            <p className="sub">The till needs a location to sell from.</p>
          </div>
        </div>
        <div className="card">
          <div className="empty">
            <strong>No counter location configured</strong>
            Create a location with the code <span className="code-chip">{config.saleLocationCode}</span> and kind{' '}
            <span className="code-chip">counter</span>, then move stock into it.
            <div style={{ marginTop: 14 }}>
              <Link href="/settings" className="btn btn-primary">Open settings</Link>
            </div>
          </div>
        </div>
      </>
    );
  }

  const products = await stockAtLocation(db, locationId);

  return (
    <>
      <div className="page-head no-print">
        <div>
          <h1>Counter</h1>
          <p className="sub">Scan to sell. Stock leaves the counter location the moment a sale is paid.</p>
        </div>
      </div>

      <PosClient
        initialItems={products.map((p) => ({
          id: p.itemId,
          sku: p.sku,
          name: p.name,
          unit: p.unit,
          priceCents: p.priceCents,
          qty: p.qty,
        }))}
        taxRateBps={config.taxRateBps}
      />
    </>
  );
}
