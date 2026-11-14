/**
 * Deterministic recommendations: score every catalog concept against the person's approved facts,
 * keep both purposes represented, and explain each pick by quoting the facts that matched.
 */
import { AppSpecSchema, type AppSpecInput } from '../../../shared/appSpec.ts';
import { RecommendationDraftSchema, type RecommendationDraft } from '../../../shared/context.ts';
import type { RecommendInput } from '../types.ts';
import { CONCEPTS, DEFAULT_CONCEPT_IDS, conceptById, type Concept, type MatchedFact } from './catalog.ts';
import { clip, escapeRegExp, normalize, uniq } from './text.ts';

type Fact = RecommendInput['facts'][number];

interface Match extends MatchedFact { weight: number }
interface Scored { concept: Concept; score: number; matches: Match[] }

export const SPARSE_REASON = "We don't know much about you yet; these are popular starting points. Add context for better matches.";
export const FILL_REASON = 'A popular starting point for many people. Add more context and the matches get closer to you.';

const CHOSEN_CUE = /\b(want to (?:start|learn|try|get into|pick up)|would like to (?:start|learn|try)|hoping to (?:start|learn|try)|curious about|new interest|thinking of (?:starting|learning|trying)|start learning|getting into)\b/i;

const triggerCache = new Map<string, { trigger: string; rx: RegExp; weight: number }[]>();
function compiledTriggers(concept: Concept) {
  let list = triggerCache.get(concept.id);
  if (!list) {
    list = uniq(concept.triggers).map((trigger) => ({
      trigger,
      rx: new RegExp(`(?<![a-z0-9])${escapeRegExp(trigger)}(?:s|es|ed|ing|er|ers|'s)?(?![a-z0-9])`, 'i'),
      weight: trigger.includes(' ') ? 3 : 1,
    }));
    triggerCache.set(concept.id, list);
  }
  return list;
}

function factMultiplier(fact: Fact, chosen: Set<string>): number {
  let m = 0.8 + 0.4 * Math.max(0, Math.min(1, fact.confidence));
  if (fact.category === 'interest' || fact.category === 'goal') m *= 1.5;
  if (fact.category === 'interest' && (CHOSEN_CUE.test(fact.value) || chosen.has(normalize(fact.value)))) m *= 2;
  return m;
}

function scoreConcept(concept: Concept, facts: Fact[], chosen: Set<string>): Scored {
  const matches: Match[] = [];
  let score = 0;
  for (const fact of facts) {
    let raw = 0;
    let bestAt: number | undefined;
    let bestWeight = 0;
    for (const t of compiledTriggers(concept)) {
      const m = t.rx.exec(fact.value);
      if (!m) continue;
      raw += t.weight;
      if (t.weight > bestWeight || (t.weight === bestWeight && bestAt === undefined)) { bestWeight = t.weight; bestAt = m.index; }
    }
    if (raw <= 0) continue;
    const weight = Math.min(raw, 9) * factMultiplier(fact, chosen);
    score += weight;
    matches.push({ id: fact.id, category: fact.category, value: fact.value, ...(bestAt !== undefined ? { at: bestAt } : {}), weight });
  }
  matches.sort((a, b) => b.weight - a.weight || a.id.localeCompare(b.id));
  return { concept, score, matches };
}

function excludedByExistingApps(concept: Concept, existing: RecommendInput['existingApps']): boolean {
  const t = normalize(concept.title);
  return existing.some((a) => {
    const n = normalize(a.name);
    return n === t || (n.length >= 6 && t.includes(n)) || (t.length >= 6 && n.includes(t));
  });
}

/** Pick `count` results, keeping at least one work and one explore when both have matches. */
function select(scored: Scored[], count: number): Scored[] {
  const ranked = scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score); // stable: catalog order breaks ties
  const picked = ranked.slice(0, count);
  for (const purpose of ['work', 'explore'] as const) {
    if (picked.some((s) => s.concept.purpose === purpose)) continue;
    const candidate = ranked.find((s) => s.concept.purpose === purpose);
    if (!candidate || picked.length === 0) continue;
    if (picked.length < count) { picked.push(candidate); continue; }
    // Replace the lowest-scored item of the over-represented purpose.
    for (let i = picked.length - 1; i >= 0; i--) {
      const p = picked[i];
      if (p && p.concept.purpose !== purpose) { picked[i] = candidate; break; }
    }
  }
  return picked.sort((a, b) => b.score - a.score);
}

