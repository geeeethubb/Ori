/**
 * Ori, model side: the Light revision "Add camera settings to my photo notes", lists of details,
 * reserved ids, revision summaries in the future tense with before → after lines and copy that follows
 * a changed default (audit P1-02), concise Agent replies (P1-07), promises tied to capabilities (P1-08),
 * defaults from the request (P1-01), the reference copy and icons, and the live adapter's deterministic
 * post-steps (driven by a stubbed model, so nothing here calls the network).
 */
import { describe, expect, it } from 'vitest';
import { AppSpecSchema, formFieldsFor, type AppSpec, type AppSpecInput, type FieldSpec } from '../../shared/appSpec.ts';
import { referenceIcon } from '../../shared/brand.ts';
import { RecommendationDraftSchema, type RecommendationDraft } from '../../shared/context.ts';
import { ICON_SYMBOLS } from '../../shared/icons.ts';
import { applyRevision, planUndo, type RevisionOp } from '../../shared/revision.ts';
import { galleryDetailFields } from '../../client/src/runtime/viewLogic.ts';
import { LIGHT_GALLERY, PEOPLE_QUEUE, PHOTO_WALK_JOURNAL, PRACTICE_TRACKER, RIFF_PRACTICE } from '../../server/fixtures/specs.ts';
import { AnthropicAdapter } from '../../server/model/anthropic.ts';
import { CONCEPTS, PLAYGROUND_CONCEPTS, conceptById } from '../../server/model/sample/catalog.ts';
import { durationPhrase, minutesFromText, rewriteMinutes } from '../../server/model/sample/durations.ts';
import { generateSpec } from '../../server/model/sample/generate.ts';
import { recommend } from '../../server/model/sample/recommend.ts';
import { respondToCapture } from '../../server/model/sample/respond.ts';
import { NO_MATCH_SUMMARY, proposeRevision } from '../../server/model/sample/revise.ts';
import { alignDurationCopy, looksAlreadyDone, rekeyReservedFields } from '../../server/model/sample/revisionCopy.ts';
import type { ExistingAppSummary, RespondInput } from '../../server/model/types.ts';

const light = (): AppSpec => AppSpecSchema.parse(LIGHT_GALLERY);
const riff = (): AppSpec => AppSpecSchema.parse(RIFF_PRACTICE);
const journal = (): AppSpec => AppSpecSchema.parse(PHOTO_WALK_JOURNAL);
const revise = (spec: AppSpec, request: string, reservedFieldIds: string[] = []) => proposeRevision({ spec, request, sampleRecords: [], reservedFieldIds });
const added = (ops: RevisionOp[]) => ops.flatMap((o) => (o.op === 'add_field' ? [o.field] : []));
const sentences = (s: string) => s.split(/(?<=[.?!])\s+/).filter(Boolean);

/** The audit's synthetic sketch app (a live-model build): a ten-minute default stated in its copy. */
const SKETCH: AppSpecInput = {
  schemaVersion: 1,
  name: 'Ten-Minute Sketch Sprint',
  tagline: 'One object, ten minutes on the clock',
  purpose: 'explore',
  pattern: 'practice',
  icon: { symbol: 'pen', color: 'rose' },
  fields: [
    { id: 'date', label: 'Date', type: 'date', default: 'today' },
    { id: 'minutes', label: 'Minutes drawn', type: 'number', min: 0, max: 180, unit: 'min' },
    { id: 'subject', label: 'What you drew', type: 'text' },
  ],
  views: [
    { id: 'sprint', type: 'practice', title: 'Ten-minute sprint', minutesFieldId: 'minutes', focusFieldId: 'subject', dateFieldId: 'date', presets: [10, 15, 20], tempoHelper: false, addLabel: 'Save sketch' },
    { id: 'progress', type: 'summary', title: 'Progress', metrics: [{ id: 'n', label: 'Sketches', kind: 'count' }] },
  ],
  rules: [{ id: 'daily_object', type: 'prompt_rotation', cadence: 'daily', title: 'Today’s 10-minute object', prompts: ['A spoon', 'A mug', 'Your left shoe'] }],
  entryNoun: { singular: 'sketch', plural: 'sketches' },
  emptyStateHint: 'Press Start 10:00 and draw one object for ten minutes.',
  permissions: [],
};
const sketch = (): AppSpec => AppSpecSchema.parse(SKETCH);

type Cap = RespondInput['capture'];
const capture = (over: Partial<Cap> = {}): Cap => ({ id: 'cap-ori-0001', kind: 'note', text: '', url: null, linkMeta: null, readStatus: 'read', sourceLabel: 'Typed note', image: null, ...over });
const respond = (over: Partial<Cap> = {}, existingApps: ExistingAppSummary[] = []) => respondToCapture({ capture: capture(over), facts: [], existingApps, recentCaptures: [] });
const LIGHT_APP: ExistingAppSummary = { id: 'app-light-0001', name: 'Light', purpose: 'explore', pattern: 'gallery', tagline: 'Notice the light.', capabilities: ['gallery', 'photo_upload', 'summary', 'prompts'], icon: { symbol: 'camera', color: 'charcoal' } };
const PEOPLE_APP: ExistingAppSummary = { id: 'app-people-001', name: 'People', purpose: 'work', pattern: 'queue', capabilities: ['next_actions', 'due_soon', 'summary'], icon: { symbol: 'people', color: 'white' } };

