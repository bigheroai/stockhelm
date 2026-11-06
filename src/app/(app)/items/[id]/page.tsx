import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDb } from '@/lib/db';
import { formatMoney, formatQty } from '@/lib/money';
import { formatDateTime } from '@/lib/format';
import { getItem } from '@/lib/queries';
import { ItemForm } from '../ItemForm';
import { toggleItemAction } from '@/app/actions/items';

export const dynamic = 'force-dynamic';

const KIND_LABEL: Record<string, string> = {
  receive: 'Received',
  transfer: 'Transfer',
  adjust: 'Count',
  sale: 'Sale',
  void: 'Void',
};

export default async function ItemDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  const detail = await getItem(db, id);
  if (!detail) notFound();

  const { item, levels, history, onHand } = detail;
  const low = item.reorderPoint > 0 && onHand <= item.reorderPoint;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="small muted mono" style={{ marginBottom: 4 }}>{item.sku}</div>
          <h1>{item.name}</h1>
          <p className="sub">
            {item.active ? (
              low ? <span className="badge badge-warn">Low stock</span> : <span className="badge badge-ok">Active</span>
            ) : (
              <span className="badge badge-neutral">Inactive</span>
            )}
            {item.barcode ? <span className="small muted mono" style={{ marginLeft: 10 }}>{item.barcode}</span> : null}
          </p>
        </div>
        <div className="head-actions">
          <Link href={`/receive?item=${item.id}`} className="btn btn-ghost">Receive</Link>
          <Link href={`/transfer?item=${item.id}`} className="btn btn-ghost">Transfer</Link>
          <Link href={`/count?item=${item.id}`} className="btn btn-ghost">Count</Link>
          <form action={toggleItemAction}>
            <input type="hidden" name="id" value={item.id} />
            <input type="hidden" name="active" value={item.active ? 'false' : 'true'} />
            <button type="submit" className={item.active ? 'btn btn-danger' : 'btn btn-primary'}>
              {item.active ? 'Deactivate' : 'Reactivate'}
            </button>
          </form>
        </div>
      </div>

      <div className="stats">
        <div className="stat">
          <div className="stat-label">On hand</div>
          <div className="stat-value">{formatQty(onHand, item.unit)}</div>
          <div className="stat-hint">across {levels.length} location{levels.length === 1 ? '' : 's'}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Sell price</div>
          <div className="stat-value">{formatMoney(item.priceCents)}</div>
          <div className="stat-hint">per {item.unit}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Stock value</div>
          <div className="stat-value">{formatMoney(onHand * item.costCents)}</div>
          <div className="stat-hint">at {formatMoney(item.costCents)} cost</div>
        </div>
        <div className="stat">
          <div className="stat-label">Reorder point</div>
          <div className="stat-value">{item.reorderPoint || '—'}</div>
          <div className="stat-hint">{low ? 'Needs replenishing' : 'Level is healthy'}</div>
        </div>
      </div>

      <div className="grid-2">
        <div className="stack">
          <section className="card">
            <div className="card-head"><h2>Stock by location</h2></div>
            <div className="card-body tight">
              {levels.length === 0 ? (
                <div className="empty">
                  <strong>No stock recorded</strong>
                  Receive a delivery to put units on the shelf.
                </div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr><th>Location</th><th>Kind</th><th className="num">Qty</th></tr>
                    </thead>
                    <tbody>
                      {levels.map((level) => (
                        <tr key={level.locationId}>
                          <td>
                            <span className="mono strong">{level.code}</span>
                            <div className="small muted">{level.name}</div>
                          </td>
                          <td><span className="badge badge-neutral">{level.kind}</span></td>
                          <td className="num strong">{formatQty(level.qty, item.unit)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <h2>Movement history</h2>
              <Link href="/movements" className="small muted">Full ledger →</Link>
            </div>
            <div className="card-body tight">
              {history.length === 0 ? (
                <div className="empty">Nothing has moved yet.</div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr><th>When</th><th>Type</th><th>Flow</th><th className="num">Qty</th><th>Note</th></tr>
                    </thead>
                    <tbody>
                      {history.map((row) => (
                        <tr key={row.id}>
                          <td className="small muted" style={{ whiteSpace: 'nowrap' }}>{formatDateTime(row.createdAt)}</td>
                          <td><span className="badge badge-neutral">{KIND_LABEL[row.kind] ?? row.kind}</span></td>
                          <td className="small mono">{row.fromCode ?? 'outside'} → {row.toCode ?? 'outside'}</td>
                          <td className="num">{row.qty}</td>
                          <td className="small muted">{row.note ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        </div>

        <div className="stack">
          <section className="card">
            <div className="card-head"><h2>Catalogue</h2></div>
            <div className="card-body">
              <div className="kv"><span className="k">SKU</span><span className="v mono">{item.sku}</span></div>
              <div className="kv"><span className="k">Barcode</span><span className="v mono">{item.barcode ?? '—'}</span></div>
              <div className="kv"><span className="k">Unit</span><span className="v">{item.unit}</span></div>
              <div className="kv"><span className="k">Cost</span><span className="v">{formatMoney(item.costCents)}</span></div>
              <div className="kv"><span className="k">Price</span><span className="v">{formatMoney(item.priceCents)}</span></div>
              <div className="kv"><span className="k">Margin</span><span className="v">{item.priceCents > 0 ? `${Math.round(((item.priceCents - item.costCents) / item.priceCents) * 100)}%` : '—'}</span></div>
              <div className="divider" />
              <p className="small muted" style={{ margin: 0 }}>{item.description || 'No description.'}</p>
            </div>
          </section>
        </div>
      </div>

      <div style={{ maxWidth: 620, marginTop: 18 }}>
        <ItemForm
          item={{
            id: item.id,
            sku: item.sku,
            name: item.name,
            description: item.description,
            barcode: item.barcode,
            unit: item.unit,
            priceCents: item.priceCents,
            costCents: item.costCents,
            reorderPoint: item.reorderPoint,
          }}
        />
      </div>
    </>
  );
}
