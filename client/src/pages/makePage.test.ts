/**
 * Make it yours (image 04): the choices change the real draft on this device, the app's link is its
 * own absolute address, the Make step is one truthful pending state, and Ready carries the agreed
 * words and destinations. Rendered to strings (no DOM); the preview's heading outline is checked
 * against a small stand-in for the DOM.
 */
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { AppSpecSchema, checkBindings, primaryView, type AppSpec } from '@shared/appSpec.ts';
import type { AppDetailDto, ProposalPreviewDto } from '@shared/api.ts';
import { previewRecords } from '@shared/previewContent.ts';
import type { OriMoodHandle } from '../components/ori/useOriMood.ts';
import { LIGHT_GALLERY, PEOPLE_QUEUE, RIFF_PRACTICE } from '../../../server/fixtures/specs.ts';
import { previewDetail } from '../runtime/AppPreview.tsx';
import { nestHeadings } from '../runtime/AppPreview.tsx';
import {
  appLink,
  Choices,
  draftAnswers,
  draftBody,
  isLocalOnly,
  layoutChoices,
  LENGTH_SETTLE_MS,
  MakingStep,
  minuteChoices,
  nextDraftStep,
  ReadyStep,
  readyExampleCaption,
  retryable,
  sameDesign,
  sessionLength,
  targetKey,
  unchangedNote,
  withChoices,
  type ChoicesProps,
  type Draft,
  type DraftTarget,
  type Made,
} from './MakePage.tsx';
import { AppStrip } from './MakeStrip.tsx';

const light = AppSpecSchema.parse(LIGHT_GALLERY);
const riff = AppSpecSchema.parse(RIFF_PRACTICE);
const people = AppSpecSchema.parse(PEOPLE_QUEUE);

/** Light with a journal of the same photos: two layouts of one kind of entry. */
const lightWithJournal = AppSpecSchema.parse({
  ...LIGHT_GALLERY,
  views: [...LIGHT_GALLERY.views.slice(0, 1), { id: 'journal', type: 'journal', title: 'Journal', dateFieldId: 'date', titleFieldId: 'caption' }, ...LIGHT_GALLERY.views.slice(1)],
});

describe('layout choice', () => {
  it('offers Gallery and Journal only when both show the same entries', () => {
    expect(layoutChoices(lightWithJournal).map((v) => v.type)).toEqual(['gallery', 'journal']);
    const oneLayout = AppSpecSchema.parse({ ...LIGHT_GALLERY, views: LIGHT_GALLERY.views.filter((v) => v.type === 'gallery' || v.type === 'summary') });
    expect(layoutChoices(oneLayout)).toEqual([]); // one layout and a summary
    expect(layoutChoices(riff)).toEqual([]); // saved sources are another kind of entry, not a layout of sessions
    expect(layoutChoices(people)).toEqual([]);
  });

  it('opens the made app on the chosen layout without touching ids or bindings', () => {
    const chosen = withChoices(lightWithJournal, { startViewId: 'journal' });
    expect(primaryView(chosen).id).toBe('journal');
    expect(chosen.views.map((v) => v.id).sort()).toEqual(lightWithJournal.views.map((v) => v.id).sort());
    expect(chosen.fields).toBe(lightWithJournal.fields);
    expect(AppSpecSchema.safeParse(chosen).success).toBe(true);
    expect(checkBindings(chosen)).toEqual([]);
    // No choice, or the view that already leads: the same draft object comes back.
    expect(withChoices(lightWithJournal, { startViewId: null })).toBe(lightWithJournal);
    expect(withChoices(lightWithJournal, { startViewId: 'sheet' })).toBe(lightWithJournal);
    expect(withChoices(lightWithJournal, { startViewId: 'missing' })).toBe(lightWithJournal);
  });

  // Review finding 8: an app that opens on a summary showed its first layout as selected.
  it('an app that opens on its summary offers the summary first, so the choice shows where it opens', () => {
    const summaryFirst = AppSpecSchema.parse({ ...lightWithJournal, views: [lightWithJournal.views.find((v) => v.type === 'summary'), ...lightWithJournal.views.filter((v) => v.type !== 'summary')] });
    const offered = layoutChoices(summaryFirst);
    expect(offered.map((v) => v.type)).toEqual(['summary', 'gallery', 'journal']);
    expect(offered[0]?.id).toBe(summaryFirst.views[0]?.id); // the selected option is where it opens
    expect(primaryView(withChoices(summaryFirst, { startViewId: 'journal' })).id).toBe('journal');
  });
});

