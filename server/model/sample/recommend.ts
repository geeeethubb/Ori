/**
 * Deterministic Playground recommendations: score every catalog concept (the redesign's reference
 * concepts Riff / Light / People first, then the original catalog) against the person's approved
 * facts and recent captures, keep both purposes represented, show at most one reference app per
 * need, add one exploration (no app needed) when the context clearly supports it, and explain each
 * pick by quoting the facts or captures that matched. Nothing here invents links or availability.
 */
import { AppSpecSchema, type AppSpecInput } from '../../../shared/appSpec.ts';
import { RecommendationDraftSchema, type RecommendationDraft } from '../../../shared/context.ts';
import type { RecommendInput } from '../types.ts';
import { CONCEPTS, DEFAULT_CONCEPT_IDS, PLAYGROUND_CONCEPTS, conceptById, type Concept, type MatchedFact } from './catalog.ts';
import { reasonFrom } from './concept.ts';
import { DOMAINS, domainForConcept, exploreDraft, minutesIn } from './domains.ts';
import { clip, escapeRegExp, normalize, snippet, uniq } from './text.ts';

type Fact = RecommendInput['facts'][number];
type RecentCapture = NonNullable<RecommendInput['recentCaptures']>[number];

interface Match extends MatchedFact { weight: number }
interface Scored { concept: Concept; score: number; matches: Match[] }

export const SPARSE_REASON = "We don't know much about you yet; these are popular starting points. Add context for better matches.";
export const FILL_REASON = 'A popular starting point for many people. Add more context and the matches get closer to you.';
/** Captures are scored like facts; their ids carry this prefix so citations can be split again. */
export const CAPTURE_FACT_PREFIX = 'capture:';
/** A domain concept must score at least this (roughly two matching facts, or one strong phrase) to earn an exploration. */
export const EXPLORE_THRESHOLD = 3;

const CHOSEN_CUE = /\b(want to (?:start|learn|try|get into|pick up)|would like to (?:start|learn|try)|hoping to (?:start|learn|try)|curious about|new interest|thinking of (?:starting|learning|trying)|start learning|getting into)\b/i;
/** Patterns distinctive enough that one app of the kind is enough. */
const NEW_PATTERNS = new Set<string>(['practice', 'gallery', 'queue']);
/** Reference concepts first, so they win catalog-order tie-breaks. */
const SCORED_CONCEPTS: Concept[] = [...PLAYGROUND_CONCEPTS, ...CONCEPTS];

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

/** Recent captures (notes, link titles) scored like confirmed interest facts, in the person's own words. */
function captureFacts(captures: RecentCapture[] = []): Fact[] {
  const out: Fact[] = [];
  for (const c of captures) {
    const value = clip([c.text?.trim(), c.linkMeta?.title?.trim()].filter(Boolean).join(' — '), 240);
    if (value.length < 3) continue;
    out.push({ id: `${CAPTURE_FACT_PREFIX}${c.id}`, category: 'interest', value, status: 'confirmed', confidence: 0.7 });
  }
  return out;
}

function splitIds(matches: MatchedFact[]): { factIds: string[]; captureIds: string[] } {
  const ids = uniq(matches.map((m) => m.id));
  return {
    factIds: ids.filter((id) => !id.startsWith(CAPTURE_FACT_PREFIX)),
    captureIds: ids.filter((id) => id.startsWith(CAPTURE_FACT_PREFIX)).map((id) => id.slice(CAPTURE_FACT_PREFIX.length)),
  };
}

function excludedByExistingApps(concept: Concept, existing: RecommendInput['existingApps']): boolean {
  const t = normalize(concept.title);
  return existing.some((a) => {
    const n = normalize(a.name);
    if (n === t || (n.length >= 6 && t.includes(n)) || (t.length >= 6 && n.includes(t))) return true;
    return NEW_PATTERNS.has(concept.pattern) && a.pattern === concept.pattern;
  });
}

/** Concepts the person could still build: an existing app rules out its whole family (reference + original). */
function availableConcepts(existing: RecommendInput['existingApps']): Concept[] {
  const excluded = new Set(SCORED_CONCEPTS.filter((c) => excludedByExistingApps(c, existing)).map((c) => c.id));
  for (const d of DOMAINS) {
    if (excluded.has(d.conceptId) || excluded.has(d.legacyConceptId)) { excluded.add(d.conceptId); excluded.add(d.legacyConceptId); }
  }
  return SCORED_CONCEPTS.filter((c) => !excluded.has(c.id));
}

