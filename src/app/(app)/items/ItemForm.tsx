'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { createItemAction, updateItemAction } from '@/app/actions/items';
import { emptyItemState, type ItemFormState } from '@/app/actions/state';
import { formatMoney } from '@/lib/money';

export interface ItemFormValues {
  id?: string;
  sku?: string;
  name?: string;
  description?: string;
  barcode?: string | null;
  unit?: string;
  priceCents?: number;
  costCents?: number;
  reorderPoint?: number;
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <span className="hint" style={{ color: 'var(--danger)' }}>{message}</span>;
}

export function ItemForm({ item }: { item?: ItemFormValues }) {
  const editing = Boolean(item?.id);
  const action = editing ? updateItemAction : createItemAction;
  const [state, formAction, pending] = useActionState<ItemFormState, FormData>(action, emptyItemState);

  return (
    <form action={formAction} className="card">
      <div className="card-head">
        <h2>{editing ? 'Item details' : 'New item'}</h2>
        {state.ok ? <span className="badge badge-ok">Saved</span> : null}
      </div>
      <div className="card-body">
        {state.error ? <div className="alert alert-error">{state.error}</div> : null}
        {item?.id ? <input type="hidden" name="id" value={item.id} /> : null}

        <div className="field-row">
          <div className="field">
            <label htmlFor="sku">SKU</label>
            <input
              id="sku"
              name="sku"
              defaultValue={item?.sku ?? ''}
              placeholder="TL-1001"
              required
              autoComplete="off"
              style={{ fontFamily: 'var(--mono)' }}
            />
            <FieldError message={state.fieldErrors.sku} />
          </div>
          <div className="field">
            <label htmlFor="barcode">Barcode</label>
            <input
              id="barcode"
              name="barcode"
              defaultValue={item?.barcode ?? ''}
              placeholder="Scan or type"
              autoComplete="off"
              style={{ fontFamily: 'var(--mono)' }}
            />
            <FieldError message={state.fieldErrors.barcode} />
          </div>
        </div>

        <div className="field">
          <label htmlFor="name">Name</label>
          <input id="name" name="name" defaultValue={item?.name ?? ''} required autoComplete="off" />
          <FieldError message={state.fieldErrors.name} />
        </div>

        <div className="field">
          <label htmlFor="description">Description</label>
          <textarea
            id="description"
            name="description"
            defaultValue={item?.description ?? ''}
            placeholder="Optional notes shown on the item page"
          />
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="price">Sell price</label>
            <input
              id="price"
              name="price"
              defaultValue={item ? (item.priceCents! / 100).toFixed(2) : ''}
              placeholder="0.00"
              inputMode="decimal"
              required
            />
            <FieldError message={state.fieldErrors.price} />
          </div>
          <div className="field">
            <label htmlFor="cost">Unit cost</label>
            <input
              id="cost"
              name="cost"
              defaultValue={item ? (item.costCents! / 100).toFixed(2) : ''}
              placeholder="0.00"
              inputMode="decimal"
              required
            />
            <FieldError message={state.fieldErrors.cost} />
          </div>
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="unit">Unit</label>
            <select id="unit" name="unit" defaultValue={item?.unit ?? 'ea'}>
              <option value="ea">each</option>
              <option value="box">box</option>
              <option value="roll">roll</option>
              <option value="kg">kilogram</option>
              <option value="m">metre</option>
              <option value="L">litre</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="reorderPoint">Reorder point</label>
            <input
              id="reorderPoint"
              name="reorderPoint"
              type="number"
              min={0}
              step={1}
              defaultValue={item?.reorderPoint ?? 0}
            />
            <span className="hint">Flag the item when stock falls to this level.</span>
            <FieldError message={state.fieldErrors.reorderPoint} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? 'Saving…' : editing ? 'Save changes' : 'Create item'}
          </button>
          <Link href={editing ? `/items/${item?.id}` : '/items'} className="btn btn-ghost">
            Cancel
          </Link>
        </div>
        {item ? (
          <p className="hint" style={{ marginTop: 12, marginBottom: 0 }}>
            List price {formatMoney(item.priceCents ?? 0)} · cost {formatMoney(item.costCents ?? 0)}
          </p>
        ) : null}
      </div>
    </form>
  );
}
