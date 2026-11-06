import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDb } from '@/lib/db';
import { config } from '@/lib/config';
import { formatMoney } from '@/lib/money';
import { formatDateTime } from '@/lib/format';
import { getSaleDetail } from '@/lib/domain/sales';
import { isDomainError } from '@/lib/domain/errors';
import { AutoPrint } from './AutoPrint';
import { VoidForm } from './VoidForm';

export const dynamic = 'force-dynamic';

export default async function SaleDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ print?: string }>;
}) {
  const { id } = await params;
  const { print } = await searchParams;

  const db = await getDb();
  // Only a genuinely missing sale becomes a 404; anything else must surface as
  // a real error so a database problem never looks like a deleted receipt.
  const detail = await getSaleDetail(db, id).catch((error: unknown) => {
    if (isDomainError(error) && error.code === 'NOT_FOUND') notFound();
    throw error;
  });

  const { sale, lines, payments } = detail;
  const paid = payments.reduce((sum, p) => sum + p.amountCents, 0);
  const change = Math.max(0, paid - sale.totalCents);

  return (
    <>
      {print ? <AutoPrint /> : null}

      <div className="page-head no-print">
        <div>
          <h1>Receipt {sale.number}</h1>
          <p className="sub">{formatDateTime(sale.createdAt)}</p>
        </div>
        <div className="head-actions">
          <Link href="/sales" className="btn btn-ghost">All sales</Link>
          <Link href={`/sales/${sale.id}?print=1`} className="btn btn-ghost" target="_blank">Print</Link>
          <Link href="/pos" className="btn btn-primary">New sale</Link>
        </div>
      </div>

      <div className="receipt">
        <h2>{config.companyName}</h2>
        <div className="rc-meta">
          Receipt {sale.number}
          <br />
          {formatDateTime(sale.createdAt)}
          {sale.customerName ? (
            <>
              <br />
              {sale.customerName}
            </>
          ) : null}
        </div>

        <hr className="receipt-sep" />

        {lines.map((line) => (
          <div className="receipt-line" key={line.id}>
            <div className="r-name">
              {line.name}
              <div className="r-qty">
                {line.qty} × {formatMoney(line.unitPriceCents)}
              </div>
            </div>
            <div>{formatMoney(line.lineTotalCents)}</div>
          </div>
        ))}

        <hr className="receipt-sep" />

        <div className="receipt-line">
          <div>Subtotal</div>
          <div>{formatMoney(sale.subtotalCents)}</div>
        </div>
        {sale.taxCents > 0 ? (
          <div className="receipt-line">
            <div>Tax ({(sale.taxRateBps / 100).toFixed(2)}%)</div>
            <div>{formatMoney(sale.taxCents)}</div>
          </div>
        ) : null}
        <div className="receipt-line" style={{ fontWeight: 700, fontSize: 15, paddingTop: 8 }}>
          <div>Total</div>
          <div>{formatMoney(sale.totalCents)}</div>
        </div>

        {payments.length > 0 ? (
          <>
            <hr className="receipt-sep" />
            {payments.map((p) => (
              <div className="receipt-line" key={p.id}>
                <div style={{ textTransform: 'capitalize' }}>{p.method}</div>
                <div>{formatMoney(p.amountCents)}</div>
              </div>
            ))}
            {change > 0 ? (
              <div className="receipt-line">
                <div>Change</div>
                <div>{formatMoney(change)}</div>
              </div>
            ) : null}
          </>
        ) : null}

        {sale.status === 'void' ? (
          <>
            <hr className="receipt-sep" />
            <div className="badge badge-danger">Voided {formatDateTime(sale.voidedAt)}</div>
            {sale.note ? <p className="small muted" style={{ marginBottom: 0 }}>{sale.note}</p> : null}
          </>
        ) : null}

        <hr className="receipt-sep" />
        <div className="rc-meta">Thank you</div>
      </div>

      {sale.status === 'paid' ? (
        <div className="no-print" style={{ maxWidth: 420, margin: '22px auto 0' }}>
          <VoidForm saleId={sale.id} />
        </div>
      ) : null}
    </>
  );
}