describe('session length goes through the app designer (review finding 1)', () => {
  const presets = (spec: AppSpec) => {
    const v = spec.views.find((x) => x.type === 'practice');
    return v?.type === 'practice' ? v.presets : [];
  };
  const designed = (spec: AppSpec, focus = '', minutes: number | null = null): Draft => ({ dto: { spec } as ProposalPreviewDto, focus, minutes });
  /** Riff as the designer returns it for a 20-minute request: 20 first, and its words say 20. */
  const riff20 = AppSpecSchema.parse({ ...RIFF_PRACTICE, tagline: '20 minutes of scales', views: RIFF_PRACTICE.views.map((v) => (v.type === 'practice' ? { ...v, presets: [20, 15, 10, 25] } : v)) });

  it('the length is never set on this device: the designer gets it, so the copy says the same length', () => {
    // Regression: withChoices moved the presets only, so "20 minutes of scales" was built with a 10-minute timer.
    expect(withChoices(riff20, { startViewId: null })).toBe(riff20);
    expect(presets(withChoices(riff20, { startViewId: null }))).toEqual([20, 15, 10, 25]);
    expect(draftBody({ words: '', length: 10 })).toEqual({ instructions: '', choices: { timeBudgetMinutes: 10 } });
    expect(draftBody({ words: 'Focus on scales', length: null })).toEqual({ instructions: 'Focus on scales', choices: {} });
    expect(sessionLength(riff20)).toBe(20);
    expect(sessionLength(light)).toBeNull();
  });

  it('a design answers the choices it was made for, and never asks again for one the designer settled', () => {
    const d = designed(riff20, '', 20);
    expect(draftAnswers(d, { words: '', length: 20 })).toBe(true);
    expect(draftAnswers(d, { words: '', length: 10 })).toBe(false);
    expect(draftAnswers(d, { words: 'Focus on scales', length: 20 })).toBe(false);
    // Asked with no length: a tap on the length it already starts at needs no new design.
    expect(draftAnswers(designed(riff20, '', null), { words: '', length: 20 })).toBe(true);
    // The words asked for 5 minutes while the chip said 20: the answer for that request is kept, not asked forever.
    const fiveByWords = AppSpecSchema.parse({ ...riff20, views: riff20.views.map((v) => (v.type === 'practice' ? { ...v, presets: [5, 20, 15] } : v)) });
    expect(draftAnswers(designed(fiveByWords, 'Make it 5 minutes', 20), { words: 'Make it 5 minutes', length: 20 })).toBe(true);
    // No timer: the length does not matter.
    expect(draftAnswers(designed(light, '', null), { words: '', length: 10 })).toBe(true);
  });

  it('a length tap is designed once the taps settle; words and Make mine are designed at once', () => {
    const d = designed(riff20, '', 20);
    const ten: DraftTarget = { words: '', length: 10 };
    const base = { draft: d, inflightKey: null, failedKey: null, makeAfterDraft: false };
    expect(nextDraftStep({ ...base, target: { words: '', length: 20 } })).toEqual({ kind: 'keep' });
    expect(nextDraftStep({ ...base, target: ten })).toEqual({ kind: 'request', delayMs: LENGTH_SETTLE_MS });
    // On its way, or failed (Try again or a new choice asks again): no second request.
    expect(nextDraftStep({ ...base, target: ten, inflightKey: targetKey(ten) })).toEqual({ kind: 'wait' });
    expect(nextDraftStep({ ...base, target: ten, failedKey: targetKey(ten) })).toEqual({ kind: 'wait' });
    // A request for older choices is replaced, not waited for.
    expect(nextDraftStep({ ...base, target: { words: '', length: 15 }, inflightKey: targetKey(ten) })).toEqual({ kind: 'request', delayMs: LENGTH_SETTLE_MS });
    // Tapping back to the length on show keeps the design (the effect drops the answer still on its way).
    expect(nextDraftStep({ ...base, target: { words: '', length: 20 }, inflightKey: targetKey(ten) })).toEqual({ kind: 'keep' });
    expect(nextDraftStep({ ...base, target: { words: 'Focus on scales', length: 20 } })).toEqual({ kind: 'request', delayMs: 0 });
    expect(nextDraftStep({ ...base, target: ten, makeAfterDraft: true })).toEqual({ kind: 'request', delayMs: 0 });
    // The first preview starts by itself.
    expect(nextDraftStep({ ...base, draft: null, target: { words: '', length: 20 } })).toEqual({ kind: 'request', delayMs: 0 });
  });

  // Review finding 2: a length tapped during "Updating the preview…" showed as chosen but was not built.
  it('while Make mine designs and saves, every choice waits: nothing tapped then can differ from what is made', () => {
    const props: ChoicesProps = {
      placeholder: 'Focus on clean chord changes',
      focus: 'Scales first',
      onFocusChange: () => undefined,
      showUpdate: true,
      updating: true,
      disabled: true,
      onUpdate: () => undefined,
      unchanged: null,
      layouts: layoutChoices(lightWithJournal),
      currentStart: 'sheet',
      onLayout: () => undefined,
      minuteOptions: [10, 15, 20, 25],
      pressedLength: 20,
      onMinutes: () => undefined,
    };
    const html = renderToStaticMarkup(createElement(Choices, props));
    const controls = html.match(/<(?:button|input)\b[^>]*>/g) ?? [];
    expect(controls.length).toBe(1 + 1 + 2 + 4); // the field, Update preview, two layouts, four lengths
    for (const c of controls) expect(c, c).toMatch(/\sdisabled=""/);
    expect(html).toMatch(/aria-pressed="true"[^>]*data-testid="make-choice-minutes-20"/);
    const open = renderToStaticMarkup(createElement(Choices, { ...props, disabled: false, updating: false }));
    expect(open.match(/\sdisabled=""/g) ?? []).toHaveLength(0);
  });

  it('offers the timer\'s presets plus the length the person asked for (audit P1-01)', () => {
    expect(minuteChoices(riff)).toEqual([10, 15, 25]);
    expect(minuteChoices(riff, 20)).toEqual([10, 15, 20, 25]);
    expect(minuteChoices(null, 12)).toEqual([10, 12, 15, 25]);
    const many = AppSpecSchema.parse({ ...RIFF_PRACTICE, views: RIFF_PRACTICE.views.map((v) => (v.type === 'practice' ? { ...v, presets: [5, 10, 15, 20, 25, 30] } : v)) });
    const offered = minuteChoices(many, 90);
    expect(offered).toHaveLength(6);
    expect(offered).toContain(90);
  });
});

