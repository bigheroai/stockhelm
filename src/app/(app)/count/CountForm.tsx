'use client';

import { useActionState } from 'react';
import { countAction } from '@/app/actions/stock';
import { idleState, type ActionState } from '@/app/actions/state';

export function CountForm({
  itemId,
  locationId,
  currentQty,
  unit,
}: {
  itemId: string;
  locationId: string;
  currentQty: number;
  unit: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(countAction, idleState);

  return (
    <form action={formAction} className="card">
      <div className="card-head">
        <h2>Record count</h2>
        <span className="badge badge-neutral">System says {currentQty} {unit}</span>
      </div>
      <div className="card-body">
        {state.error ? <div className="alert alert-error">{state.error}</div> : null}
        {state.ok && state.message ? <div className="alert alert-ok">{state.message}</div> : null}

        <input type="hidden" name="itemId" value={itemId} />
        <input type="hidden" name="locationId" value={locationId} />

        <div className="field">
          <label htmlFor="countedQty">Counted quantity</label>
          <input
            id="countedQty"
            name="countedQty"
            type="number"
            min={0}
            step={1}
            defaultValue={currentQty}
            required
            autoFocus
          />
          <span className="hint">Enter what is physically on the shelf. This sets the balance, not adds to it.</span>
        </div>

        <div className="field">
          <label htmlFor="reason">Reason</label>
          <input
            id="reason"
            name="reason"
            placeholder="Damaged, miscount, theft, found stock…"
            required
            autoComplete="off"
          />
        </div>

        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? 'Posting…' : 'Post adjustment'}
        </button>
      </div>
    </form>
  );
}
