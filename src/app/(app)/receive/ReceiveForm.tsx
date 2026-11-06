'use client';

import { useActionState } from 'react';
import { receiveAction } from '@/app/actions/stock';
import { idleState, type ActionState } from '@/app/actions/state';

export interface Option {
  id: string;
  code: string;
  name: string;
}

export interface ItemOption {
  id: string;
  sku: string;
  name: string;
  unit: string;
}

export function ReceiveForm({
  items,
  locations,
  defaultItemId,
  defaultLocationId,
}: {
  items: ItemOption[];
  locations: Option[];
  defaultItemId?: string;
  defaultLocationId?: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(receiveAction, idleState);

  return (
    <form action={formAction} className="card">
      <div className="card-head">
        <h2>Receive stock</h2>
        {state.ok ? <span className="badge badge-ok">Recorded</span> : null}
      </div>
      <div className="card-body">
        {state.error ? <div className="alert alert-error">{state.error}</div> : null}
        {state.ok && state.message ? <div className="alert alert-ok">{state.message}</div> : null}

        <div className="field">
          <label htmlFor="itemId">Item</label>
          <select id="itemId" name="itemId" defaultValue={defaultItemId ?? ''} required>
            <option value="" disabled>Choose an item…</option>
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.sku} — {item.name}
              </option>
            ))}
          </select>
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="locationId">Into location</label>
            <select id="locationId" name="locationId" defaultValue={defaultLocationId ?? ''} required>
              <option value="" disabled>Choose a location…</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.code} — {loc.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="qty">Quantity</label>
            <input id="qty" name="qty" type="number" min={1} step={1} defaultValue={1} required />
          </div>
        </div>

        <div className="field">
          <label htmlFor="note">Note</label>
          <input id="note" name="note" placeholder="Supplier, PO number, delivery reference…" autoComplete="off" />
        </div>

        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? 'Recording…' : 'Receive stock'}
        </button>
      </div>
    </form>
  );
}
