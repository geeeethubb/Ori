/**
 * Natural-language revision planner for sample mode. Maps a request onto the bounded set of
 * revision operations (always additive or reversible) and declines everything else with a concrete
 * supported alternative. Every proposal is dry-run through applyRevision before it is returned.
 * Besides fields, options, rules and names it understands the redesign's practice timer (presets,
 * prompts sized to a session, tempo), lists of details ("add camera settings to my photo notes") and
 * the app's look ("make it dark", "use the paper look"). The summary says what WOULD change, and copy
 * that states the old default session is brought along when the default moves.
 * A request with several parts keeps every part: a list taken out leaves a clause break ("… and hide the
 * location" stays its own request), rename pairs and hide lists are split, a whole preset list is read as
 * one, and a part that maps to nothing is named under "Not included" instead of disappearing. A photo's
 * details are placed right under its caption (reference 07).
 */
import { FieldSchema, RuleSchema, designFor, type AppSpec, type AppTheme, type FieldSpec, type ViewSpec } from '../../../shared/appSpec.ts';
import type { FieldInput, RuleInput } from './builders.ts';
import { slugifyFieldId } from '../../../shared/ids.ts';
import { RevisionProposalSchema, applyRevision, structuralFieldIds, type RevisionOp, type RevisionProposal } from '../../../shared/revision.ts';
import type { ReviseInput } from '../types.ts';
import { conceptForSpec } from './catalog.ts';
import { DURATION_SOURCE, minutesFromText } from './durations.ts';
import { alreadyHas, cleanLabel, detailAnchor, dueDatePlan, genericField, listAdditions, planInstructions, promptRotationPlan, typeWord, unlikelyName, type Intent, type Unsupported } from './heuristics.ts';
import { practicePromptsFor } from './prompts.ts';
import { alignDurationCopy, proposalSummary } from './revisionCopy.ts';
import { clip, contentTokens, jaccard, joinNatural, normalize, quote } from './text.ts';

export const NO_MATCH_SUMMARY = "I couldn't map that to a supported change";
export const SUPPORTED_HINT = 'Supported changes: add a field, hide or show a field, rename a field or the app, add a stage or option, change the due-soon window, add a weekly challenge or daily prompt, set the practice timer presets or tempo, or change the look (dark, paper, mint, lilac, sunset, bright).';

