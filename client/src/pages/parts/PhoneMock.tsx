/**
 * Landing-page product composition: phone frames drawn in HTML/CSS showing the Agent, the Playground
 * and two visibly different apps (Riff: dark ink practice room; Light: paper contact sheet with real
 * CC0 example photographs). Static illustrations, labelled as examples; no live data.
 */
import { BRAND } from '@shared/brand.ts';
import { AppIcon } from '../../components/AppIcon.tsx';
import { BrandMark } from '../../components/BrandMark.tsx';
import { Icons } from '../../components/ui.tsx';
import { EXAMPLE_PHOTOS } from './MiniPreview.tsx';

export const EXAMPLE_NOTE = 'I like this sound and have 15 minutes to practice.';

interface PhoneFrameProps {
  children: React.ReactNode;
  /** Visually hidden description for screen readers. */
  description: string;
  theme?: 'bright' | 'ink' | 'paper';
  className?: string;
}

export function PhoneFrame({ children, description, theme = 'bright', className }: PhoneFrameProps) {
  return (
    <figure className={`ph${className ? ` ${className}` : ''}`}>
      <div className="ph-screen themed" data-theme={theme} aria-hidden="true">
        <div className="ph-status"><span className="ph-notch" /></div>
        {children}
      </div>
      <figcaption className="sr-only">{description}</figcaption>
    </figure>
  );
}

/** The Agent: a note with a saved link, then a concise reply with a proposal card. */
export function AgentScreen() {
  return (
    <PhoneFrame description={`The Agent screen: a note saying "${EXAMPLE_NOTE}" with a saved YouTube link marked "Title read, content not read", and the agent's reply proposing Riff, a practice room, with a Make mine button.`}>
      <div className="ph-bar">
        <BrandMark size={16} decorative />
        <span>Agent</span>
      </div>
      <div className="ph-agent">
        <div className="ph-note">
          <span className="ph-eyebrow">Typed note</span>
          <p>{EXAMPLE_NOTE}</p>
          <div className="ph-linkcard">
            <span className="ph-thumb" />
            <span>
              <strong>Fingerpicked acoustic riff</strong>
              <em>YouTube · Title read, content not read</em>
            </span>
          </div>
        </div>
        <div className="ph-reply">
          <span className="ph-avatar">{Icons.agent}</span>
          <p>Got it. I read the title, not the video. Two directions:</p>
        </div>
        <div className="ph-proposal">
          <div className="ph-proposal-head">
            <AppIcon icon={{ symbol: 'guitar', color: 'ink' }} size={22} title="Riff icon" />
            <span>
              <small>Make an app</small>
              <strong>Riff</strong>
            </span>
          </div>
          <p>A timer sized to 15 minutes turns a liked sound into a session you actually play tonight.</p>
          <span className="ph-btn ph-btn-primary">Make mine</span>
        </div>
        <div className="ph-proposal ph-proposal-quiet">
          <div className="ph-proposal-head">
            <AppIcon icon={{ symbol: 'headphones', color: 'lilac' }} size={22} title="Exploration icon" />
            <span>
              <small>Explore</small>
              <strong>A listening-and-playing session</strong>
            </span>
          </div>
          <span className="ph-btn">Explore</span>
        </div>
      </div>
    </PhoneFrame>
  );
}

/** The Playground: a featured card plus two smaller, visibly different cards. */
export function PlaygroundScreen() {
  return (
    <PhoneFrame description="The Playground screen: the heading 'A few things you might be into', a featured Light card with photo tiles, and smaller cards for Riff and People.">
      <div className="ph-bar">
        <BrandMark size={16} decorative />
        <span>Playground</span>
      </div>
      <div className="ph-pg">
        <h3>A few things you might be into.</h3>
        <div className="ph-card">
          <div className="ph-card-media ph-sheet">
            {EXAMPLE_PHOTOS.slice(0, 3).map((src) => <img key={src} src={src} alt="" loading="lazy" decoding="async" />)}
          </div>
          <div className="ph-card-body">
            <small>Make an app</small>
            <strong>Light</strong>
            <p>Your walks keep stopping for shadows; a contact sheet makes noticing light a habit.</p>
            <span className="ph-btn ph-btn-primary">Make mine</span>
          </div>
        </div>
        <div className="ph-card-row">
          <div className="ph-card ph-card-small">
            <div className="ph-card-media ph-ink"><span className="ph-mini-timer">15:00</span></div>
            <div className="ph-card-body"><strong>Riff</strong><small>Make an app</small></div>
          </div>
          <div className="ph-card ph-card-small">
            <div className="ph-card-media ph-mint">
              <span className="ph-row"><i>M</i> Maya · Today</span>
              <span className="ph-row"><i>A</i> Alex · Fri</span>
            </div>
            <div className="ph-card-body"><strong>People</strong><small>Add to app</small></div>
          </div>
        </div>
      </div>
    </PhoneFrame>
  );
}

