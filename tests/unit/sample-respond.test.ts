/**
 * The Sample-mode Agent (server/model/sample/respond.ts): honest about what it read, grounded in the
 * person's own words, three domains that lead to Riff / Light / People (or to an update of an app
 * that already fits), clean learned facts, deterministic, and every proposal valid.
 */
import { describe, expect, it } from 'vitest';
import { AppSpecSchema, type AppSpecInput } from '../../shared/appSpec.ts';
import { AgentReplyDraftSchema, RecommendationDraftSchema } from '../../shared/context.ts';
import { applyRevision } from '../../shared/revision.ts';
import { FOLLOW_UP_BOARD, LIGHT_GALLERY, PEOPLE_QUEUE, PHOTO_WALK_JOURNAL, PRACTICE_TRACKER, RIFF_PRACTICE } from '../../server/fixtures/specs.ts';
import { detectDomain, minutesIn } from '../../server/model/sample/domains.ts';
import { sampleAdapter } from '../../server/model/sample/index.ts';
import { learnFromNote, readLine, respondToCapture } from '../../server/model/sample/respond.ts';
import { proposeRevision } from '../../server/model/sample/revise.ts';
import type { ExistingAppSummary, RespondInput } from '../../server/model/types.ts';

const GUITAR_NOTE = 'I like this sound and have 15 minutes to practice';
const PHOTO_NOTE = 'Hard shadows on the brick wall at 3 pm. I want to shoot more harsh midday light.';
const PEOPLE_NOTE = 'Met Maya at the design meetup, promised to send her the demo link by Friday';
const REEL = 'https://www.instagram.com/reel/abc123/';

type Cap = RespondInput['capture'];

function capture(over: Partial<Cap> = {}): Cap {
  return { id: 'cap-guitar-01', kind: 'note', text: GUITAR_NOTE, url: null, linkMeta: null, readStatus: 'read', sourceLabel: 'Typed note', image: null, ...over };
}

function respond(over: Partial<Cap> = {}, input: Partial<Omit<RespondInput, 'capture'>> = {}) {
  return respondToCapture({ capture: capture(over), facts: [], existingApps: [], recentCaptures: [], ...input });
}

const app = (over: Partial<ExistingAppSummary> & Pick<ExistingAppSummary, 'id' | 'name'>): ExistingAppSummary => ({ purpose: 'explore', pattern: 'journal', capabilities: [], ...over });

const RIFF_APP = app({ id: 'app-riff-0001', name: 'Riff', pattern: 'practice', tagline: 'A little practice tonight', capabilities: ['practice_timer', 'tempo', 'source_links', 'summary', 'prompts'], defaultMinutes: 15, minutePresets: [15, 10, 25] });
const LIGHT_APP = app({ id: 'app-light-001', name: 'Light', pattern: 'gallery', tagline: 'Find the light', capabilities: ['gallery', 'photo_upload', 'summary', 'prompts'] });
const PEOPLE_APP = app({ id: 'app-ppl-0001', name: 'People', purpose: 'work', pattern: 'queue', capabilities: ['next_actions', 'due_soon', 'summary'] });
const TRACKER_APP = app({ id: 'app-trk-0001', name: 'Practice Companion', pattern: 'tracker', tagline: 'Small sessions, steady progress', capabilities: ['list', 'summary'] });
const JOURNAL_APP = app({ id: 'app-walk-0001', name: 'Photo Walk Journal', pattern: 'journal', capabilities: ['journal', 'summary', 'prompts'] });
const BOARD_APP = app({ id: 'app-brd-0001', name: 'People to Follow Up With', purpose: 'work', pattern: 'board', capabilities: ['board', 'due_soon', 'summary'] });

const NEVER_CLAIMS = /I (?:watched|listened to|read the (?:page|reel|post|video|clip|image|screenshot))/i;