describe('the app link', () => {
  it('is the app\'s own absolute address', () => {
    expect(appLink('aB3dE5fG7h', 'https://ori.example')).toBe('https://ori.example/apps/aB3dE5fG7h/');
    expect(appLink('aB3dE5fG7h', 'https://ori.example/')).toBe('https://ori.example/apps/aB3dE5fG7h/');
  });

  it('says when a link only opens on this computer', () => {
    expect(isLocalOnly('http://localhost:8787/apps/x/')).toBe(true);
    expect(isLocalOnly('http://127.0.0.1:8787/apps/x/')).toBe(true);
    expect(isLocalOnly('http://[::1]:8787/apps/x/')).toBe(true);
    expect(isLocalOnly('https://ori.example/apps/x/')).toBe(false);
    expect(isLocalOnly('http://192.168.1.20:8787/apps/x/')).toBe(false);
    expect(isLocalOnly('/apps/x/')).toBe(false);
  });
});

describe('retry', () => {
  it('offers Try again only where trying again can help', () => {
    expect(retryable({ status: 0, code: 'network' })).toBe(true);
    expect(retryable({ status: 0, code: 'timeout' })).toBe(true);
    expect(retryable({ status: 503, code: 'error' })).toBe(true);
    expect(retryable({ status: 403, code: 'premium_paused' })).toBe(false);
    expect(retryable({ status: 409, code: 'stale_proposal' })).toBe(false);
    expect(retryable({ status: 429, code: 'rate_limited' })).toBe(false);
    expect(retryable({ status: 400, code: 'invalid_spec' })).toBe(false);
  });
});