describe('Light: "Add camera settings to my photo notes"', () => {
  it('becomes Camera, Shutter and Aperture: in the photo form, shown on the photo, every photo kept', () => {
    const before = light();
    const p = revise(before, 'Add camera settings to my photo notes');
    expect(p.summary).not.toBe(NO_MATCH_SUMMARY);
    expect(p.unsupported).toEqual([]);
    expect(added(p.ops).map((f) => [f.id, f.type, f.label, f.placeholder])).toEqual([
      ['camera', 'text', 'Camera', 'Fujifilm X100V'],
      ['shutter', 'text', 'Shutter', '1/250'],
      ['aperture', 'text', 'Aperture', 'f/8'],
    ]);
    // The change lines below already say the photos keep their data, so the summary does not repeat it.
    expect(p.summary).toBe('Light will get “Camera”, “Shutter” and “Aperture” on each photo.');
    const result = applyRevision(before, p.ops);
    expect(result.changes).toEqual(['Add “Camera”, “Shutter” and “Aperture” (short text). Existing photos keep their data; these fields start empty for them.']);
    const after = result.spec as AppSpec;
    const gallery = after.views.find((v) => v.type === 'gallery');
    if (gallery?.type !== 'gallery') throw new Error('Light lost its gallery');
    // The add/edit form for a photo shows them right under the caption (reference 07), in the order asked,
    // and so does the photo itself (lightbox details).
    expect(formFieldsFor(after, gallery).map((f) => f.id)).toEqual(['photo', 'caption', 'camera', 'shutter', 'aperture', 'light', 'note', 'location', 'keeper', 'date']);
    expect(after.fields.map((f) => f.id)).toEqual(['date', 'photo', 'caption', 'camera', 'shutter', 'aperture', 'note', 'light', 'location', 'keeper']);
    expect(galleryDetailFields(after, gallery).map((f) => f.id)).toEqual(expect.arrayContaining(['camera', 'shutter', 'aperture']));
    for (const f of after.fields.filter((x) => ['camera', 'shutter', 'aperture'].includes(x.id))) {
      expect(f.hidden, f.id).toBeFalsy();
      expect(f.required, f.id).toBeFalsy(); // never a requirement for a photo already saved
    }
    // Undo brings the earlier Light back and strands nothing; a filled-in setting stays saved, hidden.
    const photos = [
      { values: { date: '2026-11-14', photo: 'media-0000000001', caption: 'Waited for the light.' } },
      { values: { date: '2026-11-14', photo: 'media-0000000002', caption: 'Shadows on the stairs', shutter: '1/500' } },
    ];
    const undo = planUndo(after, before, photos);
    expect(undo.ok).toBe(true);
    expect(undo.spec?.fields.find((f) => f.id === 'shutter')).toMatchObject({ hidden: true });
    expect(undo.spec?.fields.some((f) => f.id === 'camera')).toBe(false);
  });

  it('close variants name their own details', () => {
    const ids = (request: string) => added(revise(light(), request).ops).map((f) => f.id);
    expect(ids('camera settings')).toEqual(['camera', 'shutter', 'aperture']);
    expect(ids('Add shutter speed and aperture')).toEqual(['shutter', 'aperture']);
    expect(ids('Add lens and ISO to my photo notes')).toEqual(['lens', 'iso']);
    expect(ids('I want to note the exposure settings on each photo')).toEqual(['camera', 'shutter', 'aperture']);
    expect(ids('add the camera, lens, shutter speed, aperture and ISO to each photo')).toEqual(['camera', 'lens', 'shutter', 'aperture', 'iso']);
  });

  it('asking again says Light already has them instead of "couldn\'t map"', () => {
    const once = applyRevision(light(), revise(light(), 'Add camera settings to my photo notes').ops).spec as AppSpec;
    const again = revise(once, 'Add camera settings to my photo notes');
    expect(again.ops).toEqual([]);
    expect(again.summary).toBe('Nothing to change yet. Light already has Camera, Shutter and Aperture.');
  });

  it('never reuses an id an earlier version held', () => {
    const p = revise(light(), 'Add camera settings to my photo notes', ['camera', 'shutter']);
    expect(added(p.ops).map((f) => f.id)).toEqual(['camera_2', 'shutter_2', 'aperture']);
    const reserved = new Map<string, FieldSpec['type']>([['camera', 'number'], ['shutter', 'checkbox']]);
    expect(applyRevision(light(), p.ops, { reserved }).ok).toBe(true);
  });

  it('shared with the Agent while Light exists, it is a change to Light, not a photo entry', () => {
    const r = respond({ text: 'Add camera settings to my photo notes' }, [LIGHT_APP]);
    expect(r.proposals.map((p) => p.kind)).toEqual(['update_app']);
    expect(r.proposals[0]).toMatchObject({ targetAppId: LIGHT_APP.id, updateRequest: 'Add camera settings to my photo notes', icon: { symbol: 'camera', color: 'charcoal' } });
    expect(r.message).toBe('That is a change to Light itself; you will see it before anything changes.');
    expect(r.learned).toEqual([]);
  });
});

describe('lists of details: "add A, B and C to my <entries>"', () => {
  it('adds one field per item, known kinds keep their own shape', () => {
    const walks = revise(journal(), 'add weather, who I was with and the route to each walk');
    expect(added(walks.ops).map((f) => [f.id, f.label])).toEqual([['weather', 'Weather'], ['who_i_was_with', 'Who I was with'], ['route', 'Route']]);
    expect(walks.summary).toMatch(/^Photo Walk Journal will get “Weather”, “Who I was with” and “Route” on each walk\./);
    const kinds = revise(journal(), 'Add a rating and tags to my walks');
    expect(added(kinds.ops).map((f) => f.type).sort()).toEqual(['rating', 'tags']);
  });

  it('leaves presets, named fields and options to their own planners', () => {
    expect(revise(riff(), 'Add a 20-minute preset to the practice timer as the default').ops.map((o) => o.op)).toEqual(['replace_view']);
    const tracker = AppSpecSchema.parse(PRACTICE_TRACKER);
    const link = added(revise(tracker, 'Add a link field called Inspiration, for the song or riff behind each session').ops);
    expect(link.map((f) => [f.type, f.label])).toEqual([['url', 'Inspiration']]);
    expect(revise(journal(), 'add an option called Tired to How did it feel').ops[0]).toMatchObject({ op: 'add_select_option', fieldId: 'mood' });
  });
});

