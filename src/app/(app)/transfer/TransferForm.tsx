'use client';

import { useActionState } from 'react';
import { transferAction } from '@/app/actions/stock';
import { idleState, type ActionState } from '@/app/actions/state';
import type { ItemOption, Option } from '../receive/ReceiveForm';

export function TransferForm({
  items,
  locations,
  defaultItemId,
}: {
  items: ItemOption[];
  locations: Option[];
  defaultItemId?: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(transferAction, idleState);

  return (
    <form action={formAction} className="card">
      <div className="card-head">
        <h2>Move stock</h2>
        {state.ok ? <span className="badge badge-ok">Moved</span> : null}
      </div>
      <div className="card-body">
        {state.error ? <div className="alert alert-error">{state.error}</div> : null}
        {state.ok && state.message ? <div className="alert alert-ok">{state.message}</div> : null}

        <div className="field">
          <label htmlFor="itemId">Item</label>
          <select id="itemId" name="itemId" defaultValue={defaultItemId ?? ''} required>
            <option value="" disabled>Choose an item…</option>
            {items.map((item) => (
              <option key={item.id} value={item.id}>{item.sku} — {item.name}</option>
            ))}
          </select>
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="fromLocationId">From</label>
            <select id="fromLocationId" name="fromLocationId" required defaultValue="">
              <option value="" disabled>Source…</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>{loc.code} — {loc.name}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="toLocationId">To</label>
            <select id="toLocationId" name="toLocationId" required defaultValue="">
              <option value="" disabled>Destination…</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>{loc.code} — {loc.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="field">
          <label htmlFor="qty">Quantity</label>
          <input id="qty" name="qty" type="number" min={1} step={1} defaultValue={1} required />
          <span className="hint">The move fails if the source bin does not have enough.</span>
        </div>

        <div className="field">
          <label htmlFor="note">Note</label>
          <input id="note" name="note" placeholder="Why is this moving?" autoComplete="off" />
        </div>

        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? 'Moving…' : 'Transfer'}
        </button>
      </div>
    </form>
  );
}
