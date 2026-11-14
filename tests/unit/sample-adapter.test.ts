import { describe, expect, it } from 'vitest';
import { AppSpecSchema, type AppSpec } from '../../shared/appSpec.ts';
import { RecommendationDraftSchema, type ExtractionResult, type RecommendationDraft } from '../../shared/context.ts';
import { applyRevision } from '../../shared/revision.ts';
import { SAMPLE_PROFILES } from '../../server/fixtures/sampleContext.ts';
import { CONCEPTS, conceptById } from '../../server/model/sample/catalog.ts';
import { extractFacts } from '../../server/model/sample/extract.ts';
import { generateSpec } from '../../server/model/sample/generate.ts';
import { applyInstructionHeuristics } from '../../server/model/sample/heuristics.ts';
import { sampleAdapter } from '../../server/model/sample/index.ts';
import { SPARSE_REASON, recommend } from '../../server/model/sample/recommend.ts';
import { NO_MATCH_SUMMARY, proposeRevision } from '../../server/model/sample/revise.ts';
import { suggestImprovement } from '../../server/model/sample/suggest.ts';
import type { RecommendInput } from '../../server/model/types.ts';

const NOW = new Date(2026, 10, 14, 12, 0, 0);

function extractProfile(key: keyof typeof SAMPLE_PROFILES): ExtractionResult {
  const p = SAMPLE_PROFILES[key];
  return extractFacts({ source: { id: `src-${key}`, label: p.label, kind: 'sample', text: p.text }, existingFacts: [] });
}

function toFacts(result: ExtractionResult, prefix: string): RecommendInput['facts'] {
  return result.facts.map((f, i) => ({ id: `${prefix}-${i + 1}`, category: f.category, value: f.value, status: f.status, confidence: f.confidence }));
}

function recommendFor(facts: RecommendInput['facts'], extra: Partial<RecommendInput> = {}): RecommendationDraft[] {
  return recommend({ facts, existingApps: [], chosenInterests: [], count: 4, ...extra });
}

/** Every quoted snippet in a reason must come from one of the cited facts (ellipses allowed). */
function quotesAreGrounded(rec: RecommendationDraft, facts: RecommendInput['facts']): boolean {
  const cited = facts.filter((f) => rec.evidenceFactIds.includes(f.id)).map((f) => f.value.replace(/\s+/g, ' '));
  const quotes = [...rec.reason.matchAll(/"([^"]+)"/g)].map((m) => (m[1] ?? '').replace(/…/g, '').trim());
  return quotes.length > 0 && quotes.every((q) => cited.some((v) => v.includes(q)));
}

const founderResult = extractProfile('founder-photographer');
const studentResult = extractProfile('student-musician');
const founderFacts = toFacts(founderResult, 'f');
const studentFacts = toFacts(studentResult, 's');