describe('revision summaries: future tense, before → after, copy that follows a changed default', () => {
  it('the audit request: rename plus a 5-minute default, with every duration in the copy following it', () => {
    const before = sketch();
    const p = revise(before, 'Rename this app Audit Sketch Lab and make 5 minutes the first and default timer preset');
    expect(p.summary).toBe('Ten-Minute Sketch Sprint will be called “Audit Sketch Lab”. The timer will start at 5 minutes. Its wording will say five minutes too.');
    expect(looksAlreadyDone(p.summary)).toBe(false);
    const result = applyRevision(before, p.ops);
    expect(result.changes).toEqual([
      'Rename the app from “Ten-Minute Sketch Sprint” to “Audit Sketch Lab”.',
      'Tagline: “One object, ten minutes on the clock” → “One object, five minutes on the clock”.',
      'Default session: 10 min → 5 min.',
      'Timer presets: 10, 15, 20 → 5, 10, 15, 20 min.',
      'Tab name: “Ten-minute sprint” → “Five-minute sprint”.',
      'Update the hint shown before the first sketch: “Press Start 5:00 and draw one object for five minutes”.',
      'Prompt title: “Today’s 10-minute object” → “Today’s 5-minute object”.',
    ]);
    const after = result.spec as AppSpec;
    expect(after).toMatchObject({ name: 'Audit Sketch Lab', tagline: 'One object, five minutes on the clock', emptyStateHint: 'Press Start 5:00 and draw one object for five minutes.' });
    const prompt = after.rules[0];
    expect(prompt?.type === 'prompt_rotation' ? prompt.prompts : null).toEqual(['A spoon', 'A mug', 'Your left shoe']); // prompts untouched
    // Nothing changed before Accept (the preview is computed on a copy), and undo restores the old copy.
    expect(before.tagline).toBe('One object, ten minutes on the clock');
    const undo = planUndo(after, before, [{ values: { date: '2026-11-14', minutes: 0, subject: 'AUDIT TEST — spoon' } }]);
    expect(undo.ok).toBe(true);
    expect(undo.spec).toMatchObject({ name: 'Ten-Minute Sketch Sprint', tagline: 'One object, ten minutes on the clock' });
  });

  it('without a rename the name is never changed for the person, and the summary says it still states the old length', () => {
    const p = revise(sketch(), 'make the default session five minutes');
    expect(p.ops.some((o) => o.op === 'rename_app' && o.name !== 'Ten-Minute Sketch Sprint')).toBe(false);
    expect(p.summary).toMatch(/The name “Ten-Minute Sketch Sprint” still says ten minutes; ask to rename it if you like\.$/);
  });

  it('copy with no stated length gets no extra operations', () => {
    const p = revise(riff(), 'make the default session 20 minutes');
    expect(p.ops.map((o) => o.op)).toEqual(['replace_view']);
    expect(p.summary).toBe('The timer will start at 20 minutes.');
    expect(applyRevision(riff(), p.ops).changes).toEqual(['Default session: 15 min → 20 min.', 'Timer presets: 15, 10, 25 → 20, 15, 10, 25 min.']);
  });

  it('every sample summary describes what WOULD change, briefly', () => {
    const cases: [AppSpec, string][] = [
      [light(), 'Add camera settings to my photo notes'], [light(), 'make it dark'], [riff(), 'Set the metronome to 60 bpm'],
      [journal(), 'add a due date'], [journal(), 'hide the keeper checkbox and the location'], [AppSpecSchema.parse(PEOPLE_QUEUE), 'Add a priority field'],
      [journal(), 'rename the app to Evening Walks'], [riff(), 'Size the daily prompts to 15-minute sessions'],
    ];
    for (const [spec, request] of cases) {
      const p = revise(spec, request);
      expect(p.ops.length, request).toBeGreaterThan(0);
      expect(p.summary, request).toMatch(/\bwill\b/);
      expect(looksAlreadyDone(p.summary), request).toBe(false);
      expect(p.summary.length, request).toBeLessThanOrEqual(220);
      for (const line of applyRevision(spec, p.ops).changes) expect(line, request).toMatch(/^[A-Z].*\.$/);
    }
    expect(revise(journal(), 'hide the keeper checkbox and the location').ops).toEqual([{ op: 'hide_field', fieldId: 'keeper' }, { op: 'hide_field', fieldId: 'location' }]);
  });

  it('spots summaries written as if the change already happened', () => {
    for (const s of ['Added Camera, Shutter and Aperture.', "I've renamed the app.", 'The timer is now 5 minutes.', 'Your app now starts at 5 minutes.', 'Renamed the app and set the timer.']) expect(looksAlreadyDone(s), s).toBe(true);
    for (const s of ['Light will get Camera, Shutter and Aperture on each photo.', 'The timer will start at 5 minutes.', 'Adds a weather field to each walk.']) expect(looksAlreadyDone(s), s).toBe(false);
  });
});

describe('defaults from the request (P1-01)', () => {
  it('reads lengths in digits and in words', () => {
    const cases: [string, number | null][] = [
      ['I want a ten-minute sketching app', 10], ['a 10-minute session', 10], ['10 min before bed', 10], ['half an hour tonight', 30],
      ['a quarter of an hour of guitar', 15], ['Twenty-five minutes', 25], ['an hour and a half', 90], ['at 3 pm, often ten people', null], ['1.5 hours', null],
    ];
    for (const [text, minutes] of cases) expect(minutesFromText(text), text).toBe(minutes);
    expect(durationPhrase('I have 15 minutes to practice')).toBe('15 minutes to practice');
    expect(rewriteMinutes('A Ten-Minute sprint, 10 min, Start 10:00, meet at 10:00, 110 minutes', 10, 5).text).toBe('A Five-Minute sprint, 5 min, Start 5:00, meet at 10:00, 110 minutes');
  });

  it('two different lengths reach the card, the Make page and the first preset of the app', () => {
    for (const [note, minutes] of [['I want a ten-minute guitar session before bed', 10], ['I have half an hour for guitar most evenings', 30]] as const) {
      const r = respond({ text: note });
      const card = r.proposals[0] as RecommendationDraft;
      expect(card).toMatchObject({ kind: 'new_app', conceptId: 'riff-practice', suggestedMinutes: minutes, tagline: `Make room for ${minutes} minutes of guitar.` });
      expect(card.previewLines[0]).toMatch(new RegExp(`^Timer: ${minutes} /`));
      // The designer starts the app there even when the Make page sends no choice…
      const built = generateSpec({ recommendation: card, instructions: '', facts: [] });
      const practice = built.spec.views.find((v) => v.type === 'practice');
      expect(practice?.type === 'practice' ? practice.presets[0] : null).toBe(minutes);
      expect(built.description).toMatch(new RegExp(`From what you asked, we set the default session to ${minutes} minutes`));
      // …and a different choice made on the Make page wins.
      const chosen = generateSpec({ recommendation: card, instructions: '', facts: [], choices: { timeBudgetMinutes: 25 } });
      const p2 = chosen.spec.views.find((v) => v.type === 'practice');
      expect(p2?.type === 'practice' ? p2.presets[0] : null).toBe(25);
    }
  });

  it('a stated length in memory starts the Playground card there too', () => {
    const facts = [{ id: 'f-1', category: 'routine' as const, value: 'I practise guitar for about 20 minutes most evenings', status: 'confirmed' as const, confidence: 0.9 }];
    const card = recommend({ facts, existingApps: [], chosenInterests: [], count: 3 }).find((r) => r.conceptId === 'riff-practice');
    expect(card).toMatchObject({ suggestedMinutes: 20, firstAction: 'Pick 20 minutes, press start, and play the riff at half speed.', tagline: 'Make room for 20 minutes of guitar.' });
    expect(card?.previewLines[0]).toBe('Timer: 20 / 15 / 10 / 25 min');
  });
});

