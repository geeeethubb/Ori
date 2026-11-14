import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '../auth.tsx';
import { ModeBadge } from './parts/badges.tsx';
import { PLAN_LABELS, daysLeft, formatDate, pluralize } from './parts/helpers.ts';
import { usePageTitle } from './parts/usePageTitle.ts';
import './pages.css';

export function AccountPage() {
  usePageTitle('Account · AI App Store');
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);

  if (!user) return null;

  const used = user.aiGenerationsThisMonth;
  const allowance = Math.max(1, user.aiGenerationAllowance);
  const pct = Math.min(100, Math.round((used / allowance) * 100));
  const trialEnded = new Date(user.trialEndsAt).getTime() < Date.now();
  const left = daysLeft(user.trialEndsAt);

  async function signOut() {
    setSigningOut(true);
    try {
      await logout();
    } finally {
      navigate('/', { replace: true });
    }
  }

  return (
    <div className="container-narrow stack-l">
      <header className="st-page-head">
        <h1>Account</h1>
        <p className="lede">{user.displayName}</p>
        <p className="muted small st-wrap" data-testid="account-email">{user.email}</p>
      </header>

      <section className="card card-pad stack" aria-labelledby="st-plan-title">
        <div className="row-between">
          <h2 id="st-plan-title" className="st-h2-sm">Your plan</h2>
          {user.premiumActive ? <span className="badge badge-ok">Active</span> : <span className="badge badge-warn">Paused</span>}
        </div>
        <dl className="st-kv">
          <dt>Plan</dt>
          <dd data-testid="account-plan">{PLAN_LABELS[user.plan]}</dd>
          <dt>Trial started</dt>
          <dd>{formatDate(user.trialStartedAt)}</dd>
          <dt>{trialEnded ? 'Trial ended' : 'Trial ends'}</dt>
          <dd data-testid="account-trial-ends">
            {formatDate(user.trialEndsAt)}
            {!trialEnded && ` (${pluralize(left, 'day')} left)`}
          </dd>
          <dt>Member since</dt>
          <dd>{formatDate(user.createdAt)}</dd>
        </dl>
        {!user.premiumActive && (
          <p className="small muted">Building and revising are paused. You can still open, use and export every app you made.</p>
        )}
        <p className="small">
          <Link to="/pricing">See pricing</Link>
        </p>
      </section>

      <section className="card card-pad stack" aria-labelledby="st-ai-title">
        <div className="row-between">
          <h2 id="st-ai-title" className="st-h2-sm">AI use this month</h2>
          <ModeBadge mode={user.modelMode} />
        </div>
        <div className="st-usage" role="progressbar" aria-valuemin={0} aria-valuemax={allowance} aria-valuenow={used} aria-label="AI generations used this month">
          <div className="st-usage-fill" style={{ width: `${pct}%` }} />
        </div>
        <p className="small" data-testid="account-usage">
          {used.toLocaleString()} of {allowance.toLocaleString()} generations used. Recommendations, new apps and changes count; ordinary data entry never does.
        </p>
      </section>

      <section className="card card-pad stack" aria-labelledby="st-data-title">
        <h2 id="st-data-title" className="st-h2-sm">Your data</h2>
        <p className="small">Each app can be exported from its settings as JSON.</p>
        <p className="small muted">
          Everything we know about you is editable in <Link to="/context">Your Context</Link>. Removing it there never deletes the apps you built.
        </p>
      </section>

      <div className="row">
        <button type="button" className="btn btn-secondary" onClick={() => void signOut()} disabled={signingOut} data-testid="account-signout">
          {signingOut ? 'Signing out…' : 'Sign out'}
        </button>
        <Link to="/collection" className="btn btn-ghost">
          My Collection
        </Link>
      </div>
    </div>
  );
}