const RX = {
  clearData: /\b(?:delete|clear|remove|wipe|erase|reset)\s+(?:all\s+)?(?:the\s+|my\s+)?(?:entries|data|records|everything|history|all)\b|\bstart (?:over|fresh|from scratch)\b/i,
  typeChange: /\b(?:change|convert|turn|switch)\s+(?:the\s+)?(.+?)\s+(?:field\s+)?(?:to|into)\s+(?:a |an )?(number|numeric|date|text|short text|long text|checkbox|yes\/no|rating|choice|select|dropdown|link|url|tags?)(?:\s+field)?\b|\bmake\s+(?:the\s+)?(.+?)\s+(?:field\s+)?(?:a |an )(number|numeric|date|text|short text|long text|checkbox|rating|choice|select|link|url|tags?)(?:\s+field)\b/i,
  hide: /^(?:please\s+)?(?:remove|delete|hide|drop|get rid of|take (?:away|out|off))\s+(?:the\s+)?(.+?)(?:\s+(?:field|column|box|input|question))?$/i,
  show: /^(?:please\s+)?(?:show|unhide|bring back|restore|re-?add|add back|put back)\s+(?:the\s+)?(.+?)(?:\s+(?:field|column|box|input|question))?(?:\s+again)?$/i,
  renameTo: /^(?:please\s+)?(?:rename|change the name of|retitle|relabel|change the label of)\s+(?:the\s+)?(.+?)\s+(?:to|as|into)\s+["“']?(.+?)["”']?$/i,
  /** "Rename this app Audit Sketch Lab", "call it Evening Walks" (the app, without "to"). Group 1: an opening quote; group 2: the name. */
  renameApp: /^(?:please\s+)?(?:rename|call|name)\s+(?:this\s+app|the\s+app|this|it)\s+(?:to\s+|as\s+)?(["“']?)([^"”']{1,60}?)["”']?$/i,
  addOption: /\b(?:add|create|include|new)\s+(?:a |an |another )?(?:new )?(?:option|stage|column|status|choice|category|bucket)\s*(?:called|named|for|:)?\s*["“']?([^"”'.,;]{1,40}?)["”']?(?:\s+(?:to|in|on|under)\s+(?:the\s+)?(.+?))?$/i,
  window: /\b(?:due|window|highlight|heads?[- ]?up|warn(?:ing)?|alert|notice)\b[^.;]*?\b(\d{1,2})\s*(?:-|\s)?days?\b|\b(\d{1,2})[- ]day\s+(?:window|warning|heads?[- ]?up|notice)|\bwithin\s+(\d{1,2})\s+days?\b/i,
  required: /\bmake\s+(?:the\s+)?(.+?)\s+(?:field\s+)?(required|optional|mandatory)\b/i,
  entryNoun: /\bcall\s+(?:each\s+|the\s+|every\s+)?(?:entry|entries|item|items|card|cards|record|records)\s+(?:an?\s+)?["“']?([a-z][a-z \-]{1,30}?)["”']?$/i,
  typeWord: /^(?:date|rating|number|checkbox|tags?|link|url|text|notes?|long text|select|choice|dropdown)$/i,
  /** "size the daily prompts to 15-minute sessions", "prompts for twenty minutes". Checked before `preset`. */
  sizedPrompts: new RegExp(`\\bprompts?\\b[^.;]*?(${DURATION_SOURCE})|(${DURATION_SOURCE})[^.;]*?\\bprompts?\\b`, 'i'),
  /** "a 15-minute preset", "make the default session twenty minutes", "make 5 minutes the first and default timer preset". */
  preset: new RegExp(`(${DURATION_SOURCE})[^.;]*?\\b(?:presets?|timer|sessions?|default)\\b|\\b(?:presets?|timer|sessions?|default)\\b[^.;]*?(${DURATION_SOURCE})`, 'i'),
  /** "change the timer presets to 5, 10 and 20 minutes": the whole list, the first one the default. Checked before `preset`. */
  presetList: /\bpresets?\b(?:\s*(?:to|be|are|as|of|:))?\s*((?:\d{1,3}(?:\s*,\s*|\s*&\s*|\s*\/\s*|\s+and\s+|\s+or\s+|\s*,\s*and\s+)){1,5}\d{1,3})\s*-?\s*min(?:ute)?s?\b/i,
  /** "set the metronome to 60 bpm", "tempo 80". */
  tempo: /\b(?:tempo|metronome|bpm)\b[^.;]*?\b(\d{2,3})\b|\b(\d{2,3})\s*bpm\b/i,
  /** A clause is about the look only when it says so (keeps "add a light field" out of it). */
  lookCue: /\b(?:look|theme|colou?rs?|background|palette|style|dark(?:er)?|light mode|lighter|mode)\b/i,
};

/** Theme words, checked in order; the first match wins. */
const THEME_WORDS: [RegExp, AppTheme][] = [
  [/\b(?:charcoal|dark(?:er)?|black|night)\b/i, 'charcoal'],
  [/\b(?:ink|navy|midnight|deep blue)\b/i, 'ink'],
  [/\b(?:paper|cream|off[- ]white|warm(?:er)? white)\b/i, 'paper'],
  [/\b(?:mint|green)\b/i, 'mint'],
  [/\b(?:lilac|purple|lavender|violet)\b/i, 'lilac'],
  [/\b(?:sunset|orange|coral|warm(?:er)?)\b/i, 'sunset'],
  [/\b(?:bright|white|light mode|lighter)\b/i, 'bright'],
];

type MatchOpts = { hidden?: boolean };
type PracticeView = Extract<ViewSpec, { type: 'practice' }>;

/** Fuzzy field lookup by label, id or type word; returns the best candidate above a threshold. */
function findField(spec: AppSpec, phrase: string, opts: MatchOpts = {}): FieldSpec | undefined {
  const p = cleanPhrase(phrase);
  if (!p) return undefined;
  const pool = spec.fields.filter((f) => (opts.hidden === undefined ? true : Boolean(f.hidden) === opts.hidden));
  const n = normalize(p);
  const slug = slugifyFieldId(p);
  let best: { f: FieldSpec; score: number } | undefined;
  const phraseTokens = contentTokens(p);
  for (const f of pool) {
    const ln = normalize(f.label);
    const labelTokens = contentTokens(f.label);
    let score = 0;
    if (ln === n || f.id === slug || f.id === n.replace(/ /g, '_')) score = 1;
    else if (ln.includes(n) || n.includes(ln)) score = 0.8;
    else if (phraseTokens.length > 0 && phraseTokens.every((t) => labelTokens.includes(t))) score = 0.7;
    else score = jaccard(labelTokens, phraseTokens) * 0.9;
    if (score > (best?.score ?? 0)) best = { f, score };
  }
  if (best && best.score >= 0.45) return best.f;
  if (RX.typeWord.test(p)) {
    const t = p.toLowerCase();
    const type = t.startsWith('note') ? 'long_text' : t === 'long text' ? 'long_text' : t === 'tag' || t === 'tags' ? 'tags' : t === 'link' || t === 'url' ? 'url' : t === 'choice' || t === 'dropdown' ? 'select' : t;
    return pool.find((f) => f.type === type);
  }
  return undefined;
}

/** The phrase is this field's own name (label or id), not just a word of it. */
function isExactly(field: FieldSpec, phrase: string): boolean {
  const p = cleanPhrase(phrase);
  return normalize(field.label) === normalize(p) || field.id === slugifyFieldId(p);
}

function cleanPhrase(s: string): string {
  return s
    .replace(/^["“']+|["”']+$/g, '')
    .replace(/^(?:the|a|an|my)\s+/i, '')
    .replace(/\s+(?:field|column|box|input|question|checkbox|toggle|rating|date|number|text|select|dropdown|choice|tags?|link|option)$/i, '')
    .trim();
}

/** Fields a view or rule is organised by; hiding them would break the app's main screen. */

function viewKind(spec: AppSpec): string {
  switch (spec.pattern) {
    case 'board': return 'board';
    case 'journal': return 'journal';
    case 'gallery': return 'gallery';
    case 'practice': return 'practice room';
    case 'queue': return 'queue';
    default: return 'list';
  }
}

/** A verb that starts a new request after "and" ("… and make 5 minutes the default"); any other "and" joins a list. */
const CLAUSE_VERB = '(?:add|remove|delete|hide|show|unhide|rename|retitle|relabel|change|make|set|use|give|call|put|include|turn|switch|bring|drop|take|let|keep|move|sort|group|highlight|size|start|swap|convert|clear|wipe|reset|restore)';
const CLAUSE_SPLIT_RX = new RegExp(`(?<=[.;!?\\n])\\s+|[.;!?\\n]+\\s*|,?\\s+(?:and then|and also|then|also|plus)\\s+(?=\\S)|,?\\s+and\\s+(?=${CLAUSE_VERB}\\b)`, 'i');

/** Clauses of a request, without the "and", "then" or commas left at either end (a list taken out leaves "… and"). */
function splitClauses(text: string): string[] {
  return text
    .split(CLAUSE_SPLIT_RX)
    .map((c) => c
      .trim()
      .replace(/[.;,]+$/, '')
      .replace(/^(?:(?:and|then|also|plus|so|but)\b[\s,]*|,\s*)+/i, '')
      .replace(/(?:[\s,]+(?:and|then|also|plus|so)|\s*,)+$/i, '')
      .trim())
    .filter((c) => c.length > 0);
}

/**
 * "rename Where to Place and Keeper to Favourite" → [Where, Place], [Keeper, Favourite]. A name that
 * merely contains "and" ("Light and Shadow") stays whole: a pair splits off only when it names a field.
 */
function renamePairs(spec: AppSpec, target: string, name: string): [string, string][] {
  const pairs: [string, string][] = [];
  let t = target;
  let n = name;
  for (let i = 0; i < 5; i++) {
    const m = /^(.+?)\s*(?:,\s*(?:and\s+)?|\s+and\s+)(?:the\s+)?(.+?)\s+(?:to|as|into)\s+["“']?(.+?)["”']?$/i.exec(n);
    if (!m?.[1] || !m[2] || !m[3] || !findField(spec, m[2], { hidden: false })) break;
    pairs.push([t, m[1].trim().replace(/["“”']+$/, '')]);
    t = m[2];
    n = m[3];
  }
  pairs.push([t, n]);
  return pairs;
}

/** "the location and the mood" → ["location", "mood"]; one phrase stays one. */
function splitList(phrase: string): string[] {
  return phrase.split(/\s*(?:,|&|\band\b)\s*/i).map((p) => p.trim()).filter(Boolean);
}

function pluralize(word: string): string {
  if (/(s|x|z|ch|sh)$/i.test(word)) return `${word}es`;
  if (/[^aeiou]y$/i.test(word)) return `${word.slice(0, -1)}ies`;
  return `${word}s`;
}

const clampMinutes = (n: number) => Math.max(1, Math.min(180, Math.round(n)));

export function proposeRevision(input: ReviseInput): RevisionProposal {
  const spec = input.spec;
  const request = (input.request ?? '').replace(/\s+/g, ' ').trim().slice(0, 2000);
  const ops: RevisionOp[] = [];
  const unsupported: Unsupported[] = [];
  /** Future-tense summary sentences, keyed by the op they describe, where the generic one says too little. */
  const detail = new Map<string, string>();
  /** Asked for and already there: named when nothing else changes ("Light already has Where and Date"). */
  const existing: string[] = [];
  if (!request) return RevisionProposalSchema.parse({ summary: NO_MATCH_SUMMARY, ops: [], unsupported: [{ request: '', reason: 'The request was empty.', alternative: SUPPORTED_HINT }] });

  const structural = structuralFieldIds(spec);
  const lastVisible = [...spec.fields].reverse().find((f) => !f.hidden)?.id;
  // Ids earlier versions used stay taken: a new field never inherits an old field's saved values.
  const reserved = input.reservedFieldIds ?? [];
  const taken = new Set([...spec.fields.map((f) => f.id), ...reserved]);
  const takeId = (label: string) => { const id = slugifyFieldId(label, taken); taken.add(id); return id; };
  // New fields follow the last visible field in the order asked; a photo's details (Camera, Shutter,
  // Aperture) go right under its caption, in the form too (reference 07).
  let tail = lastVisible;
  let detailTail = detailAnchor(spec);
  const addField = (field: FieldInput, placement?: 'detail') => {
    const detail = placement === 'detail' && detailTail !== undefined;
    const after = detail ? detailTail : tail;
    ops.push({ op: 'add_field', field: FieldSchema.parse(field), ...(after ? { afterFieldId: after } : {}) });
    if (detail) detailTail = field.id; else tail = field.id;
  };
  const rule = (r: RuleInput) => RuleSchema.parse(r);
  // The practice view accumulates preset/tempo changes so several clauses end in ONE replace_view op.
  const practiceView = spec.views.find((v): v is PracticeView => v.type === 'practice');
  const practiceDraft: PracticeView | undefined = practiceView ? structuredClone(practiceView) : undefined;
  const replacePractice = () => {
    if (!practiceDraft) return;
    const i = ops.findIndex((o) => o.op === 'replace_view' && o.viewId === practiceDraft.id);
    if (i >= 0) ops.splice(i, 1);
    ops.push({ op: 'replace_view', viewId: practiceDraft.id, view: structuredClone(practiceDraft) });
  };
  const notPractice = (clause: string, reason: string) => unsupported.push({ request: clip(clause, 400), reason, alternative: 'Make a practice app like Riff; its timer, prompts and metronome can be tuned to the minutes you have.' });

  // Lists of details first ("add camera settings to my photo notes", "add lens and ISO to each photo"):
  // splitting the request at "and" would break the list apart.
  const list = listAdditions(spec, request, taken);
  const remaining: string[] = [];
  for (const clause of splitClauses(list.rest)) {
    // Never delete data through a revision.
    if (RX.clearData.test(clause)) {
      unsupported.push({ request: clip(clause, 400), reason: 'Data is never deleted by a change to the app.', alternative: 'Delete entries one at a time from inside the app if you no longer want them.' });
      continue;
    }
    // Field type changes are declined; offer a new field plus hiding the old one.
    const tc = RX.typeChange.exec(clause);
    if (tc) {
      const phrase = tc[1] ?? tc[3] ?? '';
      const newType = (tc[2] ?? tc[4] ?? 'text').toLowerCase();
      const field = findField(spec, phrase, { hidden: false });
      const name = field ? field.label : cleanLabel(phrase) || 'Field';
      unsupported.push({
        request: clip(clause, 400),
        reason: `Changing the type of ${quote(name)} would risk the ${spec.entryNoun.plural} you already saved.`,
        alternative: field && !structural.has(field.id)
          ? `Add a new ${newType} field and hide the old one; both steps are included below.`
          : `Add a new ${newType} field next to it; the current one stays because the ${viewKind(spec)} is organised by it.`,
      });
      const label = `${name} (${newType})`;
      addField(genericField(takeId(label), clip(label, 60), newType));
      if (field && !structural.has(field.id)) ops.push({ op: 'hide_field', fieldId: field.id });
      continue;
    }
    // Hide a field (values are kept).
    const hide = RX.hide.exec(clause);
    if (hide?.[1] && !/\b(?:option|stage|column|rule|view|challenge|prompt)\b/i.test(hide[1])) {
      // "hide the location and the mood": each one, unless the whole phrase is exactly one field's name
      // ("Shadows and light"); a field that merely contains a word of it ("Keeper") is not enough.
      const whole = findField(spec, hide[1], { hidden: false });
      const phrases = whole && isExactly(whole, hide[1]) ? [hide[1]] : splitList(hide[1]);
      for (const phrase of phrases) {
        const field = findField(spec, phrase, { hidden: false });
        if (!field) {
          unsupported.push({ request: clip(clause, 400), reason: `I couldn't find a field called ${quote(cleanPhrase(phrase))}.`, alternative: `Fields you can hide: ${spec.fields.filter((f) => !f.hidden && !structural.has(f.id)).map((f) => f.label).join(', ') || 'none right now'}.` });
        } else if (structural.has(field.id)) {
          unsupported.push({ request: clip(clause, 400), reason: `${quote(field.label)} is what the ${viewKind(spec)} is organised by, so it cannot be hidden.`, alternative: 'Rename it instead, or ask for a new field to sit alongside it.' });
        } else if (!ops.some((o) => o.op === 'hide_field' && o.fieldId === field.id)) {
          ops.push({ op: 'hide_field', fieldId: field.id });
        }
      }
      continue;
    }
    // Show a hidden field again.
    const show = RX.show.exec(clause);
    if (show?.[1]) {
      const field = findField(spec, show[1], { hidden: true });
      if (field) { ops.push({ op: 'unhide_field', fieldId: field.id }); continue; }
      const visible = findField(spec, show[1], { hidden: false });
      if (visible) { // already visible: nothing to do
        if (isExactly(visible, show[1]) && !existing.includes(visible.label)) existing.push(visible.label);
        continue;
      }
      remaining.push(clause); // maybe "show me a weekly prompt" style; let the planner try
      continue;
    }
    // Rename the app or a field.
    const rename = RX.renameTo.exec(clause);
    if (rename?.[1] && rename[2]) {
      // "rename Where to Place and Keeper to Favourite": one rename per pair.
      for (const [rawTarget, rawName] of renamePairs(spec, rename[1], rename[2])) {
        const target = cleanPhrase(rawTarget);
        const newName = clip(rawName.trim().replace(/["“”']/g, ''), 60);
        if (newName.length < 1) continue;
        const aboutApp = /^(?:app|this app|the app|it|this|name|title|everything)$/i.test(target) || normalize(target) === normalize(spec.name);
        const field = aboutApp ? undefined : findField(spec, target, { hidden: false });
        if (field) {
          if (!ops.some((o) => o.op === 'update_field' && o.fieldId === field.id)) ops.push({ op: 'update_field', fieldId: field.id, patch: { label: newName } });
        } else if (aboutApp) {
          if (!ops.some((o) => o.op === 'rename_app')) ops.push({ op: 'rename_app', name: newName });
        } else {
          // An unknown field is never a reason to rename the whole app.
          unsupported.push({ request: clip(clause, 400), reason: `I couldn't find a field called ${quote(target)}.`, alternative: `Fields you can rename: ${spec.fields.filter((f) => !f.hidden).map((f) => f.label).join(', ')}; or say “rename the app to …”.` });
        }
      }
      continue;
    }
    const renameApp = RX.renameApp.exec(clause);
    if (renameApp?.[2]) {
      const raw = renameApp[2].trim();
      const newName = clip(raw.replace(/["“”']/g, ''), 60);
      // "name it after my band", "call it a day": not a name, unless it was quoted.
      if (!renameApp[1] && unlikelyName(raw)) {
        unsupported.push({ request: clip(clause, 400), reason: 'I couldn’t tell what the new name should be.', alternative: 'Put the name in quotes, for example: call it “Evening Light”.' });
      } else if (newName && normalize(newName) !== normalize(spec.name) && !ops.some((o) => o.op === 'rename_app')) ops.push({ op: 'rename_app', name: newName });
      continue;
    }
    // Add a stage/option to a choice field.
    const opt = RX.addOption.exec(clause);
    if (opt?.[1]) {
      const label = clip(opt[1].trim(), 40);
      const board = spec.views.find((v): v is Extract<ViewSpec, { type: 'board' }> => v.type === 'board');
      // A view's filter field sorts entries into tabs (a new value would show nowhere); choices a view
      // binds (a link's kind, a queue's channel or stage) are the ones people mean.
      const filterIds = new Set(spec.views.flatMap((v) => (v.filter ? [v.filter.fieldId] : [])));
      const choices = spec.fields.filter((f) => f.type === 'select' && !f.hidden && !filterIds.has(f.id));
      const boundIds = new Set(spec.views.flatMap((v) => (v.type === 'links' ? [v.kindFieldId] : v.type === 'queue' ? [v.channelFieldId, v.stageFieldId] : v.type === 'board' ? [v.stageFieldId] : [])));
      const bound = choices.filter((f) => boundIds.has(f.id));
      const named = opt[2] ? findField(spec, opt[2], { hidden: false }) : undefined;
      const target = named
        ?? (board ? spec.fields.find((f) => f.id === board.stageFieldId) : undefined)
        ?? (bound.length === 1 ? bound[0] : choices.length === 1 ? choices[0] : undefined);
      if (!target || target.type !== 'select') {
        unsupported.push(choices.length > 1
          ? { request: clip(clause, 400), reason: `There is more than one choice to add “${label}” to.`, alternative: `Say which one, for example “add an option called ${label} to ${choices[0]?.label}” (choices: ${choices.map((f) => f.label).join(', ')}).` }
          : { request: clip(clause, 400), reason: 'There is no choice field to add that option to.', alternative: 'Ask for a choice field first, for example "add a priority field".' });
        continue;
      }
      const value = slugifyFieldId(label, target.options.map((o) => o.value));
      if (!target.options.some((o) => normalize(o.label) === normalize(label))) ops.push({ op: 'add_select_option', fieldId: target.id, option: { value, label } });
      continue;
    }
    // Due-soon window.
    const win = RX.window.exec(clause);
    if (win) {
      const n = Math.max(0, Math.min(90, Number(win[1] ?? win[2] ?? win[3])));
      const existingRule = spec.rules.find((r) => r.type === 'due_soon');
      if (existingRule && existingRule.type === 'due_soon') ops.push({ op: 'replace_rule', ruleId: existingRule.id, rule: { ...existingRule, withinDays: n } });
      else {
        const plan = dueDatePlan(spec, reserved);
        if (plan.field) addField(plan.field);
        if (plan.rule) ops.push({ op: 'add_rule', rule: rule({ ...plan.rule, ...(plan.rule.type === 'due_soon' ? { withinDays: n } : {}) }) });
        if (plan.boardView) {
          const v = spec.views.find((x) => x.id === plan.boardView?.viewId);
          if (v && v.type === 'board') ops.push({ op: 'replace_view', viewId: v.id, view: { ...v, dueFieldId: plan.dateFieldId } });
        }
      }
      continue;
    }
    // Required / optional.
    const req = RX.required.exec(clause);
    if (req?.[1] && req[2]) {
      const field = findField(spec, req[1], { hidden: false });
      if (field) { ops.push({ op: 'update_field', fieldId: field.id, patch: { required: req[2].toLowerCase() !== 'optional' } }); continue; }
    }
    // What entries are called.
    const noun = RX.entryNoun.exec(clause);
    if (noun?.[1]) {
      const singular = noun[1].trim().toLowerCase();
      ops.push({ op: 'set_entry_noun', singular, plural: pluralize(singular) });
      continue;
    }
    // Daily prompts sized to a session ("size the daily prompts to 15-minute sessions").
    const sized = RX.sizedPrompts.exec(clause);
    const sizedMinutes = sized ? minutesFromText(sized[1] ?? sized[2] ?? '') : null;
    if (sized && sizedMinutes) {
      const n = clampMinutes(sizedMinutes);
      if (!practiceDraft) { notPractice(clause, 'Only practice apps have prompts sized to a session.'); continue; }
      const prompts = practicePromptsFor(n);
      const current = spec.rules.find((r) => r.type === 'prompt_rotation');
      if (current && current.type === 'prompt_rotation') {
        if (current.prompts.join('\n') === prompts.join('\n')) {
          unsupported.push({ request: clip(clause, 400), reason: `The prompts are already sized to ${n}-minute sessions.`, alternative: 'Pick a different session length, or change the presets, tempo or look instead.' });
        } else {
          const op: RevisionOp = { op: 'replace_rule', ruleId: current.id, rule: rule({ ...current, cadence: 'daily', prompts }) };
          ops.push(op);
          detail.set(JSON.stringify(op), `The daily prompts will fit ${n}-minute sessions.`);
        }
      } else {
        const op: RevisionOp = { op: 'add_rule', rule: rule({ id: slugifyFieldId('tonight', spec.rules.map((r) => r.id)), type: 'prompt_rotation', cadence: 'daily', title: 'Tonight', prompts }) };
        ops.push(op);
        detail.set(JSON.stringify(op), `A daily prompt sized to ${n}-minute sessions will be added.`);
      }
      continue;
    }
    // Practice timer: a whole preset list ("change the timer presets to 5, 10 and 20 minutes"), or the default
    // session ("make the default session 20 minutes"), and the metronome ("set the metronome to 60 bpm"). One
    // clause can set both ("make the default session 10 minutes and the metronome 60 bpm").
    let practiced = false;
    let noTimer = false;
    const listMatch = RX.presetList.exec(clause);
    const listed = listMatch?.[1] ? [...new Set((listMatch[1].match(/\d{1,3}/g) ?? []).map(Number).filter((n) => n >= 1 && n <= 180))].slice(0, 6) : [];
    const preset = listed.length >= 2 ? null : RX.preset.exec(clause);
    const presetMinutes = preset ? minutesFromText(preset[1] ?? preset[2] ?? '') : null;
    if (listed.length >= 2 || presetMinutes) {
      practiced = true;
      if (!practiceDraft) {
        notPractice(clause, 'This app has no practice timer to set presets on.');
        noTimer = true;
      } else {
        const n = listed.length >= 2 ? (listed[0] as number) : clampMinutes(presetMinutes ?? 0);
        const presets = listed.length >= 2 ? listed : [n, ...practiceDraft.presets.filter((p) => p !== n)].slice(0, 6);
        if (presets.join(',') === practiceDraft.presets.join(',')) {
          unsupported.push({
            request: clip(clause, 400),
            reason: listed.length >= 2 ? `The timer presets are already ${joinNatural(presets.map(String))} minutes.` : `The timer already starts at ${n} minutes.`,
            alternative: 'Pick a different length, or change the prompts, tempo or look instead.',
          });
        } else {
          practiceDraft.presets = presets;
          replacePractice();
        }
      }
    }
    const tempo = RX.tempo.exec(clause);
    if (tempo) {
      practiced = true;
      const n = Number(tempo[1] ?? tempo[2]);
      if (!practiceDraft) {
        if (!noTimer) notPractice(clause, 'This app has no metronome.');
      } else if (n < 30 || n > 240) {
        unsupported.push({ request: clip(clause, 400), reason: 'The metronome runs between 30 and 240 bpm.', alternative: 'Pick a tempo in that range.' });
      } else if (practiceDraft.defaultTempo === n) {
        unsupported.push({ request: clip(clause, 400), reason: `The metronome already starts at ${n} bpm.`, alternative: 'Pick a different tempo, or change the presets or look instead.' });
      } else {
        practiceDraft.defaultTempo = n;
        replacePractice();
      }
    }
    if (practiced) continue;
    // The look ("make it dark", "use the paper look").
    if (RX.lookCue.test(clause)) {
      const theme = THEME_WORDS.find(([rx]) => rx.test(clause))?.[1];
      if (theme) {
        const current = designFor(spec);
        if (current.theme === theme) unsupported.push({ request: clip(clause, 400), reason: `It already uses the ${theme} theme.`, alternative: 'Pick another look: bright, paper, charcoal, ink, mint, lilac or sunset.' });
        // The whole resolved design travels with the op, so the schema's defaults cannot reset typography or artwork.
        else ops.push({ op: 'set_design', design: { ...current, theme } });
        continue;
      }
    }
    remaining.push(clause);
  }

  // Everything else goes through the shared instruction planner (fields, prompts, due dates, declines),
  // after the list additions found above; both hand out ids from the same set, reserved ids included.
  // Each clause is planned on its own, so a clause that maps to nothing is named under "Not included"
  // instead of disappearing next to one that worked.
  const concept = conceptForSpec(spec);
  const planned: Intent[] = [];
  const unmatched: string[] = [];
  for (const clause of remaining) {
    const sub = planInstructions(spec, clause, concept?.id, { taken, reserved });
    if (sub.length) planned.push(...sub); else unmatched.push(clause);
  }
  const intents: Intent[] = [...list.intents, ...planned];
  for (const intent of intents) {
    switch (intent.kind) {
      case 'add_field':
        if (!ops.some((o) => o.op === 'add_field' && (o.field.id === intent.field.id || normalize(o.field.label) === normalize(intent.field.label)))) addField(intent.field, intent.placement);
        break;
      case 'exists':
        if (!existing.includes(intent.label)) existing.push(intent.label);
        break;
      case 'unhide_field':
        if (!ops.some((o) => o.op === 'unhide_field' && o.fieldId === intent.fieldId)) ops.push({ op: 'unhide_field', fieldId: intent.fieldId });
        break;
      case 'prompt_rotation': {
        const plan = promptRotationPlan(spec, intent.cadence, concept?.id);
        if (plan.replaceRuleId) ops.push({ op: 'replace_rule', ruleId: plan.replaceRuleId, rule: rule(plan.rule) });
        else ops.push({ op: 'add_rule', rule: rule(plan.rule) });
        break;
      }
      case 'due_date': {
        const plan = dueDatePlan(spec, reserved);
        if (plan.field && !ops.some((o) => o.op === 'add_field' && o.field.id === plan.field?.id)) addField(plan.field);
        if (plan.rule) ops.push({ op: 'add_rule', rule: rule(plan.rule) });
        if (plan.boardView) {
          const v = spec.views.find((x) => x.id === plan.boardView?.viewId);
          if (v && v.type === 'board') ops.push({ op: 'replace_view', viewId: v.id, view: { ...v, dueFieldId: plan.dateFieldId } });
        }
        break;
      }
      case 'rename':
        if (!ops.some((o) => o.op === 'rename_app')) ops.push({ op: 'rename_app', name: intent.name });
        break;
      case 'practice_preset':
        if (practiceDraft && practiceDraft.presets[0] !== intent.minutes) {
          practiceDraft.presets = [intent.minutes, ...practiceDraft.presets.filter((p) => p !== intent.minutes)].slice(0, 6);
          replacePractice();
        }
        break;
      case 'unsupported':
        unsupported.push(intent.item);
        break;
    }
  }

  // Dry run: keep only the operations that apply cleanly, in order.
  const kept: RevisionOp[] = [];
  const seen = new Set<string>();
  for (const op of ops) {
    const key = JSON.stringify(op);
    if (seen.has(key)) continue;
    const trial = applyRevision(spec, [...kept, op]);
    if (trial.ok) { kept.push(op); seen.add(key); }
  }
  // When the default session moves, copy that states the old length (tagline, hint, tab names, buttons)
  // says the new one in the same proposal, so the preview, the applied app and an undo agree.
  const aligned = kept.length ? alignDurationCopy(spec, kept) : null;
  const finalOps = aligned?.ops ?? kept;

  // Everything asked for is already there: say so instead of "couldn't map".
  if (kept.length === 0 && unsupported.length === 0 && existing.length) unsupported.push(alreadyHas(spec.name, existing));
  let summary: string;
  if (kept.length === 0 && unsupported.length === 0) {
    // Nothing in the request matched at all: one plain answer for the whole of it.
    summary = NO_MATCH_SUMMARY;
    unsupported.push({ request: clip(request, 400), reason: 'That is not a change I know how to make yet.', alternative: SUPPORTED_HINT });
  } else {
    for (const clause of unmatched) unsupported.push({ request: clip(clause, 400), reason: 'That is not a change I know how to make yet.', alternative: SUPPORTED_HINT });
    summary = kept.length === 0
      ? clip(`Nothing to change yet. ${unsupported[0]?.reason ?? ''}`.trim(), 300)
      : proposalSummary(spec, finalOps, {
        sentences: detail,
        copyOps: aligned?.copyOps,
        copyMinutes: aligned?.copyChanged ? aligned.to : null,
        note: aligned?.note,
        unsupportedCount: unsupported.length,
      });
  }

  return RevisionProposalSchema.parse({ summary, ops: finalOps, unsupported: unsupported.slice(0, 10).map((u) => ({ request: clip(u.request, 400), reason: clip(u.reason, 400), alternative: clip(u.alternative, 400) })) });
}

export { typeWord };