describe('concise Agent replies (P1-07)', () => {
  it('fit in two short sentences, with a compact read-status sentence first when something was not read', () => {
    expect(respond({ text: 'I want to try street photography on weekends.' }).message).toBe('A place for the shots you notice. Want to make it yours?');
    expect(respond({ kind: 'image', text: 'I want to try street photography on weekends.', mediaId: 'media-0000000001', readStatus: 'not_read', sourceLabel: 'Screenshot' }).message)
      .toBe("Sample mode cannot read images, so I'm using your words. Want a place for the shots you notice?");
    expect(respond({ kind: 'link', url: 'https://www.youtube.com/watch?v=abc', text: 'This fingerstyle riff, 20 minutes tonight', readStatus: 'not_read', sourceLabel: 'YouTube link' }).message)
      .toBe("I can't watch videos, so I'm using your note. Want a practice room for your 20 minutes?");
    const cases: Partial<Cap>[] = [
      { text: 'Met Maya at the design meetup, promised to send her the demo link by Friday' },
      { text: 'save this for later', kind: 'link', url: 'https://example.com/x', readStatus: 'not_read', sourceLabel: 'Link to example.com' },
      { text: 'Sync my Spotify likes into a practice list', kind: 'link', url: 'https://open.spotify.com/track/x', readStatus: 'unavailable', sourceLabel: 'Spotify link' },
      { text: 'Trying to keep my houseplants alive through the winter' },
    ];
    for (const c of cases) {
      const r = respond(c);
      expect(sentences(r.message).length, r.message).toBeLessThanOrEqual(2);
      expect(r.message.length, r.message).toBeLessThanOrEqual(160);
      if (c.text) expect(r.message).not.toContain(`"${c.text}"`);
    }
    // Using an app the person has: one sentence, and the date stays their words to confirm.
    const people = respond({ text: 'Follow up with Maya about the proposal Thursday' }, [PEOPLE_APP]);
    expect(people.message).toBe('People already does this: check the entry I drafted, confirm a date for "Thursday" and save it there.');
  });

  it('cards lead with what the app does; the person\'s words stay in "Why this?" as the card\'s source, not repeated in the reason', () => {
    const r = respond({ text: 'I like this sound and have 15 minutes to practice' });
    expect(r.proposals[0]?.reason).toBe('A timer that starts at 15 minutes and a metronome make it a session you actually play.');
    for (const p of r.proposals) {
      expect(p.sourceCaptureIds, p.kind).toContain('cap-ori-0001'); // listed under "Why this?" with what was read
      expect(p.reason, p.kind).not.toMatch(/You said|I like this sound/);
    }
  });
});

describe('promises tied to capabilities (P1-08)', () => {
  const backed = (spec: AppSpec, cadence: 'daily' | 'weekly') => spec.rules.some((r) => r.type === 'prompt_rotation' && r.cadence === cadence)
    || spec.views.some((v) => v.type === 'summary' && v.metrics.some((m) => (cadence === 'weekly' ? m.period === 'week' : m.period === 'today' || m.kind === 'streak')));

  it('catalog copy says "daily" or "weekly" only when a rule or a total backs it, and never claims automation', () => {
    for (const c of [...CONCEPTS, ...PLAYGROUND_CONCEPTS]) {
      const spec = AppSpecSchema.parse(c.buildSpec({ instructions: '' }));
      const copy = [c.tagline, c.description, c.firstAction, c.reasonTemplate([]), spec.tagline ?? '', spec.emptyStateHint ?? ''].join(' ');
      if (/\b(?:daily|every day|each day)\b/i.test(copy)) expect(backed(spec, 'daily'), `${c.id}: ${copy}`).toBe(true);
      if (/\b(?:weekly|every week|each week)\b/i.test(copy)) expect(backed(spec, 'weekly'), `${c.id}: ${copy}`).toBe(true);
      expect(copy, c.id).not.toMatch(/writes itself|automatically|remind|notif/i);
    }
  });
});

