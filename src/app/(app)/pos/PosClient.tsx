'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { formatMoney } from '@/lib/money';

export interface PosItem {
  id: string;
  sku: string;
  name: string;
  unit: string;
  priceCents: number;
  qty: number;
}

interface CartLine extends PosItem {
  cartQty: number;
}

interface Receipt {
  saleId: string;
  number: string;
  totalCents: number;
  changeCents: number;
}

const newKey = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;

export function PosClient({
  initialItems,
  taxRateBps,
}: {
  initialItems: PosItem[];
  taxRateBps: number;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PosItem[]>(initialItems);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [method, setMethod] = useState<'cash' | 'card' | 'transfer'>('cash');
  const [tendered, setTendered] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(newKey);
  const searchRef = useRef<HTMLInputElement>(null);

  // Debounced search; the first render already shows what is on the counter.
  useEffect(() => {
    const term = query.trim();
    if (!term) {
      setResults(initialItems);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/pos/items?q=${encodeURIComponent(term)}`);
        if (!res.ok) return;
        const data = (await res.json()) as { items: PosItem[] };
        setResults(data.items);
      } catch {
        /* transient network failure: keep the previous list */
      }
    }, 180);
    return () => clearTimeout(timer);
  }, [query, initialItems]);

  const subtotal = useMemo(
    () => cart.reduce((sum, line) => sum + line.priceCents * line.cartQty, 0),
    [cart],
  );
  const tax = Math.round((subtotal * taxRateBps) / 10_000);
  const total = subtotal + tax;

  const tenderedCents = useMemo(() => {
    if (method !== 'cash' || !tendered.trim()) return total;
    const cleaned = tendered.trim().replace(/[,\s]/g, '');
    if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return total;
    const [whole, frac = ''] = cleaned.split('.');
    return Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  }, [tendered, method, total]);

  const change = Math.max(0, tenderedCents - total);
  const short = method === 'cash' && cart.length > 0 && tenderedCents < total;

  function add(item: PosItem) {
    setError(null);
    setReceipt(null);
    setCart((current) => {
      const existing = current.find((line) => line.id === item.id);
      if (existing) {
        if (existing.cartQty >= item.qty) {
          setError(`Only ${item.qty} × ${item.name} left at the counter.`);
          return current;
        }
        return current.map((line) =>
          line.id === item.id ? { ...line, cartQty: line.cartQty + 1 } : line,
        );
      }
      if (item.qty <= 0) {
        setError(`${item.name} has no stock at the counter.`);
        return current;
      }
      return [...current, { ...item, cartQty: 1 }];
    });
  }

  function setQty(id: string, qty: number) {
    setCart((current) =>
      current
        .map((line) => (line.id === id ? { ...line, cartQty: Math.min(qty, line.qty) } : line))
        .filter((line) => line.cartQty > 0),
    );
  }

  function reset() {
    setCart([]);
    setTendered('');
    setMethod('cash');
    setError(null);
    setReceipt(null);
    setIdempotencyKey(newKey());
    searchRef.current?.focus();
  }

  async function checkout() {
    if (cart.length === 0 || busy) return;
    if (short) {
      setError('Not enough cash received to cover the total.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/pos/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lines: cart.map((line) => ({
            itemId: line.id,
            qty: line.cartQty,
            unitPriceCents: line.priceCents,
          })),
          payments: [{ method, amountCents: method === 'cash' ? tenderedCents : total }],
          idempotencyKey,
        }),
      });
      const data = (await res.json()) as Receipt & { error?: string };
      if (!res.ok) {
        setError(data.error ?? 'Could not complete the sale.');
        return;
      }
      setReceipt(data);
      setCart([]);
      setTendered('');
      setIdempotencyKey(newKey());
      // Refresh the visible stock numbers.
      setQuery((q) => q);
      const refreshed = await fetch('/api/pos/items?q=');
      if (refreshed.ok) {
        const body = (await refreshed.json()) as { items: PosItem[] };
        setResults(body.items);
      }
    } catch {
      setError('Network error — the sale was not recorded. Try again.');
    } finally {
      setBusy(false);
    }
  }

  function onScanKey(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return;
    const term = query.trim();
    if (!term) return;
    const exact = results.find(
      (item) => item.sku.toLowerCase() === term.toLowerCase() || item.sku === term,
    );
    if (exact) {
      event.preventDefault();
      add(exact);
      setQuery('');
    } else if (results.length === 1) {
      event.preventDefault();
      add(results[0]);
      setQuery('');
    }
  }

  return (
    <div className="pos">
      <div>
        <form className="scan-bar" onSubmit={(e) => e.preventDefault()}>
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onScanKey}
            placeholder="Scan barcode or search…"
            autoFocus
            autoComplete="off"
            aria-label="Scan or search items"
          />
        </form>

        {results.length === 0 ? (
          <div className="card">
            <div className="empty">
              <strong>Nothing matches</strong>
              Try another SKU or scan the item barcode.
            </div>
          </div>
        ) : (
          <div className="product-grid">
            {results.map((item) => (
              <button
                type="button"
                key={item.id}
                className="product"
                onClick={() => add(item)}
                disabled={item.qty <= 0}
                style={item.qty <= 0 ? { opacity: 0.55, cursor: 'not-allowed' } : undefined}
              >
                <div className="product-name">{item.name}</div>
                <div className="product-meta">
                  <span className="product-price">{formatMoney(item.priceCents)}</span>
                  <span className={item.qty <= 0 ? 'product-stock out' : 'product-stock'}>
                    {item.qty <= 0 ? 'out' : `${item.qty} left`}
                  </span>
                </div>
                <div className="small muted mono" style={{ marginTop: 4 }}>{item.sku}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="card cart">
        {receipt ? (
          <div className="card-body">
            <div style={{ textAlign: 'center', padding: '10px 0 18px' }}>
              <div className="badge badge-ok" style={{ marginBottom: 10 }}>Sale complete</div>
              <div style={{ fontSize: 26, fontWeight: 660, letterSpacing: '-0.02em' }}>
                {formatMoney(receipt.totalCents)}
              </div>
              <div className="small muted" style={{ marginTop: 4 }}>Receipt {receipt.number}</div>
              {receipt.changeCents > 0 ? (
                <div className="small" style={{ marginTop: 10 }}>
                  Change due <strong>{formatMoney(receipt.changeCents)}</strong>
                </div>
              ) : null}
            </div>
            <div className="stack" style={{ gap: 8 }}>
              <button type="button" className="btn btn-primary btn-block" onClick={reset}>
                New sale
              </button>
              <a
                className="btn btn-ghost btn-block"
                href={`/sales/${receipt.saleId}?print=1`}
                target="_blank"
                rel="noreferrer"
              >
                Print receipt
              </a>
              <a className="btn btn-ghost btn-block" href={`/sales/${receipt.saleId}`}>
                View receipt
              </a>
            </div>
          </div>
        ) : (
          <>
            <div className="card-head">
              <h2>Current sale</h2>
              <span className="small muted">{cart.length} line{cart.length === 1 ? '' : 's'}</span>
            </div>

            <div className="cart-lines">
              {cart.length === 0 ? (
                <div className="empty" style={{ padding: '34px 16px' }}>
                  <strong>Cart is empty</strong>
                  Scan an item to begin.
                </div>
              ) : (
                cart.map((line) => (
                  <div className="cart-line" key={line.id}>
                    <div>
                      <div className="cart-line-name">{line.name}</div>
                      <div className="cart-line-sub">
                        {formatMoney(line.priceCents)} × {line.cartQty} ={' '}
                        {formatMoney(line.priceCents * line.cartQty)}
                      </div>
                    </div>
                    <div className="qty-controls">
                      <button
                        type="button"
                        className="qty-btn"
                        onClick={() => setQty(line.id, line.cartQty - 1)}
                        aria-label={`Remove one ${line.name}`}
                      >
                        −
                      </button>
                      <span className="qty-val">{line.cartQty}</span>
                      <button
                        type="button"
                        className="qty-btn"
                        onClick={() => setQty(line.id, line.cartQty + 1)}
                        disabled={line.cartQty >= line.qty}
                        aria-label={`Add one ${line.name}`}
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="totals">
              {error ? <div className="alert alert-error" style={{ marginBottom: 10 }}>{error}</div> : null}

              <div className="kv">
                <span className="k">Subtotal</span>
                <span className="v">{formatMoney(subtotal)}</span>
              </div>
              {tax > 0 ? (
                <div className="kv">
                  <span className="k">Tax</span>
                  <span className="v">{formatMoney(tax)}</span>
                </div>
              ) : null}
              <div className="kv total">
                <span className="k" style={{ color: 'var(--ink)', fontWeight: 600 }}>Total</span>
                <span className="v">{formatMoney(total)}</span>
              </div>

              <div className="pay-row">
                {(['cash', 'card', 'transfer'] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={method === option ? 'pay-btn active' : 'pay-btn'}
                    onClick={() => setMethod(option)}
                  >
                    {option === 'cash' ? 'Cash' : option === 'card' ? 'Card' : 'Transfer'}
                  </button>
                ))}
              </div>

              {method === 'cash' ? (
                <div className="field" style={{ marginBottom: 10 }}>
                  <label htmlFor="tendered">Cash received</label>
                  <input
                    id="tendered"
                    value={tendered}
                    onChange={(e) => setTendered(e.target.value)}
                    placeholder={(total / 100).toFixed(2)}
                    inputMode="decimal"
                    autoComplete="off"
                  />
                  {change > 0 && !short ? (
                    <span className="hint">Change {formatMoney(change)}</span>
                  ) : null}
                  {short ? <span className="hint" style={{ color: 'var(--danger)' }}>Short by {formatMoney(total - tenderedCents)}</span> : null}
                </div>
              ) : null}

              <button
                type="button"
                className="btn btn-primary btn-block btn-lg"
                onClick={checkout}
                disabled={cart.length === 0 || busy || short}
              >
                {busy ? 'Processing…' : `Charge ${formatMoney(total)}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