/** One app per need: when a reference concept matches at all, its original sibling steps aside. */
function dedupeFamilies(scored: Scored[]): Scored[] {
  const drop = new Set<string>();
  for (const d of DOMAINS) {
    const ref = scored.find((s) => s.concept.id === d.conceptId);
    const legacy = scored.find((s) => s.concept.id === d.legacyConceptId);
    if (ref && legacy) drop.add(ref.score > 0 ? legacy.concept.id : ref.concept.id);
  }
  return scored.filter((s) => !drop.has(s.concept.id));
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
  const rotationLine = rotation && rotation.prompts[0] ? `${rotation.title ?? (rotation.cadence === 'daily' ? 'Today' : 'This week')}: ${rotation.prompts[0]}` : null;
  const due = spec.rules?.find((r) => r.type === 'due_soon');
  const summary = spec.views.find((v) => v.type === 'summary');
  const summaryLine = summary && summary.type === 'summary' ? `Tracks: ${summary.metrics.map((m) => m.label.toLowerCase()).join(', ')}` : null;
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
    if (summary && summary.type === 'summary') for (const m of summary.metrics.slice(0, 2)) lines.push(m.label);
    for (const x of fields) if (x.type !== 'date' && lines.length < 6) lines.push(x.label);
  } else if (spec.pattern === 'practice') {
    const practice = spec.views.find((v) => v.type === 'practice');
    if (practice && practice.type === 'practice') {
      lines.push(`Timer: ${(practice.presets ?? [10, 15, 25]).join(' / ')} min`);
      if (practice.tempoHelper !== false) lines.push(`Metronome from ${practice.defaultTempo ?? 72} bpm`);
    }
    if (spec.views.some((v) => v.type === 'links')) lines.push('Saved songs, riffs and lessons');
    if (rotationLine) lines.push(rotationLine);
  } else if (spec.pattern === 'gallery') {
    const gallery = spec.views.find((v) => v.type === 'gallery');
    if (gallery && gallery.type === 'gallery') {
      lines.push(`Contact sheet of your photos, ${gallery.columns ?? 3} across`);
      const caption = label(gallery.captionFieldId);
      if (caption) lines.push(caption);
    }
    if (rotationLine) lines.push(rotationLine);
    else if (summaryLine) lines.push(summaryLine);
  } else if (spec.pattern === 'queue') {
    const queue = spec.views.find((v) => v.type === 'queue');
    if (queue && queue.type === 'queue') {
      lines.push(`Grouped by ${queue.groupBy === 'person' ? 'person' : 'what is due'}`);
      for (const id of [queue.actionFieldId, queue.contextFieldId]) { const l = label(id); if (l) lines.push(l); }
    }
    if (fields.some((x) => x.type === 'long_text' && /draft/i.test(x.label))) lines.push('Drafts you copy; nothing is sent for you');
    if (due) lines.push(`Highlights anything due within ${due.withinDays ?? 3} days`);
  } else {
    for (const x of fields) if (x.type !== 'date' && lines.length < 3) lines.push(x.label);
    if (rotationLine) lines.push(rotationLine);
    else if (summaryLine) lines.push(summaryLine);
  }
  const out = uniq(lines.map((l) => clip(l, 60)).filter((l) => l.length > 0)).slice(0, 4);
  return out.length ? out : [clip(spec.tagline ?? spec.name, 60)];
}

/** Capabilities a catalog concept's pattern exercises (shown on cards before a spec exists). */
export function capabilitiesForPattern(pattern: Concept['pattern']): RecommendationDraft['capabilities'] {
  switch (pattern) {
    case 'practice': return ['practice_timer', 'tempo', 'source_links', 'summary', 'prompts'];
    case 'gallery': return ['gallery', 'photo_upload', 'summary', 'prompts'];
    case 'queue': return ['next_actions', 'due_soon', 'summary'];
    case 'board': return ['board', 'due_soon', 'summary'];
    case 'tracker': return ['list', 'summary'];
    default: return ['journal', 'summary'];
  }
}

