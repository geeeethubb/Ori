import { Link, Navigate } from 'react-router';
import { useAuth } from '../auth.tsx';
import { Skeleton } from '../components/ui.tsx';
import { usePageTitle } from './parts/usePageTitle.ts';
import './pages.css';

const STEPS = ['Bring context', 'Discover apps', 'Make it yours', 'Build and use', 'Grow together'];

export function WelcomePage() {
  usePageTitle('AI App Store');
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="container stack-l" aria-busy="true">
        <div className="hero stack">
          <Skeleton h={14} w="30%" />
          <Skeleton h={48} w="70%" />
          <Skeleton h={20} w="90%" />
          <Skeleton h={20} w="80%" />
        </div>
        <div className="purpose-row">
          <Skeleton h={140} />
          <Skeleton h={140} />
        </div>
      </div>
    );
  }
  if (user) return <Navigate to="/for-you" replace />;

  return (
    <div className="container stack-l">
      <section className="hero">
        <p className="eyebrow">A personal AI app store</p>
        <h1>A collection that grows with you.</h1>
        <p className="lede">
          Bring the context you've already shared with your AI. Discover apps made for your workflows, your goals and your curiosity.
          Build one, add it to your home screen, and use it every day.
        </p>
        <div className="row st-hero-actions">
          <Link to="/signup" className="btn btn-primary btn-lg" data-testid="welcome-signup">
            Create your account
          </Link>
          <Link to="/login" className="btn btn-secondary btn-lg" data-testid="welcome-login">
            Sign in
          </Link>
        </div>
      </section>

      <section className="purpose-row" aria-label="Two kinds of apps">
        <div className="purpose-card work">
          <span className="badge badge-work">Get things done</span>
          <h3>Tools for the work in front of you</h3>
          <p className="muted small">Small apps shaped around your real commitments, with the fields and reminders you actually need.</p>
          <div className="chips st-examples">
            <span className="chip">Follow-up board</span>
            <span className="chip">Study planner</span>
          </div>
        </div>
        <div className="purpose-card explore">
          <span className="badge badge-explore">Explore life</span>
          <h3>Companions for your curiosity</h3>
          <p className="muted small">Journals and trackers that make a hobby stick, with a gentle prompt when you want one.</p>
          <div className="chips st-examples">
            <span className="chip">Photo walk journal</span>
            <span className="chip">Music practice companion</span>
          </div>
        </div>
      </section>

      <section className="st-section">
        <h2>How it works</h2>
        <ol className="st-steps">
          {STEPS.map((step, i) => (
            <li key={step}>
              <span className="st-step-num" aria-hidden="true">{i + 1}</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </section>

      <p className="small muted st-footer-note">
        <Link to="/pricing">14 days free, then $7.50/month for two months, then $15/month. No payment needed now.</Link>
      </p>
    </div>
  );
}
