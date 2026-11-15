/**
 * Settings: account, plan and trial, AI use this month (with the Sample/Live indicator), your data
 * (export per app, memory), appearance, sign out. Memory and import have their own pages.
 */
import { BRAND } from '@shared/brand.ts';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import type { AppSummaryDto } from '@shared/api.ts';
import { api, apiBase } from '../api.ts';
import { useAuth } from '../auth.tsx';
import { AppIcon } from '../components/AppIcon.tsx';
import { Icons } from '../components/ui.tsx';
import { ModeBadge } from './parts/badges.tsx';
import { PLAN_LABELS, daysLeft, formatDate, pluralize } from './parts/helpers.ts';
import { useLoad } from './parts/useLoad.ts';
import { usePageTitle } from './parts/usePageTitle.ts';
import './pages.css';

export function SettingsPage() {
  usePageTitle(`Settings · ${BRAND.name}`);
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);
  const { data: appsData } = useLoad(() => api<{ apps: AppSummaryDto[] }>('/api/apps'));

  if (!user) return null;

  const used = user.aiGenerationsThisMonth;
  const allowance = Math.max(1, user.aiGenerationAllowance);
  const pct = Math.min(100, Math.round((used / allowance) * 100));
  const trialEnded = new Date(user.trialEndsAt).getTime() < Date.now();
  const left = daysLeft(user.trialEndsAt);
  const apps = (appsData?.apps ?? []).filter((a) => !a.archivedAt);

  async function signOut() {
    setSigningOut(true);
    try {
      await logout();
    } finally {
      navigate('/', { replace: true });
    }
  }

  return (
    <div className="container-mid se">
      <header className="se-head">
        <h1>Settings</h1>
        <nav className="se-links" aria-label="Settings pages">
          <Link to="/settings/memory" className="se-link" data-testid="settings-memory">
            <span className="se-link-icon">{Icons.bookmark}</span>
            <span>
              <strong>What you've shared</strong>
              <span className="small muted">Interests, needs, sources and things you shared. Edit or forget.</span>
            </span>
            <span className="se-link-chev" aria-hidden="true">{Icons.chevronRight}</span>
          </Link>
          <Link to="/settings/import" className="se-link" data-testid="settings-import">
            <span className="se-link-icon">{Icons.upload}</span>
            <span>
              <strong>Bring context from your AI</strong>
              <span className="small muted">Optional: paste a profile, upload a file or answer four questions.</span>
            </span>
            <span className="se-link-chev" aria-hidden="true">{Icons.chevronRight}</span>
          </Link>
        </nav>
      </header>

      <div className="se-grid">
        <section className="card card-pad se-card" aria-labelledby="se-account-title">
          <h2 id="se-account-title" className="st-h2-sm">Account</h2>
          <dl className="st-kv">
            <dt>Name</dt>
            <dd>{user.displayName || '—'}</dd>
            <dt>Email</dt>
            <dd data-testid="account-email">{user.email}</dd>
            <dt>Member since</dt>
            <dd>{formatDate(user.createdAt)}</dd>
          </dl>
          <button type="button" className="btn btn-secondary" onClick={() => void signOut()} disabled={signingOut} data-testid="account-signout">
            {Icons.logout} {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </section>

        <section className="card card-pad se-card" aria-labelledby="se-plan-title">
          <div className="row-between">
            <h2 id="se-plan-title" className="st-h2-sm">Plan</h2>
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
          </dl>
          {!user.premiumActive && (
            <p className="small muted">
              {BRAND.name}'s replies and suggestions, app previews, and making or changing apps are paused. You can still open, use and export every
              app you made, and what you share is still saved.
            </p>
          )}
          <p className="small"><Link to="/pricing">See pricing</Link></p>
        </section>

        <section className="card card-pad se-card" aria-labelledby="se-ai-title">
          <div className="row-between">
            <h2 id="se-ai-title" className="st-h2-sm">AI use this month</h2>
            <ModeBadge mode={user.modelMode} testId="settings-sample-badge" />
          </div>
          <div className="st-usage" role="progressbar" aria-valuemin={0} aria-valuemax={allowance} aria-valuenow={used} aria-label="AI generations used this month">
            <div className="st-usage-fill" style={{ width: `${pct}%` }} />
          </div>
          <p className="small" data-testid="account-usage">
            {used.toLocaleString()} of {allowance.toLocaleString()} generations. Replies, suggestions, app previews, proposed changes and imported
            profiles count; using your apps never does.
          </p>
          {user.modelMode === 'sample' && <p className="small muted">Sample mode: replies and proposals come from the built-in catalog and are labelled as such.</p>}
        </section>

        <section className="card card-pad se-card" aria-labelledby="se-data-title">
          <h2 id="se-data-title" className="st-h2-sm">Your data</h2>
          <p className="small muted">Each app can be exported as a JSON file with its definition, history and entries. Forgetting something in What you've shared never deletes an app.</p>
          {apps.length > 0 ? (
            <ul className="se-exports">
              {apps.map((a) => (
                <li key={a.id}>
                  <AppIcon icon={a.icon} name={a.name} size={28} title="" />
                  <span className="se-export-name">{a.name}</span>
                  <a className="btn btn-ghost btn-sm" style={{ minHeight: 44 }} href={`${apiBase()}/api/apps/${a.id}/export`} download={`${a.name.replace(/[^\w-]+/g, '-').toLowerCase()}.json`} data-testid="settings-export">
                    {Icons.download} Export
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="small muted">No apps yet.</p>
          )}
        </section>

        <section className="card card-pad se-card" aria-labelledby="se-look-title">
          <h2 id="se-look-title" className="st-h2-sm">Appearance</h2>
          <p className="small muted">
            {BRAND.name} itself stays bright and quiet. Every app has its own look, type and density. To change one, open the app and choose Edit with {BRAND.name}.
          </p>
        </section>
      </div>
    </div>
  );
}
