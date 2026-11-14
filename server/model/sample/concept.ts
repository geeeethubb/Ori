/**
 * Concept: one entry of the sample-mode catalog. A concept knows what in a person's context makes
 * it relevant (triggers), how to explain the fit in the person's own words (reasonTemplate), and
 * how to build a genuinely different app for it (buildSpec).
 */
import type { AppIcon, AppSpecInput, Pattern, Purpose } from '../../../shared/appSpec.ts';
import type { ProfileFact } from '../../../shared/context.ts';
import { applyInstructionHeuristics } from './heuristics.ts';
import { clip, joinNatural, quote, snippet } from './text.ts';

/** A profile fact that matched a concept, with the character offset of the best trigger match. */
export type MatchedFact = Pick<ProfileFact, 'id' | 'category' | 'value'> & { at?: number };

export interface Concept {
  id: string;
  title: string;
  purpose: Purpose;
  pattern: Pattern;
  icon: AppIcon;
  tagline: string;
  description: string;
  /** Lower-case keywords and phrases matched against fact text (synonyms included). */
  triggers: string[];
  /** "Why this fits you", quoting the matched facts. Must stay within 400 characters. */
  reasonTemplate: (matchedFacts: MatchedFact[]) => string;
  firstAction: string;
  /** Build the app; instructions are honoured through the shared heuristics. */
  buildSpec: (opts: { instructions: string }) => AppSpecInput;
}

export interface ConceptDef {
  id: string;
  title: string;
  purpose: Purpose;
  pattern: Pattern;
  icon: AppIcon;
  tagline: string;
  description: string;
  triggers: string[];
  firstAction: string;
  /** Opening words before the quotes; defaults to "You mentioned". */
  lead?: string;
  /** Sentence after the quotes that explains what the app does about it. */
  because: string;
  /** The base app, before any instructions. */
  base: () => AppSpecInput;
}

export function defineConcept(def: ConceptDef): Concept {
  const { base, because, lead, ...rest } = def;
  return {
    ...rest,
    triggers: def.triggers.map((t) => t.toLowerCase().trim()).filter(Boolean),
    reasonTemplate: (facts) => reasonFrom(lead ?? 'You mentioned', facts, because),
    buildSpec: ({ instructions }) => (instructions && instructions.trim() ? applyInstructionHeuristics(base(), instructions, def.id).spec : base()),
  };
}

/** Up to `max` short quotes in the person's own words. */
export function quotedFacts(facts: MatchedFact[], max = 3, width = 60): string[] {
  return facts.slice(0, max).map((x) => quote(snippet(x.value, x.at, width)));
}

export function reasonFrom(lead: string, facts: MatchedFact[], because: string): string {
  const quotes = quotedFacts(facts);
  const head = quotes.length ? `${lead} ${joinNatural(quotes)}.` : '';
  // Only the person's own words appear in double quotes, so the UI can trust them as citations.
  return clip(`${head} ${because.replace(/"/g, "'")}`.trim(), 400);
}
