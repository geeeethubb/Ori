/**
 * The Ori pass of the app views: the People look shown for legacy People apps (display only), action
 * and focus colors, People's Today | Upcoming queue and its cards, Light's prompt chip, empty sheet
 * and photo-detail fields, Riff's saved sources under the timer, and the typed-in practice label.
 * Rendered to strings (no DOM): what is checked is what a person or a screen reader gets.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { APP_THEMES, AppSpecSchema, designFor, formFieldsFor, type AppSpec, type AppSpecInput } from '@shared/appSpec.ts';
import type { AppRecord } from '@shared/records.ts';
import { addDays, todayIso } from '@shared/time.ts';
import { LIGHT_GALLERY, PEOPLE_QUEUE, RIFF_PRACTICE } from '../../../server/fixtures/specs.ts';
import { GalleryView } from './GalleryView.tsx';
import { PracticeView } from './PracticeView.tsx';
import { QueueView } from './QueueView.tsx';
import { newRecordBase, RecordForm } from './RecordForm.tsx';
import { formLabels, TYPED_IN_MINUTES_LABEL } from './RecordSheet.tsx';
import { contrastRatio, displayDesign, FOCUS_RING, resolveTheme, THEME_ACTION, THEME_SURFACES, THEMES } from './theme.ts';
import {
  avatarTone,
  dueChip,
  galleryDetailFields,
  personNote,
  practiceSources,
  queueTabs,
  type GalleryViewSpec,
  type PracticeViewSpec,
  type QueueViewSpec,
} from './viewLogic.ts';

const people = AppSpecSchema.parse(PEOPLE_QUEUE);
const light = AppSpecSchema.parse(LIGHT_GALLERY);
const riff = AppSpecSchema.parse(RIFF_PRACTICE);
const queue = people.views.find((v): v is QueueViewSpec => v.type === 'queue')!;
const sheet = light.views.find((v): v is GalleryViewSpec => v.type === 'gallery')!;
const practice = riff.views.find((v): v is PracticeViewSpec => v.type === 'practice')!;

let n = 0;
function rec(values: Record<string, unknown>, createdAt = `2026-11-10T10:00:${String(n % 60).padStart(2, '0')}.000Z`): AppRecord {
  n += 1;
  return { id: `rec_${String(n).padStart(8, '0')}`, appId: 'app_00000001', values, createdAt, updatedAt: createdAt };
}

const today = todayIso();
const noop = async () => undefined;

describe('the People look is shown, never stored', () => {
  const legacy: AppSpec = { ...people, design: { theme: 'mint', accent: 'blue', typography: 'compact', density: 'compact', artwork: 'none' } };

  it('shows a People app on its legacy mint + blue as white with orange, and leaves the spec alone', () => {
    const before = JSON.stringify(legacy);
    const t = resolveTheme(legacy);
    expect(t.attrs['data-theme']).toBe('bright');
    expect(t.accent).toBe('orange');
    expect(t.attrs['data-density']).toBe('compact');
    expect(t.style['--app-action']).toBe('#FF6A3D');
    // Ink text on the orange fill (white would fail AA).
    expect(t.style['--app-action-ink']).toBe('#162039');
    expect(contrastRatio(t.style['--app-action']!, t.style['--app-action-ink']!)).toBeGreaterThanOrEqual(4.5);
    expect(JSON.stringify(legacy)).toBe(before);
    expect(designFor(legacy).theme).toBe('mint');
  });

  it('keeps a look the person chose, other apps, and calls without a name exactly as they are', () => {
    const base = designFor(legacy);
    expect(displayDesign('People', { ...base, accent: 'teal' }).theme).toBe('mint');
    expect(displayDesign('People', { ...base, theme: 'lilac' }).theme).toBe('lilac');
    expect(displayDesign('Follow-ups', base).theme).toBe('mint');
    expect(displayDesign(undefined, base)).toBe(base);
    expect(resolveTheme({ design: legacy.design, pattern: legacy.pattern, icon: legacy.icon, purpose: legacy.purpose }).attrs['data-theme']).toBe('mint');
  });
});

describe('actions and keyboard focus', () => {
  it('Light acts in charcoal with paper text; Riff in lime with ink text', () => {
    const l = resolveTheme(light);
    expect(l.style['--app-action']).toBe('#181A1F');
    expect(l.style['--app-action-ink']).toBe('#FAF8F4');
    const r = resolveTheme(riff);
    expect(r.style['--app-action']).toBe('#DFFF76');
    expect(r.style['--app-action-ink']).toBe('#162039');
  });

  it('a theme-owned action reads well and stands out from its page', () => {
    for (const [theme, a] of Object.entries(THEME_ACTION) as [keyof typeof THEME_SURFACES, { fill: string; onFill: string }][]) {
      expect(contrastRatio(a.fill, a.onFill), `${theme} action text`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(a.fill, THEME_SURFACES[theme].bg), `${theme} action on page`).toBeGreaterThanOrEqual(3);
    }
  });

  it('the focus ring is at least 3:1 against every surface of every theme', () => {
    for (const theme of APP_THEMES) {
      const ring = THEMES[theme].dark ? FOCUS_RING.dark : FOCUS_RING.light;
      const s = THEME_SURFACES[theme];
      for (const bg of [s.bg, s.surface, s.surface2]) expect(contrastRatio(ring, bg), `${theme} ring on ${bg}`).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('People: Today | Upcoming', () => {
  const overdue = rec({ person: 'Priya', action: 'Send the deck', due: addDays(today, -2) });
  const due = rec({ person: 'Marcus', action: 'Intro', due: today });
  const soon = rec({ person: 'Lena', action: 'Share the route', due: addDays(today, 2) });
  const far = rec({ person: 'Ana', action: 'Catch up', due: addDays(today, 30) });
  const undated = rec({ person: 'Sam Lee', action: 'Coffee', due_words: 'Thursday' });
  const done = rec({ person: 'Jo', action: 'Old', due: addDays(today, -1), done: true });

  it('Today holds what is due today or overdue, Upcoming what is later or not dated; done is in neither', () => {
    const t = queueTabs(people, queue, [far, done, undated, soon, due, overdue]);
    expect(t.today.map((r) => r.values.action)).toEqual(['Send the deck', 'Intro']);
    expect(t.upcoming.map((r) => r.values.action)).toEqual(['Share the route', 'Catch up', 'Coffee']);
    expect(t.done.map((r) => r.values.action)).toEqual(['Old']);
  });

  it('due chips read the real date, and the person’s own words when there is no date', () => {
    const now = new Date(2026, 10, 14, 9, 0); // Saturday
    expect(dueChip('2026-11-14', undefined, now)).toMatchObject({ text: 'Today', label: 'Due today', tone: 'today' });
    expect(dueChip('2026-11-15', undefined, now)).toMatchObject({ text: 'Tomorrow', tone: 'soon' });
    expect(dueChip('2026-11-20', undefined, now)?.text).toBe(new Date(2026, 10, 20).toLocaleDateString(undefined, { weekday: 'long' }));
    expect(dueChip('2026-11-28', undefined, now)?.tone).toBe('later');
    expect(dueChip('2026-11-13', undefined, now)).toMatchObject({ text: 'Yesterday', tone: 'overdue' });
    expect(dueChip('2026-11-10', undefined, now)).toMatchObject({ text: 'Overdue', tone: 'overdue' });
    expect(dueChip(null, 'Thursday', now)).toEqual({ text: '“Thursday”', label: 'You said: Thursday', tone: 'words' });
    // The chip keeps the when-word they used; the label keeps everything they said.
    expect(dueChip(null, 'Thursday, after the demo', now)).toEqual({ text: '“Thursday”', label: 'You said: Thursday, after the demo', tone: 'words' });
    expect(dueChip('2026-11-15', 'Thursday', now)?.text).toBe('Tomorrow');
    expect(dueChip(null, '  ', now)).toBeNull();
    const long = dueChip(null, 'Sometime next week after the board meeting', now)!;
    expect(long.text.length).toBeLessThanOrEqual(18);
    expect(long.label).toBe('You said: Sometime next week after the board meeting');
  });

  it('one person keeps one avatar color, and what follows the name becomes context', () => {
    expect(avatarTone('Maya')).toBe(avatarTone('maya, met at the design meetup'));
    expect(personNote('Maya, met at the design meetup')).toBe('Met at the design meetup');
    expect(personNote('Priya (investor)')).toBe('Investor');
    expect(personNote('Alex from the founders circle')).toBe('From the founders circle');
    expect(personNote('Sam Lee')).toBe('');
  });
});

describe('People: the cards', () => {
  const render = (records: AppRecord[], props: Record<string, unknown> = {}) =>
    renderToStaticMarkup(createElement(QueueView, { spec: people, view: queue, records, ...props }));
  const maya = () => rec({ person: 'Maya, met at the campus mixer', action: 'Share the prototype', due: today, draft: 'Hi Maya, here is the prototype.' });
  const alex = () => rec({ person: 'Alex', action: 'Send the article', due: addDays(today, 1) });

  it('opens on Today with its first card expanded: context, the draft, Draft message and Mark done', () => {
    const html = render([alex(), maya()], { onPatch: noop });
    expect(html).toMatch(/aria-pressed="true" data-testid="rt-queue-tab-today"/);
    expect(html.match(/aria-expanded="true"/g)).toHaveLength(1);
    expect(html).toContain('Met at the campus mixer.');
    expect(html).toContain('Hi Maya, here is the prototype.');
    expect(html).toMatch(/aria-label="Draft message to Maya"[^>]*>.*Draft message/);
    expect(html).toMatch(/aria-label="Mark done: Share the prototype"/);
    // Tomorrow's item waits under Upcoming.
    expect(html).not.toContain('Send the article');
  });

  it('opens on Upcoming when nothing is due today, and the chip says when', () => {
    const html = render([alex()], { onPatch: noop });
    expect(html).toMatch(/aria-pressed="true" data-testid="rt-queue-tab-upcoming"/);
    expect(html).toContain('<span class="sr-only">Due tomorrow</span>');
  });

  it('a date suggested from the person’s words is offered to confirm, only where it can be saved', () => {
    const sam = rec({ person: 'Sam', action: 'Check in after the event', due_words: 'Friday' });
    const live = render([sam], { onPatch: noop });
    expect(live).toContain('You said “');
    expect(live).toMatch(/data-testid="rt-queue-set-date-rec_\d+"/);
    expect(render([sam])).not.toContain('rt-queue-set-date-');
  });

  it('read-only: nothing can be marked done, an existing draft can still be copied, a missing one cannot be written', () => {
    const html = render([maya()]);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*data-testid="rt-queue-done-/);
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*data-testid="rt-queue-copy-/);
    const noDraft = render([rec({ person: 'Jamie', action: 'Plan a coffee', due: today })]);
    expect(noDraft).toMatch(/<button[^>]*disabled=""[^>]*data-testid="rt-queue-copy-/);
    expect(render([rec({ person: 'Jamie', action: 'Plan a coffee', due: today })], { onPatch: noop })).not.toMatch(/<button[^>]*disabled=""[^>]*data-testid="rt-queue-copy-/);
  });

  it('done items leave both tabs and can be reopened from Done', () => {
    const html = render([rec({ person: 'Jo', action: 'Old promise', due: today, done: true }), maya()], { onPatch: noop });
    expect(html).toContain('data-testid="rt-queue-group-done"');
    expect(html).toMatch(/aria-label="Reopen: Old promise"/);
  });
});

describe('Light: the contact sheet', () => {
  const photo = (day: number, caption: string) => rec({ photo: 'example:light-1', caption, date: addDays(today, -day) }, `2026-11-${String(10 + day).padStart(2, '0')}T10:00:00.000Z`);

  it('shows the prompt chip only when the app has a real prompt rotation', () => {
    const html = renderToStaticMarkup(createElement(GalleryView, { spec: light, view: sheet, records: [photo(0, 'Low sun')] }));
    expect(html).toContain('data-testid="rt-gallery-prompt"');
    expect(html).toMatch(/This week’s prompt:/);
    const without = renderToStaticMarkup(createElement(GalleryView, { spec: { ...light, rules: [] }, view: sheet, records: [photo(0, 'Low sun')] }));
    expect(without).not.toContain('rt-gallery-prompt');
  });

  it('leads with the newest photo, and every tile names its photo and day', () => {
    const html = renderToStaticMarkup(createElement(GalleryView, { spec: light, view: sheet, records: [photo(2, 'Older'), photo(0, 'Newest')] }));
    expect(html.indexOf('Newest')).toBeLessThan(html.indexOf('Older'));
    expect(html).toMatch(/<li class="gal-cell is-lead"><button[^>]*aria-label="Newest, Today"/);
    expect(html.match(/data-testid="rt-gallery-tile"/g)).toHaveLength(2);
  });

  it('an empty sheet invites a first photo with the real action and invents nothing', () => {
    const add = createElement('button', { type: 'button', 'data-testid': 'rt-add-photo' }, 'Add photo');
    const html = renderToStaticMarkup(createElement(GalleryView, { spec: light, view: sheet, records: [], action: add }));
    expect(html).toContain('Start with one photo');
    expect(html).toContain('data-testid="rt-add-photo"');
    expect(html).not.toContain('rt-gallery-tile');
    expect(html).not.toContain('<img');
  });

  it('the photo detail lists every field of the photo form, with fields a revision added', () => {
    const input = structuredClone(LIGHT_GALLERY) as AppSpecInput & { fields: unknown[]; views: { type: string; formFieldIds?: string[] }[] };
    input.fields.push({ id: 'camera', label: 'Camera', type: 'text' }, { id: 'shutter', label: 'Shutter', type: 'text' }, { id: 'aperture', label: 'Aperture', type: 'text' });
    for (const v of input.views) if (v.type === 'gallery') v.formFieldIds = [...(v.formFieldIds ?? []), 'camera', 'shutter', 'aperture'];
    const revised = AppSpecSchema.parse(input);
    const view = revised.views.find((v): v is GalleryViewSpec => v.type === 'gallery')!;
    expect(galleryDetailFields(revised, view).map((f) => f.id)).toEqual(['light', 'location', 'keeper', 'camera', 'shutter', 'aperture']);
    expect(galleryDetailFields(light, sheet).map((f) => f.id)).toEqual(['light', 'location', 'keeper']);
  });
});

describe('Riff: what to practise with', () => {
  const source = rec({ kind: 'source', url: 'https://example.com/riff', title: 'Fingerpicked riff (example)', source_kind: 'riff' }, '2026-11-12T10:00:00.000Z');
  const newer = rec({ kind: 'source', url: 'https://example.com/lesson', title: 'Travis picking lesson', source_kind: 'lesson' }, '2026-11-13T10:00:00.000Z');
  const session = rec({ kind: 'session', minutes: 10, date: today });
  const noLink = rec({ kind: 'source', title: 'Remember this' });

  it('lists saved sources with a link, newest first, never sessions', () => {
    expect(practiceSources(riff, [source, session, newer, noLink])?.rows.map((r) => r.values.title)).toEqual(['Travis picking lesson', 'Fingerpicked riff (example)']);
    expect(practiceSources({ ...riff, views: riff.views.filter((v) => v.type !== 'links') }, [source])).toBeNull();
  });

  it('a source opens in a new tab, the level bars are decoration, and play starts a timer', () => {
    const html = renderToStaticMarkup(createElement(PracticeView, { appId: 'preview', spec: riff, view: practice, records: [session], allRecords: [source, session] }));
    expect(html).toMatch(/<a class="src-row src-link" href="https:\/\/example.com\/riff" target="_blank" rel="noopener noreferrer"/);
    expect(html).toContain('opens example.com in a new tab');
    expect(html).toMatch(/<svg class="prc-bars prc-bars-left"[^>]*aria-hidden="true"/);
    expect(html).toMatch(/aria-label="Start the timer" data-testid="rt-practice-start"/);
    expect(html).not.toMatch(/<audio|<video|autoplay/);
    // Without the app's records the room simply lists no sources.
    expect(renderToStaticMarkup(createElement(PracticeView, { appId: 'preview', spec: riff, view: practice, records: [] }))).not.toContain('Practice with');
  });
});

describe('a new entry starts honest', () => {
  it('an optional choice without a default starts unchosen; explicit defaults, required choices and presets stay', () => {
    const photoForm = newRecordBase(light, formFieldsFor(light, sheet), { photo: 'media_00000001' });
    expect(photoForm).not.toHaveProperty('light'); // not "Golden hour" just because it is listed first
    expect(photoForm).toMatchObject({ photo: 'media_00000001', date: today, keeper: false });
    const session = newRecordBase(riff, formFieldsFor(riff, practice), { kind: 'session' });
    expect(session.kind).toBe('session');
    const sources = riff.views.find((v) => v.type === 'links')!;
    expect(newRecordBase(riff, formFieldsFor(riff, sources), {}).source_kind).toBe('song'); // its own default
    expect(newRecordBase(people, formFieldsFor(people, queue), {})).not.toHaveProperty('channel');
  });
});

describe('a practice session typed in by hand', () => {
  it('asks for the minutes practiced; a timed session and other forms keep their own labels', () => {
    expect(formLabels({ mode: 'new', view: practice, preset: { minutes: null, target_minutes: null, timed_seconds: null } })).toEqual({ minutes: TYPED_IN_MINUTES_LABEL });
    expect(formLabels({ mode: 'new', view: practice, preset: { minutes: 12, timed_seconds: 720 } })).toBeUndefined();
    expect(formLabels({ mode: 'new', view: queue, preset: {} })).toBeUndefined();
    expect(formLabels(null)).toBeUndefined();
  });

  it('the form shows that label in place of the field’s own', () => {
    const html = renderToStaticMarkup(
      createElement(RecordForm, {
        spec: riff,
        appId: 'app_00000001',
        fields: formFieldsFor(riff, practice),
        preset: { kind: 'session', minutes: null },
        restoreDraft: false,
        onSubmit: noop,
        onCancel: () => undefined,
        submitting: false,
        labels: { minutes: TYPED_IN_MINUTES_LABEL },
      }),
    );
    expect(html).toMatch(/<label[^>]*>Minutes practiced/);
    expect(html).not.toContain('Minutes played');
  });
});
