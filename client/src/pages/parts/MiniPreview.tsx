/**
 * Domain-aware mini preview of what an app (or an exploration) would look like, drawn with CSS only
 * (docs/ori/ORI_DESIGN_SPEC.md section 6; audit P0-02). The composition follows the pattern (photos
 * for a gallery, a timer ring for practice, people and promises for a queue, columns for a board,
 * dated entries for a journal, metric tiles for a tracker, steps for an exploration) and the CONTENT
 * follows the proposal's own domain: sketching shows sketching, music shows music, People shows
 * people and promises, a newsletter shows newsletter snippets. A domain without its own examples
 * ("neutral") shows only the proposal's own words and empty shapes, never another domain's filler.
 * Everything here is illustrative and labelled "Example"; the person's own photo is labelled as theirs.
 * Decorative waveforms and rings never play anything: the card around them opens the preview.
 */
import type { AppTheme, Pattern } from '@shared/appSpec.ts';
import type { ProposalKind } from '@shared/context.ts';
import { Glyph, Icons } from '../../components/ui.tsx';
import { apiBase } from '../../api.ts';
import type { PreviewDomain } from './helpers.ts';
import '../playground.css';

/** Public-domain example photos served by the API (absolute inside the Android shell, whose page origin is the local bundle). */
export function examplePhotos(): string[] {
  return [1, 2, 3, 4].map((i) => `${apiBase()}/examples/light-${i}.jpg`);
}

export interface DomainExamples {
  /** Dated example entries for a journal-like preview: [when, what]. */
  entries: [string, string][];
  /** A practice prompt, used only when the proposal has no first step of its own. */
  prompt: string;
}

/** Example content per domain. Each set stays inside its own domain (tests check this). */
export const DOMAIN_EXAMPLES: Record<Exclude<PreviewDomain, 'neutral'>, DomainExamples> = {
  photo: {
    prompt: 'Find one long shadow and shoot it three ways',
    entries: [['Today', 'Low sun on the brick wall'], ['Yesterday', 'Long shadows on the tram tracks'], ['Sat', 'A backlit tree on the corner']],
  },
  music: {
    prompt: 'Play the riff at half tempo, then once at full speed',
    entries: [['Today', 'The riff at half speed, then full'], ['Yesterday', 'Chord changes without looking'], ['Mon', 'The intro, clean strumming']],
  },
  people: {
    prompt: 'Send the follow-up you promised',
    entries: [['Today', 'Maya: send the demo link'], ['Tomorrow', 'Alex: share the article I promised'], ['Fri', 'Jamie: plan a coffee']],
  },
  sketch: {
    prompt: 'Draw a spoon from three angles',
    entries: [['Today', 'A spoon from three angles'], ['Yesterday', 'Your keys in one line'], ['Mon', 'A mug, ink only']],
  },
  newsletter: {
    prompt: 'Write the opening line of the next issue',
    entries: [['Draft', 'Issue 12: what I learned this month'], ['Idea', 'Open with one story from the week'], ['Idea', 'Three links worth sharing']],
  },
  reading: {
    prompt: 'Read twenty pages and keep one line',
    entries: [['Today', 'Chapter 4: one line worth keeping'], ['Yesterday', 'Started a new novel'], ['Sun', 'Finished the essay collection']],
  },
  fitness: {
    // Timed sessions that fit a run, a ride or a swim alike.
    prompt: 'An easy twenty-minute session',
    entries: [['Today', 'Easy 20 minutes, felt steady'], ['Thu', 'Intervals: 6 × 1 minute'], ['Tue', 'Long and easy, 45 minutes']],
  },
  cooking: {
    prompt: 'Cook one new dish this week',
    entries: [['Today', 'Lemon pasta: make again'], ['Sun', 'Dal with extra ginger'], ['Wed', 'Sourdough, second try']],
  },
  language: {
    prompt: 'Ten new words, said out loud',
    entries: [['Today', 'Ten new words, out loud'], ['Yesterday', 'Spoke for five minutes, no notes'], ['Mon', 'A podcast episode, twice']],
  },
};

/** People and promises: the People queue example. */
export const PEOPLE_ROWS: { mark: 'done' | 'date' | 'open'; text: string; due: string }[] = [
  { mark: 'done', text: 'Follow up with Maya', due: 'Done' },
  { mark: 'date', text: 'Plan a catch-up with Alex', due: 'Fri' },
  { mark: 'open', text: 'Reply to Sam', due: 'Today' },
];

