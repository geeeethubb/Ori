import { describe, expect, it } from 'vitest';
import { AppSpecSchema } from '@shared/appSpec.ts';
import {
  composeManualProfile, daysLeft, describeFields, describeRule, describeView, flattenJsonText, looksLikeText,
  relativeTime, safeNextPath, truncate,
} from './helpers.ts';

describe('safeNextPath', () => {
  it('accepts same-site paths and keeps the query string', () => {
    expect(safeNextPath('/apps/abc12345/', '/for-you')).toBe('/apps/abc12345/');
    expect(safeNextPath('/recommendations/x?y=1', '/for-you')).toBe('/recommendations/x?y=1');
  });
  it('rejects absolute and protocol-relative URLs and junk', () => {
    expect(safeNextPath('https://evil.example/', '/for-you')).toBe('/for-you');
    expect(safeNextPath('//evil.example/', '/for-you')).toBe('/for-you');
    expect(safeNextPath('/\\evil.example', '/for-you')).toBe('/for-you');
    expect(safeNextPath('javascript:alert(1)', '/for-you')).toBe('/for-you');
    expect(safeNextPath('/a b', '/for-you')).toBe('/for-you');
    expect(safeNextPath('', '/import')).toBe('/import');
    expect(safeNextPath(null, '/import')).toBe('/import');
  });
});

describe('truncate', () => {
  it('leaves short text alone and shortens long text with an ellipsis', () => {
    expect(truncate('short', 60)).toBe('short');
    const long = 'x'.repeat(100);
    const out = truncate(long, 60);
    expect(out.length).toBe(60);
    expect(out.endsWith('…')).toBe(true);
  });
});

describe('relativeTime / daysLeft', () => {
  const now = new Date('2026-11-14T12:00:00Z');
  it('describes recent moments', () => {
    expect(relativeTime('2026-11-14T11:59:40Z', now)).toBe('just now');
    expect(relativeTime('2026-11-14T11:30:00Z', now)).toBe('30 min ago');
    expect(relativeTime('2026-11-14T09:00:00Z', now)).toBe('3 hours ago');
    expect(relativeTime('2026-11-13T12:00:00Z', now)).toBe('yesterday');
    expect(relativeTime('2026-11-10T12:00:00Z', now)).toBe('4 days ago');
    expect(relativeTime(null, now)).toBe('');
  });
  it('counts whole days left and never goes negative', () => {
    expect(daysLeft('2026-11-28T12:00:00Z', now)).toBe(14);
    expect(daysLeft('2026-11-01T12:00:00Z', now)).toBe(0);
    expect(daysLeft('not a date', now)).toBe(0);
  });
});

describe('upload helpers', () => {
  it('detects text versus binary content', () => {
    expect(looksLikeText('# Profile\n\nI am learning guitar.')).toBe(true);
    expect(looksLikeText('')).toBe(false);
    expect(looksLikeText('   \n')).toBe(false);
    expect(looksLikeText('PK\u0003\u0004\u0000\u0000binary')).toBe(false);
    expect(looksLikeText('abc�def')).toBe(false);
  });
  it('flattens JSON string values into lines', () => {
    const text = flattenJsonText({ goals: ['Ship the beta', 'Run a 10k'], profile: { name: 'Sam', age: 31 }, notes: '  trimmed  ' });
    expect(text.split('\n')).toEqual(['Ship the beta', 'Run a 10k', 'name: Sam', 'notes: trimmed']);
    expect(flattenJsonText({ n: 1, ok: true })).toBe('');
  });
});

describe('composeManualProfile', () => {
  it('writes a Markdown document with only the sections that were filled in', () => {
    const md = composeManualProfile({ working: 'A seed-stage startup', explore: '', routines: 'Early mornings', tools: '' });
    expect(md.startsWith('# My short profile')).toBe(true);
    expect(md).toContain('## What I am working on\n\nA seed-stage startup');
    expect(md).toContain('## Routines and constraints\n\nEarly mornings');
    expect(md).not.toContain('## Tools I use');
  });
  it('is empty when nothing was written', () => {
    expect(composeManualProfile({ working: ' ', explore: '', routines: '', tools: '' })).toBe('');
  });
});

