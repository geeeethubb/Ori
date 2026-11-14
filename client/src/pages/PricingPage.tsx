import { Link } from 'react-router';
import type { UserDto } from '@shared/api.ts';
import { useAuth } from '../auth.tsx';
import { useToast } from '../components/ui.tsx';
import { PLAN_LABELS, daysLeft, formatDate, pluralize } from './parts/helpers.ts';
import { usePageTitle } from './parts/usePageTitle.ts';
import './pages.css';

const PLAN_ROWS = [
  { when: 'Days 1 to 14', price: 'Free', detail: 'The full product: build several apps, revise them, add them to your home screen.' },
  { when: 'The next two months', price: '$7.50 / month', detail: 'Everything stays on while your collection takes shape.' },
  { when: 'After that', price: '$15 / month', detail: 'The regular price. Your apps stay viewable and exportable even if you stop.' },
];

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
        Your trial ended {formatDate(user.trialEndsAt)}. You keep access to view and export your apps.
      </p>
    );
  }
  return <p data-testid="pricing-trial">Your plan: {PLAN_LABELS[user.plan]}.</p>;
}

export function PricingPage() {
  usePageTitle('Pricing · AI App Store');
  const { user } = useAuth();
  const { toast } = useToast();
  const allowance = user ? `${user.aiGenerationAllowance.toLocaleString()} generations per month` : 'hundreds of generations per month';

  return (
    <div className="container-narrow stack-l">
      <header className="st-page-head">
        <p className="eyebrow">Early access</p>
        <h1>Simple, honest pricing (hypothesis)</h1>
        <p className="lede">Try everything free for two weeks. If it earns a place on your home screen, keep it for less than a coffee a week.</p>
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

      <section className="card card-pad stack">
        <h2 className="st-h2-sm">What is included</h2>
        <p>Generous AI fair-use allowance: {allowance} (shown in your account). Ordinary data entry never uses AI.</p>
        <p>No one-app cap. Build the follow-up board and the photo journal, and the next thing after that.</p>
        {user ? (
          <TrialStatus user={user} />
        ) : (
          <p className="muted small">
            <Link to="/signup">Create an account</Link> to start your 14 days.
          </p>
        )}
      </section>

      <section className="card card-pad stack">
        <p className="small muted">No payment is collected in this prototype. If a trial ends, you keep access to view and export your apps.</p>
        <div className="row">
          <button type="button" className="btn btn-secondary" onClick={() => toast('Noted')} data-testid="pricing-notify">
            Notify me when billing opens
          </button>
          <span className="tiny faint">This is not a purchase. Nothing is charged.</span>
        </div>
      </section>
    </div>
  );
}
