import Link from 'next/link';
import { getDb } from '@/lib/db';
import { formatMoney } from '@/lib/money';
import { listItems } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export default async function ItemsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = '' } = await searchParams;
  const db = await getDb();
  const rows = await listItems(db, q);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Items</h1>
          <p className="sub">{rows.length} item{rows.length === 1 ? '' : 's'}{q ? ` matching “${q}”` : ''}</p>
        </div>
        <div className="head-actions">
          <Link href="/items/new" className="btn btn-primary">New item</Link>
        </div>
      </div>

      <form className="scan-bar" action="/items" method="get">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search SKU, name or barcode…"
          autoComplete="off"
          aria-label="Search items"
        />
        <button type="submit" className="btn btn-ghost">Search</button>
        {q ? <Link href="/items" className="btn btn-ghost">Clear</Link> : null}
      </form>

      <section className="card">
        <div className="card-body tight">
          {rows.length === 0 ? (
            <div className="empty">
              <strong>{q ? 'No items match that search' : 'No items yet'}</strong>
              {q ? 'Try a different SKU or barcode.' : 'Add your first item to start tracking stock.'}
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Item</th>
                    <th className="num">On hand</th>
                    <th className="num">Reorder</th>
                    <th className="num">Price</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((item) => {
                    const low = item.reorderPoint > 0 && item.onHand <= item.reorderPoint;
                    return (
                      <tr key={item.id}>
                        <td className="mono">
                          <Link href={`/items/${item.id}`}>{item.sku}</Link>
                        </td>
                        <td>
                          <Link href={`/items/${item.id}`} className="strong">{item.name}</Link>
                          {item.barcode ? <div className="small muted mono">{item.barcode}</div> : null}
                        </td>
                        <td className="num strong">{item.onHand}</td>
                        <td className="num muted">{item.reorderPoint || '—'}</td>
                        <td className="num">{formatMoney(item.priceCents)}</td>
                        <td>
                          {!item.active ? (
                            <span className="badge badge-neutral">Inactive</span>
                          ) : item.onHand === 0 ? (
                            <span className="badge badge-danger">Out of stock</span>
                          ) : low ? (
                            <span className="badge badge-warn">Low</span>
                          ) : (
                            <span className="badge badge-ok">In stock</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