describe('draft descriptions', () => {
  const spec = AppSpecSchema.parse({
    schemaVersion: 1,
    name: 'People to Follow Up With',
    purpose: 'work',
    pattern: 'board',
    icon: { symbol: 'people', color: 'teal' },
    fields: [
      { id: 'person', label: 'Person', type: 'text', required: true },
      { id: 'stage', label: 'Stage', type: 'select', options: [{ value: 'met', label: 'Just met' }, { value: 'done', label: 'Done' }] },
      { id: 'due', label: 'Follow up by', type: 'date' },
      { id: 'secret', label: 'Hidden', type: 'text', hidden: true },
    ],
    views: [
      { id: 'board', type: 'board', stageFieldId: 'stage', titleFieldId: 'person', dueFieldId: 'due', doneStageValues: ['done'] },
      { id: 'summary', type: 'summary', title: 'At a glance', metrics: [{ id: 'open', label: 'Open follow-ups', kind: 'count' }] },
      { id: 'log', type: 'journal', title: 'History', dateFieldId: 'due' },
    ],
    rules: [
      { id: 'due_soon', type: 'due_soon', dateFieldId: 'due', withinDays: 3, stageFieldId: 'stage', doneStageValues: ['done'], label: 'Needs attention' },
      { id: 'weekly', type: 'prompt_rotation', cadence: 'weekly', title: 'This week', prompts: ['Reach out to one person', 'Thank someone'] },
    ],
  });
  it('describes views, rules and visible fields in plain words', () => {
    expect(spec.views.map((v) => describeView(spec, v))).toEqual([
      'Board with columns: Just met, Done',
      'Summary: Open follow-ups',
      'Journal view: History',
    ]);
    expect(spec.rules.map(describeRule)).toEqual([
      'Highlights anything due within 3 days, and anything overdue (Needs attention).',
      'This week: a weekly prompt that rotates through 2 ideas.',
    ]);
    expect(describeFields(spec)).toEqual([
      { label: 'Person', type: 'short text', required: true },
      { label: 'Stage', type: 'choice', required: false },
      { label: 'Follow up by', type: 'date', required: false },
    ]);
  });
});

// ---------- redesign helpers (proposals, memory grouping, Make-mine choices) ----------
import type { ProfileFact } from '@shared/context.ts';
import { defaultLook, firstSentence, groupFactsForMemory, pickFeatured, proposalAction, wantsTimeBudget } from './helpers.ts';

describe('proposalAction', () => {
  it('offers one action per kind and status', () => {
    expect(proposalAction({ id: 'r1', kind: 'new_app', status: 'fresh' })).toEqual({ label: 'Make mine', to: '/make/r1', emphasis: 'primary' });
    expect(proposalAction({ id: 'r1', kind: 'new_app', status: 'built', builtAppId: 'app12345' })).toMatchObject({ label: 'Open', to: '/apps/app12345/' });
    expect(proposalAction({ id: 'r2', kind: 'explore', status: 'fresh' })).toMatchObject({ label: 'Explore', to: '/make/r2' });
    expect(proposalAction({ id: 'r3', kind: 'update_app', status: 'fresh', targetAppId: 'app12345' })).toMatchObject({ label: 'Preview change', to: '/make/r3' });
    // Using an app you have opens it (with the suggestion, while it is fresh); it never goes through a design change.
    expect(proposalAction({ id: 'r5', kind: 'use_app', status: 'fresh', targetAppId: 'app12345' })).toMatchObject({ label: 'Open', to: '/apps/app12345/?from=r5' });
    expect(proposalAction({ id: 'r5', kind: 'use_app', status: 'applied', targetAppId: 'app12345' })).toMatchObject({ label: 'Open', to: '/apps/app12345/' });
    expect(proposalAction({ id: 'r3', kind: 'update_app', status: 'applied', targetAppId: 'app12345' })).toMatchObject({ label: 'Open', to: '/apps/app12345/' });
    expect(proposalAction({ id: 'r4', kind: 'keep', status: 'fresh' })).toMatchObject({ label: 'Keep', emphasis: 'secondary' });
    expect(proposalAction({ id: 'r4', kind: 'keep', status: 'kept' }).label).toBe('Kept');
  });
});