describe('extractFacts (sample profiles)', () => {
  it('reads the founder profile into categorised, labelled facts', () => {
    const { facts } = founderResult;
    expect(facts.length).toBeGreaterThanOrEqual(8);
    const categories = new Set(facts.map((f) => f.category));
    for (const c of ['goal', 'project', 'interest', 'routine', 'tool', 'change', 'uncertainty']) expect(categories.has(c as never)).toBe(true);
    const followUp = facts.find((f) => /forget to follow up/i.test(f.value));
    expect(followUp).toBeDefined();
    expect(followUp?.category).toBe('project');
    expect(followUp?.status).toBe('confirmed');
    expect(followUp?.confidence).toBe(0.9);
    const zine = facts.find((f) => /zine/i.test(f.value));
    expect(zine?.status).toBe('inferred');
    expect(zine?.confidence).toBe(0.55);
    expect(facts.find((f) => /moved from champaign to chicago/i.test(f.value))?.category).toBe('change');
    expect(facts.find((f) => /newsletter or replace/i.test(f.value))?.category).toBe('uncertainty');
    expect(facts.find((f) => /notion/i.test(f.value))?.category).toBe('tool');
    for (const f of facts) {
      expect(f.value.length).toBeGreaterThanOrEqual(3);
      expect(f.value.length).toBeLessThanOrEqual(240);
      expect(f.value).not.toMatch(/\((?:confirmed|inferred)/i);
      expect(f.value).not.toMatch(/items to review/i);
      expect(f.value).not.toMatch(/^SAMPLE CONTEXT/);
    }
    expect(facts.some((f) => f.evidence?.startsWith('From:'))).toBe(true);
    expect(founderResult.note).toBeUndefined();
    // Nothing in the founder profile contradicts itself.
    expect(founderResult.conflicts).toEqual([]);
  });

  it('reads the student profile and surfaces the practice contradiction as a conflict', () => {
    const { facts, conflicts } = studentResult;
    expect(facts.length).toBeGreaterThanOrEqual(8);
    expect(facts.find((f) => /30 minutes most evenings/i.test(f.value))?.category).toBe('interest');
    expect(facts.find((f) => /lose track of assignment deadlines/i.test(f.value))?.category).toBe('project');
    expect(facts.find((f) => /checklists and streaks/i.test(f.value))?.category).toBe('routine');
    expect(conflicts.length).toBeGreaterThanOrEqual(1);
    const barely = facts.findIndex((f) => /barely practised/i.test(f.value));
    expect(barely).toBeGreaterThanOrEqual(0);
    expect(conflicts.some(([a, b]) => a === barely || b === barely)).toBe(true);
    for (const [a, b] of conflicts) {
      expect(a).not.toBe(b);
      expect(facts[a]).toBeDefined();
      expect(facts[b]).toBeDefined();
    }
    // No spurious conflicts between facts that merely share a topic.
    const songs = facts.findIndex((f) => /five complete songs/i.test(f.value));
    const deadlines = facts.findIndex((f) => /lose track of assignment deadlines/i.test(f.value));
    expect(conflicts.some(([a, b]) => a === songs || b === songs || a === deadlines || b === deadlines)).toBe(false);
    expect(conflicts.length).toBe(1);
  });

  it('is deterministic', () => {
    expect(extractProfile('founder-photographer')).toEqual(founderResult);
  });

  it('classifies unstructured prose and treats a typed profile as confirmed', () => {
    const text = "I'm a product manager at a fintech. I run three times a week and I'm learning Japanese. I use Notion for everything. Not sure whether to start a podcast.";
    const { facts } = extractFacts({ source: { id: 'm1', label: 'About me', kind: 'manual', text }, existingFacts: [] });
    expect(facts.length).toBeGreaterThanOrEqual(3);
    expect(facts.find((f) => /japanese/i.test(f.value))?.category).toBe('interest');
    expect(facts.find((f) => /notion/i.test(f.value))?.category).toBe('tool');
    expect(facts.find((f) => /podcast/i.test(f.value))?.category).toBe('uncertainty');
    expect(facts.every((f) => f.status === 'confirmed')).toBe(true);
  });

  it('is honest when the text says little, and flags a change against existing facts', () => {
    const sparse = extractFacts({ source: { id: 'p1', label: 'Paste', kind: 'paste', text: 'Hi there.' }, existingFacts: [] });
    expect(sparse.facts.length).toBeLessThan(3);
    expect(sparse.note).toMatch(/says little about you/);
    const changed = extractFacts({
      source: { id: 'p2', label: 'Paste', kind: 'paste', text: 'I no longer practise guitar in the evenings; I switched to piano.' },
      existingFacts: [{ id: 'e1', category: 'routine', value: 'I practise guitar for 30 minutes most evenings', status: 'confirmed' }],
    });
    const fact = changed.facts.find((f) => /no longer practise guitar/i.test(f.value));
    expect(fact?.evidence).toMatch(/Conflicts with what you said before/);
    expect(fact?.status).toBe('inferred');
  });
});

describe('recommend', () => {
  it('recommends follow-ups and photo walks for the founder, quoting their own words', () => {
    const recs = recommendFor(founderFacts);
    expect(recs.length).toBe(4);
    const titles = recs.map((r) => r.title);
    expect(titles).toContain('People to Follow Up With');
    expect(titles).toContain('Photo Walk Journal');
    expect(recs.some((r) => r.purpose === 'work')).toBe(true);
    expect(recs.some((r) => r.purpose === 'explore')).toBe(true);
    const ids = new Set(founderFacts.map((f) => f.id));
    for (const rec of recs) {
      RecommendationDraftSchema.parse(rec);
      expect(rec.evidenceFactIds.length).toBeGreaterThanOrEqual(1);
      expect(rec.evidenceFactIds.every((id) => ids.has(id))).toBe(true);
      expect(quotesAreGrounded(rec, founderFacts)).toBe(true);
      expect(rec.previewLines.length).toBeGreaterThanOrEqual(1);
      expect(rec.reason.length).toBeLessThanOrEqual(400);
    }
    expect(recs.find((r) => r.title === 'People to Follow Up With')?.reason).toMatch(/follow up|investors|mentors|coffee chats/i);
    expect(recs.find((r) => r.title === 'Photo Walk Journal')?.reason).toMatch(/photograph|light|walks/i);
  });

  it('recommends a music concept and a study concept for the student', () => {
    const recs = recommendFor(studentFacts);
    const titles = recs.map((r) => r.title);
    expect(titles.some((t) => /music|practice/i.test(t))).toBe(true);
    expect(titles.some((t) => /study|course|assignment/i.test(t))).toBe(true);
    for (const rec of recs) expect(quotesAreGrounded(rec, studentFacts)).toBe(true);
  });

  it('gives the two profiles visibly different top results', () => {
    const founderTop = recommendFor(founderFacts).slice(0, 3).map((r) => r.title);
    const studentTop = recommendFor(studentFacts).slice(0, 3).map((r) => r.title);
    const overlap = founderTop.filter((t) => studentTop.includes(t)).length;
    expect(3 - overlap).toBeGreaterThanOrEqual(2);
  });

  it('skips apps already in the collection and stays deterministic', () => {
    const recs = recommendFor(founderFacts, { existingApps: [{ name: 'People to Follow Up With', purpose: 'work', pattern: 'board' }] });
    expect(recs.map((r) => r.title)).not.toContain('People to Follow Up With');
    expect(recommendFor(founderFacts)).toEqual(recommendFor(founderFacts));
  });

  it('falls back to popular starting points when nothing matches, still citing a real fact', () => {
    const facts: RecommendInput['facts'] = [
      { id: 'x1', category: 'interest', value: 'Zxqv blorp wumple', status: 'inferred', confidence: 0.55 },
      { id: 'x2', category: 'routine', value: 'Qwerty zorple fnord', status: 'confirmed', confidence: 0.9 },
    ];
    const recs = recommendFor(facts);
    expect(recs.map((r) => r.title)).toEqual(['People to Follow Up With', 'Photo Walk Journal', 'Habit Streaks']);
    for (const rec of recs) {
      expect(rec.reason).toBe(SPARSE_REASON);
      expect(rec.evidenceFactIds).toEqual(['x2']);
    }
    expect(recommendFor([])).toEqual([]);
  });
});

describe('catalog', () => {
  const required = [
    'People to Follow Up With', 'Photo Walk Journal', 'Weekend Explorer', 'Music Practice Companion', 'Study Planner', 'Reading Log', 'Running Log',
    'Job Search Tracker', 'Side Project Milestones', 'Habit Streaks', 'Recipe Experiments', 'Sketchbook', 'Language Practice', 'Customer Conversations',
    'Content Ideas Board', 'Gratitude & Reflection', 'Plant Care', 'Climbing Log', 'Trip Planner', 'Energy & Sleep Check-in', 'Meeting Notes',
    'Budget Check-in', 'Course Assignments', 'Poetry Notebook', 'Mentor Check-ins', 'Film Log',
  ];

  it('has at least 26 concepts with both purposes well represented', () => {
    expect(CONCEPTS.length).toBeGreaterThanOrEqual(26);
    const titles = CONCEPTS.map((c) => c.title);
    for (const t of required) expect(titles).toContain(t);
    expect(CONCEPTS.filter((c) => c.purpose === 'work').length).toBeGreaterThanOrEqual(10);
    expect(CONCEPTS.filter((c) => c.purpose === 'explore').length).toBeGreaterThanOrEqual(10);
    expect(new Set(CONCEPTS.map((c) => c.id)).size).toBe(CONCEPTS.length);
  });

  it('builds a valid, genuinely different app for every concept', () => {
    const signatures = new Set<string>();
    for (const concept of CONCEPTS) {
      expect(concept.title.length).toBeLessThanOrEqual(50);
      expect(concept.triggers.length).toBeGreaterThanOrEqual(5);
      const spec = AppSpecSchema.parse(concept.buildSpec({ instructions: '' }));
      expect(spec.fields.length).toBeGreaterThanOrEqual(4);
      expect(spec.pattern).toBe(concept.pattern);
      expect(spec.purpose).toBe(concept.purpose);
      const types = spec.views.map((v) => v.type);
      if (concept.pattern === 'journal') expect(types).toEqual(['journal', 'summary']);
      if (concept.pattern === 'board') {
        expect(types).toEqual(['board', 'summary']);
        const board = spec.views[0];
        if (board?.type === 'board' && board.dueFieldId) expect(spec.rules.some((r) => r.type === 'due_soon' && r.dateFieldId === board.dueFieldId)).toBe(true);
      }
      if (concept.pattern === 'tracker') expect(types).toEqual(['summary', 'list']);
      expect(spec.emptyStateHint).toBeTruthy();
      signatures.add(spec.fields.map((f) => `${f.id}:${f.type}`).join('|'));
      expect(concept.reasonTemplate([{ id: 'a', category: 'interest', value: 'I love weekend walks with my camera' }])).toMatch(/"I love weekend walks with my camera"/);
    }
    expect(signatures.size).toBe(CONCEPTS.length);
  });
});

describe('generateSpec', () => {
  const photoRec = recommendFor(founderFacts).find((r) => r.title === 'Photo Walk Journal') as RecommendationDraft;

  it('turns the hero instructions into a weekly challenge and a reflection field', () => {
    const out = generateSpec({ recommendation: photoRec, instructions: 'Make it a weekly photography challenge and add a reflection field', facts: [] });
    AppSpecSchema.parse(out.spec);
    const rotation = out.spec.rules.find((r) => r.type === 'prompt_rotation');
    expect(rotation).toBeDefined();
    if (rotation?.type === 'prompt_rotation') {
      expect(rotation.cadence).toBe('weekly');
      expect(rotation.prompts.length).toBe(8);
    }
    expect(out.spec.fields.some((f) => f.type === 'long_text')).toBe(true);
    expect(out.unsupported).toEqual([]);
    expect(out.description).toMatch(/weekly challenge/i);
    expect(out.description).toMatch(/reflection/i);
    expect(out.spec.name).toBe('Photo Walk Journal');
    // Idempotent: applying the same instructions again changes nothing.
    const again = applyInstructionHeuristics(out.spec, 'Make it a weekly photography challenge and add a reflection field');
    expect(again.changes).toEqual([]);
    expect(AppSpecSchema.parse(again.spec)).toEqual(out.spec);
  });

  it('declines attachments and reminders with alternatives but still builds the app', () => {
    const out = generateSpec({ recommendation: photoRec, instructions: 'Let me upload photos and remind me by email every Friday. Also add a mood field and rename it to Light Hunter.', facts: [] });
    AppSpecSchema.parse(out.spec);
    expect(out.unsupported.length).toBeGreaterThanOrEqual(2);
    expect(out.unsupported.every((u) => u.reason.length > 0 && u.alternative.length > 0)).toBe(true);
    expect(out.spec.fields.some((f) => f.type === 'select' && f.id === 'mood')).toBe(true);
    expect(out.spec.fields.some((f) => f.type === 'url')).toBe(true);
    expect(out.spec.name).toBe('Light Hunter');
  });

  it('builds a working board for a work recommendation and honours a due-date request', () => {
    const rec = recommendFor(founderFacts).find((r) => r.title === 'People to Follow Up With') as RecommendationDraft;
    const out = generateSpec({ recommendation: rec, instructions: 'Add a priority field and a field for the company', facts: [] });
    expect(out.spec.pattern).toBe('board');
    expect(out.spec.fields.some((f) => f.id === 'priority' && f.type === 'select')).toBe(true);
    expect(out.spec.fields.some((f) => f.label === 'Company' && f.type === 'text')).toBe(true);
    expect(out.spec.rules.some((r) => r.type === 'due_soon')).toBe(true);
  });
});

describe('proposeRevision', () => {
  const journal = AppSpecSchema.parse(conceptById('photo-walk-journal')!.buildSpec({ instructions: '' }));
  const board = AppSpecSchema.parse(conceptById('people-to-follow-up-with')!.buildSpec({ instructions: '' }));
  const revise = (spec: AppSpec, request: string) => proposeRevision({ spec, request, sampleRecords: [] });

  it('adds a next experiment field as one additive op', () => {
    const p = revise(journal, 'add a next experiment field');
    expect(p.ops.length).toBe(1);
    const op = p.ops[0];
    expect(op?.op).toBe('add_field');
    if (op?.op === 'add_field') {
      expect(op.field.type).toBe('text');
      expect(op.field.label).toMatch(/next experiment/i);
      expect(op.afterFieldId).toBe('keeper');
    }
    expect(p.unsupported).toEqual([]);
    const applied = applyRevision(journal, p.ops);
    expect(applied.ok).toBe(true);
    expect(p.summary).toMatch(/Next experiment/);
  });

  it('declines a type change and offers a safe alternative', () => {
    const p = revise(journal, 'change the date to a number');
    expect(p.unsupported.length).toBeGreaterThanOrEqual(1);
    expect(p.unsupported[0]?.reason).toMatch(/type|risk/i);
    expect(p.unsupported[0]?.alternative.length).toBeGreaterThan(0);
    expect(applyRevision(journal, p.ops).ok).toBe(true);
  });

  it('maps hide, show, rename, options, due window and prompts onto ops', () => {
    const hide = revise(board, 'remove the best channel field');
    expect(hide.ops).toEqual([{ op: 'hide_field', fieldId: 'channel' }]);
    const hidden = applyRevision(board, hide.ops).spec as AppSpec;
    expect(revise(hidden, 'bring back the best channel').ops).toEqual([{ op: 'unhide_field', fieldId: 'channel' }]);

    const rename = revise(board, 'rename What I promised to Commitment');
    expect(rename.ops).toEqual([{ op: 'update_field', fieldId: 'commitment', patch: { label: 'Commitment' } }]);
    expect(revise(board, 'rename the app to Promises').ops).toEqual([{ op: 'rename_app', name: 'Promises' }]);

    const option = revise(board, 'add a stage called Negotiating');
    expect(option.ops[0]).toEqual({ op: 'add_select_option', fieldId: 'stage', option: { value: 'negotiating', label: 'Negotiating' } });

    const window = revise(board, 'highlight things due within 7 days');
    expect(window.ops[0]?.op).toBe('replace_rule');
    if (window.ops[0]?.op === 'replace_rule' && window.ops[0].rule.type === 'due_soon') expect(window.ops[0].rule.withinDays).toBe(7);

    const prompts = revise(journal, 'add a weekly challenge');
    expect(prompts.ops[0]?.op).toBe('add_rule');
    if (prompts.ops[0]?.op === 'add_rule') expect(prompts.ops[0].rule.type).toBe('prompt_rotation');

    const due = revise(journal, 'add a due date');
    expect(due.ops.some((o) => o.op === 'add_field' && o.field.type === 'date')).toBe(true);
    expect(due.ops.some((o) => o.op === 'add_rule' && o.rule.type === 'due_soon')).toBe(true);
    expect(applyRevision(journal, due.ops).ok).toBe(true);

    const multi = revise(journal, 'Add a rating and a mood field, and hide the keeper checkbox');
    expect(multi.ops.map((o) => o.op).sort()).toEqual(['add_field', 'add_field', 'hide_field']);
    expect(applyRevision(journal, multi.ops).ok).toBe(true);
    // The journal already has a "Where" field, so asking for a location adds nothing twice.
    expect(revise(journal, 'add a location field').ops).toEqual([]);
  });

  it('never deletes data, declines external actions, and explains when nothing matched', () => {
    const wipe = revise(board, 'delete all entries');
    expect(wipe.ops).toEqual([]);
    expect(wipe.unsupported[0]?.reason).toMatch(/never deleted/i);
    const sync = revise(board, 'sync with my calendar');
    expect(sync.ops).toEqual([]);
    expect(sync.unsupported.length).toBe(1);
    const nonsense = revise(board, 'make it purple and sparkly');
    expect(nonsense.ops).toEqual([]);
    expect(nonsense.summary).toBe(NO_MATCH_SUMMARY);
    expect(nonsense.unsupported.length).toBe(1);
    expect(nonsense.unsupported[0]?.alternative).toMatch(/add a field/i);
  });
});

describe('suggestImprovement', () => {
  const journal = AppSpecSchema.parse(conceptById('photo-walk-journal')!.buildSpec({ instructions: '' }));
  const board = AppSpecSchema.parse(conceptById('people-to-follow-up-with')!.buildSpec({ instructions: '' }));

  it('returns null for a fresh app', () => {
    expect(suggestImprovement({ spec: journal, events: [], records: [] }, NOW)).toBeNull();
    expect(suggestImprovement({ spec: board, events: [], records: [] }, NOW)).toBeNull();
  });

  it('suggests a next step when a board has overdue cards', () => {
    const records = [
      { values: { person: 'Ana', stage: 'promised', due: '2026-10-01' }, createdAt: '2026-09-28T10:00:00.000Z' },
      { values: { person: 'Ben', stage: 'waiting', due: '2026-11-01' }, createdAt: '2026-10-20T10:00:00.000Z' },
      { values: { person: 'Cy', stage: 'done', due: '2026-10-01' }, createdAt: '2026-09-20T10:00:00.000Z' },
    ];
    const s = suggestImprovement({ spec: board, events: [{ type: 'item_saved', at: '2026-11-13T10:00:00.000Z' }], records }, NOW);
    expect(s?.title).toMatch(/Next step/);
    expect(s?.request).toBe('Add a short text field called Next step');
    expect(s?.why).toMatch(/2 follow-ups are overdue/);
  });

  it('suggests ratings for an active journal and maps feedback through the heuristics', () => {
    const records = [1, 2, 3].map((i) => ({ values: { date: `2026-11-1${i}`, subject: `Walk ${i}` }, createdAt: `2026-11-1${i}T09:00:00.000Z` }));
    const s = suggestImprovement({ spec: journal, events: [{ type: 'item_saved', at: '2026-11-13T09:00:00.000Z' }], records }, NOW);
    expect(s?.title).toMatch(/Rate/);
    const forget = suggestImprovement({ spec: journal, events: [], records: [], feedback: 'I keep forgetting to come back to the places I wanted to revisit' }, NOW);
    expect(forget?.request).toMatch(/due date/i);
    const weather = suggestImprovement({ spec: journal, events: [], records: [], feedback: 'It would be nice to track the weather on each walk' }, NOW);
    expect(weather?.title).toMatch(/Weather/);
    expect(weather?.request).toMatch(/Weather/);
    const lighter = suggestImprovement({ spec: journal, events: [{ type: 'item_saved', at: '2026-10-20T09:00:00.000Z' }], records: records.slice(0, 1) }, NOW);
    expect(lighter?.title).toMatch(/daily prompt/i);
  });
});

describe('SampleAdapter', () => {
  it('labels every result as sample and is deterministic end to end', async () => {
    expect(sampleAdapter.mode).toBe('sample');
    const extracted = await sampleAdapter.extractFacts({ source: { id: 's', label: 'x', kind: 'sample', text: SAMPLE_PROFILES['founder-photographer'].text }, existingFacts: [] });
    expect(extracted.generatedBy).toBe('sample');
    const recs = await sampleAdapter.recommend({ facts: founderFacts, existingApps: [], chosenInterests: [], count: 3 });
    expect(recs.generatedBy).toBe('sample');
    expect(recs.data.length).toBe(3);
    const built = await sampleAdapter.generateSpec({ recommendation: recs.data[0] as RecommendationDraft, instructions: '', facts: [] });
    expect(built.generatedBy).toBe('sample');
    expect(AppSpecSchema.safeParse(built.data.spec).success).toBe(true);
    const revised = await sampleAdapter.proposeRevision({ spec: built.data.spec, request: 'add a notes field', sampleRecords: [] });
    expect(revised.generatedBy).toBe('sample');
    const suggestion = await sampleAdapter.suggestImprovement({ spec: built.data.spec, events: [], records: [] });
    expect(suggestion.generatedBy).toBe('sample');
  });
});
