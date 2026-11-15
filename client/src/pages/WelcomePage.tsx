/**
 * Landing (references C and 01; ORI_DESIGN_SPEC section 6): the headline and one explanatory line,
 * "Make it yours" and "Try an example", and the product itself above the fold: three example apps
 * with their own identities and a home screen where Ori and each app have their own icon. Below, how
 * one example goes from a shared photo to an app on the home screen, drawn as example screens (pictures,
 * not controls), then a quiet footer with pricing. Signed-in people go to the Playground, as before.
 */
import { BRAND } from '@shared/brand.ts';
import { Link, Navigate } from 'react-router';
import { useAuth } from '../auth.tsx';
import { OriWordmark } from '../components/ori/OriWordmark.tsx';
import { Skeleton } from '../components/ui.tsx';
import { ExampleTag } from './parts/badges.tsx';
import { ExampleReady, ExampleReply, ExampleShare, LandingScene, OriAppIcon } from './parts/PhoneMock.tsx';
import { usePageTitle } from './parts/usePageTitle.ts';
import './pages.css';
import './landing.css';

/** "Make it yours": sign up, then the Agent (the sign-up page's own default destination). */
export const START_PATH = '/signup';
/**
 * Where "Try an example" lands after sign-up: the Agent's own labelled example (a photography note,
 * text only, that the person sends or changes; nothing is sent until they press send).
 */
export const EXAMPLE_PATH = '/agent?start=example';
/** "Try an example": the real example flow, which starts with an account (the auth pages keep `next`). */
export const TRY_EXAMPLE_PATH = `${START_PATH}?next=${encodeURIComponent(EXAMPLE_PATH)}`;
/** The walkthrough below the hero: one example, written for this page, never anyone's data. */
export const EXAMPLE_ANCHOR = 'example';

const STEPS = [
  { title: 'Share what caught your eye', body: 'A thought, a photo or a link. Ori says what it could read.', Art: ExampleShare },
  { title: 'Ori suggests a next step', body: 'Keep it, explore it, use an app you have, or preview a new one.', Art: ExampleReply },
  { title: 'Make it yours', body: 'Preview it, make it, then add it to your home screen. It opens on its own.', Art: ExampleReady },
] as const;

export function WelcomePage() {
  usePageTitle(BRAND.name);
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="ld" aria-busy="true">
        <div className="ld-hero">
          <div className="ld-copy">
            <Skeleton h={120} w="80%" />
            <Skeleton h={48} w="70%" />
            <Skeleton h={52} w="60%" />
          </div>
          <Skeleton h={360} />
        </div>
      </div>
    );
  }
  if (user) return <Navigate to="/playground" replace />;

  return (
    <div className="ld">
      <section className="ld-hero" aria-labelledby="ld-title">
        <div className="ld-copy">
          <h1 id="ld-title" className="ld-h1">{BRAND.headline}</h1>
          <p className="ld-lede">{BRAND.landingExplainer}</p>
          <div className="ld-cta">
            <Link to={START_PATH} className="btn btn-primary btn-lg" data-testid="welcome-signup">
              Make it yours
            </Link>
            <Link to={TRY_EXAMPLE_PATH} className="btn btn-secondary btn-lg" data-testid="welcome-example">
              Try an example
            </Link>
          </div>
          <p className="ld-signature">{BRAND.signature}</p>
        </div>
        <LandingScene />
      </section>

      <section id={EXAMPLE_ANCHOR} className="ld-example" tabIndex={-1} aria-labelledby="ld-example-title" data-testid="welcome-example-section">
        <div className="ld-example-head">
          <ExampleTag />
          <h2 id="ld-example-title">From a photo you liked to an app on your home screen.</h2>
          <p className="muted">One example, start to finish. It is written for this page, not taken from anyone's account.</p>
        </div>
        <ol className="ld-steps">
          {STEPS.map(({ title, body, Art }, i) => (
            <li key={title} className="ld-step">
              <div className="ld-step-head">
                <span className="ld-step-num" aria-hidden="true">{i + 1}</span>
                <div>
                  <h3>{title}</h3>
                  <p className="small muted">{body}</p>
                </div>
              </div>
              {/* A picture of the screen, not the screen: framed, scaled down, captioned, and never a control. */}
              <figure className="ld-step-art" aria-hidden="true">
                <div className="ld-screen">
                  <Art />
                </div>
                <figcaption className="ld-screen-caption">Example screen</figcaption>
              </figure>
            </li>
          ))}
        </ol>
        <div className="ld-example-cta">
          <Link to={START_PATH} className="btn btn-primary btn-lg" data-testid="welcome-example-start">
            Make it yours
          </Link>
          <Link to={TRY_EXAMPLE_PATH} className="btn btn-secondary btn-lg" data-testid="welcome-example-try">
            Try this example
          </Link>
          <span className="small muted">Both start by creating an account. The example is labelled, and nothing is sent until you press send.</span>
        </div>
      </section>

      <footer className="ld-foot">
        <span className="ld-foot-brand">
          <OriAppIcon size={44} />
          <span className="ld-foot-sep" aria-hidden="true" />
          <OriWordmark variant="ink" height={30} />
        </span>
        <p className="small muted">
          <Link to="/pricing" data-testid="welcome-pricing">Early access pricing</Link>: 14 days free, then $7.50 a month for two months, then
          $15 a month. No payment is collected in this prototype.
        </p>
      </footer>
    </div>
  );
}
