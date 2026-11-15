import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../../api.ts';

type State = { kind: 'idle' } | { kind: 'sending' } | { kind: 'done' } | { kind: 'error'; message: string };

const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** One email field for the homepage waitlist. It only stores the address; nothing is sent from the app. */
export function WaitlistForm({ source = 'landing' }: { source?: string }) {
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState(''); // hidden from people; bots that fill it are ignored by the server
  const [state, setState] = useState<State>({ kind: 'idle' });

  async function submit(e: FormEvent) {
    e.preventDefault();
    const value = email.trim();
    if (!LOOKS_LIKE_EMAIL.test(value)) {
      setState({ kind: 'error', message: 'Enter a valid email address.' });
      return;
    }
    setState({ kind: 'sending' });
    try {
      await api('/api/waitlist', { method: 'POST', body: { email: value, source, company } });
      setState({ kind: 'done' });
    } catch (err) {
      setState({ kind: 'error', message: err instanceof ApiError ? err.message : 'Something went wrong. Try again.' });
    }
  }

  if (state.kind === 'done') {
    return (
      <p className="ld-waitlist-done" role="status" data-testid="waitlist-done">
        You’re on the list. We’ll be in touch about what’s next for Ori.
      </p>
    );
  }

  const error = state.kind === 'error';
  return (
    <form className="ld-waitlist-form" onSubmit={submit} noValidate data-testid="waitlist-form">
      <label className="sr-only" htmlFor="wl-email">Email</label>
      <input
        id="wl-email"
        className="input"
        type="email"
        inputMode="email"
        autoComplete="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
          if (error) setState({ kind: 'idle' });
        }}
        aria-invalid={error}
        aria-describedby="wl-msg"
        required
        data-testid="waitlist-email"
      />
      <div className="ld-waitlist-hp" aria-hidden="true">
        <label>
          Company
          <input tabIndex={-1} autoComplete="off" value={company} onChange={(e) => setCompany(e.target.value)} />
        </label>
      </div>
      <button type="submit" className="btn btn-primary btn-lg" disabled={state.kind === 'sending'} data-testid="waitlist-submit">
        {state.kind === 'sending' ? 'Joining…' : 'Join the waitlist'}
      </button>
      <p id="wl-msg" className={error ? 'field-error' : 'small muted'} role={error ? 'alert' : undefined}>
        {error ? state.message : 'We’ll only use your email to tell you about Ori.'}
      </p>
    </form>
  );
}
