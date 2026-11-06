'use client';

import { useActionState } from 'react';
import { setupFirstAdmin, type LoginState } from '@/app/actions/auth';

const initial: LoginState = { error: null };

export function SetupForm() {
  const [state, formAction, pending] = useActionState(setupFirstAdmin, initial);

  return (
    <form action={formAction}>
      {state.error ? <div className="alert alert-error">{state.error}</div> : null}
      <div className="field">
        <label htmlFor="name">Your name</label>
        <input id="name" name="name" autoComplete="name" required autoFocus />
      </div>
      <div className="field">
        <label htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          placeholder="you@company.com"
        />
      </div>
      <div className="field">
        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </div>
      <div className="field">
        <label htmlFor="confirm">Confirm password</label>
        <input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </div>
      <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={pending}>
        {pending ? 'Creating account…' : 'Create administrator'}
      </button>
    </form>
  );
}