describe('honesty about what was read', () => {
  it('quotes the note, and says for each link status exactly what was and was not read', () => {
    const note = respond();
    expect(note.message).toContain(`Got your note: "${GUITAR_NOTE}"`);

    const unread = respond({ kind: 'link', url: REEL, readStatus: 'not_read', sourceLabel: 'Instagram link' });
    expect(unread.message).toMatch(/saved the link but have not read the page, so I am working from your note/);

    const titled = respond({ kind: 'link', url: 'https://www.youtube.com/watch?v=abc', readStatus: 'metadata_only', linkMeta: { provider: 'YouTube', title: 'Fingerstyle blues lesson', author: 'Some Teacher' }, sourceLabel: 'YouTube link' });
    expect(titled.message).toContain('I read the title "Fingerstyle blues lesson" by Some Teacher on YouTube, but not the content itself.');

    const unavailable = respond({ kind: 'link', url: 'https://open.spotify.com/track/x', readStatus: 'unavailable', sourceLabel: 'Spotify link' });
    expect(unavailable.message).toMatch(/saved the link but could not read the page or its title/);

    const shot = respond({ kind: 'image', readStatus: 'not_read', sourceLabel: 'Screenshot' });
    expect(shot.message).toMatch(/In Sample mode I cannot read images/);
    expect(shot.imageRead).toBe(false);

    for (const r of [note, unread, titled, unavailable, shot]) {
      expect(r.message).not.toMatch(NEVER_CLAIMS);
      expect(r.message.length).toBeLessThanOrEqual(700);
    }
    // metadata_only without a title falls back to the unread wording rather than inventing one.
    expect(readLine(capture({ kind: 'link', url: REEL, readStatus: 'metadata_only', linkMeta: { provider: 'YouTube' } }))).toMatch(/have not read the page/);
  });

  it('asks one question when only a link or a screenshot was shared, and still offers explore + keep', () => {
    const link = respond({ text: '', kind: 'link', url: 'https://example.com/x', readStatus: 'not_read', sourceLabel: 'Link to example.com' });
    expect(link.message).toMatch(/Tell me in a line what it is about/);
    expect(link.question).toMatch(/in a line/);
    expect(link.proposals.map((p) => p.kind)).toEqual(['explore', 'keep']);

    const shot = respond({ text: '', kind: 'image', readStatus: 'not_read', sourceLabel: 'Screenshot' });
    expect(shot.question).toMatch(/screenshot/);
    expect(shot.proposals.map((p) => p.kind)).toEqual(['explore', 'keep']);
    expect(shot.learned).toEqual([]);
  });
});