function draftFor(concept: Concept, matches: MatchedFact[], reason: string): RecommendationDraft {
  const input = concept.buildSpec({ instructions: '' });
  const spec = AppSpecSchema.parse(input); // every concept must build a valid app
  const { factIds, captureIds } = splitIds(matches);
  return RecommendationDraftSchema.parse({
    conceptId: concept.id,
    kind: 'new_app',
    title: clip(concept.title, 50),
    purpose: concept.purpose,
    pattern: concept.pattern,
    icon: concept.icon,
    tagline: clip(concept.tagline, 120),
    description: clip(concept.description, 500),
    reason: clip(reason, 400),
    evidenceFactIds: factIds.slice(0, 8),
    sourceCaptureIds: captureIds.slice(0, 4),
    firstAction: clip(concept.firstAction, 200),
    previewLines: previewLinesFor(input),
    capabilities: capabilitiesForPattern(concept.pattern),
    ...(spec.design ? { design: spec.design } : {}),
  });
}

/**
 * One exploration (no app needed) when the strongest domain concept clearly matches, even if the
 * person already owns that app: a light walk for photography, a listening-and-playing session for
 * music, a follow-up sprint for people. Steps use only the person's own words and general practice.
 */
function explorationFor(scoredAll: Scored[]): RecommendationDraft | null {
  const ranked = scoredAll.filter((s) => s.score > 0).sort((a, b) => b.score - a.score);
  const top = ranked.find((s) => domainForConcept(s.concept.id));
  if (!top || top.score < EXPLORE_THRESHOLD || top.matches.length === 0) return null;
  const domain = domainForConcept(top.concept.id);
  const best = top.matches[0];
  if (!domain || !best) return null;
  const minutes = top.matches.map((m) => minutesIn(m.value)).find((n): n is number => n !== null) ?? null;
  const { factIds, captureIds } = splitIds(top.matches.slice(0, 4));
  return exploreDraft(domain, { words: snippet(best.value, best.at, 60), minutes, source: null }, {
    evidenceFactIds: factIds,
    sourceCaptureIds: captureIds,
    reason: reasonFrom('You mentioned', top.matches.slice(0, 2), domain.explore.because),
  });
}

export function recommend(input: RecommendInput): RecommendationDraft[] {
  const facts = input.facts.filter((x) => x.status !== 'removed' && x.value.trim().length > 0);
  const fromCaptures = captureFacts(input.recentCaptures);
  const all = [...facts, ...fromCaptures];
  if (all.length === 0) return [];
  const count = Math.max(1, Math.min(8, Math.floor(input.count) || 4));
  const chosen = new Set((input.chosenInterests ?? []).map(normalize).filter(Boolean));
  const existing = input.existingApps ?? [];

  const scoredAll = SCORED_CONCEPTS.map((c) => scoreConcept(c, all, chosen));
  const exploration = count > 1 ? explorationFor(scoredAll) : null;
  const appCount = exploration ? count - 1 : count;

  const available = availableConcepts(existing);
  const availableIds = new Set(available.map((c) => c.id));
  const picked = select(dedupeFamilies(scoredAll.filter((s) => availableIds.has(s.concept.id))), appCount);

  // Fallback citation when a concept did not match anything: the most confident fact (or capture).
  const anchorPool = facts.length ? facts : fromCaptures;
  const anchor = [...anchorPool].sort((a, b) => b.confidence - a.confidence || a.id.localeCompare(b.id))[0] as Fact;
  const anchorMatch: MatchedFact = { id: anchor.id, category: anchor.category, value: anchor.value };

  const out: RecommendationDraft[] = [];
  for (const s of picked) out.push(draftFor(s.concept, s.matches.slice(0, 8), s.concept.reasonTemplate(s.matches.slice(0, 3))));

  if (out.length < appCount) {
    const sparse = out.length === 0;
    for (const id of DEFAULT_CONCEPT_IDS) {
      if (out.length >= appCount) break;
      const concept = conceptById(id);
      if (!concept || out.some((d) => d.conceptId === id) || !availableIds.has(concept.id)) continue;
      out.push(draftFor(concept, [anchorMatch], sparse ? SPARSE_REASON : FILL_REASON));
    }
  }
  if (exploration) out.splice(Math.min(1, out.length), 0, exploration);
  return out;
}
