/**
 * Instruction heuristics: turn a person's free-text customisation ("make it a weekly challenge and
 * add a reflection field") into a small set of intents, then apply them to a spec. The same planner
 * feeds the build flow (mutating a draft spec) and the revision flow (emitting revision ops).
 *
 * Every heuristic is additive and idempotent: applying the same instructions twice yields the same
 * spec. Instructions are untrusted text; they are matched with regular expressions and never
 * executed or echoed as HTML.
 */
import type { AppSpecInput, Pattern, Purpose } from '../../../shared/appSpec.ts';
import { slugifyFieldId } from '../../../shared/ids.ts';
import { f, type FieldInput, type RuleInput, type ViewInput } from './builders.ts';
import { promptsFor, promptTitle } from './prompts.ts';
import { clip, sentenceCase } from './text.ts';

export interface Unsupported { request: string; reason: string; alternative: string }

/** The subset of a spec the planner reads; both AppSpecInput and a parsed AppSpec satisfy it. */
export type SpecLike = Pick<AppSpecInput, 'name' | 'pattern' | 'purpose' | 'fields' | 'views' | 'rules'>;

export type Intent =
  | { kind: 'add_field'; field: FieldInput; change: string }
  | { kind: 'unhide_field'; fieldId: string; change: string }
  | { kind: 'prompt_rotation'; cadence: 'daily' | 'weekly'; change: string }
  | { kind: 'due_date'; change: string }
  | { kind: 'rename'; name: string; change: string }
  | { kind: 'unsupported'; item: Unsupported };

export interface HeuristicResult { spec: AppSpecInput; changes: string[]; unsupported: Unsupported[] }

// ---------- lexicon ----------

