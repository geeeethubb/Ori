/**
 * Improvement suggestions from real usage: deterministic rules over events, records and the spec,
 * plus explicit feedback mapped through the same instruction heuristics the revision flow uses.
 * Returns null when nothing applies; the product never rewrites an app silently.
 */
import { dueStatus } from '../../../shared/rules.ts';
import { daysBetween, todayIso } from '../../../shared/time.ts';
import type { ImprovementSuggestion, SuggestInput } from '../types.ts';
import { planInstructions, typeWord, type Intent } from './heuristics.ts';
import { STOPWORDS, clip, quote, sentenceCase } from './text.ts';

const FORGET = /\b(forget|forgot|forgetting|miss(?:ed|ing)?|late|slip(?:s|ped)?|overdue|behind|lose track|lost track)\b/i;
const BORING = /\b(boring|bored|stale|repetitive|same thing|uninspired|blank page|don't know what to write|dont know what to write|stuck|dull|monotonous)\b/i;
const VERBS = new Set(['add', 'track', 'record', 'note', 'log', 'capture', 'keep', 'want', 'wish', 'would', 'could', 'should', 'make', 'put', 'see', 'show', 'include', 'have', 'need', 'field', 'column', 'app', 'entry', 'entries', 'thing', 'way', 'place', 'something', 'please', 'really', 'maybe', 'more', 'also', 'able', 'nice', 'great', 'love', 'like']);

export function suggestImprovement(input: SuggestInput, now: Date = new Date()): ImprovementSuggestion | null {
  const { spec, records, events } = input;
  const hasDueRule = spec.rules.some((r) => r.type === 'due_soon');
  const hasPrompts = spec.rules.some((r) => r.type === 'prompt_rotation');

  const feedback = (input.feedback ?? '').trim().slice(0, 1000);
  if (feedback) {
    const said = `You said ${quote(clip(feedback, 120))}.`;
    if (FORGET.test(feedback) && !hasDueRule) {
      return {
        title: 'Add due dates with a heads-up',
        why: `${said} A due date on each item highlights anything due soon or overdue when you open the app.`,
        request: 'Add a due date and highlight items due soon',
      };
    }
    if (BORING.test(feedback) && !hasPrompts) {
      return {
        title: 'Add a weekly challenge',
        why: `${said} A rotating prompt gives each week a fresh angle without changing anything else.`,
        request: 'Add a weekly challenge',
      };
    }
    const intents = planInstructions(spec, feedback).filter((i): i is Exclude<Intent, { kind: 'unsupported' | 'exists' }> => i.kind !== 'unsupported' && i.kind !== 'exists');
    const first = intents[0];
    if (first) return fromIntent(first, said);
    const noun = mainNoun(feedback, spec.fields.map((f) => f.label));
    if (noun) {
      return {
        title: `Add a ${quote(noun)} field`,
        why: `${said} A short field for ${noun.toLowerCase()} on each ${spec.entryNoun.singular} keeps it where you will see it.`,
        request: `Add a short text field called ${noun}`,
      };
    }
    return null;
  }

  // Overdue cards piling up on a board.
  const dueRule = spec.rules.find((r) => r.type === 'due_soon');
  if (spec.pattern === 'board' && dueRule && dueRule.type === 'due_soon') {
    const overdue = records.filter((r) => dueStatus({ id: 'r', appId: 'a', values: r.values, createdAt: r.createdAt, updatedAt: r.createdAt }, dueRule, now) === 'overdue').length;
    if (overdue >= 2 && !spec.fields.some((f) => !f.hidden && /next step/i.test(f.label))) {
      return {
        title: `Add a ${quote('Next step')} field`,
        why: `${overdue} ${spec.entryNoun.plural} are overdue. Writing the single next step on each card makes it easier to pick one up.`,
        request: 'Add a short text field called Next step',
      };
    }
  }

  if (spec.pattern === 'journal' && records.length >= 3 && !spec.fields.some((f) => f.type === 'rating' && !f.hidden)) {
    return {
      title: 'Rate each entry',
      why: `You have ${records.length} ${spec.entryNoun.plural}. A quick 1 to 5 rating lets the summary show how things are trending.`,
      request: 'Add a 1-5 rating field called How did it go?',
    };
  }

  if (spec.pattern === 'tracker' && records.length >= 5 && !spec.fields.some((f) => f.type === 'long_text' && !f.hidden)) {
    return {
      title: 'Add notes for next time',
      why: `After ${records.length} ${spec.entryNoun.plural}, a notes field captures what to do differently next time.`,
      request: 'Add a long text field called Notes',
    };
  }

  if (records.length >= 1 && !hasPrompts) {
    const saves = events.filter((e) => e.type === 'item_saved' || e.type === 'first_item_saved').map((e) => e.at.slice(0, 10)).sort();
    const lastSave = saves[saves.length - 1];
    const reference = lastSave ?? records.map((r) => r.createdAt.slice(0, 10)).sort().pop();
    const gap = reference ? daysBetween(reference, todayIso(now)) : null;
    if (gap !== null && gap >= 10) {
      return {
        title: 'Make it lighter: a daily prompt',
        why: `It has been ${gap} days since your last ${spec.entryNoun.singular}. A rotating prompt lowers the bar to a couple of lines.`,
        request: 'Add a daily prompt',
      };
    }
  }

  return null;
}

function fromIntent(intent: Exclude<Intent, { kind: 'unsupported' | 'exists' }>, said: string): ImprovementSuggestion {
  switch (intent.kind) {
    case 'add_field':
      return {
        title: `Add a ${quote(intent.field.label)} field`,
        why: `${said} A ${typeWord(intent.field)} field makes room for it on every entry.`,
        request: `Add a ${typeWord(intent.field)} field called ${intent.field.label.replace(/[?.]+$/, '')}`,
      };
    case 'unhide_field':
      return { title: 'Bring a field back', why: `${said} That field exists and is hidden; showing it again keeps its old values.`, request: `Show the field ${intent.fieldId.replace(/_/g, ' ')}` };
    case 'prompt_rotation':
      return {
        title: intent.cadence === 'daily' ? 'Add a daily prompt' : 'Add a weekly challenge',
        why: `${said} A rotating ${intent.cadence} prompt gives you something fresh to respond to.`,
        request: intent.cadence === 'daily' ? 'Add a daily prompt' : 'Add a weekly challenge',
      };
    case 'due_date':
      return { title: 'Add due dates with a heads-up', why: `${said} Items due within three days are highlighted when you open the app.`, request: 'Add a due date and highlight items due soon' };
    case 'rename':
      return { title: `Rename to ${quote(intent.name)}`, why: said, request: `Rename the app to ${intent.name}` };
    case 'practice_preset':
      return {
        title: `Start the timer at ${intent.minutes} minutes`,
        why: `${said} The timer offers the minutes you actually have first; the other presets stay.`,
        request: `Add a ${intent.minutes}-minute preset to the practice timer as the default`,
      };
  }
}

/** The most field-worthy noun in a piece of feedback, skipping words already used as labels. */
function mainNoun(feedback: string, labels: string[]): string | undefined {
  const used = new Set(labels.flatMap((l) => l.toLowerCase().split(/\W+/)));
  const words = feedback.toLowerCase().replace(/[^a-z0-9\s'-]/g, ' ').split(/\s+/).filter(Boolean);
  const candidates = words.filter((w) => w.length >= 4 && !STOPWORDS.has(w) && !VERBS.has(w) && !used.has(w) && !/^(the|this|that|with|from|into|about|when|where|every|each|some)$/.test(w));
  const best = candidates.sort((a, b) => b.length - a.length || words.indexOf(a) - words.indexOf(b))[0];
  return best ? sentenceCase(best) : undefined;
}
