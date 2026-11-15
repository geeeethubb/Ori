import { BRAND } from '@shared/brand.ts';
import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { ApiError, describeError, isNative } from '../api.ts';
import { useAuth } from '../auth.tsx';
import { Skeleton } from '../components/ui.tsx';
import { safeNextPath } from './parts/helpers.ts';
import { usePageTitle } from './parts/usePageTitle.ts';
import { EXAMPLE_PATH } from './WelcomePage.tsx';
import './pages.css';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const AUTH_PAGE_RE = /^\/(?:login|signup)(?:[/?#]|$)/;

interface FormError {
  message: string;
  code: string;
}

/**
 * Where a successful sign-in or sign-up goes: the intended same-site destination, kept exactly
 * (an app's own URL with its query, such as /apps/{id}/?install=1, included); otherwise the Agent
 * after sign-up and the Playground after sign-in. Never back to a sign-in page.
 */
export function authDestination(rawNext: string | null | undefined, mode: 'login' | 'signup'): string {
  const fallback = mode === 'signup' ? '/agent' : '/playground';
  const next = safeNextPath(rawNext, fallback);
  return AUTH_PAGE_RE.test(next) ? fallback : next;
}

export function LoginPage({ mode }: { mode: 'login' | 'signup' }) {
  const isSignup = mode === 'signup';
  usePageTitle(isSignup ? `Create your account · ${BRAND.name}` : `Sign in · ${BRAND.name}`);
  const { user, loading, login, signup } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const rawNext = params.get('next');
  const destination = authDestination(rawNext, mode);
  const toApp = destination.startsWith('/apps/');
  // Arriving from the landing's "Try an example": say why there is a form first.
  const toExample = destination === EXAMPLE_PATH;
  const nextQuery = rawNext ? `?next=${encodeURIComponent(rawNext)}` : '';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<FormError | null>(null);

  if (loading) {
    return (
      <div className="card auth-card stack" aria-busy="true">
        <Skeleton h={32} w="60%" />
        <Skeleton h={46} />
        <Skeleton h={46} />
        <Skeleton h={52} />
      </div>
    );
  }
  if (user) return <Navigate to={destination} replace />;

  // The Android shell's origin is also "localhost", so the hint is web-only.
  const isLocal = !isNative() && ['localhost', '127.0.0.1'].includes(window.location.hostname);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const trimmedEmail = email.trim();
    if (!EMAIL_RE.test(trimmedEmail)) {
      setError({ message: 'Enter a valid email address.', code: 'invalid' });
      return;
    }
    if (password.length < 8) {
      setError({ message: 'Use at least 8 characters for your password.', code: 'invalid' });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (isSignup) await signup(trimmedEmail, password, displayName.trim() || undefined);
      else await login(trimmedEmail, password);
      navigate(destination, { replace: true });
    } catch (err) {
      setError({ message: describeError(err), code: err instanceof ApiError ? err.code : 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card auth-card">
      <p className="eyebrow">{isSignup ? 'Welcome' : 'Welcome back'}</p>
      <h1>{isSignup ? 'Create your account' : 'Sign in'}</h1>
      <p className="muted small" data-testid="auth-lede">
        {toApp
          ? 'Then your app opens right where you were going.'
          : toExample
            ? `Then try the example with ${BRAND.name}. It is labelled as an example, and nothing is sent until you press send.`
            : isSignup
              ? `Your apps, and what you share with ${BRAND.name}, in one place.`
              : 'Pick up where you left off.'}
      </p>
      <form className="st-auth-form" onSubmit={(e) => void onSubmit(e)} noValidate>
        {isSignup && (
          <div className="field">
            <label className="field-label" htmlFor="st-name">What should we call you?</label>
            <input
              id="st-name"
              className="input"
              autoComplete="name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={60}
              placeholder="Your first name is fine"
              data-testid="auth-name"
            />
          </div>
        )}
        <div className="field">
          <label className="field-label" htmlFor="st-email">Email</label>
          <input
            id="st-email"
            className="input"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            data-testid="auth-email"
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="st-password">Password</label>
          <input
            id="st-password"
            className="input"
            type="password"
            autoComplete={isSignup ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            data-testid="auth-password"
          />
          {isSignup && <span className="field-help">At least 8 characters.</span>}
        </div>
        {error && (
          <p className="field-error" role="alert" data-testid="auth-error">
            {error.message}
            {error.code === 'exists' && (
              <>
                {' '}
                <Link to={`/login${nextQuery}`}>Sign in instead</Link>.
              </>
            )}
          </p>
        )}
        <button type="submit" className="btn btn-primary btn-lg btn-block" data-testid="auth-submit" disabled={busy}>
          {busy ? (isSignup ? 'Creating your account…' : 'Signing in…') : isSignup ? 'Create your account' : 'Sign in'}
        </button>
      </form>
      <p className="small muted st-auth-note">
        {isSignup ? 'Already have an account? ' : 'New here? '}
        <Link to={`${isSignup ? '/login' : '/signup'}${nextQuery}`} data-testid="auth-switch">
          {isSignup ? 'Sign in' : 'Create your account'}
        </Link>
      </p>
      <p className="tiny faint">Prototype sign-in. Use any email; passwords are stored hashed on this server only.</p>
      {isLocal && (
        <p className="tiny faint" data-testid="auth-demo-hint">
          Demo account on this machine: made by npm run seed, with example content only. Its sign-in is in docs/DEMO.md.
        </p>
      )}
    </div>
  );
}
