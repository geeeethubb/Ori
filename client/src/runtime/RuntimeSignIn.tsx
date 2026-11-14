/**
 * Inline sign-in / sign-up shown at the app's own URL. Installed iOS web apps keep their own
 * cookies, so signing in must happen inside the app's scope, never on another page.
 */
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { describeError } from '../api.ts';
import { useAuth } from '../auth.tsx';
import { AppIcon } from '../components/AppIcon.tsx';
import { bootTarget, useStandalone } from './runtimeUtils.ts';

export function RuntimeSignIn({ appId }: { appId: string }) {
  const auth = useAuth();
  const boot = bootTarget(appId);
  const standalone = useStandalone();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const trimmed = email.trim();
    if (!trimmed || !password) {
      setError('Enter your email and password.');
      return;
    }
    if (mode === 'signup' && password.length < 8) {
      setError('Choose a password with at least 8 characters.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (mode === 'login') await auth.login(trimmed, password);
      else await auth.signup(trimmed, password, name.trim() || undefined);
      // On success the page re-renders with the user and loads the app in place.
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rt-root">
      <div className="rt-page rt-page-center">
        <div className="card card-pad rt-signin" data-testid="rt-signin">
          <div className="rt-signin-head">
            {boot && <AppIcon icon={boot.icon} size={56} title={`${boot.name} icon`} />}
            <h1>{mode === 'login' ? 'Sign in' : 'Create your account'}</h1>
            <p className="muted">
              {boot ? `to open ${boot.name}.` : 'to open your app.'} Your apps and entries are saved to your account, so they come back on any device.
            </p>
          </div>
          {auth.offline && (
            <div className="banner banner-warn" role="status">
              <span>You appear to be offline. Signing in needs a connection.</span>
              <button type="button" className="btn btn-sm btn-secondary" onClick={() => void auth.refresh()}>
                Retry
              </button>
            </div>
          )}
          <form className="stack rt-signin-form" onSubmit={submit} noValidate>
            {mode === 'signup' && (
              <div className="field">
                <label className="field-label" htmlFor="rt-name">
                  Your name <span className="faint">(optional)</span>
                </label>
                <input id="rt-name" className="input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
            )}
            <div className="field">
              <label className="field-label" htmlFor="rt-email">
                Email
              </label>
              <input
                id="rt-email"
                className="input"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                data-testid="rt-signin-email"
              />
            </div>
            <div className="field">
              <label className="field-label" htmlFor="rt-password">
                Password
              </label>
              <input
                id="rt-password"
                className="input"
                type="password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                data-testid="rt-signin-password"
              />
            </div>
            {error && (
              <div className="field-error" role="alert" data-testid="rt-signin-error">
                {error}
              </div>
            )}
            <button type="submit" className="btn btn-primary btn-block btn-lg" data-testid="rt-signin-submit" disabled={busy}>
              {busy ? 'One moment…' : mode === 'login' ? 'Sign in' : 'Create account'}
            </button>
          </form>
          <button
            type="button"
            className="btn btn-ghost btn-block"
            data-testid="rt-signin-toggle"
            onClick={() => {
              setMode((m) => (m === 'login' ? 'signup' : 'login'));
              setError(null);
            }}
          >
            {mode === 'login' ? 'New here? Create an account' : 'Have an account? Sign in'}
          </button>
          {!standalone && (
            <p className="small faint rt-center-text">
              <Link to="/">Back to AI App Store</Link>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
