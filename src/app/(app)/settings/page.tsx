import { getDb } from '@/lib/db';
import { config } from '@/lib/config';
import { ledgerDrift, listLocations } from '@/lib/queries';
import { LocationForm } from './LocationForm';
import { ReconcileButton } from './ReconcileButton';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const db = await getDb();
  const [locations, drift] = await Promise.all([listLocations(db), ledgerDrift(db)]);
  const healthy = drift.mismatched === 0;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p className="sub">Locations, ledger integrity and deployment facts.</p>
        </div>
      </div>

      <div className="grid-2">
        <div className="stack">
          <section className="card">
            <div className="card-head">
              <h2>Locations</h2>
              <span className="small muted">{locations.length} total</span>
            </div>
            <div className="card-body tight">
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>Name</th>
                      <th>Kind</th>
                      <th className="num">SKUs</th>
                      <th className="num">Units</th>
                    </tr>
                  </thead>
                  <tbody>
                    {locations.map((loc) => (
                      <tr key={loc.id}>
                        <td className="mono strong">{loc.code}</td>
                        <td>{loc.name}</td>
                        <td>
                          <span className={loc.kind === 'counter' ? 'badge badge-accent' : 'badge badge-neutral'}>
                            {loc.kind}
                          </span>
                        </td>
                        <td className="num muted">{loc.skus}</td>
                        <td className="num">{loc.units}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section className="card">
            <div className="card-head"><h2>Add a location</h2></div>
            <div className="card-body">
              <LocationForm />
            </div>
          </section>
        </div>

        <div className="stack">
          <section className="card">
            <div className="card-head">
              <h2>Ledger integrity</h2>
              {healthy ? (
                <span className="badge badge-ok">Balanced</span>
              ) : (
                <span className="badge badge-danger">Mismatch</span>
              )}
            </div>
            <div className="card-body">
              <div className="kv">
                <span className="k">Balance rows</span>
                <span className="v">{drift.levelRows}</span>
              </div>
              <div className="kv">
                <span className="k">Rows implied by ledger</span>
                <span className="v">{drift.ledgerRows}</span>
              </div>
              <div className="kv">
                <span className="k">Rows that disagree</span>
                <span className="v" style={{ color: healthy ? 'var(--ok)' : 'var(--danger)' }}>
                  {drift.mismatched}
                </span>
              </div>
              <div className="divider" />
              <p className="small muted">
                Balances are a cache of the movement ledger. If they ever drift apart, rebuild from the ledger —
                no history is lost.
              </p>
              <ReconcileButton />
            </div>
          </section>

          <section className="card">
            <div className="card-head"><h2>Configuration</h2></div>
            <div className="card-body">
              <div className="kv"><span className="k">Company</span><span className="v">{config.companyName}</span></div>
              <div className="kv"><span className="k">Currency</span><span className="v">{config.currency}</span></div>
              <div className="kv"><span className="k">Tax rate</span><span className="v">{(config.taxRateBps / 100).toFixed(2)}%</span></div>
              <div className="kv"><span className="k">Sales location</span><span className="v mono">{config.saleLocationCode}</span></div>
              <div className="divider" />
              <p className="small muted" style={{ marginBottom: 0 }}>
                Set these with environment variables: <span className="code-chip">COMPANY_NAME</span>{' '}
                <span className="code-chip">CURRENCY</span> <span className="code-chip">TAX_RATE_BPS</span>{' '}
                <span className="code-chip">SALE_LOCATION_CODE</span>.
              </p>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