describe('three domains, three different directions', () => {
  it('turns the guitar note with a time budget into Riff, a session-sized exploration and a keep', () => {
    const r = respond({ kind: 'link', url: REEL, readStatus: 'not_read', sourceLabel: 'Instagram link' });
    expect(r.proposals.map((p) => p.kind)).toEqual(['new_app', 'explore', 'keep']);
    const riff = r.proposals[0]!;
    expect(riff.conceptId).toBe('riff-practice');
    expect(riff.title).toBe('Riff');
    expect(riff.pattern).toBe('practice');
    expect(riff.capabilities).toContain('practice_timer');
    expect(riff.design?.theme).toBe('ink');
    expect(riff.sourceCaptureIds).toEqual(['cap-guitar-01']);
    expect(riff.reason).toContain(`"${GUITAR_NOTE}"`);
    expect(riff.reason).toContain('15 minutes');
    expect(riff.firstAction).toContain('15-minute');
    expect(riff.suggestedMinutes).toBe(15); // the Make page starts at the length they asked for
    expect(riff.previewLines.some((l) => /Timer: 15/.test(l))).toBe(true);

    const explore = r.proposals[1]!;
    const steps = explore.explorationSteps ?? [];
    expect(steps.length).toBeGreaterThanOrEqual(3);
    expect(steps.length).toBeLessThanOrEqual(6);
    expect(steps.join(' ')).toContain(`"${GUITAR_NOTE}"`); // the person's own words
    expect(steps.join(' ')).toContain('15 minutes is enough'); // their time budget
    expect(steps.join(' ')).toContain('the clip you saved'); // never pretends to have heard it
    expect(steps.join(' ')).not.toMatch(/https?:\/\//);
    expect(explore.capabilities).toEqual([]);
    expect(r.question).toBeUndefined();
    expect(r.proposals[2]?.kind).toBe('keep');
  });

  it('asks for the time budget when a music note has none, and uses a read title when there is one', () => {
    const r = respond({ id: 'cap-g-02', text: 'Love this fingerstyle guitar arrangement' });
    expect(r.question).toMatch(/minutes/);
    expect(r.proposals[0]?.conceptId).toBe('riff-practice');
    const titled = respond({ id: 'cap-g-03', text: 'Want to learn this', kind: 'link', url: 'https://www.youtube.com/watch?v=abc', readStatus: 'metadata_only', linkMeta: { provider: 'YouTube', title: 'Blackbird fingerpicking lesson' }, sourceLabel: 'YouTube link' });
    expect(titled.proposals[0]?.conceptId).toBe('riff-practice');
    expect(titled.proposals.find((p) => p.kind === 'explore')?.explorationSteps?.join(' ')).toContain('"Blackbird fingerpicking lesson"');
  });

  it('turns a photo note into Light and a light walk', () => {
    const r = respond({ id: 'cap-photo-01', kind: 'image', text: PHOTO_NOTE, readStatus: 'not_read', sourceLabel: 'Screenshot' });
    expect(r.proposals.map((p) => p.kind)).toEqual(['new_app', 'explore', 'keep']);
    const light = r.proposals[0]!;
    expect(light.conceptId).toBe('light-gallery');
    expect(light.title).toBe('Light');
    expect(light.pattern).toBe('gallery');
    expect(light.capabilities).toContain('photo_upload');
    expect(light.previewLines.some((l) => /Contact sheet/.test(l))).toBe(true);
    const walk = r.proposals[1]!;
    expect(walk.title).toMatch(/light walk/i);
    expect(walk.explorationSteps?.length).toBeGreaterThanOrEqual(3);
    expect(walk.explorationSteps?.length).toBeLessThanOrEqual(5);
    expect(walk.explorationSteps?.join(' ')).toMatch(/picture that inspired you/);
    expect(walk.explorationSteps?.join(' ')).toContain('Hard shadows on the brick wall');
    expect(r.message).toMatch(/cannot read images/);
  });

  it('turns a follow-up note into People and a follow-up sprint, learning nothing about others', () => {
    const r = respond({ id: 'cap-people-01', text: PEOPLE_NOTE });
    expect(r.proposals.map((p) => p.kind)).toEqual(['new_app', 'explore', 'keep']);
    expect(r.proposals[0]?.conceptId).toBe('people-queue');
    expect(r.proposals[0]?.pattern).toBe('queue');
    expect(r.proposals[0]?.capabilities).toContain('next_actions');
    expect(r.proposals[1]?.title).toMatch(/follow-ups/);
    expect(r.proposals[1]?.explorationSteps?.join(' ')).toContain('starting from what you wrote');
    expect(r.learned).toEqual([]);
  });

  it('the three domains lead to three different primary proposals', () => {
    const titles = [respond(), respond({ id: 'p', text: PHOTO_NOTE }), respond({ id: 'q', text: PEOPLE_NOTE })].map((r) => r.proposals[0]?.title);
    expect(new Set(titles).size).toBe(3);
    expect(detectDomain('I want to practise street photography on Saturday')?.id).toBe('photo'); // "practise" alone is not music
    expect(detectDomain('A light 20-minute workout before work')).toBeNull();
    expect(minutesIn('I have half an hour tonight')).toBe(30);
  });

  it('falls back to the catalog for an unrelated note, grounded in the note itself', () => {
    const r = respond({ id: 'cap-plants-01', text: 'Trying to keep my houseplants alive through the winter' });
    expect(r.message).toMatch(/Sample-mode suggestions start from your words/);
    expect(r.proposals.map((p) => p.kind)).toEqual(['new_app', 'explore', 'keep']);
    expect(r.proposals[0]?.conceptId).toBe('plant-care');
    expect(r.proposals[0]?.sourceCaptureIds).toEqual(['cap-plants-01']);
    expect(r.proposals[0]?.reason).toContain('houseplants');
    expect(r.proposals[1]?.explorationSteps?.join(' ')).toContain('houseplants');
  });
});

describe('an app the person has: use it, and change it only when they ask for something it lacks', () => {
  it('uses an existing Riff instead of making another or revising it, with the shared link as the one entry', () => {
    const r = respond({ kind: 'link', url: REEL, readStatus: 'not_read', sourceLabel: 'Instagram link' }, { existingApps: [RIFF_APP] });
    expect(r.proposals.map((p) => p.kind)).toEqual(['use_app', 'explore', 'keep']);
    const use = r.proposals[0]!;
    expect(use.targetAppId).toBe('app-riff-0001');
    expect(use.title).toBe('Practise in Riff tonight');
    expect(use.updateRequest).toBeUndefined();
    expect(use.recordDraft).toEqual({ kind: 'source', url: REEL, title: 'Instagram link', note: GUITAR_NOTE });
    expect(use.description).toMatch(/nothing about the app changes/i);
    expect(r.message).toMatch(/Riff already does this/);
  });

  it('a session length Riff does not offer is a real design change the planner applies', () => {
    const r = respond({ id: 'cap-g-20', text: 'I have 20 minutes to practise this riff tonight' }, { existingApps: [RIFF_APP] });
    expect(r.proposals.map((p) => p.kind)).toEqual(['use_app', 'update_app', 'explore', 'keep']);
    const up = r.proposals[1]!;
    expect(up.title).toBe('Give Riff a 20-minute timer preset');
    expect(up.updateRequest).toBe('Add a 20-minute preset to the practice timer as the default');
    const spec = AppSpecSchema.parse(RIFF_PRACTICE);
    const plan = proposeRevision({ spec, request: up.updateRequest!, sampleRecords: [] });
    const applied = applyRevision(spec, plan.ops);
    expect(applied.ok).toBe(true);
    const practice = applied.spec?.views.find((v) => v.type === 'practice');
    expect(practice?.type === 'practice' ? practice.presets[0] : null).toBe(20);
  });

  it('offers Riff plus an addition when a practice tracker only partly fits', () => {
    const r = respond({}, { existingApps: [TRACKER_APP] });
    expect(r.proposals.map((p) => p.kind)).toEqual(['new_app', 'update_app', 'explore', 'keep']);
    expect(r.proposals[0]?.conceptId).toBe('riff-practice');
    const up = r.proposals[1]!;
    expect(up.targetAppId).toBe(TRACKER_APP.id);
    const spec = AppSpecSchema.parse(PRACTICE_TRACKER);
    const plan = proposeRevision({ spec, request: up.updateRequest!, sampleRecords: [] });
    expect(plan.ops.some((o) => o.op === 'add_field' && o.field.type === 'url')).toBe(true);
    expect(applyRevision(spec, plan.ops).ok).toBe(true);
  });

  it('photo and people captures use Light or People (with one entry), or add to a photo journal or a follow-up board', () => {
    const r0 = respond({ id: 'cap-photo-01', text: PHOTO_NOTE }, { existingApps: [LIGHT_APP] });
    expect(r0.proposals.map((p) => p.kind)).toEqual(['use_app', 'explore', 'keep']);
    const shot = respond({ id: 'cap-photo-09', kind: 'image', text: 'Low sun on the brick wall', readStatus: 'not_read', sourceLabel: 'Screenshot', mediaId: 'media-0000001' }, { existingApps: [LIGHT_APP] });
    expect(shot.proposals[0]).toMatchObject({ kind: 'use_app', targetAppId: LIGHT_APP.id, recordDraft: { kind: 'photo', mediaId: 'media-0000001' } });

    // Tags are a change Light lacks, so asking for them is a real (previewed) design change.
    const r1 = respond({ id: 'cap-photo-02', text: 'I want to tag my photos by the kind of light I was chasing' }, { existingApps: [LIGHT_APP] });
    expect(r1.proposals.map((p) => p.kind)).toEqual(['use_app', 'update_app', 'explore', 'keep']);
    const light = AppSpecSchema.parse(LIGHT_GALLERY);
    const a1 = applyRevision(light, proposeRevision({ spec: light, request: r1.proposals[1]!.updateRequest!, sampleRecords: [] }).ops);
    expect(a1.ok).toBe(true);
    expect(a1.spec?.fields.some((f) => f.type === 'tags')).toBe(true);
    expect(a1.spec?.views.find((v) => v.type === 'gallery')?.formFieldIds).toContain('tags'); // visible in the gallery's form

    const r2 = respond({ id: 'cap-photo-02', text: PHOTO_NOTE }, { existingApps: [JOURNAL_APP] });
    expect(r2.proposals.map((p) => p.kind)).toEqual(['new_app', 'update_app', 'explore', 'keep']);
    const journal = AppSpecSchema.parse(PHOTO_WALK_JOURNAL);
    const p2 = proposeRevision({ spec: journal, request: r2.proposals[1]!.updateRequest!, sampleRecords: [] });
    expect(p2.ops.length).toBeGreaterThanOrEqual(1);
    expect(applyRevision(journal, p2.ops).ok).toBe(true);

    // Adding a follow-up is an entry, never a design change: People opens with it drafted.
    const r3 = respond({ id: 'cap-people-01', text: PEOPLE_NOTE }, { existingApps: [PEOPLE_APP] });
    expect(r3.proposals.map((p) => p.kind)).toEqual(['use_app', 'explore', 'keep']);
    expect(r3.proposals[0]?.recordDraft).toMatchObject({ kind: 'follow_up', person: 'Maya', action: 'Send her the demo link', dueText: 'by Friday' });
    const asked = respond({ id: 'cap-people-04', text: 'My follow-ups need a priority so the most important ones float up' }, { existingApps: [PEOPLE_APP] });
    const people = AppSpecSchema.parse(PEOPLE_QUEUE);
    const p3 = proposeRevision({ spec: people, request: asked.proposals.find((p) => p.kind === 'update_app')!.updateRequest!, sampleRecords: [] });
    expect(p3.ops.some((o) => o.op === 'add_field' && o.field.id === 'priority')).toBe(true);

    const r4 = respond({ id: 'cap-people-02', text: PEOPLE_NOTE }, { existingApps: [BOARD_APP] });
    expect(r4.proposals.map((p) => p.kind)).toEqual(['new_app', 'update_app', 'explore', 'keep']);
    const board = AppSpecSchema.parse(FOLLOW_UP_BOARD);
    const p4 = proposeRevision({ spec: board, request: r4.proposals[1]!.updateRequest!, sampleRecords: [] });
    expect(p4.ops.some((o) => o.op === 'add_field' && /draft/i.test(o.field.label))).toBe(true);
  });

  it('says so when the app already covers the note and there is nothing concrete to add', () => {
    const r = respond({ id: 'cap-g-04', text: 'Picked up the guitar again tonight and want to learn that riff properly' }, { existingApps: [RIFF_APP] });
    expect(r.proposals.map((p) => p.kind)).toEqual(['use_app', 'explore', 'keep']);
    expect(r.proposals[0]?.recordDraft).toBeUndefined();
    expect(r.message).toMatch(/Riff already does this/);
  });

  it('never targets an app of another kind', () => {
    const study = app({ id: 'app-study-001', name: 'Study Planner', purpose: 'work', pattern: 'board', capabilities: ['board', 'due_soon', 'summary'] });
    const r = respond({ id: 'cap-people-03', text: PEOPLE_NOTE }, { existingApps: [study] });
    expect(r.proposals.some((p) => p.kind === 'update_app')).toBe(false);
    expect(r.proposals[0]?.kind).toBe('new_app');
  });
});

describe('every update request applies to its reference fixture with at least one real change', () => {
  const cases: [string, Cap, ExistingAppSummary, AppSpecInput][] = [
    ['Riff from a link with a 20-minute budget', capture({ id: 'cap-g-05', text: 'Found this riff on a reel and have 20 minutes tonight to practise it', kind: 'link', url: REEL, readStatus: 'not_read', sourceLabel: 'Instagram link' }), RIFF_APP, RIFF_PRACTICE],
    ['Light when tags are asked for', capture({ id: 'cap-photo-03', text: 'I want to tag my photos by the kind of light I was chasing' }), LIGHT_APP, LIGHT_GALLERY],
    ['People when a priority is asked for', capture({ id: 'cap-people-05', text: 'My follow-ups need a priority so the most important ones float up' }), PEOPLE_APP, PEOPLE_QUEUE],
  ];
  for (const [name, cap, existing, fixture] of cases) {
    it(name, () => {
      const r = respondToCapture({ capture: cap, facts: [], existingApps: [existing], recentCaptures: [] });
      const up = r.proposals.find((p) => p.kind === 'update_app');
      expect(up?.targetAppId).toBe(existing.id);
      const spec = AppSpecSchema.parse(fixture);
      const plan = proposeRevision({ spec, request: up!.updateRequest!, sampleRecords: [] });
      expect(plan.ops.length).toBeGreaterThanOrEqual(1);
      const applied = applyRevision(spec, plan.ops);
      expect(applied.ok).toBe(true);
      expect(applied.changes.length).toBeGreaterThanOrEqual(1);
      expect(applied.spec).not.toEqual(spec);
      for (const line of applied.changes) expect(line).toMatch(/^[A-Z].*\.$/);
    });
  }
});

describe('learned facts', () => {
  it('splits the time budget from the like and never records "this sound"', () => {
    const r = respond();
    expect(r.learned.map((f) => f.value)).toEqual(['Has about 15 minutes at a time for music practice']);
    expect(r.learned[0]?.category).toBe('routine');
    expect(r.learned[0]?.status).toBe('inferred');
    expect(r.learned[0]?.evidence).toBe(GUITAR_NOTE);
    for (const f of r.learned) expect(f.value).not.toMatch(/and have|this sound/);
  });

  it('keeps explicit wants, likes and learning about the person, as short clauses', () => {
    const r = respond({ id: 'cap-g-06', text: 'I want to learn fingerpicking and I have 20 minutes most evenings on the guitar' });
    const values = r.learned.map((f) => f.value);
    expect(values).toContain('Wants to learn fingerpicking');
    expect(values).toContain('Has about 20 minutes at a time for guitar practice');
    expect(respond({ id: 'cap-g-07', text: 'I love fingerstyle blues, especially slow ones' }).learned.map((f) => f.value)).toContain('Likes fingerstyle blues');
    expect(respond({ id: 'cap-g-08', text: "I've been learning ukulele chords since the summer" }).learned.map((f) => f.value)).toContain('Learning ukulele chords since the summer');
  });

  it('records nothing about other people', () => {
    expect(respond({ id: 'cap-p-01', text: PEOPLE_NOTE }).learned).toEqual([]);
    expect(respond({ id: 'cap-p-02', text: 'I want to help my brother learn guitar chords' }).learned).toEqual([]);
    expect(respond({ id: 'cap-p-03', text: 'I want to reconnect with Priya about the investor intro' }).learned).toEqual([]);
    // Someone else's time budget is not the person's routine.
    expect(learnFromNote('She loves this song and has 15 minutes', detectDomain('she loves this song'), 15)).toEqual([]);
    expect(respond({ id: 'cap-p-04', text: 'My brother has 15 minutes a day to practise guitar' }).learned).toEqual([]);
  });

  it('notices repeated saves in one domain and says so', () => {
    const recent = [1, 2].map((i) => ({ id: `cap-old-${i}`, kind: 'link' as const, text: 'another guitar riff to learn', url: REEL, createdAt: '2026-11-13T10:00:00.000Z' }));
    const r = respond({}, { recentCaptures: recent });
    expect(r.message).toMatch(/3 music saves/);
    // Saving is not a commitment: repeated saves are mentioned, never stored as an interest.
    expect(r.learned.some((f) => /Keeps coming back/.test(f.value))).toBe(false);
    expect(r.learned.length).toBeLessThanOrEqual(3);
  });
});

describe('shape and determinism', () => {
  const inputs: [Partial<Cap>, Partial<Omit<RespondInput, 'capture'>>][] = [
    [{}, {}],
    [{ kind: 'link', url: REEL, readStatus: 'not_read' }, { existingApps: [RIFF_APP] }],
    [{ id: 'cap-photo-01', kind: 'image', text: PHOTO_NOTE, readStatus: 'not_read' }, {}],
    [{ id: 'cap-people-01', text: PEOPLE_NOTE }, { existingApps: [BOARD_APP] }],
    [{ id: 'cap-plants-01', text: 'Trying to keep my houseplants alive through the winter' }, {}],
    [{ id: 'cap-empty-01', text: '', kind: 'image', readStatus: 'not_read' }, {}],
  ];

  it('returns at most four valid proposals, at most one exploration and one keep, and validates as a reply', () => {
    for (const [over, extra] of inputs) {
      const r = respond(over, extra);
      AgentReplyDraftSchema.parse({ message: r.message, question: r.question, proposals: r.proposals, learned: r.learned, unsupported: r.unsupported });
      expect(r.proposals.length).toBeGreaterThanOrEqual(1);
      expect(r.proposals.length).toBeLessThanOrEqual(4);
      expect(r.proposals.filter((p) => p.kind === 'explore').length).toBeLessThanOrEqual(1);
      expect(r.proposals.filter((p) => p.kind === 'keep').length).toBe(1);
      for (const p of r.proposals) {
        RecommendationDraftSchema.parse(p);
        expect(p.sourceCaptureIds).toContain(over.id ?? 'cap-guitar-01');
        if (p.kind === 'explore') {
          expect(p.explorationSteps?.length).toBeGreaterThanOrEqual(3);
          expect(p.explorationSteps?.join(' ')).not.toMatch(/https?:\/\//);
        } else {
          expect(p.explorationSteps).toBeUndefined();
        }
        if (p.kind === 'update_app') {
          expect(p.targetAppId).toBeTruthy();
          expect(p.updateRequest).toBeTruthy();
        } else if (p.kind === 'use_app') {
          expect(p.targetAppId).toBeTruthy();
          expect(p.updateRequest).toBeUndefined();
        } else {
          expect(p.targetAppId).toBeUndefined();
        }
      }
    }
  });

  it('is deterministic and labelled sample through the adapter', async () => {
    for (const [over, extra] of inputs) expect(respond(over, extra)).toEqual(respond(over, extra));
    const viaAdapter = await sampleAdapter.respondToCapture({ capture: capture(), facts: [], existingApps: [], recentCaptures: [] });
    expect(viaAdapter.generatedBy).toBe('sample');
    expect(viaAdapter.data).toEqual(respond());
  });
});