/** The parts of a mood handle the steps read (the mood and phase of the current operation). */
function handle(mood: OriMoodHandle['mood'], phase: OriMoodHandle['phase']): OriMoodHandle {
  return { mood, phase, settled: false, pendingKind: phase === 'pending' ? 'create' : null, companion: { mood, motion: 'auto' } } as unknown as OriMoodHandle;
}

function made(spec: AppSpec, extra: Partial<Made> = {}): Made {
  const detail: AppDetailDto = previewDetail(spec);
  detail.app = { ...detail.app, id: 'aB3dE5fG7h', launchPath: '/apps/aB3dE5fG7h/' };
  return { detail, alreadyBuilt: false, carried: [], records: null, ...extra };
}

const render = (el: ReturnType<typeof createElement>) => renderToStaticMarkup(createElement(MemoryRouter, null, el));
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');

describe('Make step', () => {
  it('is one pending state: the building companion and "Making Light yours…", no stages, percentage or cancel', () => {
    const html = render(createElement(MakingStep, { name: 'Light', icon: light.icon, mood: handle('building', 'pending') }));
    expect(text(html)).toContain('Making Light yours…');
    expect(html).toContain('data-mood="building"');
    expect(html).toMatch(/width="120"/); // the 96-128px focal companion
    expect(text(html)).not.toMatch(/%|cancel|designing|checking|preparing|step \d/i);
    expect(html).not.toContain('<button');
  });
});

