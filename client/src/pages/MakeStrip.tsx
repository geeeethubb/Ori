/**
 * A compact strip of what an app holds, in the app's own look (review findings 4 and 11 on image 04):
 * two photos for a gallery, the timer face for a practice room, the next people for a queue, the first
 * entries for anything else, and the app's own empty-state words when there is nothing to show.
 *
 * On narrow screens it leads the Make page's Preview step (see it, shape it, make it), with the whole
 * real preview one tap away; the Ready card uses it too. The caller wraps it in the app's theme root
 * and labels example entries (the card's "Example photos" heading, or the caption here); the person's
 * own entries are never labelled as examples. Nothing here is interactive: decorative timer digits and
 * presets never start anything.
 */
import { fieldById, recordMatchesView, roleField, type AppSpec, type ViewSpec } from '@shared/appSpec.ts';
import type { AppRecord } from '@shared/records.ts';
import { parseIsoDate } from '@shared/time.ts';
import { Glyph } from '../components/ui.tsx';
import { AuthImage } from '../runtime/AuthImage.tsx';
import { avatarTone, dueChip, personInitials, personName, personShortName, queueTabs, type QueueViewSpec } from '../runtime/viewLogic.ts';
import { ExampleTag } from './parts/badges.tsx';

type Of<T extends ViewSpec['type']> = Extract<ViewSpec, { type: T }>;

export interface AppStripProps {
  spec: AppSpec;
  /** What to show: the person's own entries, or labelled examples. */
  records: AppRecord[];
  /** Shown under the strip with an Example tag when `records` are examples ("Example photos until you add your own."). */
  exampleCaption?: string | null;
  now?: Date;
}

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** "Nov 14" for a date value; empty for anything else. */
function shortDate(v: unknown): string {
  const d = typeof v === 'string' ? parseIsoDate(v) : null;
  return d ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
}

/** The field that names an entry in a view: its title, caption, focus or person, else the first visible text field. */
function titleFieldOf(spec: AppSpec, view: ViewSpec): string | undefined {
  return (
    roleField(view, 'title') ??
    roleField(view, 'caption') ??
    roleField(view, 'focus') ??
    roleField(view, 'person') ??
    spec.fields.find((f) => !f.hidden && f.type === 'text')?.id
  );
}

/** A short second line: the board stage, else the entry's date. */
function metaOf(spec: AppSpec, view: ViewSpec, record: AppRecord): string {
  if (view.type === 'board') {
    const stage = fieldById(spec, view.stageFieldId);
    const value = record.values[view.stageFieldId];
    if (stage?.type === 'select') return stage.options.find((o) => o.value === value)?.label ?? '';
  }
  const dateId = roleField(view, 'date') ?? spec.fields.find((f) => !f.hidden && f.type === 'date')?.id;
  return dateId ? shortDate(record.values[dateId]) : '';
}

function Caption({ words }: { words?: string | null }) {
  if (!words) return null;
  return (
    <figcaption className="make-strip-caption">
      <ExampleTag />
      <span>{words}</span>
    </figcaption>
  );
}

export function AppStrip({ spec, records, exampleCaption, now = new Date() }: AppStripProps) {
  const gallery = spec.views.find((v): v is Of<'gallery'> => v.type === 'gallery');
  if (gallery) {
    const shots = records.filter((r) => text(r.values[gallery.imageFieldId]) !== '').slice(0, 2);
    if (shots.length) {
      return (
        <figure className="make-strip make-strip-photos" data-count={shots.length} data-testid="make-strip" data-strip="photos">
          <div className="make-strip-photo-row">
            {shots.map((r) => (
              <AuthImage key={r.id} value={text(r.values[gallery.imageFieldId])} alt={gallery.captionFieldId ? text(r.values[gallery.captionFieldId]) : ''} />
            ))}
          </div>
          <Caption words={exampleCaption} />
        </figure>
      );
    }
  }

  const practice = spec.views.find((v): v is Of<'practice'> => v.type === 'practice');
  if (practice) {
    const first = practice.presets[0] ?? 15;
    return (
      <div className="make-strip make-strip-timer" data-testid="make-strip" data-strip="timer">
        <span className="make-strip-kicker">{practice.title ?? 'Practice'}</span>
        <span className="make-strip-time" role="img" aria-label={`Starts at ${first} minutes`}>
          {String(first).padStart(2, '0')}:00
        </span>
        <span className="make-strip-presets" aria-hidden="true">
          {practice.presets.slice(0, 4).map((p) => (
            <span key={p} className={p === first ? 'is-first' : undefined}>
              {p} min
            </span>
          ))}
        </span>
      </div>
    );
  }

  const queue = spec.views.find((v): v is QueueViewSpec => v.type === 'queue');
  if (queue) {
    const tabs = queueTabs(spec, queue, records.filter((r) => recordMatchesView(queue, r.values)), now);
    const rows = [...tabs.today, ...tabs.upcoming].slice(0, 2);
    if (rows.length) {
      return (
        <figure className="make-strip make-strip-queue" data-testid="make-strip" data-strip="queue">
          <ul className="make-strip-people">
            {rows.map((r) => {
              const full = personName(queue, r);
              const due = dueChip(queue.dueFieldId ? r.values[queue.dueFieldId] : undefined, queue.dueTextFieldId ? r.values[queue.dueTextFieldId] : undefined, now);
              return (
                <li key={r.id}>
                  <span className="make-strip-avatar" data-tone={avatarTone(full)} aria-hidden="true">
                    {personInitials(full)}
                  </span>
                  <span className="make-strip-who">
                    <span className="make-strip-name">{personShortName(full)}</span>
                    <span className="make-strip-action">{text(r.values[queue.actionFieldId])}</span>
                  </span>
                  {due && (
                    <span className="make-strip-due" data-tone={due.tone}>
                      <span aria-hidden="true">{due.text}</span>
                      <span className="sr-only">{due.label}</span>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          <Caption words={exampleCaption} />
        </figure>
      );
    }
  }

  const view = spec.views.find((v) => v.type !== 'summary' && v.type !== 'gallery');
  const titleId = view ? titleFieldOf(spec, view) : undefined;
  const rows = view && titleId ? records.filter((r) => recordMatchesView(view, r.values) && text(r.values[titleId]) !== '').slice(0, 3) : [];
  if (view && titleId && rows.length) {
    return (
      <figure className="make-strip make-strip-entries" data-testid="make-strip" data-strip="entries">
        <ul className="make-strip-list">
          {rows.map((r) => {
            const meta = metaOf(spec, view, r);
            return (
              <li key={r.id}>
                <span className="make-strip-entry">{text(r.values[titleId])}</span>
                {meta && <span className="make-strip-meta">{meta}</span>}
              </li>
            );
          })}
        </ul>
        <Caption words={exampleCaption} />
      </figure>
    );
  }

  // Nothing to show yet: the app's own words for its empty state, never somebody else's examples.
  return (
    <div className="make-strip make-strip-empty" data-testid="make-strip" data-strip="empty">
      <span className="make-strip-empty-icon" aria-hidden="true">
        <Glyph symbol={spec.icon.symbol} size={22} />
      </span>
      <span>{spec.emptyStateHint || `No ${spec.entryNoun.plural} yet. The first one you add shows here.`}</span>
    </div>
  );
}
