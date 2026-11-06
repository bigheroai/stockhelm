'use client';

import { useActionState } from 'react';
import { createLocationAction } from '@/app/actions/items';
import type { LocationState } from '@/app/actions/state';

export function LocationForm() {
  const [state, formAction, pending] = useActionState<LocationState, FormData>(createLocationAction, {
    ok: false,
    error: null,
  });

  return (
    <form action={formAction}>
      {state.error ? <div className="alert alert-error">{state.error}</div> : null}
      {state.ok ? <div className="alert alert-ok">Location created.</div> : null}

      <div className="field-row">
        <div className="field">
          <label htmlFor="code">Code</label>
          <input id="code" name="code" placeholder="C-02" required autoComplete="off" style={{ fontFamily: 'var(--mono)' }} />
        </div>
        <div className="field">
          <label htmlFor="kind">Kind</label>
          <select id="kind" name="kind" defaultValue="bin">
            <option value="bin">Shelf / bin</option>
            <option value="counter">Sales counter</option>
            <option value="staging">Staging</option>
            <option value="virtual">Virtual</option>
          </select>
        </div>
      </div>

      <div className="field">
        <label htmlFor="name">Name</label>
        <input id="name" name="name" placeholder="Aisle C · Bay 2" required autoComplete="off" />
      </div>

      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? 'Creating…' : 'Add location'}
      </button>
    </form>
  );
}