describe('Ready step', () => {
  it('uses the agreed words and the app\'s own destinations', () => {
    const html = render(createElement(ReadyStep, { made: made(light), mood: handle('success', 'success'), focusHeading: false, back: { to: '/agent', label: 'Agent' } }));
    const t = text(html);
    for (const words of ['Light is yours', 'Ready to use', 'Open Light', 'Add to home screen', 'Copy app link', 'Your own app. Its own link.']) expect(t).toContain(words);
    expect(html).toContain('href="/apps/aB3dE5fG7h/"');
    expect(html).toContain('href="/apps/aB3dE5fG7h/?install=1"');
    expect(html).toContain('data-mood="success"');
    expect(t).not.toMatch(/installed/i); // the guide is only a way to add it; nothing claims it happened
  });

  it('labels example photos on the card and shows the person\'s own photo when the app holds one', () => {
    const examples = render(createElement(ReadyStep, { made: made(light), mood: handle('idle', 'idle'), focusHeading: false, back: { to: '/agent', label: 'Agent' } }));
    expect(examples).toContain('/examples/light-1.jpg');
    expect(text(examples)).toContain('Example');
    const own = made(light, { records: [{ id: 'r1', appId: 'aB3dE5fG7h', values: { photo: 'Zz9yX8wV7u', caption: 'Mine' }, createdAt: '', updatedAt: '' }] });
    const ownHtml = render(createElement(ReadyStep, { made: own, mood: handle('idle', 'idle'), focusHeading: false, back: { to: '/agent', label: 'Agent' } }));
    expect(ownHtml).not.toContain('/examples/');
    expect(ownHtml).not.toMatch(/>Example</);
  });

  it('after the brief acknowledgement the Ready expression stays, still', () => {
    const html = render(createElement(ReadyStep, { made: made(riff), mood: handle('idle', 'idle'), focusHeading: false, back: { to: '/playground', label: 'Playground' } }));
    expect(html).toContain('data-mood="success"');
    expect(html).toContain('data-motion="none"');
    // A timer app shows its real default on the card, never a playback control.
    expect(text(html)).toContain('15:00');
    expect(html).not.toMatch(/aria-label="Play/i);
  });

  it('a repeat says it is the same app, and what Make mine carried over', () => {
    const html = render(createElement(ReadyStep, { made: made(light, { alreadyBuilt: true, carried: ['Your photo is the first entry in “Contact sheet”.'] }), mood: handle('idle', 'idle'), focusHeading: false, back: { to: '/agent', label: 'Agent' } }));
    expect(text(html)).toContain('This is the same app, not a copy.');
    expect(text(html)).toContain('Your photo is the first entry');
  });

  // Review finding 11.
  it('one caption labels all the example photos, and People shows its next people in its own look', () => {
    const lightHtml = render(createElement(ReadyStep, { made: made(light), mood: handle('idle', 'idle'), focusHeading: false, back: { to: '/agent', label: 'Agent' } }));
    expect(lightHtml).toContain('/examples/light-2.jpg');
    expect(text(lightHtml)).toContain('Example Shown until you add your own photos.');
    expect(lightHtml.match(/>Example</g) ?? []).toHaveLength(1); // the strip as a whole, not the first photo only

    const peopleHtml = render(createElement(ReadyStep, { made: made(people), mood: handle('idle', 'idle'), focusHeading: false, back: { to: '/agent', label: 'Agent' } }));
    expect(peopleHtml).toContain('data-strip="queue"');
    const t = text(peopleHtml);
    expect(t).toContain('Maya');
    expect(t).toContain('Send the demo link');
    expect(t).toContain('Example Shown until you add your own follow-ups.');
    expect(peopleHtml).not.toMatch(/Next actions<\/span>\s*<\/div>\s*<\/div>/); // no longer a lone view chip
    expect(readyExampleCaption(riff)).toBe('Shown until you add your own sessions.');
  });

  it('an archived app says so, offers Restore, and waits to be restored before Add to home screen', () => {
    const archived = made(light);
    archived.detail.app = { ...archived.detail.app, archivedAt: '2026-11-14T10:00:00.000Z' };
    const html = render(createElement(ReadyStep, { made: archived, mood: handle('idle', 'idle'), focusHeading: false, back: { to: '/agent', label: 'Agent' }, onDetail: () => undefined }));
    const t = text(html);
    expect(t).toContain('Light is archived.');
    expect(t).toContain('Restore Light');
    expect(html).toContain('href="/apps/aB3dE5fG7h/"'); // it still opens
    expect(html).not.toContain('?install=1');
    // Without a way to restore here, it points to My apps.
    expect(render(createElement(ReadyStep, { made: archived, mood: handle('idle', 'idle'), focusHeading: false, back: { to: '/agent', label: 'Agent' } }))).toContain('href="/apps"');
  });
});

describe('the compact example strip (review finding 4)', () => {
  const NOW = new Date(2026, 10, 14, 12, 0, 0);
  const strip = (spec: AppSpec, records = previewRecords(spec, 3, NOW), exampleCaption?: string) => renderToStaticMarkup(createElement(AppStrip, { spec, records, exampleCaption, now: NOW }));

  it('Light leads with two example photos, described by their captions', () => {
    const html = strip(light);
    expect(html).toContain('data-strip="photos"');
    expect(html).toContain('data-count="2"');
    expect(html).toContain('/examples/light-1.jpg');
    expect(html).toContain('alt="Tree shadows across the brick street"');
    expect(html).not.toMatch(/>Example</); // the card's own heading labels them on the Preview step
  });

  it('Riff shows the timer face at the length it starts at, and nothing it could start', () => {
    const html = strip(riff);
    expect(html).toContain('data-strip="timer"');
    expect(text(html)).toContain('15:00');
    expect(html).not.toContain('<button');
  });

  it('People shows the next two people with their actions and when', () => {
    const html = strip(people);
    expect(html).toContain('data-strip="queue"');
    expect(html.match(/<li>/g) ?? []).toHaveLength(2);
    expect(text(html)).toMatch(/Maya .*Send the demo link/);
    expect(text(html)).toContain('Today');
  });

  it('other apps list their first entries; with none, the app\'s own empty-state words', () => {
    const journal = AppSpecSchema.parse({ ...LIGHT_GALLERY, name: 'Photo walks', views: [{ id: 'walks', type: 'journal', title: 'Walks', dateFieldId: 'date', titleFieldId: 'caption' }] });
    const entries = strip(journal);
    expect(entries).toContain('data-strip="entries"');
    expect(text(entries)).toContain('Tree shadows across the brick street');
    expect(text(entries)).toContain('Nov 14');
    const empty = strip(AppSpecSchema.parse({ ...journal, emptyStateHint: 'Your first walk goes here.' }), []);
    expect(empty).toContain('data-strip="empty"');
    expect(text(empty)).toContain('Your first walk goes here.');
  });
});

describe('focus words the designer could not apply (review finding 6)', () => {
  it('a new design that is the same app is recognised, whatever order its keys are in', () => {
    const reorder = (v: unknown): unknown =>
      Array.isArray(v) ? v.map(reorder) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).reverse().map(([k, x]) => [k, reorder(x)])) : v;
    expect(sameDesign(light, AppSpecSchema.parse(LIGHT_GALLERY))).toBe(true);
    expect(sameDesign(light, reorder(light) as AppSpec)).toBe(true);
    expect(sameDesign(light, { ...light, tagline: 'Find the light' })).toBe(false);
  });

  it('says plainly that nothing changed, and what to do instead', () => {
    expect(unchangedNote('Only black and white street photos at night', true)).toBe(
      'The preview did not change. Sample mode could not apply “Only black and white street photos at night”. You can make it now and ask Edit with Ori later.',
    );
    expect(unchangedNote('More reflections', false)).toContain('The designer could not apply “More reflections”.');
  });
});

describe('preview headings (audit P2-02)', () => {
  /** A stand-in for the preview's DOM: just headings with a tag and attributes. */
  function fakeRoot(tags: string[]) {
    const els = tags.map((tagName) => {
      const attrs = new Map<string, string>();
      return { tagName, getAttribute: (k: string) => attrs.get(k) ?? null, setAttribute: (k: string, v: string) => void attrs.set(k, v) };
    });
    return { root: { querySelectorAll: () => els } as unknown as ParentNode, levels: () => els.map((e) => e.getAttribute('aria-level')) };
  }

  it('the app\'s own name sits under the page\'s headings and the rest keep their order', () => {
    const { root, levels } = fakeRoot(['H1', 'H3', 'H4', 'H3']);
    nestHeadings(root, 3);
    expect(levels()).toEqual(['3', '5', '6', '5']);
  });

  it('works whatever level the app starts at, and never goes past 6', () => {
    const { root, levels } = fakeRoot(['H2', 'H3', 'H6']);
    nestHeadings(root, 3);
    expect(levels()).toEqual(['3', '4', '6']);
    const empty = fakeRoot([]);
    expect(() => nestHeadings(empty.root, 3)).not.toThrow();
  });
});
