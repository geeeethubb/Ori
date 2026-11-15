/**
 * /ori: the isolated companion gallery. Every mood at every reference size on the real surfaces,
 * the wordmark and lockup, the parent and reference-app icons, the favicon, the operation-bound
 * mood logic and an accessible "Edit Light with Ori" control. Built-in art only: the page's own
 * code calls no API and no model and shows no account data, so it is safe for visual review and
 * screenshots. As on every route, the app-wide sign-in check (GET /api/auth/me) still runs, and the
 * browser may fetch the parent favicon and manifest that useInstallMeta links.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { ORI_MOODS, ORI_MOOD_LABELS, oriAppIconSvg, oriCompanionSvg, oriFaviconDocument, oriFaviconSvg, type OriMood } from '@shared/oriArt.ts';
import { BRAND, BRAND_COLORS, REFERENCE_APP_ICONS, referenceIcon, supersededIcons, type ReferenceAppKey } from '@shared/brand.ts';
import { appIconSvg } from '@shared/icons.ts';
import { AppIcon } from '../components/AppIcon.tsx';
import { OriCompanion } from '../components/ori/OriCompanion.tsx';
import { OriLockup, OriWordmark } from '../components/ori/OriWordmark.tsx';
import { NO_ORI_TOKEN, ORI_MOOD_TIMING, useOriMood, type OriOperationKind, type OriToken } from '../components/ori/useOriMood.ts';
import { useInstallMeta } from '../hooks/useInstallMeta.ts';
import { usePageTitle } from './parts/usePageTitle.ts';
import './oriGallery.css';

type Motion = 'auto' | 'none';

/** The real trigger behind each mood (spec section 5). "Listening" is a design label, not a recording claim. */
const MOOD_TRIGGERS: Record<OriMood, string> = {
  idle: 'Nothing in progress',
  attentive: 'Composer focus or typing. No microphone.',
  thinking: 'A share or change request is pending',
  discovery: 'A valid proposal arrived',
  building: 'A create or apply is pending',
  success: 'The server confirmed a usable result',
  clarify: 'A missing choice blocks the action',
  error: 'The active request failed',
};

const SIZES = [24, 40, 80, 160] as const;

const SURFACES: readonly { key: string; label: string; color: string; dark: boolean; note?: string }[] = [
  { key: 'canvas', label: 'Canvas', color: BRAND_COLORS.canvas, dark: false },
  { key: 'white', label: 'White', color: BRAND_COLORS.surface, dark: false },
  {
    key: 'lilac',
    label: 'Lilac',
    color: BRAND_COLORS.lilac,
    dark: false,
    note: 'On lilac the Making orbit ring (about 1.5:1) and the lime dots (about 1.3:1) are faint, so a state never rests on them: its text label stays beside the companion.',
  },
  {
    key: 'ink',
    label: 'Ink',
    color: BRAND_COLORS.ink,
    dark: true,
    note: 'Cobalt on ink is only about 2.5:1. Inside dark apps, seat the companion on a lilac disc (as in Riff) or use the white single-colour version below.',
  },
];

const REFERENCE_KEYS = Object.keys(REFERENCE_APP_ICONS) as ReferenceAppKey[];

/** The parent's install identity (Ori favicon and theme color), as on the other parent pages. */
const PARENT_INSTALL = { appId: null, name: BRAND.name, icon: { symbol: 'compass', color: 'blue' } } as const;

function svgDataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** The OS setting, live. The companion's own CSS honours it too; this only reports it. */
function usePrefersReducedMotion(): boolean {
  const query = '(prefers-reduced-motion: reduce)';
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(query);
    const onChange = () => setReduced(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

export function OriGalleryPage() {
  usePageTitle('Ori companion');
  useInstallMeta(PARENT_INSTALL, { title: false });
  const [motion, setMotion] = useState<Motion>('auto');
  const reduced = usePrefersReducedMotion();
  const motionOn = motion === 'auto';

  return (
    <div className="og" data-testid="ori-gallery">
      <header className="og-top">
        <div className="og-top-inner">
          <Link to="/" className="og-home" aria-label={`${BRAND.name} home`}>
            <OriWordmark variant="ink" height={34} title="" />
          </Link>
          <span className="og-top-label">Companion gallery</span>
        </div>
      </header>

      <main className="og-main">
        <section className="og-intro" aria-labelledby="og-title">
          <div className="og-intro-text">
            <p className="eyebrow">Design system</p>
            <h1 id="og-title">Ori companion</h1>
            <p className="og-lede">
              Every mood, size, surface and icon in one place. The art is drawn by the page itself: nothing here calls a model or the app&rsquo;s data, and no account data is shown.
              As on every page, the app still checks whether you are signed in, and your browser may fetch Ori&rsquo;s favicon and manifest.
            </p>
          </div>
          <div className="og-motion">
            <button type="button" role="switch" aria-checked={motionOn} className="og-switch" onClick={() => setMotion(motionOn ? 'none' : 'auto')} data-testid="ori-motion-toggle">
              <span className="og-switch-track" aria-hidden="true">
                <span className="og-switch-thumb" />
              </span>
              <span>Motion {motionOn ? 'on' : 'off'}</span>
            </button>
            <p className="og-note">
              Your device&rsquo;s reduced-motion setting always wins: with it on, every companion shows its still pose whatever this switch says.
              Reduced motion is <strong>{reduced ? 'on' : 'off'}</strong> here.
            </p>
          </div>
        </section>

        <section className="og-section" aria-labelledby="og-moods">
          <div className="og-section-head">
            <h2 id="og-moods">Moods</h2>
            <p className="og-sub">Eight states, each bound to a real interface event. Shown at {SIZES.join(', ')} px on the surfaces Ori uses.</p>
          </div>
          {SURFACES.map((surface) => (
            <div key={surface.key} className={`og-surface${surface.dark ? ' og-surface-dark' : ''}`} style={{ background: surface.color }} data-surface={surface.key}>
              <h3 className="og-surface-title">On {surface.label.toLowerCase()} <span>{surface.color}</span></h3>
              {surface.note && <p className="og-surface-note">{surface.note}</p>}
              <ul className="og-mood-grid">
                {ORI_MOODS.map((mood) => (
                  <li key={mood} className="og-mood">
                    <div className="og-mood-head">
                      <strong>{ORI_MOOD_LABELS[mood]}</strong>
                      <code>{mood}</code>
                    </div>
                    <p className="og-mood-trigger">{MOOD_TRIGGERS[mood]}</p>
                    <div className="og-sizes">
                      {SIZES.map((size) => (
                        <figure key={size} className="og-size">
                          <OriCompanion mood={mood} size={size} motion={motion} />
                          <figcaption>{size}</figcaption>
                        </figure>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <SmallAndMono />
        </section>

        <section className="og-section" aria-labelledby="og-logic">
          <div className="og-section-head">
            <h2 id="og-logic">Mood follows the operation</h2>
            <p className="og-sub">
              The same logic the product uses. Answers are simulated on this page; nothing is sent.
            </p>
          </div>
          <MoodLab motion={motion} />
        </section>

        <section className="og-section" aria-labelledby="og-words">
          <div className="og-section-head">
            <h2 id="og-words">Wordmark and lockup</h2>
            <p className="og-sub">Wordmark alone in compact navigation. Companion and wordmark together only on landing and brand headers.</p>
          </div>
          <div className="og-word-grid">
            <figure className="og-word-card">
              <div className="og-word-stage">
                <OriWordmark variant="ink" height={34} />
              </div>
              <figcaption><strong>Ink, 34 px</strong> Compact navigation on light surfaces</figcaption>
            </figure>
            <figure className="og-word-card">
              <div className="og-word-stage">
                <OriWordmark variant="cobalt" height={64} />
              </div>
              <figcaption><strong>Cobalt, 64 px</strong> Large brand moments</figcaption>
            </figure>
            <figure className="og-word-card og-word-card-dark">
              <div className="og-word-stage">
                <OriWordmark variant="light" height={44} />
              </div>
              <figcaption><strong>Light, 44 px</strong> On ink surfaces; the lime dot keeps its cobalt ring</figcaption>
            </figure>
            <figure className="og-word-card og-word-card-wide">
              <div className="og-word-stage og-word-stage-row">
                <OriLockup size={44} variant="ink" />
                <OriLockup size={72} variant="cobalt" />
              </div>
              <figcaption><strong>Lockup</strong> Landing and brand headers</figcaption>
            </figure>
            <figure className="og-word-card og-word-card-dark">
              <div className="og-word-stage">
                <OriLockup size={52} variant="light" />
              </div>
              <figcaption><strong>Lockup, light</strong> On ink surfaces: the white single-colour companion, as cobalt on ink is only about 2.5:1</figcaption>
            </figure>
          </div>
        </section>

        <section className="og-section" aria-labelledby="og-icons">
          <div className="og-section-head">
            <h2 id="og-icons">App icons</h2>
            <p className="og-sub">Only Ori uses the companion as its icon. Each reference app keeps one canonical icon everywhere: cards, previews, launcher, manifest and shortcuts.</p>
          </div>
          <IconShowcase />
        </section>

        <section className="og-section" aria-labelledby="og-label">
          <div className="og-section-head">
            <h2 id="og-label">Companion as a control</h2>
            <p className="og-sub">Interactive companions are real buttons with a real name. The art inside stays decorative so screen readers hear the name once.</p>
          </div>
          <LabelExample />
        </section>
      </main>
    </div>
  );
}

/** Small sizes use the simplified drawing; single-colour versions for where colour is unavailable. */
function SmallAndMono() {
  const small = useMemo(() => [16, 20, 24].map((size) => ({ size, src: svgDataUri(oriCompanionSvg({ mood: 'idle', size, simplified: true })) })), []);
  const mono = useMemo(
    () => [
      { key: 'ink', label: 'Ink on white', bg: BRAND_COLORS.surface, src: svgDataUri(oriCompanionSvg({ mood: 'idle', size: 72, mono: BRAND_COLORS.ink })) },
      { key: 'white', label: 'White on ink', bg: BRAND_COLORS.ink, src: svgDataUri(oriCompanionSvg({ mood: 'idle', size: 72, mono: '#FFFFFF' })) },
    ],
    [],
  );
  return (
    <div className="og-extra">
      <figure className="og-extra-card">
        <div className="og-extra-row">
          {small.map((s) => (
            <span key={s.size} className="og-size">
              <img src={s.src} width={s.size} height={s.size} alt="" />
              <span className="og-cap">{s.size}</span>
            </span>
          ))}
        </div>
        <figcaption><strong>Simplified, 16 to 24 px</strong> Silhouette and eyes kept; accents dropped.</figcaption>
      </figure>
      {mono.map((m) => (
        <figure key={m.key} className="og-extra-card" style={{ background: m.bg }} data-dark={m.key === 'white' || undefined}>
          <div className="og-extra-row">
            <img src={m.src} width={72} height={72} alt="" />
          </div>
          <figcaption><strong>Single colour</strong> {m.label}</figcaption>
        </figure>
      ))}
    </div>
  );
}

const PENDING_LABEL: Record<OriOperationKind, string> = {
  capture: 'Reading what you shared…',
  revision: 'Preparing the change…',
  create: 'Making Light yours…',
  apply: 'Applying the change…',
};

/** A live companion driven by useOriMood, with locally simulated answers. */
function MoodLab({ motion }: { motion: Motion }) {
  const ori = useOriMood();
  const [token, setToken] = useState<OriToken>(NO_ORI_TOKEN);
  const [previous, setPrevious] = useState<OriToken>(NO_ORI_TOKEN);
  const [note, setNote] = useState('');

  const start = (kind: OriOperationKind) => {
    if (token !== NO_ORI_TOKEN) setPrevious(token);
    setToken(ori.begin(kind));
    setNote('');
  };
  const pending = ori.phase === 'pending' && ori.isCurrent(token);

  let status: string;
  switch (ori.phase) {
    case 'pending':
      status = ori.pendingKind ? PENDING_LABEL[ori.pendingKind] : 'Working…';
      break;
    case 'success':
      status = 'Ready. Light is yours.';
      break;
    case 'discovery':
      status = 'Found something: a photo journal for your walks.';
      break;
    case 'clarify':
      status = 'Need a detail: which photos should Light start with?';
      break;
    case 'error':
      status = 'That did not work. Your words are kept. Try again.';
      break;
    default:
      status = ori.mood === 'attentive' ? 'Listening to what you type.' : 'Here when you need me.';
  }

  return (
    <div className="og-lab">
      <div className="og-lab-stage">
        <OriCompanion mood={ori.mood} size={112} motion={motion === 'none' ? 'none' : ori.companion.motion} />
        <div className="og-lab-readout">
          <p className="og-lab-mood">
            <code>{ori.mood}</code>
            {ori.settled && <span className="og-chip">settled</span>}
          </p>
          <p className="og-lab-status" role="status">{status}</p>
          {ori.settled && ori.phase === 'pending' && <p className="og-note">Still working after {ORI_MOOD_TIMING.pendingSettleMs / 1000} s: motion stops, the label stays.</p>}
          {note && <p className="og-note">{note}</p>}
        </div>
      </div>
      <div className="og-lab-controls">
        <label className="og-field">
          <span>Composer</span>
          <input className="input" placeholder="Focus or type here for Listening" onFocus={ori.focus} onBlur={ori.blur} onChange={() => ori.typing()} />
        </label>
        <div className="og-btn-row" role="group" aria-label="Start an operation">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => start('capture')}>Share a thought</button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => start('create')}>Make mine</button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => start('apply')}>Apply a change</button>
        </div>
        <div className="og-btn-row" role="group" aria-label="Simulate the answer">
          <button type="button" className="btn btn-secondary btn-sm" disabled={!pending} onClick={() => ori.succeed(token)}>Server confirms</button>
          <button type="button" className="btn btn-secondary btn-sm" disabled={!pending} onClick={() => ori.discover(token)}>Proposal arrives</button>
          <button type="button" className="btn btn-secondary btn-sm" disabled={!pending} onClick={() => ori.clarify(token)}>Needs a detail</button>
          <button type="button" className="btn btn-secondary btn-sm" disabled={!pending} onClick={() => ori.fail(token)}>Request fails</button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={!ori.isCurrent(token)} onClick={() => ori.cancel(token)}>Cancel</button>
        </div>
        <div className="og-btn-row">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={previous === NO_ORI_TOKEN}
            onClick={() => {
              ori.succeed(previous);
              setNote('A late answer to an older request arrived and was ignored.');
            }}
          >
            Late answer to an older request
          </button>
        </div>
        <p className="og-note">
          Ready shows for {ORI_MOOD_TIMING.successMs / 1000} s after a confirmed result, then returns to Here. A timer never produces Ready.
        </p>
      </div>
    </div>
  );
}

/**
 * A favicon drawn at its true pixel size, then shown magnified with hard pixel edges, so the whole-
 * pixel eyes can be checked by eye. Local art only (a data URI); nothing is fetched.
 */
function PixelZoom({ src, px, scale, label }: { src: string; px: number; scale: number; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    let live = true;
    const img = new Image();
    img.onload = () => {
      if (!live) return;
      ctx.clearRect(0, 0, px, px);
      ctx.drawImage(img, 0, 0, px, px);
    };
    img.src = src;
    return () => {
      live = false;
    };
  }, [src, px]);
  return (
    <span className="og-size">
      <canvas ref={ref} width={px} height={px} className="og-favicon-zoom" style={{ width: px * scale, height: px * scale }} aria-hidden="true" />
      <span className="og-cap">{label}</span>
    </span>
  );
}

function IconShowcase() {
  const ori = useMemo(
    () => ({
      tile: svgDataUri(oriAppIconSvg(128)),
      maskable: svgDataUri(oriAppIconSvg(128, { maskable: true })),
      // The very document served at /icons/store.svg: it picks its own drawing for the size it is shown at.
      favicon: svgDataUri(oriFaviconDocument()),
      favicon16: svgDataUri(oriFaviconSvg(16)),
      favicon32: svgDataUri(oriFaviconSvg(32)),
    }),
    [],
  );
  const sizes = [28, 44, 64, 96];
  return (
    <div className="og-icons">
      <div className="og-icon-card">
        <h3>Ori</h3>
        <div className="og-icon-row">
          {[40, 60, 96, 128].map((size) => (
            <span key={size} className="og-size">
              <img src={ori.tile} width={size} height={size} alt={size === 128 ? 'Ori app icon' : ''} />
              <span className="og-cap">{size}</span>
            </span>
          ))}
        </div>
        <div className="og-icon-row og-masks">
          <span className="og-size">
            <img className="og-mask-circle" src={ori.maskable} width={96} height={96} alt="" />
            <span className="og-cap">circle mask</span>
          </span>
          <span className="og-size">
            <img className="og-mask-squircle" src={ori.maskable} width={96} height={96} alt="" />
            <span className="og-cap">squircle mask</span>
          </span>
          <span className="og-size">
            <img src={ori.maskable} width={96} height={96} alt="" />
            <span className="og-cap">maskable, full bleed</span>
          </span>
        </div>
        <div className="og-icon-row og-favicons">
          {[16, 32, 64].map((size) => (
            <span key={size} className="og-size">
              <img src={ori.favicon} width={size} height={size} alt={size === 32 ? 'Ori favicon' : ''} />
              <span className="og-cap">{size}</span>
            </span>
          ))}
          <PixelZoom src={ori.favicon16} px={16} scale={4} label="16 px, 4×" />
          <PixelZoom src={ori.favicon32} px={32} scale={2} label="32 px, 2×" />
        </div>
        <p className="og-note">
          Browser tabs get their own drawing: a bigger body and whole-pixel eyes with a gap, so they stay two eyes at 16 and 32 px.
          From 48 px the same favicon file shows the app icon.
        </p>
      </div>
      {REFERENCE_KEYS.map((key) => {
        const ref = REFERENCE_APP_ICONS[key];
        const earlier = supersededIcons(key);
        // The home-screen PNG is this full-bleed tile (no rounded corners, no hairline); the platform masks it.
        const homeScreen = svgDataUri(appIconSvg(referenceIcon(key), 128, 0));
        return (
          <div key={key} className="og-icon-card">
            <h3>{ref.name}</h3>
            <div className="og-icon-row">
              {sizes.map((size) => (
                <span key={size} className="og-size">
                  <AppIcon icon={referenceIcon(key)} name={ref.name} size={size} title={size === 96 ? `${ref.name} icon` : ''} />
                  <span className="og-cap">{size}</span>
                </span>
              ))}
            </div>
            <div className="og-icon-row og-icon-row-dark">
              {sizes.slice(0, 3).map((size) => (
                <span key={size} className="og-size">
                  <AppIcon icon={referenceIcon(key)} name={ref.name} size={size} title="" />
                  <span className="og-cap">{size}</span>
                </span>
              ))}
            </div>
            <div className="og-icon-row og-masks" data-testid={`ori-home-icon-${key}`}>
              <span className="og-size">
                <img className="og-mask-circle" src={homeScreen} width={64} height={64} alt="" />
                <span className="og-cap">circle</span>
              </span>
              <span className="og-size">
                <img className="og-mask-squircle" src={homeScreen} width={64} height={64} alt="" />
                <span className="og-cap">squircle</span>
              </span>
              <span className="og-cap og-mask-note">Home-screen PNG under platform masks: full bleed, no edge line</span>
            </div>
            <p className="og-note">
              {earlier.length > 1 ? 'Earlier defaults' : 'The earlier default'}{' '}
              {earlier.map((old, i) => (
                <span key={`${old.symbol}-${old.color}`}>
                  {i > 0 && (i === earlier.length - 1 ? ' and ' : ', ')}
                  <code>{old.symbol} / {old.color}</code>
                  <AppIcon icon={old} size={24} title="" className="og-inline-icon" />
                </span>
              ))}
              {earlier.length > 1 ? ' now show ' : ' now shows '}
              <AppIcon icon={earlier[0]!} name={ref.name} size={24} title="" className="og-inline-icon" />
              for an app named {ref.name}, for display only. Icons people choose never change.
            </p>
          </div>
        );
      })}
    </div>
  );
}

function LabelExample() {
  const [pressed, setPressed] = useState(0);
  const press = () => setPressed((n) => n + 1);
  return (
    <div className="og-label">
      <div className="og-label-stage">
        <button type="button" className="og-edit-btn" onClick={press} data-testid="ori-edit-example">
          <OriCompanion mood="idle" size={26} motion="none" />
          <span>Edit Light with Ori</span>
        </button>
        <button type="button" className="og-edit-icon" aria-label="Edit Light with Ori" title="Edit Light with Ori" onClick={press}>
          <OriCompanion mood="idle" size={28} motion="none" />
        </button>
      </div>
      <dl className="og-label-facts">
        <div>
          <dt>Accessible name</dt>
          <dd>&ldquo;Edit Light with Ori&rdquo;, from the visible text, or from <code>aria-label</code> on the compact button</dd>
        </div>
        <div>
          <dt>Companion</dt>
          <dd>Decorative (<code>aria-hidden</code>), so it is not announced twice</dd>
        </div>
      </dl>
      <p className="og-note" role="status">
        {pressed > 0 ? 'Pressed. Inside Light this opens Edit with Ori for Light; on this page nothing is sent.' : ''}
      </p>
    </div>
  );
}
