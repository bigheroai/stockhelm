/**
 * Shared form-state shapes and idle values.
 *
 * These live outside the "use server" modules on purpose: a server-action file
 * may only export async functions, so plain constants have to sit elsewhere.
 */

export interface ActionState {
  ok: boolean;
  error: string | null;
  message: string | null;
}

export const idleState: ActionState = { ok: false, error: null, message: null };

export interface ItemFormState {
  ok: boolean;
  error: string | null;
  fieldErrors: Record<string, string>;
}

export const emptyItemState: ItemFormState = { ok: false, error: null, fieldErrors: {} };

export interface LocationState {
  ok: boolean;
  error: string | null;
}

export interface VoidState {
  ok: boolean;
  error: string | null;
}
