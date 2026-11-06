import { getDb } from '@/lib/db';
import { listActiveBins, listItems } from '@/lib/queries';
import { TransferForm } from './TransferForm';

export const dynamic = 'force-dynamic';

export default async function TransferPage({
  searchParams,
}: {
  searchParams: Promise<{ item?: string }>;
}) {
  const { item } = await searchParams;
  const db = await getDb();
  const [items, locations] = await Promise.all([listItems(db, ''), listActiveBins(db)]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Transfer</h1>
          <p className="sub">Move units between bins without changing total stock.</p>
        </div>
      </div>

      <div className="grid-2">
        <TransferForm
          items={items.map((i) => ({ id: i.id, sku: i.sku, name: i.name, unit: i.unit }))}
          locations={locations}
          defaultItemId={item}
        />
        <section className="card">
          <div className="card-head"><h2>Bins</h2></div>
          <div className="card-body">
            {locations.map((loc) => (
              <div className="kv" key={loc.id}>
                <span className="k"><span className="mono strong">{loc.code}</span> · {loc.name}</span>
                <span className="v small muted">{loc.kind}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
