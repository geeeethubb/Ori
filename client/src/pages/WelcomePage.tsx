/**
 * Landing: the promise, one sentence, two actions, and a product composition that occupies real
 * space (Agent, Playground, two visibly different apps). Below: one transformation story, three
 * steps, and the trial line. No testimonials, counts or logos. Signed-in people go to the Playground.
 */
import { BRAND } from '@shared/brand.ts';
import { Link, Navigate } from 'react-router';
import { useAuth } from '../auth.tsx';
import { Icons, Skeleton } from '../components/ui.tsx';
import { AgentScreen, InspirationNote, LightScreen, PlaygroundScreen, RiffScreen } from './parts/PhoneMock.tsx';
import { usePageTitle } from './parts/usePageTitle.ts';
import './pages.css';

const STEPS = [
  { title: 'Share', body: 'A thought, a link or a screenshot. The agent says exactly what it read, and what it only saved.' },
  { title: 'Choose', body: 'Explore it, make a small app, add it to an app you already have, or just keep it.' },
  { title: 'Make it yours', body: 'Pick the one thing that matters, preview the real app, then use it from your home screen.' },
];

export function WelcomePage() {
  usePageTitle(BRAND.name);
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="container stack-l" aria-busy="true">
        <div className="ld-hero stack" style={{ alignItems: 'center' }}>
          <Skeleton h={14} w="20%" />
          <Skeleton h={56} w="70%" />
          <Skeleton h={20} w="60%" />
        </div>
        <Skeleton h={420} />
      </div>
    );
  }
  if (user) return <Navigate to="/playground" replace />;

  return (
    <div className="ld">
      <section className="ld-hero container">
        <p className="eyebrow ld-eyebrow">{BRAND.name}</p>
        <h1 className="ld-h1">{BRAND.tagline}</h1>
        <p className="ld-lede">{BRAND.description}</p>
        <div className="ld-cta">
          <Link to="/signup" className="btn btn-primary btn-lg" data-testid="welcome-signup">
            Make it yours
          </Link>
          <Link to="/signup?next=/agent" className="btn btn-secondary btn-lg" data-testid="welcome-example">
            Try an example
          </Link>
        </div>
      </section>

      <section className="ld-stage" aria-label="What it looks like: the Agent, the Playground, and two apps">
        <div className="ld-stage-scroll">
          <AgentScreen />
          <PlaygroundScreen />
          <RiffScreen />
          <LightScreen />
        </div>
        <p className="ld-stage-note tiny faint">
          Example content, not a real account. Photographs are public-domain (CC0) examples.
        </p>
      </section>

      <section className="ld-story" aria-labelledby="ld-story-title">
        <div className="ld-story-copy">
          <p className="eyebrow">One real example</p>
          <h2 id="ld-story-title">A reel you liked becomes a practice room.</h2>
          <p className="muted">
            You save a fingerpicked riff and type one line. The agent reads the line, says it did not watch the video, and offers two
            directions. You pick fifteen minutes. Riff arrives with that timer, a metronome, the link you saved, and a place to write
            what got easier. Tonight you actually play.
          </p>
        </div>
        <div className="ld-story-flow">
          <InspirationNote />
          <span className="ld-arrow" aria-hidden="true">{Icons.arrowRight}</span>
          <RiffScreen minutes={15} />
        </div>
      </section>

      <section className="ld-steps container-mid" aria-labelledby="ld-steps-title">
        <h2 id="ld-steps-title">Three steps, no questionnaire.</h2>
        <ol className="ld-steps-list">
          {STEPS.map((s, i) => (
            <li key={s.title}>
              <span className="ld-step-num" aria-hidden="true">{i + 1}</span>
              <div>
                <h3>{s.title}</h3>
                <p className="muted small">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="ld-cta ld-cta-bottom">
          <Link to="/signup" className="btn btn-primary btn-lg">Make it yours</Link>
          <Link to="/signup?next=/agent" className="btn btn-ghost btn-lg">Try an example</Link>
        </div>
      </section>

      <p className="ld-trial small muted">
        <Link to="/pricing">14 days free, then $7.50 a month for two months, then $15 a month. Nothing to pay now.</Link>
      </p>
    </div>
  );
}