const RX = {
  weeklyChallenge: /weekly (?:challenge|prompt|theme|focus)|\bchallenges?\b|rotating prompt|weekly question/i,
  dailyPrompt: /daily (?:prompt|challenge|question|theme)|prompt (?:every|each) day|a prompt a day/i,
  reflection: /\breflections?\b|what i learned|what did i learn|\blessons?\b|\breflect\b|\btakeaways?\b/i,
  rating: /\bratings?\b|\brate\b|\bscores?\b|how it went|how did it go|\bstars\b|out of (?:5|five|10|ten)/i,
  mood: /\bmoods?\b|\benergy\b|\bfeelings?\b|how i feel|how i felt/i,
  next: /next experiment|next steps?\b|next time\b|next action|what to try next|try next/i,
  dueDate: /due dates?\b|\bdeadlines?\b|by when|follow[- ]up by|due soon|\bdue\b/i,
  priority: /\bpriorit(?:y|ies|i[sz]e)\b|\burgen(?:t|cy)\b/i,
  location: /\blocation\b|\bwhere\b(?!\s+(?:i|we|you|they|it|he|she|my|the)\b)|\bplace visited\b/i,
  tags: /\btags?\b|\btopics?\b|\bcategor(?:y|ies)\b|\blabels?\b|\bhashtags?\b/i,
  attachments: /\buploads?\b|\battach(?:ment|ments|ed|ing)?\b|\b(?:add|include|insert|take|store|save)\s+(?:a\s+|an\s+|my\s+|the\s+)?(?:photo|photos|image|images|picture|pictures|screenshot|screenshots|file|files|video|videos)\b|\bphoto uploads?\b|\bimage uploads?\b/i,
  external: /remind me|\breminders?\b|\bnotifications?\b|\bnotify\b|\balerts?\b|send (?:me |an |a )?(?:email|e-mail|text|message|sms)|email me|text me|\bsync(?:ing|ed)?\b(?: with| to)?|\bintegrat(?:e|ion)\b|\binstagram\b|\blinkedin\b|\bcalendar\b|\bslack\b|\bwhatsapp\b|\btwitter\b|\bgoogle (?:sheets|docs|drive|calendar)\b|\bnotion\b|\bspotify\b|\bstrava\b|\bimport (?:from|my)\b|\bexport to\b|\bauto(?:matically)? (?:post|send|share)|\bpost(?:ing)? to\b/i,
  renameTo: /\b(?:rename (?:it|this|the app|this app|the name)?\s*(?:to|as)|call (?:it|this|the app|this app)|name (?:it|this|the app))\s+["“']?([^"”'.,;!?\n]{2,60})/i,
  // Group 1: optional type word, group 2: label. "add a short text field called Next step"
  addFieldFor: /(?:\badd\s+|\bwant\s+|\bneed\s+|\binclude\s+|\bwith\s+|\band\s+|^)(?:a |an |another |one )?(?:(?:new|short|long|simple|little|quick|small|1[–-]5|1 to 5|five[- ]star) )*(?:(text|number|numeric|date|rating|checkbox|choice|select|dropdown|link|url|tags?|long[- ]text|free[- ]text|yes\/no) )?(?:field|column|box|input|section|line)\s+(?:for|called|named|labell?ed|titled|to track|to record|to note|to log|about)\s+["“']?([^"”'.,;!?\n]{2,50})/gi,
  // Group 1: label, group 2: optional type word. "add a weather text field"
  addXField: /(?:\badd\s+|\bwant\s+|\bneed\s+|\binclude\s+|\bwith\s+|\band\s+|^)(?:a |an |another |one )?(?:(?:new|short|long|simple|little|quick|small) )*["“']?([a-z0-9][a-z0-9 '\-]{1,40}?)["”']?\s+(?:(text|number|numeric|date|rating|checkbox|choice|select|link|url|tags?) )?(?:field|column|box|input|section)\b/gi,
  // Group 1: label phrase. "a place to record the weather"
  placeToRecord: /\b(?:a place|somewhere|a spot|a box|a space|a way|room) (?:to|for|where i can) (?:record|note|write|track|log|capture|jot)(?:ing)?(?: down)? (?:what |the |my |how |each |every )?([^.,;!?\n]{3,50})/gi,
  typeWordOnly: /^(?:text|number|numeric|date|rating|checkbox|choice|select|dropdown|link|url|tags?|long[- ]text|short[- ]text|free[- ]text|field|column)$/i,
  specificWords: /\b(?:reflection|reflections|learned|lesson|lessons|rating|rate|score|stars|mood|energy|feeling|feelings|next|due|deadline|priority|urgent|location|where|tags?|topics?|categor(?:y|ies)|labels?|photo|photos|image|images|picture|pictures|upload|attachment|reminder|notification|challenge|prompt)\b/i,
};

// ---------- planning ----------

export function planInstructions(spec: SpecLike, text: string, _conceptId?: string): Intent[] {
  const intents: Intent[] = [];
  const t = (text ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return intents;
  const fields = spec.fields;
  const taken = new Set(fields.map((x) => x.id));
  const takeId = (preferred: string) => {
    const id = slugifyFieldId(preferred, taken);
    taken.add(id);
    return id;
  };
  const existing = (pred: (x: FieldInput) => boolean) => fields.find(pred);
  const pushField = (field: FieldInput, change: string) => intents.push({ kind: 'add_field', field, change });
  const reuseOrAdd = (match: FieldInput | undefined, make: () => FieldInput, change: string) => {
    if (match?.hidden) intents.push({ kind: 'unhide_field', fieldId: match.id, change: `brought back “${match.label}”` });
    else if (!match) pushField(make(), change);
  };

  // Unsupported requests first, so their clauses are not also treated as field requests.
  if (RX.attachments.test(t)) {
    intents.push({ kind: 'unsupported', item: {
      request: clauseFor(t, RX.attachments),
      reason: 'Attachments and photo uploads are not supported yet.',
      alternative: 'A link field to the photo is added instead, so you can paste a link from your photo library.',
    } });
    reuseOrAdd(existing((x) => x.type === 'url'), () => f.url(takeId('photo_link'), 'Link to the photo', { placeholder: 'https://' }), 'added a link field for the photo');
  }
  if (RX.external.test(t)) {
    intents.push({ kind: 'unsupported', item: {
      request: clauseFor(t, RX.external),
      reason: 'This app cannot send messages, set reminders or connect to other services yet.',
      alternative: spec.pattern === 'board'
        ? 'Items due soon and anything overdue are highlighted on the board when you open it, so you can follow up yourself.'
        : 'Add a due date and the app will highlight items due soon whenever you open it.',
    } });
  }

  // Prompt rotation.
  const rotation = spec.rules?.find((r) => r.type === 'prompt_rotation');
  if (RX.dailyPrompt.test(t)) {
    if (!rotation || rotation.cadence !== 'daily') intents.push({ kind: 'prompt_rotation', cadence: 'daily', change: rotation ? 'switched the prompts to daily' : 'added a daily prompt with 8 rotating prompts' });
  } else if (RX.weeklyChallenge.test(t)) {
    if (!rotation) intents.push({ kind: 'prompt_rotation', cadence: 'weekly', change: 'added a weekly challenge with 8 rotating prompts' });
    else if (rotation.cadence !== 'weekly' && /weekly/i.test(t)) intents.push({ kind: 'prompt_rotation', cadence: 'weekly', change: 'switched the prompts to weekly' });
  }

  // Specific fields.
  if (RX.reflection.test(t)) {
    reuseOrAdd(
      existing((x) => x.type === 'long_text' && (x.id === 'reflection' || /learn|reflect|lesson|takeaway/i.test(x.label))),
      () => f.long(takeId('reflection'), 'What did you learn?', { placeholder: 'One thing you would try differently next time' }),
      'added a reflection field “What did you learn?”',
    );
  }
  if (RX.rating.test(t)) {
    reuseOrAdd(existing((x) => x.type === 'rating'), () => f.rating(takeId('how_it_went'), 'How did it go?'), 'added a 1 to 5 rating “How did it go?”');
  }
  if (RX.mood.test(t)) {
    const energy = /\benergy\b/i.test(t) && !/\bmood\b/i.test(t);
    reuseOrAdd(
      existing((x) => x.type === 'select' && (x.id === 'mood' || x.id === 'energy' || /\bfeel|mood|energy/i.test(x.label))),
      () => energy
        ? f.select(takeId('energy'), 'Energy level', [['low', 'Low'], ['okay', 'Okay'], ['good', 'Good'], ['high', 'High']])
        : f.select(takeId('mood'), 'How did it feel?', [['calm', 'Calm'], ['curious', 'Curious'], ['tired', 'Tired'], ['inspired', 'Inspired']]),
      energy ? 'added an energy level choice' : 'added a mood choice with four options',
    );
  }
  if (RX.next.test(t)) {
    const m = RX.next.exec(t)?.[0].toLowerCase() ?? 'next step';
    const label = /experiment/.test(m) ? 'Next experiment' : /time/.test(m) ? 'Next time, try' : /action/.test(m) ? 'Next action' : 'Next step';
    reuseOrAdd(
      existing((x) => (x.type === 'text' || x.type === 'long_text') && (/^next_/.test(x.id) || /^next\b/i.test(x.label))),
      () => f.text(takeId(label.replace(/,.*$/, '')), label, { placeholder: 'What will you try next?' }),
      `added a short text field “${label}”`,
    );
  }
  if (RX.dueDate.test(t)) {
    const plan = dueDatePlan(spec);
    if (plan.field || plan.rule || plan.boardView) intents.push({ kind: 'due_date', change: plan.field ? 'added a due date and highlighted anything due within 3 days' : 'highlighted anything due within 3 days' });
  }
  if (RX.priority.test(t)) {
    reuseOrAdd(
      existing((x) => x.type === 'select' && (x.id === 'priority' || /priorit/i.test(x.label))),
      () => f.select(takeId('priority'), 'Priority', [['low', 'Low', 'slate'], ['medium', 'Medium', 'mustard'], ['high', 'High', 'coral']], { default: 'medium' }),
      'added a priority choice (low, medium, high)',
    );
  }
  if (RX.location.test(t)) {
    reuseOrAdd(
      existing((x) => x.type === 'text' && (x.id === 'location' || /where|location|place/i.test(x.label))),
      () => f.text(takeId('location'), 'Where', { placeholder: 'Neighbourhood, venue, street' }),
      'added a “Where” field',
    );
  }
  if (RX.tags.test(t)) {
    reuseOrAdd(existing((x) => x.type === 'tags'), () => f.tags(takeId('tags'), 'Tags'), 'added tags');
  }

  // Rename.
  const rename = RX.renameTo.exec(t);
  if (rename?.[1]) {
    const name = clip(sentenceCase(rename[1].trim().replace(/["“”']/g, '')), 60);
    if (name.length >= 1 && name.toLowerCase() !== spec.name.toLowerCase()) intents.push({ kind: 'rename', name, change: `renamed the app to “${name}”` });
  }

  // Generic "add a field for X" / "add an X field" / "a place to record X". Each clause of the
  // text is consumed by the first pattern that matches it, so one request yields one field.
  const generic: { raw: string; type?: string }[] = [];
  const spans: [number, number][] = [];
  const overlaps = (s: number, e: number) => spans.some(([a, b]) => s < b && e > a);
  const scan = (rx: RegExp, pick: (m: RegExpExecArray) => { raw?: string; type?: string }) => {
    rx.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = rx.exec(t)) !== null) {
      const s = m.index;
      const e = s + m[0].length;
      if (overlaps(s, e)) continue;
      const { raw, type } = pick(m);
      if (raw?.trim()) {
        spans.push([s, e]);
        generic.push({ raw: raw.trim(), ...(type ? { type: type.toLowerCase() } : {}) });
      }
    }
  };
  scan(RX.addFieldFor, (m) => ({ raw: m[2], type: m[1] }));
  scan(RX.addXField, (m) => ({ raw: m[1], type: m[2] }));
  scan(RX.placeToRecord, (m) => ({ raw: m[1] }));

  const sameLabel = (a: string, b: string) => normalizeLabel(a) === normalizeLabel(b);
  for (const { raw, type } of generic) {
    const label = cleanLabel(raw);
    if (!label || RX.typeWordOnly.test(label) || RX.specificWords.test(label)) continue;
    const id = slugifyFieldId(label);
    const dup = existing((x) => x.id === id || sameLabel(x.label, label));
    if (dup) {
      if (dup.hidden && !intents.some((i) => i.kind === 'unhide_field' && i.fieldId === dup.id)) intents.push({ kind: 'unhide_field', fieldId: dup.id, change: `brought back “${dup.label}”` });
      continue;
    }
    if (intents.some((i) => i.kind === 'add_field' && sameLabel(i.field.label, label))) continue;
    const field = genericField(takeId(label), label, type);
    pushField(field, `added a ${typeWord(field)} field “${label}”`);
  }

  return intents;
}

function normalizeLabel(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** What a due-date request needs to add for this spec (only the missing parts). */
export function dueDatePlan(spec: SpecLike): { field?: FieldInput; rule?: RuleInput; dateFieldId: string; boardView?: { viewId: string } } {
  const dateField = spec.fields.find((x) => x.type === 'date' && !x.hidden && (x.id === 'due' || /due|deadline|by\b|follow/i.test(x.label)));
  const dateFieldId = dateField?.id ?? slugifyFieldId('due', spec.fields.map((x) => x.id));
  const out: { field?: FieldInput; rule?: RuleInput; dateFieldId: string; boardView?: { viewId: string } } = { dateFieldId };
  if (!dateField) out.field = f.due(dateFieldId, spec.pattern === 'board' ? 'Due date' : 'Due date', { help: 'Items due within 3 days are highlighted' });
  const hasRule = spec.rules?.some((r) => r.type === 'due_soon' && r.dateFieldId === dateFieldId);
  if (!hasRule) {
    const board = spec.views.find((v): v is Extract<ViewInput, { type: 'board' }> => v.type === 'board');
    const stage = board ? spec.fields.find((x) => x.id === board.stageFieldId && x.type === 'select') : undefined;
    const done = spec.fields.find((x) => x.type === 'checkbox' && /done|complete|finished/i.test(x.label));
    const doneValues = board?.doneStageValues ?? [];
    out.rule = {
      id: slugifyFieldId('due_soon', (spec.rules ?? []).map((r) => r.id)),
      type: 'due_soon',
      dateFieldId,
      withinDays: 3,
      label: 'Due soon',
      ...(stage && doneValues.length ? { stageFieldId: stage.id, doneStageValues: doneValues } : done ? { doneFieldId: done.id } : {}),
    };
  }
  const board = spec.views.find((v): v is Extract<ViewInput, { type: 'board' }> => v.type === 'board');
  if (board && board.dueFieldId !== dateFieldId) out.boardView = { viewId: board.id };
  return out;
}

/** The prompt-rotation rule a request needs (new, or a replacement with the new cadence). */
export function promptRotationPlan(spec: SpecLike, cadence: 'daily' | 'weekly', conceptId?: string): { rule: RuleInput; replaceRuleId?: string } {
  const current = spec.rules?.find((r) => r.type === 'prompt_rotation');
  const prompts = current && current.type === 'prompt_rotation' && current.prompts.length ? current.prompts : promptsFor(conceptId, spec.pattern, spec.purpose);
  const rule: RuleInput = {
    id: current?.id ?? (cadence === 'weekly' ? 'weekly_challenge' : 'daily_prompt'),
    type: 'prompt_rotation',
    cadence,
    title: promptTitle(cadence, spec.pattern),
    prompts,
  };
  return current ? { rule, replaceRuleId: current.id } : { rule };
}

// ---------- applying to a draft spec (build flow) ----------

export function applyInstructionHeuristics(input: AppSpecInput, instructions: string, conceptId?: string): HeuristicResult {
  const spec: AppSpecInput = structuredClone(input);
  const changes: string[] = [];
  const unsupported: Unsupported[] = [];
  for (const intent of planInstructions(spec, instructions, conceptId)) {
    switch (intent.kind) {
      case 'add_field':
        if (spec.fields.some((x) => x.id === intent.field.id)) break;
        spec.fields.push(intent.field);
        exposeField(spec, intent.field);
        changes.push(intent.change);
        break;
      case 'unhide_field': {
        const x = spec.fields.find((y) => y.id === intent.fieldId);
        if (x?.hidden) { x.hidden = false; changes.push(intent.change); }
        break;
      }
      case 'prompt_rotation': {
        const plan = promptRotationPlan(spec, intent.cadence, conceptId);
        spec.rules = spec.rules ?? [];
        const idx = plan.replaceRuleId ? spec.rules.findIndex((r) => r.id === plan.replaceRuleId) : -1;
        if (idx >= 0) spec.rules[idx] = plan.rule; else spec.rules.push(plan.rule);
        changes.push(intent.change);
        break;
      }
      case 'due_date': {
        const plan = dueDatePlan(spec);
        if (plan.field) { spec.fields.push(plan.field); exposeField(spec, plan.field); }
        if (plan.rule) { spec.rules = [...(spec.rules ?? []), plan.rule]; }
        if (plan.boardView) {
          const v = spec.views.find((y) => y.id === plan.boardView?.viewId);
          if (v && v.type === 'board') v.dueFieldId = plan.dateFieldId;
        }
        changes.push(intent.change);
        break;
      }
      case 'rename':
        spec.name = intent.name;
        changes.push(intent.change);
        break;
      case 'unsupported':
        unsupported.push(intent.item);
        break;
    }
  }
  return { spec, changes, unsupported };
}

/** Make a newly added field visible in views that enumerate fields explicitly. */
function exposeField(spec: AppSpecInput, field: FieldInput): void {
  for (const v of spec.views) {
    if (v.type === 'journal' && v.showFieldIds && !v.showFieldIds.includes(field.id)) v.showFieldIds.push(field.id);
    if (v.type === 'list' && v.columnFieldIds && v.columnFieldIds.length < 8 && field.type !== 'long_text') v.columnFieldIds.push(field.id);
    if (v.type === 'board' && v.cardFieldIds && v.cardFieldIds.length < 6 && (field.type === 'date' || field.type === 'select' || field.type === 'text')) v.cardFieldIds.push(field.id);
  }
}

// ---------- helpers ----------

/** The sentence or clause of `text` where `rx` matched, for quoting back in an unsupported item. */
export function clauseFor(text: string, rx: RegExp): string {
  const clauses = text.split(/(?<=[.;!?\n])\s+|,?\s+(?:and then|and also|and|then|also|plus)\s+/i).map((c) => c.trim()).filter(Boolean);
  const probe = new RegExp(rx.source, rx.flags.replace('g', ''));
  const hit = clauses.find((c) => probe.test(c));
  return clip(hit ?? text, 200);
}

export function cleanLabel(raw: string): string {
  const cleaned = raw
    .replace(/^(?:the|a|an|my|each|every|some)\s+/i, '')
    .replace(/\s+(?:field|column|box|input|section)$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned.length < 2 || cleaned.length > 50) return '';
  return sentenceCase(cleaned);
}

/** Pick a field type from an explicit type word when given, else from the words in the label. */
export function genericField(id: string, label: string, typeWordHint?: string): FieldInput {
  const l = label.toLowerCase();
  const hint = typeWordHint?.toLowerCase().replace(/[- ]/g, '_');
  if (hint) {
    if (hint === 'number' || hint === 'numeric') return f.number(id, label);
    if (hint === 'date') return f.due(id, label);
    if (hint === 'rating') return f.rating(id, label);
    if (hint === 'checkbox' || hint === 'yes/no') return f.checkbox(id, label);
    if (hint === 'link' || hint === 'url') return f.url(id, label);
    if (hint === 'tag' || hint === 'tags') return f.tags(id, label);
    if (hint === 'long_text' || hint === 'free_text') return f.long(id, label);
    if (hint === 'text') return f.text(id, label);
    // choice/select/dropdown without options: a short text field keeps the request honest.
  }
  if (/\b(date|deadline|when|day)\b/.test(l)) return f.due(id, label);
  if (/\b(minutes|hours|count|number|amount|cost|price|distance|pages|reps|sets|weight|km|miles|calories|steps|how many|how much|how long|duration|total|budget|\$)\b/.test(l)) return f.number(id, label);
  if (/\b(notes?|thoughts|details|description|summary|why|what happened|story|observations)\b/.test(l)) return f.long(id, label);
  if (/\b(link|url|website|source)\b/.test(l)) return f.url(id, label);
  if (/\b(done|completed|finished|checked)\b/.test(l) || /\?$/.test(label)) return f.checkbox(id, label);
  if (/\b(rating|score|stars)\b/.test(l)) return f.rating(id, label);
  if (/\b(tags|topics|categories|labels)\b/.test(l)) return f.tags(id, label);
  return f.text(id, label);
}

export function typeWord(field: FieldInput): string {
  switch (field.type) {
    case 'text': return 'short text';
    case 'long_text': return 'long text';
    case 'date': return 'date';
    case 'number': return 'number';
    case 'select': return 'choice';
    case 'checkbox': return 'checkbox';
    case 'rating': return 'rating';
    case 'url': return 'link';
    case 'tags': return 'tags';
  }
}

export function patternNoun(pattern: Pattern): string {
  return pattern === 'journal' ? 'journal' : pattern === 'board' ? 'board' : 'tracker';
}

export function purposeWord(purpose: Purpose): string {
  return purpose === 'work' ? 'get things done' : 'explore';
}