describe('reference copy and icons', () => {
  it('the three reference apps carry the Ori copy', () => {
    const [l, r, p] = [light(), riff(), AppSpecSchema.parse(PEOPLE_QUEUE)];
    expect(l.tagline).toBe('Notice the light.');
    expect(l.views.find((v) => v.type === 'gallery')?.addLabel).toBe('Add photo');
    expect(r.tagline).toBe('A little practice. A little progress.');
    expect(p.tagline).toBe('Keep the conversation going.');
    expect(p.views.find((v) => v.type === 'queue')?.addLabel).toBe('Add person');
    expect(p.emptyStateHint).not.toMatch(/remind/i);
    expect(r.icon).toEqual({ symbol: 'levels', color: 'ink' });
    expect(ICON_SYMBOLS).toContain('levels');
  });

  it('a card shows the icon of the app it makes, and the Light card speaks in Ori\'s words', () => {
    const keys = { 'riff-practice': 'riff', 'light-gallery': 'light', 'people-queue': 'people' } as const;
    for (const c of PLAYGROUND_CONCEPTS) {
      const key = keys[c.id as keyof typeof keys];
      expect(c.icon, c.id).toEqual(referenceIcon(key));
      expect(AppSpecSchema.parse(c.buildSpec({ instructions: '' })).icon, c.id).toEqual(c.icon);
    }
    expect(conceptById('light-gallery')?.tagline).toBe('A photo journal shaped around you.');
    const card = respond({ text: 'I want to try street photography on weekends.' }).proposals[0];
    expect(card).toMatchObject({ conceptId: 'light-gallery', icon: referenceIcon('light'), tagline: 'A photo journal shaped around you.' });
    // An app made before the rebrand still shows its canonical icon on a "use it" card (display only).
    const oldRiff: ExistingAppSummary = { id: 'app-riff-0001', name: 'Riff', purpose: 'explore', pattern: 'practice', capabilities: ['practice_timer', 'tempo', 'source_links'], icon: { symbol: 'guitar', color: 'ink' } };
    expect(respond({ text: 'Picked up the guitar again tonight' }, [oldRiff]).proposals[0]).toMatchObject({ kind: 'use_app', icon: referenceIcon('riff') });
  });
});

describe('live adapter post-steps (stubbed model, no network)', () => {
  type Stub = { json?: (opts: unknown) => Promise<unknown>; parseOrJson?: (opts: unknown) => Promise<unknown> };
  // The model call is replaced by a canned answer; everything after it (validation, post-steps) is real.
  const adapterWith = (stub: Stub): AnthropicAdapter => {
    const adapter = new AnthropicAdapter('test-key-not-used');
    Object.assign(adapter as object, stub);
    return adapter;
  };

  it('a revision never reuses a reserved id, and a past-tense summary is replaced by what WOULD change', async () => {
    const adapter = adapterWith({ json: async () => ({
      summary: 'Added Camera, Shutter and Aperture to your photos.',
      ops: (['Camera', 'Shutter', 'Aperture'] as const).map((label) => ({ op: 'add_field', field: { id: label.toLowerCase(), label, type: 'text' } })),
      unsupported: [],
    }) });
    const res = await adapter.proposeRevision({ spec: light(), request: 'Add camera settings to my photo notes', sampleRecords: [], reservedFieldIds: ['camera'] });
    expect(res.generatedBy).toBe('anthropic');
    expect(added(res.data.ops).map((f) => f.id)).toEqual(['camera_2', 'shutter', 'aperture']);
    expect(res.data.summary).toBe('Light will get “Camera”, “Shutter” and “Aperture” on each photo.');
    // Whatever placement the model chose, the details sit under the caption, in the order asked (reference 07).
    expect(res.data.ops.map((o) => (o.op === 'add_field' ? o.afterFieldId : null))).toEqual(['caption', 'camera_2', 'shutter']);
    const gallery = (applyRevision(light(), res.data.ops).spec as AppSpec).views.find((v) => v.type === 'gallery');
    expect(gallery?.formFieldIds?.slice(0, 5)).toEqual(['photo', 'caption', 'camera_2', 'shutter', 'aperture']);
  });

  it('a revision that moves the default brings the copy along, keeping a good model summary', async () => {
    const view = sketch().views[0];
    const adapter = adapterWith({ json: async () => ({ summary: 'The timer will start at 5 minutes.', ops: [{ op: 'replace_view', viewId: 'sprint', view: { ...view, presets: [5, 10, 15, 20] } }], unsupported: [] }) });
    const res = await adapter.proposeRevision({ spec: sketch(), request: 'make 5 minutes the default', sampleRecords: [] });
    const after = applyRevision(sketch(), res.data.ops).spec as AppSpec;
    expect(after).toMatchObject({ name: 'Ten-Minute Sketch Sprint', tagline: 'One object, five minutes on the clock', emptyStateHint: 'Press Start 5:00 and draw one object for five minutes.' });
    expect(res.data.summary).toMatch(/^The timer will start at 5 minutes\. The name “Ten-Minute Sketch Sprint” still says ten minutes/);
  });

  it('a new app starts at the requested length and its copy agrees, whatever the model wrote', async () => {
    const model = {
      name: 'Sketch Sprint', tagline: 'Fifteen minutes on the clock', purpose: 'explore', pattern: 'practice', icon: { symbol: 'pen', color: 'rose' },
      fields: [{ id: 'date', label: 'Date', type: 'date', default: 'today' }, { id: 'minutes', label: 'Minutes drawn', type: 'number', unit: 'min' }, { id: 'subject', label: 'What you drew', type: 'text' }],
      views: [{ id: 'sprint', type: 'practice', title: 'Sprint', minutesFieldId: 'minutes', focusFieldId: 'subject', dateFieldId: 'date', presets: [15, 10, 25], tempoHelper: false }],
      rules: [], entryNoun: { singular: 'sketch', plural: 'sketches' }, emptyStateHint: 'Press Start 15:00 and draw.',
    };
    const adapter = adapterWith({ json: async () => ({ spec: model, description: 'A fifteen-minute sprint for one object.', unsupported: [] }) });
    const recommendation = RecommendationDraftSchema.parse({ kind: 'new_app', title: 'Sketch Sprint', purpose: 'explore', pattern: 'practice', icon: { symbol: 'pen', color: 'rose' }, tagline: 'A short daily sketch', description: 'A timer and a place for your sketches.', reason: 'You asked for a ten-minute sketching app.', firstAction: 'Start the timer.', previewLines: ['Timer'], suggestedMinutes: 10 });
    const res = await adapter.generateSpec({ recommendation, instructions: '', facts: [] });
    const practice = res.data.spec.views.find((v) => v.type === 'practice');
    expect(practice?.type === 'practice' ? practice.presets : null).toEqual([10, 15, 25]);
    expect(res.data.spec).toMatchObject({ tagline: 'Ten minutes on the clock', emptyStateHint: 'Press Start 10:00 and draw.' });
    expect(res.data.description).toBe('A ten-minute sprint for one object.');
  });

  it('a session length in the note becomes the new practice app\'s suggested length', async () => {
    const proposal = { kind: 'new_app', title: 'Riff', purpose: 'explore', pattern: 'practice', icon: { symbol: 'levels', color: 'ink' }, tagline: 'A practice room', description: 'A timer and a metronome for your guitar.', reason: 'You want a short guitar session before bed.', evidenceFactIds: [], sourceCaptureIds: ['cap-ori-0001'], firstAction: 'Press start.', previewLines: ['Timer'], capabilities: ['practice_timer'] };
    const adapter = adapterWith({ parseOrJson: async () => ({ message: 'A practice room for your ten minutes. Want to make it yours?', proposals: [proposal], learned: [], unsupported: [], imageRead: false }) });
    const res = await adapter.respondToCapture({ capture: capture({ text: 'I want a ten-minute guitar session before bed' }), facts: [], existingApps: [], recentCaptures: [] });
    expect(res.data.proposals[0]?.suggestedMinutes).toBe(10);
  });

  it('re-keying follows every reference to the new field', () => {
    const ops: RevisionOp[] = [
      { op: 'add_field', field: { id: 'due', label: 'Due date', type: 'date' } },
      { op: 'add_rule', rule: { id: 'soon', type: 'due_soon', dateFieldId: 'due', withinDays: 3 } },
    ];
    const keyed = rekeyReservedFields(journal(), ops, ['due']);
    expect(keyed[0]).toMatchObject({ op: 'add_field', field: { id: 'due_date' } });
    expect(keyed[1]).toMatchObject({ op: 'add_rule', rule: { dateFieldId: 'due_date' } });
    expect(applyRevision(journal(), keyed).ok).toBe(true);
    expect(alignDurationCopy(journal(), keyed).ops).toEqual(keyed); // no timer: nothing to align
  });
});

