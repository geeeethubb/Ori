/**
 * Landing previews (references C and 01; ORI_DESIGN_SPEC section 6): faithful static compositions of
 * three example apps, each with its own identity (Light: paper and charcoal, photographs first; Riff:
 * ink, lime and lilac, a tabular timer; People: white with orange, a next-action queue), a home screen
 * where Ori and each app have their own icon, and the three example screens of one journey (drawn
 * small and muted, with chips where the real screens have buttons). They use the real tokens, the
 * canonical icons and CC0 example photographs, and are labelled Example. No device bezel or status
 * bar, no live data, and nothing in them is a control.
 */
import type { CSSProperties } from 'react';
import { REFERENCE_APP_ICONS, referenceIcon, type ReferenceAppKey } from '@shared/brand.ts';
import { oriAppIconSvg } from '@shared/oriArt.ts';
import { AppIcon } from '../../components/AppIcon.tsx';
import { OriCompanion } from '../../components/ori/OriCompanion.tsx';
import { Glyph, Icons } from '../../components/ui.tsx';
import { ExampleTag } from './badges.tsx';
import { examplePhotos } from './MiniPreview.tsx';

/** The reference apps' headlines, as the apps themselves show them. */
export const EXAMPLE_TAGLINES: Record<ReferenceAppKey, string> = {
  light: 'Notice the light.',
  riff: 'A little practice. A little progress.',
  people: 'Keep the conversation going.',
};

const REFERENCE_KEYS: ReferenceAppKey[] = ['light', 'riff', 'people'];

let oriIconUri: string | null = null;

/** Ori's own app icon (the still companion on lilac): the same art the parent manifest serves. */
export function OriAppIcon({ size = 64, className }: { size?: number; className?: string }) {
  oriIconUri ??= `data:image/svg+xml;charset=utf-8,${encodeURIComponent(oriAppIconSvg(128))}`;
  return <img className={className} src={oriIconUri} width={size} height={size} alt="" />;
}

function cx(...names: Array<string | false | undefined>): string {
  return names.filter(Boolean).join(' ');
}

function PreviewHead({ app }: { app: ReferenceAppKey }) {
  return (
    <div className="lp-head">
      <Glyph symbol={referenceIcon(app).symbol} className="lp-glyph" />
      <span>{REFERENCE_APP_ICONS[app].name}</span>
      <ExampleTag />
    </div>
  );
}

/** Light: one large photograph and a contact strip. */
export function LightPreview({ className }: { className?: string }) {
  const photos = examplePhotos();
  return (
    <div className={cx('lp-card lp-light', className)}>
      <PreviewHead app="light" />
      <img className="lp-photo" src={photos[0]} alt="" decoding="async" />
      <div className="lp-film">
        {photos.slice(1, 4).map((src) => <img key={src} src={src} alt="" loading="lazy" decoding="async" />)}
      </div>
      <p className="lp-tagline lp-serif">{EXAMPLE_TAGLINES.light}</p>
    </div>
  );
}

/** Riff's level bars drawn large: static decoration, not audio. */
const LEVELS = [4, 7, 10, 6, 13, 9, 15, 11, 7, 12, 15, 9, 13, 8, 11, 6, 9, 5];

/** Riff: the practice room with its plan on a tabular timer. */
export function RiffPreview({ className }: { className?: string }) {
  return (
    <div className={cx('lp-card lp-riff', className)}>
      <PreviewHead app="riff" />
      <div className="lp-levels">
        {LEVELS.map((h, i) => <i key={i} style={{ '--h': h } as CSSProperties} />)}
      </div>
      <div className="lp-timer">
        <span className="lp-time">15:00</span>
        <span className="lp-plan">15-minute plan</span>
      </div>
      <p className="lp-tagline">{EXAMPLE_TAGLINES.riff}</p>
    </div>
  );
}

const PEOPLE_ROWS = [
  { text: 'Follow up with Jamie', when: 'Today', done: false },
  { text: 'Plan a catch-up', when: 'Friday', done: false },
  { text: 'Reply to Sam', when: 'Done', done: true },
];

