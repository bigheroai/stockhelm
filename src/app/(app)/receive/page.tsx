import { getDb } from '@/lib/db';
import { findItemByCode } from '@/lib/domain/items';
import { listActiveBins, listItems, recentMovements } from '@/lib/queries';
import { formatDateTime } from '@/lib/format';
import { ReceiveForm } from './ReceiveForm';

export const dynamic = 'force-dynamic';

export default async function ReceivePage({
  searchParams,
}: {
  searchParams: Promise<{ item?: string; scan?: string }>;
}) {
  const { item: itemId, scan } = await searchParams;
  const db = await getDb();

  let resolvedId = itemId;
  let scannedName: string | null = null;
  if (scan) {
    const found = await findItemByCode(db, scan);
    if (found) {
      resolvedId = found.id;
      scannedName = `${found.sku} — ${found.name}`;
    }
  }

  const [items, locations, recent] = await Promise.all([
    listItems(db, ''),
    listActiveBins(db),
    recentMovements(db, 10),
  ]);

  const receives = recent.filter((m) => m.kind === 'receive');

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Receive</h1>
          <p className="sub">Book a delivery onto the shelf. Every unit gets a ledger entry.</p>
        </div>
      </div>

      {scan && !scannedName ? (
        <div className="alert alert-error">No item matches the code “{scan}”.</div>
      ) : null}
      {scannedName ? <div className="alert alert-ok">Scanned {scannedName}</div> : null}

      <div className="grid-2">
        <div>
          <form className="scan-bar" action="/receive" method="get">
            <input name="scan" placeholder="Scan barcode or type SKU…" autoFocus autoComplete="off" aria-label="Scan item" />
            <button type="submit" className="btn btn-ghost">Find</button>
          </form>

          <ReceiveForm
            items={items.map((i) => ({ id: i.id, sku: i.sku, name: i.name, unit: i.unit }))}
            locations={locations}
            defaultItemId={resolvedId}
            defaultLocationId={locations.find((l) => l.kind === 'staging')?.id ?? locations[0]?.id}
          />
        </div>

        <section className="card">
          <div className="card-head"><h2>Recent receipts</h2></div>
          <div className="card-body tight">
            {receives.length === 0 ? (
              <div className="empty">No receipts yet.</div>
            ) : (
              <div className="table-wrap">
                <table>
                  <tbody>
                    {receives.map((m) => (
                      <tr key={m.id}>
                        <td>
                          <div className="strong">{m.itemName}</div>
                          <div className="small muted">
                            {formatDateTime(m.createdAt)} · into <span className="mono">{m.toCode}</span>
                          </div>
                        </td>
                        <td className="num strong">+{m.qty}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