// ---------- review round 2 ----------

/** A card the way the Agent or Playground would store it, for builds of a given concept. */
const card = (conceptId: string): RecommendationDraft => {
  const c = conceptById(conceptId);
  if (!c) throw new Error(`unknown concept ${conceptId}`);
  return RecommendationDraftSchema.parse({ conceptId, kind: 'new_app', title: c.title, purpose: c.purpose, pattern: c.pattern, icon: c.icon, tagline: c.tagline, description: c.description, reason: 'From a note the person shared.', firstAction: c.firstAction, previewLines: ['Example line'] });
};

describe('a shared photo with its settings is an entry; a list of details is a change (Velocity routing)', () => {
  const shared = (text: string) => respond({ kind: 'image', text, mediaId: 'media-0000000001', readStatus: 'not_read', sourceLabel: 'Screenshot' }, [LIGHT_APP]);

  it('adds the shared photo to Light, never a change, and never claims Light keeps those settings', () => {
    for (const text of ['Shot at ISO 400 this morning, add it to Light', 'Add this one to my photos: f/8 and shutter at 1/500, the light was great', 'Add this photo to Light with the camera settings I used']) {
      const r = shared(text);
      expect(r.proposals.map((p) => p.kind), text).toEqual(['use_app', 'explore', 'keep']);
      expect(r.proposals[0], text).toMatchObject({ title: 'Add this photo to Light', targetAppId: LIGHT_APP.id, recordDraft: { kind: 'photo', mediaId: 'media-0000000001' } });
      expect(r.message, text).toBe("Sample mode cannot read images, so I'm using your words. Add the photo to Light and write what you noticed there.");
    }
    // A photo shared WITH a request for details on every photo: the photo stays an entry, and the change is its own card.
    const both = shared('Add camera settings to my photo notes');
    expect(both.proposals.map((p) => p.kind)).toEqual(['use_app', 'update_app', 'explore', 'keep']);
    expect(both.proposals[0]).toMatchObject({ recordDraft: { kind: 'photo', mediaId: 'media-0000000001' } });
    expect(both.proposals[1]).toMatchObject({ targetAppId: LIGHT_APP.id, updateRequest: 'Add camera settings to my photo notes' });
    expect(both.proposals[1]?.recordDraft).toBeUndefined();
    // Without the photo it is still not a change: Light opens, and nothing claims it keeps ISO.
    const typed = respond({ text: 'Shot at ISO 400 this morning, add it to Light' }, [LIGHT_APP]);
    expect(typed.proposals.map((p) => p.kind)).toEqual(['use_app', 'explore', 'keep']);
    expect(typed.proposals[0]).toMatchObject({ targetAppId: LIGHT_APP.id });
    expect(typed.message).toBe('Open Light when you are ready; it keeps your photos.');
    expect([typed.message, ...typed.proposals.map((p) => `${p.tagline} ${p.description} ${p.reason}`)].join(' ')).not.toMatch(/already does this/);
  });

  it('details for every photo are a change whatever the verb, with no "it already does this" card beside it', () => {
    for (const text of ['Add camera settings to my photo notes', 'I want to note shutter speed and aperture for each photo', 'add lens and ISO to my photos']) {
      const r = respond({ text }, [LIGHT_APP]);
      expect(r.proposals.map((p) => p.kind), text).toEqual(['update_app']);
      expect(r.proposals[0]?.updateRequest, text).toBe(text);
      expect(r.message, text).toBe('That is a change to Light itself; you will see it before anything changes.');
    }
    // When the app summary lists Light's fields and they are there, it says so instead of offering the change again.
    const applied = { ...LIGHT_APP, fieldLabels: ['Photo', 'What caught your eye?', 'Camera', 'Shutter', 'Aperture', 'Date'] };
    const again = respond({ text: 'Add camera settings to my photo notes' }, [applied]);
    expect(again.proposals.map((p) => p.kind)).toEqual(['use_app']);
    expect(again.message).toBe('Light already has Camera, Shutter and Aperture; open it and fill them in.');
  });
});