describe('firstSentence', () => {
  it('returns the first sentence and leaves unpunctuated text alone', () => {
    expect(firstSentence('You said “15 minutes”. A timer turns it into a session.')).toBe('You said “15 minutes”.');
    expect(firstSentence('No punctuation here')).toBe('No punctuation here');
    expect(firstSentence('Try it at 7.30 tonight. Then stop.')).toBe('Try it at 7.30 tonight.');
  });
});

describe('groupFactsForMemory', () => {
  const fact = (id: string, category: ProfileFact['category'], status: ProfileFact['status'] = 'confirmed', conflictGroup: string | null = null): ProfileFact => ({
    id, ownerId: 'u1', category, value: `${id} value text`, sourceIds: [], confidence: 1, status, conflictGroup, createdAt: '2026-11-14T00:00:00Z', updatedAt: '2026-11-14T00:00:00Z',
  });
  it('groups into the memory sections, drops removed facts and pulls conflicts out', () => {
    const r = groupFactsForMemory([
      fact('a', 'interest'), fact('b', 'goal'), fact('c', 'project'), fact('d', 'routine'), fact('e', 'tool'), fact('f', 'change'), fact('g', 'uncertainty'),
      fact('h', 'interest', 'removed'), fact('i', 'goal', 'conflict', 'g1'), fact('j', 'goal', 'conflict', 'g1'), fact('k', 'goal', 'conflict', 'lonely'),
    ]);
    expect(r.total).toBe(10);
    expect(r.groups.map((g) => [g.key, g.facts.map((f) => f.id)])).toEqual([
      ['interests', ['a']], ['needs', ['b', 'c', 'k']], ['routines', ['d', 'e']], ['changes', ['f']], ['questions', ['g']],
    ]);
    expect(r.conflicts.map((g) => g.map((f) => f.id))).toEqual([['i', 'j']]);
  });
  it('keeps every section present when there is nothing yet', () => {
    const r = groupFactsForMemory([]);
    expect(r.groups.map((g) => g.key)).toEqual(['interests', 'needs', 'routines', 'changes', 'questions']);
    expect(r.total).toBe(0);
  });
});

describe('Make-mine choices', () => {
  it('asks for a time budget only when the app would use a timer', () => {
    expect(wantsTimeBudget({ pattern: 'practice', capabilities: [] })).toBe(true);
    expect(wantsTimeBudget({ pattern: 'journal', capabilities: ['practice_timer'] })).toBe(true);
    expect(wantsTimeBudget({ pattern: 'gallery', capabilities: ['gallery', 'photo_upload'] })).toBe(false);
  });
  it('defaults the look to the proposal design, else the pattern default', () => {
    const icon = { symbol: 'guitar', color: 'ink' } as const;
    expect(defaultLook({ pattern: 'practice', icon, purpose: 'explore' })).toBe('ink');
    expect(defaultLook({ pattern: 'gallery', icon, purpose: 'explore' })).toBe('paper');
    expect(defaultLook({ pattern: 'journal', icon, purpose: 'explore' })).toBe('bright');
    expect(defaultLook({ pattern: 'journal', icon, purpose: 'explore', design: { theme: 'sunset', typography: 'editorial', density: 'regular', artwork: 'none' } })).toBe('sunset');
  });
  it('features a fresh app-shaped proposal over explorations and keeps', () => {
    const recs = [
      { id: 'k', kind: 'keep', status: 'fresh', pattern: 'journal' },
      { id: 'e', kind: 'explore', status: 'fresh', pattern: 'practice' },
      { id: 'g', kind: 'new_app', status: 'fresh', pattern: 'gallery' },
    ] as const;
    expect(pickFeatured([...recs])?.id).toBe('g');
    expect(pickFeatured([recs[0], recs[1]])?.id).toBe('e');
    expect(pickFeatured([])).toBeNull();
  });
});
