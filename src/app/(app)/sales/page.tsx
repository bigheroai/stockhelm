import Link from 'next/link';
import { getDb } from '@/lib/db';
import { formatMoney } from '@/lib/money';
import { formatDateTime } from '@/lib/format';
import { listSales } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export default async function SalesPage() {
  const db = await getDb();
  const rows = await listSales(db, 100);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Sales</h1>
          <p className="sub">{rows.length} receipt{rows.length === 1 ? '' : 's'}</p>
        </div>
        <div className="head-actions">
          <Link href="/pos" className="btn btn-primary">Open counter</Link>
        </div>
      </div>

      <section className="card">
        <div className="card-body tight">
          {rows.length === 0 ? (
            <div className="empty">
              <strong>No sales yet</strong>
              Ring up the first order at the counter.
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Receipt</th>
                    <th>When</th>
                    <th>Customer</th>
                    <th className="num">Lines</th>
                    <th className="num">Total</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s) => (
                    <tr key={s.id}>
                      <td className="mono"><Link href={`/sales/${s.id}`}>{s.number}</Link></td>
                      <td className="small muted" style={{ whiteSpace: 'nowrap' }}>{formatDateTime(s.createdAt)}</td>
                      <td>{s.customerName || <span className="muted">Walk-in</span>}</td>
                      <td className="num muted">{s.lineCount}</td>
                      <td className="num strong">{formatMoney(s.totalCents)}</td>
                      <td>
                        {s.status === 'paid' ? (
                          <span className="badge badge-ok">Paid</span>
                        ) : s.status === 'void' ? (
                          <span className="badge badge-danger">Void</span>
                        ) : (
                          <span className="badge badge-warn">Open</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
