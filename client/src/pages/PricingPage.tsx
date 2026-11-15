/**
 * Early access pricing (audit P2-03): the existing offer exactly as implemented (14 days free, then
 * $7.50 a month for two months, then $15 a month), the AI allowance in plain words, and what stays
 * available if someone stops. This prototype collects no payment: there is no checkout, no billing
 * and nothing to subscribe to here.
 */
import { BRAND } from '@shared/brand.ts';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import type { UserDto } from '@shared/api.ts';
import { api } from '../api.ts';
import { useAuth } from '../auth.tsx';
import { PLAN_LABELS, daysLeft, formatDate, pluralize } from './parts/helpers.ts';
import { usePageTitle } from './parts/usePageTitle.ts';
import './pages.css';

const PLAN_ROWS = [
  { when: 'Days 1 to 14', price: 'Free', detail: 'Everything: make apps, change them with Ori, add them to your home screen.' },
  { when: 'The next two months', price: '$7.50 / month', detail: 'Everything stays on while your collection takes shape.' },
  { when: 'After that', price: '$15 / month', detail: 'The regular price.' },
];

/**
 * What the server meters (one generation each): an Agent reply, a round of Playground suggestions, an
 * app preview (even if no app is made from it), a proposed change, and an imported profile. Making
 * the app you previewed, applying a change and using your apps never count.
 */
const COUNTS_AS_ONE = `each reply, set of suggestions, app preview or proposed change from ${BRAND.name} counts as one, as does each profile you import.`;

/** The monthly AI allowance in plain words. */
export function allowanceSentence(allowance: number | null): string {
  if (allowance === null || !Number.isFinite(allowance) || allowance <= 0) {
    return `A monthly allowance of AI generations: ${COUNTS_AS_ONE}`;
  }
  return `${allowance.toLocaleString('en-US')} AI generations a month. ${COUNTS_AS_ONE.charAt(0).toUpperCase()}${COUNTS_AS_ONE.slice(1)}`;
}

/** The server's configured allowance: the account's when signed in, else the public health check's. */
function useAllowance(user: UserDto | null): number | null {
  const [publicAllowance, setPublicAllowance] = useState<number | null>(null);
  useEffect(() => {
    if (user) return;
    let cancelled = false;
    api<{ aiGenerationAllowance?: number }>('/api/health')
      .then((h) => {
        if (!cancelled && typeof h.aiGenerationAllowance === 'number') setPublicAllowance(h.aiGenerationAllowance);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [user]);
  return user ? user.aiGenerationAllowance : publicAllowance;
}

function TrialStatus({ user }: { user: UserDto }) {
  const ended = new Date(user.trialEndsAt).getTime() < Date.now();
  if (user.plan === 'trial' && !ended) {
    return (
      <p data-testid="pricing-trial">
        Your trial ends {formatDate(user.trialEndsAt)} ({pluralize(daysLeft(user.trialEndsAt), 'day')} left).
      </p>
    );
  }
  if (user.plan === 'trial' || user.plan === 'paused') {
    return (
      <p data-testid="pricing-trial">
        Your trial ended {formatDate(user.trialEndsAt)}. You can still open, use and export your apps.
      </p>
    );
  }
  return <p data-testid="pricing-trial">Your plan: {PLAN_LABELS[user.plan]}.</p>;
}

export function PricingPage() {
  usePageTitle(`Early access pricing · ${BRAND.name}`);
  const { user } = useAuth();
  const allowance = useAllowance(user);

  return (
    <div className="container-narrow stack-l">
      <header className="st-page-head">
        <h1>Early access pricing</h1>
        <p className="lede">Try everything free for 14 days. No payment is collected in this prototype.</p>
      </header>

      <table className="st-plan-table">
        <thead>
          <tr>
            <th scope="col">When</th>
            <th scope="col">Price</th>
            <th scope="col">What you get</th>
          </tr>
        </thead>
        <tbody>
          {PLAN_ROWS.map((row) => (
            <tr key={row.when}>
              <td><strong>{row.when}</strong></td>
              <td><span className="st-price">{row.price}</span></td>
              <td className="muted">{row.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="card card-pad stack" aria-labelledby="pricing-included">
        <h2 id="pricing-included" className="st-h2-sm">What is included</h2>
        <p data-testid="pricing-allowance">{allowanceSentence(allowance)}</p>
        <p className="muted">Using your apps never counts: adding entries and photos, timing practice, checking things off.</p>
        <p className="muted">No limit on how many apps you make.</p>
        {user ? (
          <TrialStatus user={user} />
        ) : (
          <p className="muted small">
            <Link to="/signup">Create an account</Link> to start your 14 days.
          </p>
        )}
      </section>

      <section className="card card-pad stack" aria-labelledby="pricing-stop">
        <h2 id="pricing-stop" className="st-h2-sm">If you stop</h2>
        <p data-testid="pricing-stop-text">
          You can still open, use and export every app you made, and what you share with {BRAND.name} is still saved. What pauses: {BRAND.name}'s
          replies and suggestions, app previews, and making or changing apps.
        </p>
        <p className="small muted" data-testid="pricing-no-payment">No payment is collected in this prototype, and nothing is charged.</p>
      </section>
    </div>
  );
}