/** People: a short next-action queue. */
export function PeoplePreview({ className }: { className?: string }) {
  return (
    <div className={cx('lp-card lp-people', className)}>
      <PreviewHead app="people" />
      <ul className="lp-rows">
        {PEOPLE_ROWS.map((r) => (
          <li key={r.text} className={cx('lp-row', r.done && 'is-done')}>
            <span className="lp-mark">{r.done ? Icons.check : null}</span>
            <span className="lp-row-text">
              <span>{r.text}</span>
              <small>{r.when}</small>
            </span>
          </li>
        ))}
      </ul>
      <p className="lp-tagline">{EXAMPLE_TAGLINES.people}</p>
    </div>
  );
}

/** A home screen with Ori and each app as its own icon (no bezel, no status bar). */
export function HomeScreenPreview({ className }: { className?: string }) {
  return (
    <div className={cx('lp-home', className)}>
      <ul className="lp-home-icons">
        <li>
          <span className="lp-home-tile"><OriAppIcon size={64} /></span>
          <span>Ori</span>
        </li>
        {REFERENCE_KEYS.map((key) => (
          <li key={key}>
            <span className="lp-home-tile">
              <AppIcon icon={referenceIcon(key)} name={REFERENCE_APP_ICONS[key].name} size={64} title="" />
            </span>
            <span>{REFERENCE_APP_ICONS[key].name}</span>
          </li>
        ))}
      </ul>
      <p className="lp-home-caption">Open each app directly.</p>
    </div>
  );
}

const SCENE_DESCRIPTION =
  'Example apps, not a real account. Light shows a large street photograph and a strip of three more. ' +
  'Riff, a dark practice room, shows a 15-minute plan on its timer. People lists three next steps: follow up with Jamie today, ' +
  'plan a catch-up on Friday, and a reply to Sam that is done. In front, a home screen where Ori, Light, Riff and ' +
  'People each have their own icon. Open each app directly.';

/** The hero composition: the example apps in Ori's pocket around a home screen. Phones: the home screen, then one example. */
export function LandingScene() {
  return (
    <figure className="ld-scene" data-testid="landing-scene">
      <div className="ld-art" aria-hidden="true">
        <span className="ld-deco ld-deco-glow" />
        <span className="ld-pocket ld-pocket-back" />
        <LightPreview />
        <RiffPreview />
        <PeoplePreview />
        <HomeScreenPreview />
        <span className="ld-pocket ld-pocket-front" />
        <OriCompanion className="ld-art-ori" size={128} />
        <span className="ld-deco ld-deco-lime" />
        <span className="ld-deco ld-deco-lilac" />
        <span className="ld-deco ld-deco-orange" />
      </div>
      <figcaption>
        <span className="sr-only">{SCENE_DESCRIPTION}</span>
        <span className="ld-scene-caption" aria-hidden="true">Open each app directly.</span>
      </figcaption>
    </figure>
  );
}

/** Example step 1: what someone shares. */
export function ExampleShare() {
  const photos = examplePhotos();
  return (
    <div className="lx-share">
      <img src={photos[2]} alt="" loading="lazy" decoding="async" />
      <p className="lx-bubble">I keep stopping for long shadows on brick walls. I want to notice the light on my walks.</p>
    </div>
  );
}

/** Example step 2: a short reply and the suggestion that comes with it. */
export function ExampleReply() {
  return (
    <div className="lx-reply">
      <p className="lx-reply-line">
        <OriCompanion size={30} motion="none" />
        <span>Light could help: one photo and one line about the light, each walk.</span>
      </p>
      <div className="lx-proposal">
        <div className="lx-app">
          <AppIcon icon={referenceIcon('light')} name="Light" size={44} title="" />
          <div>
            <strong>Light</strong>
            <span>{EXAMPLE_TAGLINES.light}</span>
          </div>
        </div>
        <div className="lx-actions">
          <span className="lx-chip lx-chip-primary">Preview Light</span>
          <span className="lx-chip">Keep inspiration</span>
        </div>
      </div>
    </div>
  );
}

/** Example step 3: the app is made, with its own link and a home-screen spot. */
export function ExampleReady() {
  return (
    <div className="lx-ready">
      <AppIcon icon={referenceIcon('light')} name="Light" size={64} title="" />
      <strong>Light is yours</strong>
      <span className="muted small">Ready to use</span>
      <div className="lx-actions">
        <span className="lx-chip lx-chip-primary">Open Light</span>
        <span className="lx-chip">Add to home screen</span>
      </div>
      <span className="lx-ready-foot">Your own app. Its own link.</span>
    </div>
  );
}
