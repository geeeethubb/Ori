/**
 * Pattern-aware mini preview of what an app (or an exploration) would look like, drawn with CSS
 * only: a contact sheet for galleries, a big timer for practice, people rows for a queue, columns
 * for a board, dated lines for a journal, metric tiles for a tracker, a checklist for explorations.
 * It is illustrative and labelled as example content; the Make-mine page renders the real app.
 */
import type { AppTheme, Pattern } from '@shared/appSpec.ts';
import type { ProposalKind } from '@shared/context.ts';
import { Icons } from '../../components/ui.tsx';
import { apiBase } from '../../api.ts';

/** Public-domain example photos served by the API (absolute inside the Android shell, whose page origin is the local bundle). */
export function examplePhotos(): string[] {
  return [1, 2, 3, 4].map((i) => `${apiBase()}/examples/light-${i}.jpg`);
}

export interface MiniPreviewProps {
  pattern: Pattern;
  kind?: ProposalKind;
  theme: AppTheme;
  /** The proposal's preview lines (field or column names); used for headings where they fit. */
  lines?: string[];
  size?: 'card' | 'featured';
  minutes?: number;
  className?: string;
}

const QUEUE_ROWS = [
  { who: 'Maya', what: 'Send the demo link', due: 'Today' },
  { who: 'Alex', what: 'Share the pricing article', due: 'Tomorrow' },
  { who: 'Jamie', what: 'Plan a coffee next week', due: 'Fri' },
];
const JOURNAL_ROWS = [
  { when: 'Today', what: 'Low sun on the brick wall by the station' },
  { when: 'Yesterday', what: 'Steam from a food cart at blue hour' },
  { when: 'Monday', what: 'Long shadows across the tram tracks' },
];
/** An illustrative value that fits the metric's label (minutes, streaks, averages, counts, or a short text). */
function trackerValue(label: string, i: number): string {
  if (/min|minute|hour|time/i.test(label)) return '42 min';
  if (/streak|\bdays?\b|week/i.test(label)) return '5 days';
  if (/avg|average|feel|rating|quality|score/i.test(label)) return '4.2';
  if (/which|what|who|where|how|notes?|focus/i.test(label)) return ['Reading', 'Guitar', 'Walks', 'Sketching'][i % 4] as string;
  return String([12, 7, 3, 28][i % 4]);
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function MiniPreview({ pattern, kind = 'new_app', theme, lines = [], size = 'card', minutes = 15, className }: MiniPreviewProps) {
  const cls = `mp themed mp-${size}${className ? ` ${className}` : ''}`;
  let body: React.ReactNode;
  let variant: string = pattern;

  if (kind === 'explore') {
    variant = 'explore';
    const steps = (lines.length ? lines : ['Listen once, all the way through', 'Find the two bars that matter', 'Play them slowly']).slice(0, 3);
    body = (
      <ul className="mp-explore">
        {steps.map((s, i) => (
          <li key={i}>
            <span className={`mp-check${i === 0 ? ' is-done' : ''}`} aria-hidden="true">{i === 0 ? Icons.check : null}</span>
            <span>{s}</span>
          </li>
        ))}
      </ul>
    );
  } else if (kind === 'keep') {
    variant = 'keep';
    body = (
      <div className="mp-keep">
        <span className="mp-keep-icon" aria-hidden="true">{Icons.bookmark}</span>
        <div>
          <div className="mp-keep-title">Saved as a source</div>
          <div className="mp-keep-sub">No new interest, no app</div>
        </div>
      </div>
    );
  } else if (pattern === 'practice') {
    body = (
      <div className="mp-practice">
        <div className="mp-practice-top">
          <span className="mp-kicker">Tonight</span>
          <span className="mp-practice-prompt">Play the riff at half tempo, then once at full speed</span>
        </div>
        <div className="mp-timer" aria-hidden="true">{pad(minutes)}:00</div>
        <div className="mp-presets" aria-hidden="true">
          {[10, 15, 25].map((m) => (
            <span key={m} className={`mp-preset${m === minutes ? ' is-on' : ''}`}>{m}</span>
          ))}
          <span className="mp-play">{Icons.play}</span>
        </div>
      </div>
    );
  } else if (pattern === 'gallery') {
    const count = size === 'featured' ? 6 : 4;
    body = (
      <div className={`mp-sheet mp-sheet-${count === 6 ? 3 : 2}`}>
        {Array.from({ length: count }, (_, i) => {
          const src = examplePhotos()[i];
          return src ? <img key={i} src={src} alt="" loading="lazy" decoding="async" /> : <span key={i} className="mp-tile-empty" aria-hidden="true">{Icons.sun}</span>;
        })}
      </div>
    );
  } else if (pattern === 'queue') {
    body = (
      <ul className="mp-queue">
        {QUEUE_ROWS.slice(0, size === 'featured' ? 3 : 2).map((r) => (
          <li key={r.who}>
            <span className="mp-initial" aria-hidden="true">{r.who[0]}</span>
            <span className="mp-queue-text">
              <span className="mp-queue-who">{r.who}</span>
              <span className="mp-queue-what">{r.what}</span>
            </span>
            <span className={`mp-due${r.due === 'Today' ? ' is-today' : ''}`}>{r.due}</span>
          </li>
        ))}
      </ul>
    );
  } else if (pattern === 'board') {
    const stageLine = lines.find((l) => /^stages?:/i.test(l));
    const cols = (stageLine ? stageLine.replace(/^stages?:\s*/i, '').split(/\s*>\s*/) : ['To do', 'Doing', 'Done']).slice(0, 3);
    const heights = size === 'featured' ? [[2, 1, 1], [1, 2], [1, 1]] : [[2, 1], [1], [1, 1]];
    body = (
      <div className="mp-board">
        {cols.map((c, i) => (
          <div className="mp-col" key={`${i}-${c}`}>
            <span className="mp-col-title">{c}</span>
            {(heights[i] ?? [1]).map((h, j) => (
              <span key={j} className={`mp-bcard${h === 2 ? ' is-tall' : ''}`} />
            ))}
          </div>
        ))}
      </div>
    );
  } else if (pattern === 'tracker') {
    const labels = (lines.length >= 2 ? lines : ['Minutes this week', 'Day streak', 'Sessions', 'Average feel']).slice(0, 4);
    body = (
      <div className="mp-metrics">
        {labels.map((l, i) => (
          <div className="mp-metric" key={`${i}-${l}`}>
            <span className="mp-metric-value">{trackerValue(l, i)}</span>
            <span className="mp-metric-label">{l}</span>
          </div>
        ))}
      </div>
    );
  } else {
    body = (
      <ul className="mp-journal">
        {JOURNAL_ROWS.slice(0, size === 'featured' ? 3 : 2).map((r) => (
          <li key={r.when}>
            <span className="mp-date">{r.when}</span>
            <span className="mp-journal-text">
              <span className="mp-journal-title">{r.what}</span>
              <span className="mp-bar" aria-hidden="true" />
            </span>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className={cls} data-theme={theme} data-variant={variant} role="img" aria-label={`Illustration of a ${variant} layout with example content`}>
      <div className="mp-screen">{body}</div>
      <span className="mp-tag" aria-hidden="true">Example</span>
    </div>
  );
}
