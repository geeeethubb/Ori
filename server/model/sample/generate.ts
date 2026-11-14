/**
 * Build a validated app from a recommendation plus the person's instructions, in sample mode.
 * The concept supplies a genuinely different base app; instructions are applied through the shared
 * heuristics; the result is always validated against AppSpecSchema before it is returned.
 */
import { AppSpecSchema, type AppSpec } from '../../../shared/appSpec.ts';
import type { GeneratedApp, RecommendationDraft } from '../../../shared/context.ts';
import { ModelOutputError, type GenerateSpecInput } from '../types.ts';
import { CONCEPTS, conceptById, conceptByTitle, type Concept } from './catalog.ts';
import { applyInstructionHeuristics, type Unsupported } from './heuristics.ts';
import { clip, joinNatural } from './text.ts';

/** The catalog concept behind a recommendation (by id, then title, then pattern and purpose). */
export function conceptForRecommendation(rec: Pick<RecommendationDraft, 'conceptId' | 'title' | 'pattern' | 'purpose'>): Concept {
  return (
    conceptById(rec.conceptId) ??
    conceptByTitle(rec.title) ??
    CONCEPTS.find((c) => c.pattern === rec.pattern && c.purpose === rec.purpose) ??
    CONCEPTS.find((c) => c.pattern === rec.pattern) ??
    (CONCEPTS[0] as Concept)
  );
}

export function generateSpec(input: GenerateSpecInput): GeneratedApp & { spec: AppSpec } {
  const concept = conceptForRecommendation(input.recommendation);
  const base = concept.buildSpec({ instructions: '' });
  // The person chose this card: keep its title, tagline and icon on the app they get.
  const title = clip(input.recommendation.title, 60);
  if (title.length >= 1) base.name = title;
  base.tagline = clip(input.recommendation.tagline, 120);
  base.icon = input.recommendation.icon;

  const instructions = (input.instructions ?? '').slice(0, 4000);
  const result = applyInstructionHeuristics(base, instructions, concept.id);
  let changes = result.changes;
  const unsupported: Unsupported[] = [...result.unsupported];

  let parsed = AppSpecSchema.safeParse(result.spec);
  if (!parsed.success) {
    // Defensive: fall back to the untouched base app and say what was left out.
    parsed = AppSpecSchema.safeParse(base);
    if (!parsed.success) throw new ModelOutputError('The sample app definition did not pass validation.', parsed.error.issues);
    unsupported.push({
      request: clip(instructions, 400),
      reason: 'Those changes could not be applied safely to this app.',
      alternative: 'Build the app first, then ask for the change with Make a change.',
    });
    changes = [];
  }
  const spec = parsed.data;
  return { spec, description: describe(spec, concept, changes, unsupported.length), unsupported };
}

function describe(spec: AppSpec, concept: Concept, changes: string[], unsupportedCount: number): string {
  const what = concept.description.replace(/\.$/, '');
  const first = /^(?:a|an)\s/i.test(what)
    ? `${spec.name} is ${what[0]?.toLowerCase()}${what.slice(1)}.`
    : `${spec.name}: ${what}.`;
  let second: string;
  if (changes.length) second = `From your instructions, we ${joinNatural(changes)}.`;
  else if (unsupportedCount) second = 'The requested extras are not supported yet, so it starts with the fields above; see the note below.';
  else second = 'It starts with the fields above, and you can change anything later with Make a change.';
  if (changes.length && unsupportedCount) second += ' One request is not supported yet; see the note below.';
  return clip(`${first} ${second}`, 600);
}
