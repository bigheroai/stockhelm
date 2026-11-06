'use client';

import { useActionState } from 'react';
import { voidSaleAction } from '@/app/actions/sales';
import type { VoidState } from '@/app/actions/state';

export function VoidForm({ saleId }: { saleId: string }) {
  const [state, formAction, pending] = useActionState<VoidState, FormData>(voidSaleAction, {
    ok: false,
    error: null,
  });

  if (state.ok) {
    return <div className="alert alert-ok">Sale voided. Stock has been returned to the counter.</div>;
  }

  return (
    <form action={formAction}>
      {state.error ? <div className="alert alert-error">{state.error}</div> : null}
      <input type="hidden" name="saleId" value={saleId} />
      <div className="field">
        <label htmlFor="reason">Void reason</label>
        <input id="reason" name="reason" placeholder="Wrong item, customer cancelled…" required autoComplete="off" />
      </div>
      <button type="submit" className="btn btn-danger" disabled={pending}>
        {pending ? 'Voiding…' : 'Void this sale'}
      </button>
    </form>
  );
}