describe('lists never make fields of requests, pronouns or the entries themselves (P1-08)', () => {
  it('declines what the app cannot do, in Edit with Ori and when an app is made', () => {
    for (const request of ['add reminders to my photos', 'add notifications to each photo', 'add instagram sync to my photos']) {
      const p = revise(light(), request);
      expect(p.ops, request).toEqual([]);
      expect(p.summary, request).toBe('Nothing to change yet. This app cannot send messages, set reminders or connect to other services yet.');
      // A photo gallery has nothing to be due: the alternative is its own home-screen icon, not a due date.
      expect(p.unsupported[0]?.alternative, request).toBe('Add Light to your home screen so it is one tap away when you want it; nothing here sends reminders or messages.');
    }
    const built = generateSpec({ recommendation: card('light-gallery'), instructions: 'add reminders to my photos', facts: [] });
    expect(built.spec.fields.map((f) => f.id)).toEqual(light().fields.map((f) => f.id));
    expect(built.unsupported.map((u) => u.reason)).toEqual(['This app cannot send messages, set reminders or connect to other services yet.']);
    expect(built.description).not.toMatch(/Reminders/);
  });

  it('"it", "this", "more detail" or "some color" are not names of details', () => {
    const cases: [AppSpec, string][] = [[light(), 'add it to my photos'], [light(), 'Add this to Light'], [journal(), 'add that to each walk'], [light(), 'add more detail to my photo notes'], [light(), 'add some color to my photos'], [light(), 'add the photo I took this morning to Light']];
    for (const [spec, request] of cases) {
      const p = revise(spec, request);
      expect(p.ops, request).toEqual([]);
      expect(p.summary, request).toBe(NO_MATCH_SUMMARY);
    }
  });

  it('a list names the app\'s own entries ("each person") and says when everything is already there', () => {
    const people = revise(AppSpecSchema.parse(PEOPLE_QUEUE), 'add email and phone number to each person');
    expect(added(people.ops).map((f) => [f.label, f.type])).toEqual([['Email', 'text'], ['Phone number', 'text']]);
    const there = revise(light(), 'add location and date to my photos');
    expect(there.ops).toEqual([]);
    expect(there.summary).toBe('Nothing to change yet. Light already has Where and Date.');
    // What the app already has is named, never called "not a change I know how to make".
    const has = revise(journal(), 'Make it a weekly photography challenge and add a reflection field');
    expect(has.ops).toEqual([]);
    expect(has.summary).toBe("Nothing to change yet. Photo Walk Journal already has This week's challenge and What did you learn?");
    expect(revise(journal(), 'show the location').summary).toBe('Nothing to change yet. Photo Walk Journal already has Where.');
  });

  it('"reflections" in a photo request is not a reflection field (reference 04)', () => {
    const focus = generateSpec({ recommendation: card('light-gallery'), instructions: 'Focus on shadows and reflections', facts: [] });
    expect(focus.spec.fields.map((f) => f.id)).toEqual(light().fields.map((f) => f.id));
    expect(focus.unsupported).toEqual([]);
  });
});

describe('compound requests keep every part', () => {
  const ops = (spec: AppSpec, request: string) => revise(spec, request).ops;

  it('a list of details, then another request', () => {
    expect(ops(journal(), 'add a rating to my walks and remove the keeper checkbox').map((o) => o.op).sort()).toEqual(['add_field', 'hide_field']);
    const camHide = revise(light(), 'Add camera settings to my photo notes and hide the location');
    expect(added(camHide.ops).map((f) => f.id)).toEqual(['camera', 'shutter', 'aperture']);
    expect(camHide.ops).toContainEqual({ op: 'hide_field', fieldId: 'location' });
    expect(camHide.unsupported).toEqual([]);
    const renameAdd = revise(light(), 'Rename this app to Light Notes and add camera settings to my photo notes');
    expect(renameAdd.ops).toContainEqual({ op: 'rename_app', name: 'Light Notes' });
    expect(added(renameAdd.ops)).toHaveLength(3);
  });

  it('several renames, hides and timer settings in one sentence', () => {
    expect(ops(journal(), 'rename Where to Place and Keeper to Favourite')).toEqual([
      { op: 'update_field', fieldId: 'location', patch: { label: 'Place' } },
      { op: 'update_field', fieldId: 'keeper', patch: { label: 'Favourite' } },
    ]);
    expect(ops(light(), 'rename the caption to Title and the note to Story')).toEqual([
      { op: 'update_field', fieldId: 'caption', patch: { label: 'Title' } },
      { op: 'update_field', fieldId: 'note', patch: { label: 'Story' } },
    ]);
    expect(ops(journal(), 'rename the app to Light and Shadow')).toEqual([{ op: 'rename_app', name: 'Light and Shadow' }]); // a name with "and" stays whole
    expect(ops(light(), 'hide the location and the keeper')).toEqual([{ op: 'hide_field', fieldId: 'location' }, { op: 'hide_field', fieldId: 'keeper' }]);
    expect(ops(AppSpecSchema.parse(PEOPLE_QUEUE), 'hide the channel and the draft')).toEqual([{ op: 'hide_field', fieldId: 'channel' }, { op: 'hide_field', fieldId: 'draft' }]);
    const practice = (spec: AppSpec) => spec.views.find((v): v is Extract<AppSpec['views'][number], { type: 'practice' }> => v.type === 'practice');
    const both = applyRevision(riff(), ops(riff(), 'make the default session 10 minutes and the metronome 60 bpm')).spec as AppSpec;
    expect([practice(both)?.presets[0], practice(both)?.defaultTempo]).toEqual([10, 60]);
    const list = revise(riff(), 'change the timer presets to 5, 10 and 20 minutes');
    expect(practice(applyRevision(riff(), list.ops).spec as AppSpec)?.presets).toEqual([5, 10, 20]);
    expect(list.summary).toBe('The timer presets will be 5, 10 and 20 minutes, starting at 5.');
  });

  it('a part that maps to nothing is named under "Not included", never dropped in silence', () => {
    const p = revise(light(), 'add a rating to my photos and make it sparkle');
    expect(added(p.ops).map((f) => f.type)).toEqual(['rating']);
    expect(p.unsupported.map((u) => u.request)).toEqual(['make it sparkle']);
    expect(p.summary).toMatch(/One request is not included; see below\.$/);
    // An unknown field is never a reason to rename the whole app.
    const unknown = revise(light(), 'rename Favorite to Keeper');
    expect(unknown.ops).toEqual([]);
    expect(unknown.unsupported[0]?.reason).toBe('I couldn\'t find a field called "Favorite".');
  });
});