/** Four short lines that preview what the app would look like. */
export function previewLinesFor(spec: AppSpecInput): string[] {
  const fields = spec.fields.filter((x) => !x.hidden);
  const label = (id: string | undefined) => fields.find((x) => x.id === id)?.label;
  const lines: string[] = [];
  const rotation = spec.rules?.find((r) => r.type === 'prompt_rotation');
  const due = spec.rules?.find((r) => r.type === 'due_soon');
  if (spec.pattern === 'board') {
    const board = spec.views.find((v) => v.type === 'board');
    const stage = board && board.type === 'board' ? fields.find((x) => x.id === board.stageFieldId) : undefined;
    if (stage?.type === 'select') lines.push(`Stages: ${stage.options.map((o) => o.label).join(' > ')}`);
    if (board && board.type === 'board') {
      const title = label(board.titleFieldId);
      if (title) lines.push(title);
      for (const id of board.cardFieldIds ?? []) { const l = label(id); if (l && l !== title) lines.push(l); }
    }
    if (due) lines.push(`Highlights anything due within ${due.withinDays ?? 3} days`);
  } else if (spec.pattern === 'tracker') {
    const summary = spec.views.find((v) => v.type === 'summary');
    if (summary && summary.type === 'summary') for (const m of summary.metrics.slice(0, 2)) lines.push(m.label);
    for (const x of fields) if (x.type !== 'date' && lines.length < 6) lines.push(x.label);
  } else {
    for (const x of fields) if (x.type !== 'date' && lines.length < 3) lines.push(x.label);
    if (rotation && rotation.prompts[0]) lines.push(`${rotation.cadence === 'daily' ? 'Today' : 'This week'}: ${rotation.prompts[0]}`);
    else {
      const summary = spec.views.find((v) => v.type === 'summary');
      if (summary && summary.type === 'summary') lines.push(`Tracks: ${summary.metrics.map((m) => m.label.toLowerCase()).join(', ')}`);
    }
  }
  const out = uniq(lines.map((l) => clip(l, 60)).filter((l) => l.length > 0)).slice(0, 4);
  return out.length ? out : [clip(spec.tagline ?? spec.name, 60)];
}

function draftFor(concept: Concept, matches: MatchedFact[], reason: string): RecommendationDraft {
  const spec = concept.buildSpec({ instructions: '' });
  AppSpecSchema.parse(spec); // every concept must build a valid app
  const draft: RecommendationDraft = {
    conceptId: concept.id,
    title: clip(concept.title, 50),
    purpose: concept.purpose,
    pattern: concept.pattern,
    icon: concept.icon,
    tagline: clip(concept.tagline, 120),
    description: clip(concept.description, 500),
    reason: clip(reason, 400),
    evidenceFactIds: uniq(matches.map((m) => m.id)).slice(0, 8),
    firstAction: clip(concept.firstAction, 200),
    previewLines: previewLinesFor(spec),
  };
  return RecommendationDraftSchema.parse(draft);
}

export function recommend(input: RecommendInput): RecommendationDraft[] {
  const facts = input.facts.filter((x) => x.status !== 'removed' && x.value.trim().length > 0);
  if (facts.length === 0) return [];
  const count = Math.max(1, Math.min(8, Math.floor(input.count) || 4));
  const chosen = new Set((input.chosenInterests ?? []).map(normalize).filter(Boolean));
  const available = CONCEPTS.filter((c) => !excludedByExistingApps(c, input.existingApps ?? []));
  const scored = available.map((c) => scoreConcept(c, facts, chosen));
  const picked = select(scored, count);

  // Fallback facts to cite when a concept did not match anything: the most confident fact.
  const anchor = [...facts].sort((a, b) => b.confidence - a.confidence || a.id.localeCompare(b.id))[0] as Fact;
  const anchorMatch: MatchedFact = { id: anchor.id, category: anchor.category, value: anchor.value };

  const out: RecommendationDraft[] = [];
  for (const s of picked) out.push(draftFor(s.concept, s.matches.slice(0, 8), s.concept.reasonTemplate(s.matches.slice(0, 3))));

  if (out.length < count) {
    const sparse = out.length === 0;
    for (const id of DEFAULT_CONCEPT_IDS) {
      if (out.length >= count) break;
      const concept = conceptById(id);
      if (!concept || out.some((d) => d.conceptId === id) || !available.includes(concept)) continue;
      out.push(draftFor(concept, [anchorMatch], sparse ? SPARSE_REASON : FILL_REASON));
    }
  }
  return out;
}
