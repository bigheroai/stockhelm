import Link from 'next/link';
import { getDb } from '@/lib/db';
import { config } from '@/lib/config';
import { formatMoney } from '@/lib/money';
import { relative } from '@/lib/format';
import { dashboardMetrics, listSales, lowStock, recentMovements, topSellers } from '@/lib/queries';
import { ledgerDrift } from '@/lib/queries';

export const dynamic = 'force-dynamic';

const KIND_LABEL: Record<string, string> = {
  receive: 'Received',
  transfer: 'Transfer',
  adjust: 'Count',
  sale: 'Sale',
  void: 'Void',
};

export default async function DashboardPage() {
  const db = await getDb();
  const [metrics, low, movements, sellers, sales, drift] = await Promise.all([
    dashboardMetrics(db),
    lowStock(db, 6),
    recentMovements(db, 8),
    topSellers(db, 5),
    listSales(db, 5),
    ledgerDrift(db),
  ]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Overview</h1>
          <p className="sub">{config.companyName} · warehouse and counter</p>
        </div>
        <div className="head-actions">
          <Link href="/receive" className="btn btn-ghost">Receive stock</Link>
          <Link href="/pos" className="btn btn-primary">Open counter</Link>
        </div>
      </div>

      {drift.mismatched > 0 ? (
        <div className="alert alert-error">
          <strong>Ledger check failed.</strong> {drift.mismatched} balance row(s) disagree with the movement
          ledger. Open <Link href="/settings" style={{ textDecoration: 'underline' }}>Settings</Link> to rebuild.
        </div>
      ) : null}

      <div className="stats">
        <div className="stat">
          <div className="stat-label">Sales today</div>
          <div className="stat-value">{formatMoney(metrics.salesTodayCents)}</div>
          <div className="stat-hint">{metrics.salesTodayCount} transaction{metrics.salesTodayCount === 1 ? '' : 's'}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Stock on hand</div>
          <div className="stat-value">{metrics.unitsOnHand.toLocaleString()}</div>
          <div className="stat-hint">units across all bins</div>
        </div>
        <div className="stat">
          <div className="stat-label">Inventory value</div>
          <div className="stat-value">{formatMoney(metrics.stockValueCents)}</div>
          <div className="stat-hint">at cost</div>
        </div>
        <div className="stat">
          <div className="stat-label">Active SKUs</div>
          <div className="stat-value">{metrics.activeSkus}</div>
          <div className="stat-hint">{metrics.movementCount.toLocaleString()} ledger entries</div>
        </div>
      </div>

      <div className="grid-2">
        <div className="stack">
          <section className="card">
            <div className="card-head">
              <h2>Low stock</h2>
              <Link href="/items" className="small muted">All items →</Link>
            </div>
            <div className="card-body tight">
              {low.length === 0 ? (
                <div className="empty">
                  <strong>Everything is above its reorder point</strong>
                  Set a reorder point on an item to see it here.
                </div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th className="num">On hand</th>
                        <th className="num">Reorder at</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {low.map((item) => (
                        <tr key={item.id}>
                          <td>
                            <Link href={`/items/${item.id}`} className="strong">{item.name}</Link>
                            <div className="small muted mono">{item.sku}</div>
                          </td>
                          <td className="num">
                            <span className={item.onHand === 0 ? 'badge badge-danger' : 'badge badge-warn'}>
                              {item.onHand}
                            </span>
                          </td>
                          <td className="num muted">{item.reorderPoint}</td>
                          <td className="num">
                            <Link href={`/receive?item=${item.id}`} className="small">Receive</Link>
                          </td>
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
              <h2>Recent activity</h2>
              <Link href="/movements" className="small muted">Full ledger →</Link>
            </div>
            <div className="card-body tight">
              {movements.length === 0 ? (
                <div className="empty"><strong>No movement yet</strong>Receive your first delivery to start the ledger.</div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>When</th>
                        <th>Movement</th>
                        <th>Item</th>
                        <th className="num">Qty</th>
                      </tr>
                    </thead>
                    <tbody>
                      {movements.map((m) => (
                        <tr key={m.id}>
                          <td className="muted small" style={{ whiteSpace: 'nowrap' }}>{relative(m.createdAt)}</td>
                          <td>
                            <span className="badge badge-neutral">{KIND_LABEL[m.kind] ?? m.kind}</span>
                            <div className="small muted">
                              {m.fromCode ?? 'outside'} → {m.toCode ?? 'outside'}
                            </div>
                          </td>
                          <td>
                            <div className="strong">{m.itemName}</div>
                            <div className="small muted mono">{m.sku}</div>
                          </td>
                          <td className="num strong">
                            {m.kind === 'receive' || m.kind === 'void' ? '+' : ''}
                            {m.kind === 'transfer' || m.kind === 'adjust' ? '↔ ' : ''}
                            {m.qty}
                          </td>
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
            <div className="card-head">
              <h2>Top sellers</h2>
              <span className="small muted">All time</span>
            </div>
            <div className="card-body">
              {sellers.length === 0 ? (
                <p className="small muted" style={{ margin: 0 }}>No sales recorded yet.</p>
              ) : (
                sellers.map((s) => (
                  <div className="kv" key={s.itemId}>
                    <span className="k" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.name}
                      <span className="small muted"> · {s.units} sold</span>
                    </span>
                    <span className="v">{formatMoney(s.revenue)}</span>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <h2>Latest receipts</h2>
              <Link href="/sales" className="small muted">All →</Link>
            </div>
            <div className="card-body">
              {sales.length === 0 ? (
                <p className="small muted" style={{ margin: 0 }}>Nothing sold yet today.</p>
              ) : (
                sales.map((s) => (
                  <div className="kv" key={s.id}>
                    <span className="k">
                      <Link href={`/sales/${s.id}`} className="strong">{s.number}</Link>
                      {s.status === 'void' ? <span className="badge badge-danger" style={{ marginLeft: 6 }}>void</span> : null}
                      <div className="small muted">{relative(s.createdAt)}</div>
                    </span>
                    <span className="v">{formatMoney(s.totalCents)}</span>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