/** An illustrative value bound to the metric's own label (never a word from another domain). */
export function trackerValue(label: string, i: number): string {
  if (/\b(?:min|mins|minutes?|hours?|time)\b/i.test(label)) return '42 min';
  if (/\b(?:km|miles?|distance)\b/i.test(label)) return '12 km';
  if (/streak|\bdays?\b/i.test(label)) return '5 days';
  if (/avg|average|feel|rating|quality|score|effort|again/i.test(label)) return '4.2';
  if (/\$|spent|budget|money|cost/i.test(label)) return '$84';
  if (/\b(?:sessions?|walks?|runs?|sketches|dishes|books?|pages|entries|times|keepers?|finished|count|shots?|words|photos|so far|this (?:week|month))\b/i.test(label)) {
    return ['7', '12', '3', '28'][i % 4] as string;
  }
  return '—';
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export interface MiniPreviewProps {
  pattern: Pattern;
  kind?: ProposalKind;
  theme: AppTheme;
  /** What the proposal is about (helpers.previewDomain); 'neutral' uses only the proposal's own words. */
  domain?: PreviewDomain;
  /** The proposal's preview lines (labels in the app): board stages, metric names. */
  lines?: string[];
  /** The proposal's own first step, shown as a practice prompt. */
  prompt?: string;
  /** Exploration steps (explore proposals). */
  steps?: string[];
  /** Session length for a timer (null: the 15-minute default the Make page also starts from). */
  minutes?: number | null;
  /** The person's own photo (an object URL), shown first and labelled "Your photo". */
  ownPhoto?: string | null;
  /** stage: full-bleed composition for a Playground card; strip: a short band inside an Agent card. */
  variant?: 'stage' | 'strip';
  size?: 'card' | 'featured';
  className?: string;
}

function Bars({ side }: { side: 'left' | 'right' }) {
  const heights = side === 'left' ? [30, 55, 80, 45, 65] : [65, 45, 80, 55, 30];
  return (
    <span className={`mv-bars mv-bars-${side}`} aria-hidden="true">
      {heights.map((h, i) => (
        <i key={i} style={{ height: `${h}%` }} />
      ))}
    </span>
  );
}

export function MiniPreview({
  pattern, kind = 'new_app', theme, domain = 'neutral', lines = [], prompt, steps, minutes, ownPhoto, variant = 'stage', size = 'card', className,
}: MiniPreviewProps) {
  const examples = domain === 'neutral' ? null : DOMAIN_EXAMPLES[domain];
  const featured = size === 'featured';
  const mins = minutes && minutes > 0 ? minutes : 15;
  let composition: string = pattern;
  let body: React.ReactNode;
  let description = '';
  // The proposal's own words only (no example content): no "Example" tag.
  let ownContent = false;

  if (kind === 'explore') {
    composition = 'explore';
    const own = (steps?.length ? steps : lines).filter(Boolean).slice(0, featured ? 4 : 3);
    description = 'the first steps of this idea';
    ownContent = own.length > 0;
    // The person's own plan, none of it done yet: numbered, never ticked.
    body = own.length ? (
      <ol className="mv-steps">
        {own.map((s, i) => (
          <li key={`${i}-${s}`}>
            <span className="mv-check mv-step-n" aria-hidden="true">{i + 1}</span>
            <span className="mv-step-text">{s}</span>
          </li>
        ))}
      </ol>
    ) : (
      <ol className="mv-steps mv-steps-empty" aria-hidden="true">
        {[0, 1, 2].map((i) => <li key={i}><span className="mv-check" /><span className="mv-line" /></li>)}
      </ol>
    );
  } else if (kind === 'keep') {
    composition = 'keep';
    description = 'a saved source';
    body = (
      <div className="mv-keep">
        <span className="mv-keep-icon" aria-hidden="true">{Icons.bookmark}</span>
        <span className="mv-keep-text">Saved as a source</span>
      </div>
    );
  } else if (domain === 'photo' && (pattern === 'gallery' || pattern === 'journal' || pattern === 'tracker')) {
    composition = 'photos';
    const ex = examplePhotos();
    const shown = variant === 'strip' ? (ownPhoto ? [ownPhoto, ex[0] ?? ''] : [ex[2] ?? '', ex[0] ?? '']) : ownPhoto ? [ownPhoto, ex[2] ?? '', ex[0] ?? ''] : [ex[2] ?? '', ex[0] ?? '', ex[1] ?? ''];
    description = ownPhoto ? 'your photo beside an example photo' : 'example photos';
    body = (
      <div className={`mv-photos${featured && variant === 'stage' ? ' has-side' : ''}`}>
        {shown.slice(0, variant === 'strip' ? 2 : featured ? 3 : 1).map((src, i) => {
          const mine = Boolean(ownPhoto) && i === 0;
          return (
            <figure key={`${i}-${src}`} className={`mv-photo${i > 0 && variant === 'stage' ? ' mv-photo-side' : ''}`}>
              <img src={src} alt="" loading="lazy" decoding="async" />
              {variant === 'strip' && <figcaption className={`mv-chip${mine ? ' is-mine' : ''}`}>{mine ? <>{Icons.image} Your photo</> : 'Example'}</figcaption>}
            </figure>
          );
        })}
      </div>
    );
  } else if (pattern === 'practice' && domain === 'music') {
    composition = 'ring';
    description = `a ${mins}-minute practice timer`;
    body = (
      <div className="mv-ringwrap">
        <Bars side="left" />
        <span className="mv-ring">
          <span className="mv-ring-time">{pad(mins)}:00</span>
          <span className="mv-ring-glyph" aria-hidden="true">{Icons.timer}</span>
        </span>
        <Bars side="right" />
      </div>
    );
  } else if (pattern === 'practice') {
    composition = 'practice';
    const say = prompt?.trim() || examples?.prompt || '';
    description = `a ${mins}-minute session timer`;
    body = (
      <div className="mv-practice">
        {say ? (
          <span className="mv-prompt">
            <span className="mv-kicker">Today</span>
            <span className="mv-prompt-text">{say}</span>
          </span>
        ) : (
          <span className="mv-line mv-line-wide" aria-hidden="true" />
        )}
        <span className="mv-timer">{pad(mins)}:00</span>
      </div>
    );
  } else if (pattern === 'queue' || (domain === 'people' && pattern !== 'board' && pattern !== 'tracker')) {
    composition = 'rows';
    description = domain === 'people' ? 'people and the follow-ups you promised' : 'a list of next steps';
    const rows = domain === 'people' ? PEOPLE_ROWS : null;
    body = (
      <ul className="mv-rows">
        {(rows ?? [0, 1, 2]).slice(0, featured ? 3 : variant === 'strip' ? 2 : 3).map((r, i) =>
          typeof r === 'number' ? (
            <li key={i} className="mv-row" aria-hidden="true">
              <span className="mv-mark" />
              <span className="mv-line" />
            </li>
          ) : (
            <li key={r.text} className={`mv-row mv-row-${r.mark}`}>
              <span className="mv-mark" aria-hidden="true">{r.mark === 'done' ? Icons.check : r.mark === 'date' ? <Glyph symbol="calendar" size={14} /> : null}</span>
              <span className="mv-row-text">{r.text}</span>
              {featured && <span className="mv-due">{r.due}</span>}
            </li>
          ),
        )}
      </ul>
    );
  } else if (pattern === 'board') {
    composition = 'board';
    const stageLine = lines.find((l) => /^stages?:/i.test(l));
    const cols = (stageLine ? stageLine.replace(/^stages?:\s*/i, '').split(/\s*>\s*/) : ['To do', 'Doing', 'Done']).slice(0, featured ? 4 : 3);
    const heights = [[2, 1], [1, 1], [1]];
    description = `a board with ${cols.join(', ')}`;
    body = (
      <div className="mv-board" style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(0, 1fr))` }}>
        {cols.map((c, i) => (
          <div className="mv-col" key={`${i}-${c}`}>
            <span className="mv-col-title">{c}</span>
            {(heights[i] ?? [1]).map((h, j) => (
              <span key={j} className={`mv-card${h === 2 ? ' is-tall' : ''}`}>
                {domain === 'people' && <i className="mv-avatar" />}
                <i className="mv-line" />
              </span>
            ))}
          </div>
        ))}
      </div>
    );
  } else if (pattern === 'tracker') {
    composition = 'metrics';
    const labels = (lines.length ? lines : ['This week', 'This month', 'Streak', 'Average']).filter((l) => !/^stages?:/i.test(l)).slice(0, 4);
    description = `figures for ${labels.join(', ')}`;
    body = (
      <div className="mv-metrics">
        {labels.map((l, i) => (
          <div className="mv-metric" key={`${i}-${l}`}>
            <span className="mv-metric-value">{trackerValue(l, i)}</span>
            <span className="mv-metric-label">{l}</span>
          </div>
        ))}
      </div>
    );
  } else if (pattern === 'gallery') {
    composition = 'tiles';
    description = 'a grid for your pictures';
    body = (
      <div className="mv-tiles" aria-hidden="true">
        {Array.from({ length: featured ? 6 : 4 }, (_, i) => <span key={i}>{Icons.image}</span>)}
      </div>
    );
  } else {
    composition = 'journal';
    description = examples ? 'dated entries' : 'dated entries, still empty';
    body = (
      <ul className="mv-journal">
        {(examples?.entries ?? [['Today', ''], ['Yesterday', ''], ['Mon', '']]).slice(0, featured ? 3 : 2).map(([when, what], i) => (
          <li key={`${i}-${when}`}>
            <span className="mv-date">{when}</span>
            {what ? <span className="mv-entry">{what}</span> : <span className="mv-line" aria-hidden="true" />}
          </li>
        ))}
      </ul>
    );
  }

  // Strip photos carry their own chips ("Your photo", "Example").
  const ownTagged = composition === 'photos' && variant === 'strip';
  const tagged = !ownTagged && !ownContent;
  return (
    <div
      className={`mv themed${className ? ` ${className}` : ''}`}
      data-theme={theme}
      data-variant={variant}
      data-size={size}
      data-domain={domain}
      data-composition={composition}
      data-tagged={tagged ? 'true' : undefined}
      role="img"
      aria-label={`${ownContent ? 'Preview' : 'Example preview'}: ${description}`}
    >
      <div className="mv-body">{body}</div>
      {tagged && <span className="mv-tag" aria-hidden="true">Example</span>}
    </div>
  );
}