describe('names, lengths and placement', () => {
  it('a rename needs a name ("name it after my band" and "call it a day" are not names unless quoted)', () => {
    for (const request of ['name it after my band', 'call it a day']) {
      const p = revise(riff(), request);
      expect(p.ops, request).toEqual([]);
      expect(p.summary, request).toBe('Nothing to change yet. I couldn’t tell what the new name should be.');
    }
    expect(revise(riff(), 'call it "A Day"').ops).toEqual([{ op: 'rename_app', name: 'A Day' }]);
    expect(revise(riff(), 'Rename this app Audit Sketch Lab').ops).toEqual([{ op: 'rename_app', name: 'Audit Sketch Lab' }]);
    expect(generateSpec({ recommendation: card('riff-practice'), instructions: 'name it after my band', facts: [] }).spec.name).toBe('Riff');
  });

  it('copy that follows a new default keeps adjectives as adjectives and leaves times of day alone', () => {
    expect(rewriteMinutes('Half-hour sessions', 30, 20).text).toBe('Twenty-minute sessions');
    expect(rewriteMinutes('A quarter-hour sprint', 15, 10).text).toBe('A ten-minute sprint');
    expect(rewriteMinutes('An hour-long session', 60, 90).text).toBe('A ninety-minute session');
    expect(rewriteMinutes('an eleven-minute walk', 11, 10).text).toBe('a ten-minute walk');
    expect(rewriteMinutes('a 10 minute session', 10, 8).text).toBe('an 8 minute session');
    expect(rewriteMinutes('half an hour of practice', 30, 20).text).toBe('twenty minutes of practice');
    expect(rewriteMinutes('Lessons start at 10:00 on Saturdays', 10, 5)).toEqual({ text: 'Lessons start at 10:00 on Saturdays', count: 0 });
    expect(rewriteMinutes('The timer starts 10:00 am sharp', 10, 5).text).toBe('The timer starts 10:00 am sharp');
    expect(rewriteMinutes('Press Start 10:00 and draw', 10, 5).text).toBe('Press Start 5:00 and draw');
  });

  it('camera details made with an app also sit under the caption', () => {
    const built = generateSpec({ recommendation: card('light-gallery'), instructions: 'Add camera settings to my photo notes', facts: [] });
    const gallery = built.spec.views.find((v) => v.type === 'gallery');
    expect(gallery?.formFieldIds?.slice(0, 5)).toEqual(['photo', 'caption', 'camera', 'shutter', 'aperture']);
  });
});

describe('sketching (audit P0-02 / P1-01 in Sample mode)', () => {
  const SKETCH_APP: ExistingAppSummary = { id: 'app-sketch-001', name: 'Sketch Sprint', purpose: 'explore', pattern: 'practice', capabilities: ['practice_timer', 'summary', 'prompts'], minutePresets: [10, 15, 20] };
  const RIFF_APP: ExistingAppSummary = { id: 'app-riff-0001', name: 'Riff', purpose: 'explore', pattern: 'practice', capabilities: ['practice_timer', 'tempo', 'source_links'], minutePresets: [15, 10, 25] };

  it('a sketching note gets a sketching timer that starts at the length said, with planned and timed minutes apart', () => {
    const r = respond({ text: 'I want to sketch for 10 minutes every day' });
    expect(r.message).toBe('A sketching timer for your 10 minutes. Want to make it yours?');
    const proposal = r.proposals[0] as RecommendationDraft;
    expect(proposal).toMatchObject({ kind: 'new_app', conceptId: 'sketch-practice', title: 'Sketch Sprint', suggestedMinutes: 10, tagline: 'Make room for 10 minutes of sketching.' });
    expect(r.learned.map((f) => f.value)).toEqual(['Has about 10 minutes at a time for sketching']);
    const built = generateSpec({ recommendation: proposal, instructions: '', facts: [] });
    const sprint = built.spec.views.find((v) => v.type === 'practice');
    expect(sprint).toMatchObject({ presets: [10, 15, 20], targetMinutesFieldId: 'target_minutes', timedSecondsFieldId: 'timed_seconds', tempoHelper: false });
    // "Today's object" is a real daily rule; nothing claims to remind, notify or post.
    expect(built.spec.rules.some((x) => x.type === 'prompt_rotation' && x.cadence === 'daily')).toBe(true);
    const copy = [proposal.tagline, proposal.description, proposal.firstAction, proposal.reason, built.spec.tagline ?? '', built.spec.emptyStateHint ?? '', built.description].join(' ');
    expect(copy).not.toMatch(/remind|notif|automatically|writes itself/i);
    // The Playground still scores the Sketchbook journal; nothing there changes.
    expect([...CONCEPTS, ...PLAYGROUND_CONCEPTS].some((c) => c.id === 'sketch-practice')).toBe(false);
  });

  it('a sketching timer and a music practice room never stand in for each other', () => {
    expect(respond({ text: 'I want to sketch for 10 minutes every day' }, [RIFF_APP]).proposals[0]).toMatchObject({ kind: 'new_app', conceptId: 'sketch-practice' });
    expect(respond({ text: 'I have 15 minutes to practise guitar' }, [SKETCH_APP]).proposals[0]).toMatchObject({ kind: 'new_app', conceptId: 'riff-practice' });
    const use = respond({ text: 'Time to sketch for 10 minutes' }, [SKETCH_APP]);
    expect(use.proposals[0]).toMatchObject({ kind: 'use_app', targetAppId: SKETCH_APP.id, title: 'Sketch in Sketch Sprint today' });
    expect(use.message).toBe('Sketch Sprint already does this: open it, pick 10 minutes and press Start.');
  });
});
