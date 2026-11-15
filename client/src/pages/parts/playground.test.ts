/**
 * Playground ideas, real filter semantics and a grid that fills its rows in reading order.
 */
import { describe, expect, it } from 'vitest';
import { availableFilters, filterIdeas, pickFeature, playgroundIdeas, playgroundSpans, type GridSpan } from './helpers.ts';

type Idea = { id: string; kind: 'new_app' | 'explore' | 'keep' | 'use_app' | 'update_app'; status: 'fresh' | 'built' | 'applied'; title: string; purpose: 'work' | 'explore'; captureId?: string | null };
const idea = (id: string, over: Partial<Idea> = {}): Idea => ({ id, kind: 'new_app', status: 'fresh', title: id, purpose: 'explore', captureId: null, ...over });

describe('playgroundIdeas', () => {
  it('shows the Playground’s own ideas once, fresh first; never a plain save or a reply to an Agent share', () => {
    const out = playgroundIdeas([
      idea('Made earlier', { status: 'built' }),
      idea('Light'),
      idea('Just keep it', { kind: 'keep' }),
      idea('Practise in Riff tonight', { kind: 'use_app', captureId: 'cap1' }),
      idea('light'),
      idea('A twenty-minute light walk', { kind: 'explore' }),
    ]);
    expect(out.map((r) => r.title)).toEqual(['Light', 'A twenty-minute light walk', 'Made earlier']);
  });
});

describe('filters', () => {
  const ideas = [idea('a', { purpose: 'explore' }), idea('b', { purpose: 'work' }), idea('c', { purpose: 'explore' })];
  it('mean something: Explore is ideas for interests, Everyday is useful things, For you is everything', () => {
    expect(filterIdeas(ideas, 'for_you').map((r) => r.id)).toEqual(['a', 'b', 'c']);
    expect(filterIdeas(ideas, 'explore').map((r) => r.id)).toEqual(['a', 'c']);
    expect(filterIdeas(ideas, 'everyday').map((r) => r.id)).toEqual(['b']);
  });
  it('appear only when both kinds of idea exist', () => {
    expect(availableFilters(ideas)).toEqual(['for_you', 'explore', 'everyday']);
    expect(availableFilters([idea('a'), idea('c')])).toEqual([]);
    expect(availableFilters([])).toEqual([]);
  });
});

/** Place spans left to right in rows of `width`; return problems (a hole before a wrap, an unfinished last row). */
function packProblems(spans: number[], width: number): string[] {
  const problems: string[] = [];
  let used = 0;
  spans.forEach((s, i) => {
    if (s > width) problems.push(`item ${i} is wider than the grid`);
    if (used + s > width) {
      problems.push(`hole of ${width - used} before item ${i}`);
      used = 0;
    }
    used = (used + s) % width;
  });
  if (used !== 0) problems.push(`last row ends ${width - used} short`);
  return problems;
}

describe('pickFeature', () => {
  const base = { tagline: '', description: '', previewLines: [] as string[], firstAction: '', icon: { symbol: 'star', color: 'slate' } as const };
  const r = (id: string, kind: Idea['kind'], pattern: 'board' | 'gallery' | 'practice' | 'queue', title: string, status: Idea['status'] = 'fresh') => ({ ...base, id, kind, pattern, title, status });
  it('leads with real imagery, then a strong identity, never with a plain save', () => {
    expect(pickFeature([r('b', 'new_app', 'board', 'Study Planner'), r('l', 'new_app', 'gallery', 'Light'), r('m', 'new_app', 'practice', 'Riff', 'fresh')])?.id).toBe('l');
    expect(pickFeature([r('b', 'new_app', 'board', 'Study Planner'), { ...r('m', 'new_app', 'practice', 'Riff'), conceptId: 'riff-practice' }])?.id).toBe('m');
    expect(pickFeature([r('l', 'new_app', 'gallery', 'Light', 'built'), r('b', 'new_app', 'board', 'Study Planner')])?.id).toBe('b');
    expect(pickFeature([r('k', 'keep', 'board', 'Just keep it')])).toBeNull();
  });
});

describe('playgroundSpans', () => {
  it('fills every row without holes at desktop and tablet widths, keeping reading order', () => {
    for (let cards = 0; cards <= 9; cards++) {
      for (const specials of [1, 2]) {
        const { cards: c, specials: s } = playgroundSpans(cards, specials);
        const all: GridSpan[] = [...c, ...s];
        expect(packProblems(all.map((x) => x.lg), 6), `lg ${cards}+${specials}`).toEqual([]);
        expect(packProblems(all.map((x) => x.md), 2), `md ${cards}+${specials}`).toEqual([]);
        expect(packProblems(all.map((x) => x.sm), 2), `sm ${cards}+${specials}`).toEqual([]);
      }
    }
  });
  it('leads with a wide feature', () => {
    expect(playgroundSpans(4, 2).cards[0]).toEqual({ lg: 4, md: 2, sm: 2 });
    expect(playgroundSpans(1, 2).cards[0]).toEqual({ lg: 6, md: 2, sm: 2 });
  });
  it('keeps "Something unexpected" beside "Make something new" on wide screens by widening the last idea', () => {
    const four = playgroundSpans(4, 2);
    expect(four.cards.map((c) => c.lg)).toEqual([4, 2, 2, 4]);
    expect(four.specials.map((c) => c.lg)).toEqual([3, 3]);
    expect(four.specials.map((c) => c.md)).toEqual([1, 1]);
    // On a phone each is a full-width banner under the ideas, as in the reference.
    expect(four.specials.map((c) => c.sm)).toEqual([2, 2]);
  });
  it('three ideas sit side by side on desktop with the two banners in their own row (reference 03)', () => {
    const three = playgroundSpans(3, 2);
    expect(three.cards.map((c) => c.lg)).toEqual([2, 2, 2]);
    expect(three.specials.map((c) => c.lg)).toEqual([3, 3]);
    expect(three.cards.map((c) => c.sm)).toEqual([2, 1, 1]);
  });
  it('never puts a special card in a row with an idea, at any width (it would stretch to the idea’s height)', () => {
    const widths = { lg: 6, md: 2, sm: 2 } as const;
    for (let cards = 0; cards <= 9; cards++) {
      for (const specials of [1, 2]) {
        const { cards: c, specials: s } = playgroundSpans(cards, specials);
        for (const key of ['lg', 'md', 'sm'] as const) {
          const used = c.reduce((n, x) => n + x[key], 0);
          expect(used % widths[key], `${key} ${cards}+${specials}: ideas end on a full row`).toBe(0);
        }
      }
    }
    expect(playgroundSpans(2, 1).specials).toEqual([{ lg: 6, md: 2, sm: 2 }]);
  });
});
