import Link from 'next/link';
import { getDb } from '@/lib/db';
import { formatDateTime } from '@/lib/format';
import { recentMovements } from '@/lib/queries';

export const dynamic = 'force-dynamic';

const KINDS = ['receive', 'transfer', 'adjust', 'sale', 'void'] as const;

const LABEL: Record<string, string> = {
  receive: 'Received',
  transfer: 'Transfer',
  adjust: 'Count',
  sale: 'Sale',
  void: 'Void',
};

const TONE: Record<string, string> = {
  receive: 'badge-ok',
  transfer: 'badge-accent',
  adjust: 'badge-warn',
  sale: 'badge-neutral',
  void: 'badge-danger',
};

export default async function MovementsPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const { kind } = await searchParams;
  const db = await getDb();
  const all = await recentMovements(db, 200);
  const rows = kind && KINDS.includes(kind as (typeof KINDS)[number])
    ? all.filter((m) => m.kind === kind)
    : all;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Ledger</h1>
          <p className="sub">Every stock movement, newest first. Rows are append-only.</p>
        </div>
      </div>

      <div className="head-actions" style={{ marginBottom: 16 }}>
        <Link href="/movements" className={!kind ? 'btn btn-primary' : 'btn btn-ghost'}>All</Link>
        {KINDS.map((k) => (
          <Link key={k} href={`/movements?kind=${k}`} className={kind === k ? 'btn btn-primary' : 'btn btn-ghost'}>
            {LABEL[k]}
          </Link>
        ))}
      </div>

      <section className="card">
        <div className="card-body tight">
          {rows.length === 0 ? (
            <div className="empty"><strong>No movements</strong>Nothing matches this filter.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Type</th>
                    <th>Item</th>
                    <th>Flow</th>
                    <th className="num">Qty</th>
                    <th>By</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((m) => (
                    <tr key={m.id}>
                      <td className="small muted" style={{ whiteSpace: 'nowrap' }}>{formatDateTime(m.createdAt)}</td>
                      <td><span className={`badge ${TONE[m.kind] ?? 'badge-neutral'}`}>{LABEL[m.kind] ?? m.kind}</span></td>
                      <td>
                        <div className="strong">{m.itemName}</div>
                        <div className="small muted mono">{m.sku}</div>
                      </td>
                      <td className="small mono">
                        {m.fromCode ?? 'outside'} → {m.toCode ?? 'outside'}
                      </td>
                      <td className="num strong">{m.qty}</td>
                      <td className="small muted">{m.actor ?? '—'}</td>
                      <td className="small muted">{m.note ?? '—'}</td>
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
