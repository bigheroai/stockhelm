'use client';

import { useActionState } from 'react';
import { reconcileAction } from '@/app/actions/stock';
import { idleState, type ActionState } from '@/app/actions/state';

export function ReconcileButton() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(reconcileAction, idleState);

  return (
    <form action={formAction}>
      {state.error ? <div className="alert alert-error">{state.error}</div> : null}
      {state.ok && state.message ? <div className="alert alert-ok">{state.message}</div> : null}
      <button type="submit" className="btn btn-ghost" disabled={pending}>
        {pending ? 'Rebuilding…' : 'Rebuild balances from ledger'}
      </button>
    </form>
  );
}