/** Riff: a dark listening room with a big timer. Session/control-first. */
export function RiffScreen({ minutes = 15 }: { minutes?: number }) {
  return (
    <PhoneFrame theme="ink" description={`Riff, a practice app with a dark ink look: tonight's prompt, a large ${minutes}:00 timer, preset chips 10, 15 and 25 minutes, a lime Start button and a tempo of 72 bpm.`}>
      <div className="ph-bar ph-bar-app">
        <AppIcon icon={{ symbol: 'guitar', color: 'ink' }} size={22} title="Riff icon" />
        <span>Riff</span>
        <em>A little practice tonight</em>
      </div>
      <div className="ph-riff">
        <div className="ph-prompt">
          <small>Tonight</small>
          <p>Play the riff at half tempo three times, then once at full speed</p>
        </div>
        <div className="ph-timer">{String(minutes).padStart(2, '0')}:00</div>
        <div className="ph-presets">
          {[10, 15, 25].map((m) => <span key={m} className={m === minutes ? 'is-on' : ''}>{m} min</span>)}
        </div>
        <span className="ph-btn ph-btn-lime">{Icons.play} Start</span>
        <div className="ph-tempo">
          <span>Tempo</span>
          <strong>72 bpm</strong>
          <span className="ph-tempo-dots"><i /><i /><i /><i /></span>
        </div>
        <div className="ph-sources">
          <small>Inspiration</small>
          <span>Fingerpicked acoustic riff · YouTube</span>
        </div>
      </div>
    </PhoneFrame>
  );
}

/** Light: a paper contact sheet with real example photographs. Image-first. */
export function LightScreen() {
  return (
    <PhoneFrame theme="paper" description="Light, a photography app with a warm paper look: a weekly light exercise, a contact sheet of four photographs of sunlight and shadows, and an Add photo button.">
      <div className="ph-bar ph-bar-app">
        <AppIcon icon={{ symbol: 'aperture', color: 'charcoal' }} size={22} title="Light icon" />
        <span>Light</span>
        <em>Find the light</em>
      </div>
      <div className="ph-light">
        <div className="ph-exercise">
          <small>Light exercise</small>
          <p>Shoot only shadows and reflections</p>
        </div>
        <div className="ph-contact">
          {EXAMPLE_PHOTOS.map((src, i) => (
            <figure key={src}>
              <img src={src} alt="" loading={i < 2 ? 'eager' : 'lazy'} decoding="async" />
              <figcaption>{['Low sun, brick wall', 'Trees on the pavement', 'Shadow of a tree', 'Scaffolding at noon'][i]}</figcaption>
            </figure>
          ))}
        </div>
        <span className="ph-btn ph-btn-charcoal">{Icons.camera} Add photo</span>
      </div>
    </PhoneFrame>
  );
}

/** The inspiration that starts the story: the note and the saved link, honestly labelled. */
export function InspirationNote() {
  return (
    <div className="ld-note card" aria-label="An example note shared with the agent">
      <div className="row-between">
        <span className="eyebrow">A note to the agent</span>
        <span className="badge badge-sample">Example</span>
      </div>
      <p className="ld-note-text">{EXAMPLE_NOTE} It is a fingerpicked acoustic riff I keep coming back to.</p>
      <div className="ld-note-link">
        <span className="ld-note-thumb" aria-hidden="true">{Icons.play}</span>
        <span>
          <strong>Fingerpicked acoustic riff</strong>
          <span className="small muted">YouTube · Title read, content not read</span>
        </span>
      </div>
      <p className="tiny faint">{BRAND.shortName} never claims to have watched a video it only saved.</p>
    </div>
  );
}
