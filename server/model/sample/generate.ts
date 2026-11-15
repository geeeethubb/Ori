/**
 * Build a validated app from a proposal plus the person's instructions and choices, in sample mode.
 * The concept supplies a genuinely different base app; instructions are applied through the shared
 * heuristics; choices (time budget, look, goal) are applied directly; the result is always validated
 * against AppSpecSchema before it is returned, and falls back to the untouched base app if an
 * instruction would have broken it. A length the person asked for (their choice on the Make page, or
 * the proposal's suggestedMinutes) is the timer's first preset, and the copy says that length too.
 */
import { AppSpecSchema, type AppSpec, type AppSpecInput } from '../../../shared/appSpec.ts';
import type { GeneratedApp, RecommendationDraft } from '../../../shared/context.ts';
import { ModelOutputError, type GenerateSpecInput } from '../types.ts';
import { ALL_CONCEPTS, CONCEPTS, conceptById, conceptByTitle, type Concept } from './catalog.ts';
import { rewriteMinutes } from './durations.ts';
import { applyInstructionHeuristics, type Unsupported } from './heuristics.ts';
import { alignSpecDurations, defaultSessionMinutes } from './revisionCopy.ts';
import { findUnsupported } from './unsupported.ts';
import { clip, joinNatural } from './text.ts';

/** The catalog concept behind a proposal (by id, then title, then pattern and purpose). */
export function conceptForRecommendation(rec: Pick<RecommendationDraft, 'conceptId' | 'title' | 'pattern' | 'purpose'>): Concept {
  return (
    conceptById(rec.conceptId) ??
    conceptByTitle(rec.title) ??
    ALL_CONCEPTS.find((c) => c.pattern === rec.pattern && c.purpose === rec.purpose) ??
    ALL_CONCEPTS.find((c) => c.pattern === rec.pattern) ??
    (CONCEPTS[0] as Concept)
  );
}

/** Apply the one or two choices the person made before "Make mine". */
export function applyChoices(spec: AppSpecInput, choices: GenerateSpecInput['choices']): string[] {
  const changes: string[] = [];
  if (!choices) return changes;
  if (choices.timeBudgetMinutes) {
    const minutes = choices.timeBudgetMinutes;
    let applied = false;
    // Practice timers: the budget becomes the first (default) preset.
    for (const v of spec.views) {
      if (v.type !== 'practice') continue;
      const rest = (v.presets ?? [10, 15, 25]).filter((p) => p !== minutes);
      v.presets = [minutes, ...rest].slice(0, 6);
      applied = true;
    }
    // No timer (e.g. a tracker): the minutes field, if any, defaults to the budget instead.
    if (!applied) {
      const minutesField = spec.fields.find((x) => x.type === 'number' && !x.hidden && (x.unit === 'min' || /minute/i.test(x.label)));
      if (minutesField && minutesField.type === 'number') {
        minutesField.default = minutes;
        applied = true;
      }
    }
    if (applied) changes.push(`set the default session to ${minutes} minutes`);
  }
  if (choices.look) {
    spec.design = { ...(spec.design ?? {}), theme: choices.look };
    changes.push(`used the ${choices.look} look`);
  }
  if (choices.goal && choices.goal.trim()) {
    const goal = clip(choices.goal.trim(), 100);
    spec.tagline = goal;
    changes.push(`made “${goal}” the app's line`);
  }
  return changes;
}

export function generateSpec(input: GenerateSpecInput): GeneratedApp & { spec: AppSpec } {
  const concept = conceptForRecommendation(input.recommendation);
  const base = concept.buildSpec({ instructions: '' });
  // The person chose this card: keep its title, tagline and icon on the app they get, unless the
  // card is a reference concept whose own identity is the point.
  const rec = input.recommendation;
  const keepsOwnIdentity = /^(riff|light|people)$/i.test(concept.title) && rec.conceptId === concept.id;
  if (!keepsOwnIdentity) {
    const title = clip(rec.title, 60);
    if (title.length >= 1) base.name = title;
    base.tagline = clip(rec.tagline, 120);
    base.icon = rec.icon;
  }
  if (rec.design) base.design = { ...(base.design ?? {}), ...rec.design };

  // A length the person asked for outranks the template's default: their choice on the Make page, else
  // the proposal's suggestedMinutes ("a ten-minute session", "half an hour"). Copy that states the
  // template's length says the new one (tagline, hint, tab names, buttons, prompt titles, description).
  const templateMinutes = defaultSessionMinutes(base);
  const asked = input.choices?.timeBudgetMinutes ?? rec.suggestedMinutes;
  const choices = asked ? { ...(input.choices ?? {}), timeBudgetMinutes: asked } : input.choices;
  const choiceChanges = applyChoices(base, choices);
  const afterChoices = defaultSessionMinutes(base);
  if (templateMinutes && afterChoices) alignSpecDurations(base, templateMinutes, afterChoices);
  const instructions = (input.instructions ?? '').slice(0, 4000);
  const result = applyInstructionHeuristics(base, instructions, concept.id);
  const finalMinutes = defaultSessionMinutes(result.spec);
  if (afterChoices && finalMinutes) alignSpecDurations(result.spec, afterChoices, finalMinutes);
  let changes = [...choiceChanges, ...result.changes];
  const unsupported: Unsupported[] = [...result.unsupported];
  for (const cap of input.captures ?? []) {
    for (const u of findUnsupported(cap.text)) {
      if (!unsupported.some((x) => x.request === u.request)) unsupported.push({ request: u.request, reason: u.reason, alternative: u.alternative ?? '' });
    }
  }

  let parsed = AppSpecSchema.safeParse(result.spec);
  if (!parsed.success) {
    // Defensive: fall back to the base app with the choices applied and say what was left out.
    parsed = AppSpecSchema.safeParse(base);
    if (!parsed.success) throw new ModelOutputError('The sample app definition did not pass validation.', parsed.error.issues);
    unsupported.push({
      request: clip(instructions, 400),
      reason: 'Those changes could not be applied safely to this app.',
      alternative: 'Make the app first, then ask for the change with Edit with Ori.',
    });
    changes = choiceChanges;
  }
  const spec = parsed.data;
  const chose = Boolean(input.choices && Object.values(input.choices).some((v) => v !== undefined && v !== ''));
  let description = describe(spec, concept, changes, unsupported.length, chose ? 'From your choices' : 'From what you asked');
  const startsAt = defaultSessionMinutes(spec);
  if (templateMinutes && startsAt) description = rewriteMinutes(description, templateMinutes, startsAt).text;
  return { spec, description, unsupported };
}

function describe(spec: AppSpec, concept: Concept, changes: string[], unsupportedCount: number, lead: string): string {
  const what = concept.description.replace(/\.$/, '');
  const first = /^(?:a|an)\s/i.test(what)
    ? `${spec.name} is ${what[0]?.toLowerCase()}${what.slice(1)}.`
    : `${spec.name}: ${what}.`;
  let second: string;
  if (changes.length) second = `${lead}, we ${joinNatural(changes)}.`;
  else if (unsupportedCount) second = 'The requested extras are not supported yet, so it starts as shown; see the note below.';
  else second = 'It starts as shown, and you can change anything later with Edit with Ori.';
  if (changes.length && unsupportedCount) second += ' One request is not supported yet; see the note below.';
  return clip(`${first} ${second}`, 600);
}
