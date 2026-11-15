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
import { DURATION_SOURCE, minutesFromText } from './durations.ts';
import { promptsFor, promptTitle } from './prompts.ts';
import { clip, joinNatural, sentenceCase } from './text.ts';
import { findUnsupported } from './unsupported.ts';
import { currentPrompt } from '../../../shared/rules.ts';
import type { PromptRotationRule } from '../../../shared/appSpec.ts';

export interface Unsupported { request: string; reason: string; alternative: string }

/** The subset of a spec the planner reads; both AppSpecInput and a parsed AppSpec satisfy it. */
export type SpecLike = Pick<AppSpecInput, 'name' | 'pattern' | 'purpose' | 'fields' | 'views' | 'rules'> & { entryNoun?: { singular: string; plural: string } };

export interface PlanOptions {
  /** Field ids earlier versions used: a new field never takes one (it would inherit old values). */
  reserved?: Iterable<string>;
  /** Ids already handed out by the caller, shared so two planners never pick the same new id. */
  taken?: Set<string>;
  /** Planning one item of a list: lists are not looked for again. */
  nested?: boolean;
}

export type Intent =
  /** `placement: 'detail'`: a detail of the main item (a photo's camera settings), placed right under its caption. */
  | { kind: 'add_field'; field: FieldInput; change: string; placement?: 'detail' }
  | { kind: 'unhide_field'; fieldId: string; change: string }
  | { kind: 'prompt_rotation'; cadence: 'daily' | 'weekly'; change: string }
  | { kind: 'due_date'; change: string }
  | { kind: 'rename'; name: string; change: string }
  /** Practice apps: make N minutes the first timer preset ("make sessions 20 minutes", "add a 15-minute preset"). */
  | { kind: 'practice_preset'; minutes: number; change: string }
  /** Asked for, and already there (visible): a revision says "Light already has Where"; a build stays silent. */
  | { kind: 'exists'; label: string }
  | { kind: 'unsupported'; item: Unsupported };

export interface HeuristicResult { spec: AppSpecInput; changes: string[]; unsupported: Unsupported[] }

// ---------- lexicon ----------

const RX = {
  weeklyChallenge: /weekly (?:challenge|prompt|theme|focus)|\bchallenges?\b|rotating prompt|weekly question/i,
  dailyPrompt: /daily (?:prompt|challenge|question|theme)|prompt (?:every|each) day|a prompt a day/i,
  // "a 15-minute preset", "make the default session twenty minutes", "half-hour sessions"
  preset: new RegExp(`(${DURATION_SOURCE})[^.;]*?\\b(?:presets?|timer|sessions?|default)\\b|\\b(?:presets?|timer|sessions?|default)\\b[^.;]*?(${DURATION_SOURCE})`, 'i'),
  // A reflection field, not reflections in a window ("focus on shadows and reflections").
  reflection: /\breflection\b|\breflections\s+(?:field|box|section|notes?|questions?)\b|what i learned|what did i learn|\blessons? learned\b|\breflect\b|\btakeaways?\b/i,
  rating: /\bratings?\b|\brate\b|\bscores?\b|how it went|how did it go|\bstars\b|out of (?:5|five|10|ten)/i,
  mood: /\bmoods?\b|\benergy\b|\bfeelings?\b|how i feel|how i felt/i,
  next: /next experiment|next steps?\b|next time\b|next action|what to try next|try next/i,
  dueDate: /due dates?\b|\bdeadlines?\b|by when|follow[- ]up by|due soon|\bdue\b/i,
  priority: /\bpriorit(?:y|ies|i[sz]e)\b|\burgen(?:t|cy)\b/i,
  location: /\blocation\b|\bwhere\b(?!\s+(?:i|we|you|they|it|he|she|my|the)\b)|\bplace visited\b/i,
  tags: /\btags?\b|\btopics?\b|\bcategor(?:y|ies)\b|\blabels?\b|\bhashtags?\b/i,
  attachments: /\buploads?\b|\battach(?:ment|ments|ed|ing)?\b|\b(?:add|include|insert|take|store|save)\s+(?:a\s+|an\s+|my\s+|the\s+)?(?:photo|photos|image|images|picture|pictures|screenshot|screenshots|file|files|video|videos)\b|\bphoto uploads?\b|\bimage uploads?\b/i,
  external: /remind me|\breminders?\b|\bnotifications?\b|\bnotify\b|\balerts?\b|send (?:me |an |a )?(?:email|e-mail|text|message|sms)|email me|text me|\bsync(?:ing|ed)?\b(?: with| to)?|\bintegrat(?:e|ion)\b|\binstagram\b|\blinkedin\b|\bcalendar\b|\bslack\b|\bwhatsapp\b|\btwitter\b|\bgoogle (?:sheets|docs|drive|calendar)\b|\bnotion\b|\bspotify\b|\bstrava\b|\bimport (?:from|my)\b|\bexport to\b|\bauto(?:matically)? (?:post|send|share)|\bpost(?:ing)? to\b/i,
  // Group 1: an opening quote, if any; group 2: the name.
  renameTo: /\b(?:rename (?:it|this|the app|this app|the name)?\s*(?:to|as)|call (?:it|this|the app|this app)|name (?:it|this|the app))\s+(["“']?)([^"”'.,;!?\n]{2,60})/i,
  // Group 1: optional type word, group 2: label. "add a short text field called Next step"
  addFieldFor: /(?:\badd\s+|\bwant\s+|\bneed\s+|\binclude\s+|\bwith\s+|\band\s+|^)(?:a |an |another |one )?(?:(?:new|short|long|simple|little|quick|small|1[–-]5|1 to 5|five[- ]star) )*(?:(text|number|numeric|date|rating|checkbox|choice|select|dropdown|link|url|tags?|long[- ]text|free[- ]text|yes\/no) )?(?:field|column|box|input|section|line)\s+(?:for|called|named|labell?ed|titled|to track|to record|to note|to log|about)\s+["“']?([^"”'.,;!?\n]{2,50})/gi,
  // Group 1: label, group 2: optional type word. "add a weather text field"
  addXField: /(?:\badd\s+|\bwant\s+|\bneed\s+|\binclude\s+|\bwith\s+|\band\s+|^)(?:a |an |another |one )?(?:(?:new|short|long|simple|little|quick|small) )*["“']?([a-z0-9][a-z0-9 '\-]{1,40}?)["”']?\s+(?:(text|number|numeric|date|rating|checkbox|choice|select|link|url|tags?) )?(?:field|column|box|input|section)\b/gi,
  // Group 1: label phrase. "a place to record the weather"
  placeToRecord: /\b(?:a place|somewhere|a spot|a box|a space|a way|room) (?:to|for|where i can) (?:record|note|write|track|log|capture|jot)(?:ing)?(?: down)? (?:what |the |my |how |each |every )?([^.,;!?\n]{3,50})/gi,
  typeWordOnly: /^(?:text|number|numeric|date|rating|checkbox|choice|select|dropdown|link|url|tags?|long[- ]text|short[- ]text|free[- ]text|field|column)$/i,
  specificWords: /\b(?:reflection|reflections|learned|lesson|lessons|rating|rate|score|stars|mood|energy|feeling|feelings|next|due|deadline|priority|urgent|location|where|tags?|topics?|categor(?:y|ies)|labels?|photo|photos|image|images|picture|pictures|upload|attachment|reminder|notification|challenge|prompt|camera|shutter|aperture|iso|lens|lenses|exif)\b/i,
};

// ---------- photo details ----------

/** Details people note per photo, each a short text field with an example (shooting order). */
export const CAMERA_DETAILS = {
  camera: { label: 'Camera', placeholder: 'Fujifilm X100V' },
  lens: { label: 'Lens', placeholder: '23mm f/2' },
  shutter: { label: 'Shutter', placeholder: '1/250' },
  aperture: { label: 'Aperture', placeholder: 'f/8' },
  iso: { label: 'ISO', placeholder: '400' },
} as const;
export type CameraDetail = keyof typeof CAMERA_DETAILS;
const CAMERA_ORDER: CameraDetail[] = ['camera', 'lens', 'shutter', 'aperture', 'iso'];
const CAMERA_SETTINGS_RX = /\b(?:camera|exposure|shooting|shot)\s+(?:settings?|details|info|data)\b|\bexif\b|\bsettings\s+(?:i|you)\s+(?:used|shot)\b/i;

/**
 * The camera details a text asks for: "camera settings" means Camera, Shutter and Aperture; "shutter
 * speed", "aperture", "ISO" and "lens" name their own. `bare` also accepts a list item that is just "camera".
 */
export function cameraDetailsIn(text: string, bare = false): CameraDetail[] {
  const t = text.toLowerCase();
  const found = new Set<CameraDetail>();
  if (CAMERA_SETTINGS_RX.test(t)) for (const d of ['camera', 'shutter', 'aperture'] as const) found.add(d);
  if (/\bshutter(?:\s*speeds?)?\b/.test(t)) found.add('shutter');
  if (/\bapertures?\b|\bf[- ]?stops?\b|\bf-numbers?\b/.test(t)) found.add('aperture');
  if (/\biso\b/.test(t)) found.add('iso');
  if (/\blens(?:es)?\b|\bfocal lengths?\b/.test(t)) found.add('lens');
  if (/\b(?:which|what)\s+camera\b|\bcamera\s+(?:body|model|used|name)\b/.test(t) || (bare && /^(?:the\s+|my\s+|a\s+)?cameras?$/.test(t.trim()))) found.add('camera');
  return CAMERA_ORDER.filter((d) => found.has(d));
}

/** Camera details to add (each a detail of the photo, placed under its caption), to bring back, or already there. */
function cameraPlan(spec: SpecLike, details: CameraDetail[], takeId: (preferred: string) => string): { intents: Intent[]; existing: string[] } {
  const intents: Intent[] = [];
  const existing: string[] = [];
  for (const d of details) {
    const { label, placeholder } = CAMERA_DETAILS[d];
    const match = spec.fields.find((x) => (x.type === 'text' || x.type === 'long_text') && (normalizeLabel(x.label) === normalizeLabel(label) || x.id === d));
    if (match?.hidden) intents.push({ kind: 'unhide_field', fieldId: match.id, change: `brought back “${match.label}”` });
    else if (match) existing.push(match.label);
    else intents.push({ kind: 'add_field', field: f.text(takeId(d), label, { placeholder }), change: `added a short text field “${label}”`, placement: 'detail' });
  }
  return { intents, existing };
}

/** "Light already has Camera, Shutter and Aperture.": what a revision says when everything asked for is there. */
export function alreadyHas(specName: string, labels: string[]): Unsupported {
  const names = joinNatural(labels);
  return { request: names, reason: `${specName} already has ${names}${/[.?!]$/.test(names) ? '' : '.'}`, alternative: 'Ask for another detail to note, or for a different look.' };
}

/** Intents for camera details: add the missing ones, bring hidden ones back, note the ones already there. */
function cameraIntents(spec: SpecLike, details: CameraDetail[], takeId: (preferred: string) => string): Intent[] {
  if (!details.length) return [];
  const { intents, existing } = cameraPlan(spec, details, takeId);
  return intents.length ? intents : existing.map((label): Intent => ({ kind: 'exists', label }));
}

/**
 * What an app says when asked for something it cannot do: send, remind, notify or connect to another
 * service. The alternative fits the app: due dates where entries have deadlines, the app's own home-screen
 * icon where they do not (a photo gallery or a practice timer has nothing to be due).
 */
function externalItem(spec: SpecLike, request: string): Unsupported {
  return {
    request,
    reason: 'This app cannot send messages, set reminders or connect to other services yet.',
    alternative: spec.pattern === 'board' || spec.pattern === 'queue'
      ? `Items due soon and anything overdue are highlighted on the ${spec.pattern} when you open it, so you can follow up yourself.`
      : spec.pattern === 'gallery' || spec.pattern === 'practice'
        ? `Add ${spec.name} to your home screen so it is one tap away when you want it; nothing here sends reminders or messages.`
        : 'Add a due date and the app will highlight items due soon whenever you open it.',
  };
}

/** A name that is really part of a phrase ("name it after my band", "call it a day"), unless it was quoted. */
export function unlikelyName(raw: string): boolean {
  return /^(?:after|a|an|the|my|our|your|his|her|their|it|its|this|that|these|those|for|with|by|from|of|in|on|at|to|into|about|something|anything|whatever|me|us|them|him)\b/.test(raw.trim());
}

// ---------- lists: "add camera, lens and ISO to my photo notes" ----------

const LIST_ADD_RX = /\b(?:add|include|record|track|log|note down|note|capture)\s+((?:(?!\b(?:to|on|in|into|onto|for)\b)[^.;!?\n]){2,140}?)\s+(?:to|on|in|into|onto|for)\s+((?:(?:my|the|each|every|all|our|its|this|these)\s+)*)([a-z][a-z'’ -]{0,40}?)\s*(?=$|[.;!?\n]|,?\s+(?:and|then|also|please|so)\b)/gi;
const LIST_SPLIT_RX = /\s*(?:,|;|&|\+|\band\b|\bplus\b|\bas well as\b|\balong with\b)\s*/i;
/** Words that make a list another planner's job: a named field, an option, a timer preset, a look. */
const NOT_A_LIST_RX = /\b(?:field|column|called|named|option|stage|preset|timer|prompt|challenge|view|tab|look|theme|minutes?|bpm)\b/i;
const GENERIC_TARGETS = ['notes', 'note', 'entries', 'entry', 'items', 'item', 'records', 'record', 'cards', 'card', 'form', 'forms', 'app', 'list'];

const pluralNoun = (w: string) => (/person$/i.test(w) ? w.replace(/person$/i, 'people') : /(?:s|x|z|ch|sh)$/i.test(w) ? `${w}es` : /[^aeiou]y$/i.test(w) ? `${w.slice(0, -1)}ies` : `${w}s`);

/** "my photo notes", "each walk", "each person", "Light": the place a list of details is added to is the entries themselves. */
function isEntryTarget(spec: SpecLike, raw: string): boolean {
  const t = normalizeLabel(raw.replace(/['’]s\b/g, ''));
  if (!t) return false;
  const names = new Set(GENERIC_TARGETS);
  if (spec.entryNoun) {
    names.add(normalizeLabel(spec.entryNoun.singular));
    names.add(normalizeLabel(spec.entryNoun.plural));
  }
  const app = normalizeLabel(spec.name);
  names.add(app);
  names.add(`${app} app`);
  if (spec.fields.some((x) => x.type === 'image')) for (const w of ['photo', 'photos', 'picture', 'pictures', 'shot', 'shots', 'image', 'images']) names.add(w);
  for (const v of spec.views) {
    // The noun on the app's own button ("Add person", "Add photo", "Save a source") names its entries too.
    const noun = /^(?:\+\s*)?(?:add|new|save|log)\s+(?:a\s+|an\s+|the\s+|your\s+)?([a-z][a-z' -]{1,30})$/i.exec((v.addLabel ?? '').trim())?.[1];
    if (noun) {
      names.add(normalizeLabel(noun));
      names.add(normalizeLabel(pluralNoun(noun.trim())));
    }
    if (v.type === 'queue') for (const w of ['person', 'people', 'contact', 'contacts']) names.add(w);
  }
  return names.has(t) || /^[a-z]+(?: [a-z]+)? notes?$/.test(t);
}

/** "it", "this one", "more detail", "some colour": not the name of a detail (left to the planner, which declines or maps it). */
const VAGUE_ITEM_RX = /^(?:(?:the|a|an|my|some|any|more|a bit of|a little|a few)\s+)*(?:it|this|that|these|those|them|this one|that one|one|ones|more|some|any|all|everything|something|anything|stuff|things?|details?|info|information|bits?|colou?rs?|look|looks|style|styles|theme|vibe|flair|personality|life|pop|sparkle|fun)$/i;

/** "this photo", "the shot I took this morning": the entry itself (something to add in the app), never a field. */
function isEntryItself(spec: SpecLike, item: string): boolean {
  const nouns = ['one', 'entry', 'item', ...(spec.entryNoun ? [spec.entryNoun.singular, spec.entryNoun.plural] : [])];
  if (spec.fields.some((x) => x.type === 'image')) nouns.push('photo', 'photos', 'picture', 'pictures', 'shot', 'shots', 'image', 'images', 'pic', 'pics');
  const rx = new RegExp(`^(?:(?:this|that|these|those|the|my|a|an|today['’]?s|tonight['’]?s|another|one more)\\s+)*(?:${nouns.map((n) => n.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?:\\s+(?:i|we|you)\\b.*)?$`, 'i');
  return rx.test(item.trim());
}

/** One "add <list> to <entries>" phrase: the whole match, its list of details and where they go. */
export interface ListPhrase { whole: string; list: string; target: string }

export function listPhrases(text: string): ListPhrase[] {
  return [...text.matchAll(LIST_ADD_RX)].map((m) => ({ whole: m[0], list: m[1] ?? '', target: m[3] ?? '' }));
}

/**
 * Camera details a text asks to add to entries ("Add camera settings to my photo notes", "note shutter
 * speed and aperture for each photo"): only details named in the list being added, never the settings of a
 * shared photo ("Shot at ISO 400, add it to Light").
 */
export function listedCameraDetails(text: string): CameraDetail[] {
  const found = new Set<CameraDetail>();
  for (const p of listPhrases(text)) {
    if (NOT_A_LIST_RX.test(p.list)) continue;
    for (const item of p.list.split(LIST_SPLIT_RX)) for (const d of cameraDetailsIn(item.trim(), true)) found.add(d);
  }
  return CAMERA_ORDER.filter((d) => found.has(d));
}

/**
 * "Add A, B and C to my <entries>": one field per item (camera details and known kinds of field keep
 * their own shape). Returns the intents and the text with those requests taken out (each becomes a
 * clause break, so "… and hide the location" stays a request of its own). Requests the app cannot do
 * ("add reminders to my photos") are declined, never made into fields; items that only point at
 * something ("add it to my photos", "add some colour") are left to the planner; details the app already
 * has are named ("Light already has Where and Date").
 */
export function listAdditions(spec: SpecLike, text: string, taken: Set<string>): { intents: Intent[]; rest: string } {
  const intents: Intent[] = [];
  const takeId = (preferred: string) => {
    const id = slugifyFieldId(preferred, taken);
    taken.add(id);
    return id;
  };
  const sameLabel = (a: string, b: string) => normalizeLabel(a) === normalizeLabel(b);
  const details: CameraDetail[] = [];
  const existing: string[] = [];
  let rest = text;
  for (const m of text.matchAll(LIST_ADD_RX)) {
    const list = m[1] ?? '';
    if (!isEntryTarget(spec, m[3] ?? '') || NOT_A_LIST_RX.test(list)) continue;
    let used = false;
    let declined = false;
    for (const item of list.split(LIST_SPLIT_RX).map((s) => s.trim()).filter(Boolean)) {
      if (RX.external.test(item) || findUnsupported(item).length) {
        if (!declined) intents.push({ kind: 'unsupported', item: externalItem(spec, clauseFor(m[0], RX.external)) });
        declined = true;
        used = true;
        continue;
      }
      const camera = cameraDetailsIn(item, true);
      if (camera.length) {
        for (const d of camera) if (!details.includes(d)) details.push(d);
        used = true;
        continue;
      }
      if (VAGUE_ITEM_RX.test(item) || isEntryItself(spec, item)) continue;
      const label = cleanLabel(item.replace(/\s+(?:details?|info)$/i, ''));
      if (!label || VAGUE_ITEM_RX.test(label)) continue;
      used = true;
      // Known kinds first ("a rating", "tags", "a due date"): they have their own shape and options.
      if (RX.specificWords.test(label) || RX.dueDate.test(label)) {
        const sub = planInstructions(spec, `add a ${label} field`, undefined, { taken, nested: true });
        if (sub.length) {
          intents.push(...sub);
          continue;
        }
      }
      const dup = spec.fields.find((x) => x.id === slugifyFieldId(label) || sameLabel(x.label, label));
      if (dup) {
        if (dup.hidden && !intents.some((i) => i.kind === 'unhide_field' && i.fieldId === dup.id)) intents.push({ kind: 'unhide_field', fieldId: dup.id, change: `brought back “${dup.label}”` });
        else if (!dup.hidden && !existing.includes(dup.label)) existing.push(dup.label);
        continue;
      }
      if (RX.typeWordOnly.test(label)) continue;
      if (intents.some((i) => i.kind === 'add_field' && sameLabel(i.field.label, label))) continue;
      const field = genericField(takeId(label), label);
      intents.push({ kind: 'add_field', field, change: `added a ${typeWord(field)} field “${label}”` });
    }
    // Only a phrase that asked for something here is taken out; "add it to my photos" stays for the planner.
    if (used) rest = rest.replace(m[0], '. ');
  }
  const camera = cameraPlan(spec, details, takeId);
  intents.push(...camera.intents);
  for (const label of camera.existing) if (!existing.includes(label)) existing.push(label);
  for (const label of existing) intents.push({ kind: 'exists', label });
  return { intents, rest: rest.replace(/\s+/g, ' ').replace(/^[\s.]+/, '').trim() };
}

// ---------- planning ----------

export function planInstructions(spec: SpecLike, text: string, _conceptId?: string, opts: PlanOptions = {}): Intent[] {
  const intents: Intent[] = [];
  let t = (text ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return intents;
  const fields = spec.fields;
  const taken = opts.taken ?? new Set<string>();
  for (const x of fields) taken.add(x.id);
  for (const id of opts.reserved ?? []) taken.add(id);
  // Lists of details first ("add camera, lens and ISO to my photo notes"); their words are consumed here.
  if (!opts.nested) {
    const list = listAdditions(spec, t, taken);
    intents.push(...list.intents);
    t = list.rest;
    if (!t) return intents;
  }
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
    else intents.push({ kind: 'exists', label: match.label });
  };

  // Unsupported requests first, so their clauses are not also treated as field requests.
  // Photo uploads are real in gallery apps (an image field); elsewhere they are declined honestly.
  if (RX.attachments.test(t) && !fields.some((x) => x.type === 'image' && !x.hidden)) {
    intents.push({ kind: 'unsupported', item: {
      request: clauseFor(t, RX.attachments),
      reason: 'Photo uploads are only part of photo-gallery apps for now; other attachments are not supported.',
      alternative: 'A link field to the photo is added instead. For real photo uploads, make a gallery app like Light.',
    } });
    reuseOrAdd(existing((x) => x.type === 'url'), () => f.url(takeId('photo_link'), 'Link to the photo', { placeholder: 'https://' }), 'added a link field for the photo');
  }
  if (RX.external.test(t)) {
    intents.push({ kind: 'unsupported', item: externalItem(spec, clauseFor(t, RX.external)) });
  }

  // Prompt rotation.
  const rotation = spec.rules?.find((r) => r.type === 'prompt_rotation');
  const rotationName = rotation?.title ?? (rotation?.cadence === 'daily' ? 'a daily prompt' : 'a weekly challenge');
  if (RX.dailyPrompt.test(t)) {
    if (!rotation || rotation.cadence !== 'daily') intents.push({ kind: 'prompt_rotation', cadence: 'daily', change: rotation ? 'switched the prompts to daily' : 'added a daily prompt with 8 rotating prompts' });
    else intents.push({ kind: 'exists', label: rotationName });
  } else if (RX.weeklyChallenge.test(t)) {
    if (!rotation) intents.push({ kind: 'prompt_rotation', cadence: 'weekly', change: 'added a weekly challenge with 8 rotating prompts' });
    else if (rotation.cadence !== 'weekly' && /weekly/i.test(t)) intents.push({ kind: 'prompt_rotation', cadence: 'weekly', change: 'switched the prompts to weekly' });
    else intents.push({ kind: 'exists', label: rotationName });
  }

  // Practice timer presets (only apps with a timer).
  const preset = RX.preset.exec(t);
  const practice = spec.views.find((v) => v.type === 'practice');
  if (preset && practice && practice.type === 'practice') {
    const n = minutesFromText(preset[1] ?? preset[2] ?? '');
    if (n && (practice.presets ?? [10, 15, 25])[0] !== n) intents.push({ kind: 'practice_preset', minutes: n, change: `set the default session to ${n} minutes` });
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
    else {
      const date = fields.find((x) => x.id === plan.dateFieldId);
      if (date) intents.push({ kind: 'exists', label: date.label });
    }
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
  // Camera details ("add camera settings to my photo notes", "shutter speed and aperture"): one short field each.
  intents.push(...cameraIntents(spec, cameraDetailsIn(t), takeId));

  // Rename ("call it Evening Walks"; never "name it after my band" or "call it a day" unless quoted).
  const rename = RX.renameTo.exec(t);
  if (rename?.[2]) {
    const raw = rename[2].trim().replace(/["“”']/g, '');
    const name = clip(sentenceCase(raw), 60);
    if (!rename[1] && unlikelyName(raw)) {
      intents.push({ kind: 'unsupported', item: { request: clip(rename[0], 200), reason: 'I couldn’t tell what the new name should be.', alternative: 'Put the name in quotes, for example: call it “Evening Light”.' } });
    } else if (name.length >= 1 && name.toLowerCase() !== spec.name.toLowerCase()) intents.push({ kind: 'rename', name, change: `renamed the app to “${name}”` });
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
      else if (!dup.hidden) intents.push({ kind: 'exists', label: dup.label });
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

/** What a due-date request needs to add for this spec (only the missing parts); a new date field never takes a reserved id. */
export function dueDatePlan(spec: SpecLike, reserved: Iterable<string> = []): { field?: FieldInput; rule?: RuleInput; dateFieldId: string; boardView?: { viewId: string } } {
  const dateField = spec.fields.find((x) => x.type === 'date' && !x.hidden && (x.id === 'due' || /due|deadline|by\b|follow/i.test(x.label)));
  const dateFieldId = dateField?.id ?? slugifyFieldId('due', [...spec.fields.map((x) => x.id), ...reserved]);
  const out: { field?: FieldInput; rule?: RuleInput; dateFieldId: string; boardView?: { viewId: string } } = { dateFieldId };
  if (!dateField) out.field = f.due(dateFieldId, spec.pattern === 'board' ? 'Due date' : 'Due date', { help: 'Items due within 3 days are highlighted' });
  const hasRule = spec.rules?.some((r) => r.type === 'due_soon' && r.dateFieldId === dateFieldId);
  if (!hasRule) {
    const board = spec.views.find((v): v is Extract<ViewInput, { type: 'board' }> => v.type === 'board');
    const stage = board ? spec.fields.find((x) => x.id === board.stageFieldId && x.type === 'select') : undefined;
    // "Done" comes only from a view binding (a queue's done box); a checkbox that merely mentions
    // completion (e.g. "Completed the warm-up?") must never decide whether an item is overdue.
    const queue = spec.views.find((v): v is Extract<ViewInput, { type: 'queue' }> => v.type === 'queue');
    const done = queue?.doneFieldId ? spec.fields.find((x) => x.id === queue.doneFieldId && x.type === 'checkbox') : undefined;
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
  // A photo's details go right under its caption, in the order asked; other new fields go at the end.
  let detailAfter = detailAnchor(spec);
  for (const intent of planInstructions(spec, instructions, conceptId)) {
    switch (intent.kind) {
      case 'add_field': {
        if (spec.fields.some((x) => x.id === intent.field.id)) break;
        const after = intent.placement === 'detail' ? detailAfter : undefined;
        const at = after ? spec.fields.findIndex((x) => x.id === after) : -1;
        if (at >= 0) spec.fields.splice(at + 1, 0, intent.field); else spec.fields.push(intent.field);
        exposeField(spec, intent.field, at >= 0 ? after : undefined);
        if (at >= 0) detailAfter = intent.field.id;
        changes.push(intent.change);
        break;
      }
      case 'exists':
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
      case 'practice_preset':
        for (const v of spec.views) {
          if (v.type !== 'practice') continue;
          v.presets = [intent.minutes, ...(v.presets ?? [10, 15, 25]).filter((p) => p !== intent.minutes)].slice(0, 6);
        }
        changes.push(intent.change);
        break;
      case 'unsupported':
        unsupported.push(intent.item);
        break;
    }
  }
  focusPrompt(spec, instructions, changes);
  return { spec, changes, unsupported };
}

/** "Focus on shadows and reflections", the Make page's focus words, in the person's own phrasing. */
const FOCUS_RX = /\bfocus(?:\s+more)?\s+on\s+([^.!?\n]{3,60})/i;

/**
 * Focus words for an app with a rotating prompt (Light's weekly prompt): the person's own words become this
 * period's prompt, placed where the rotation lands now, and the other prompts rotate after it as before. A
 * real, visible change in the made app; nothing else is claimed. Apps without a rotation are left alone.
 */
function focusPrompt(spec: AppSpecInput, instructions: string, changes: string[]): void {
  const m = FOCUS_RX.exec(instructions);
  if (!m) return;
  const words = m[1]!.trim().replace(/[\s,;:]+$/, '');
  if (!words) return;
  const prompt = `Focus on ${words}`;
  const rule = (spec.rules ?? []).find((r) => r.type === 'prompt_rotation') as PromptRotationRule | undefined;
  if (!rule || !Array.isArray(rule.prompts) || rule.prompts.some((p) => p.toLowerCase() === prompt.toLowerCase())) return;
  for (let at = 0; at <= rule.prompts.length; at++) {
    const prompts = [...rule.prompts.slice(0, at), prompt, ...rule.prompts.slice(at)];
    if (currentPrompt({ ...rule, prompts }).text === prompt) {
      rule.prompts = prompts;
      changes.push(`made “${prompt}” ${rule.cadence === 'daily' ? 'today’s' : 'this week’s'} prompt`);
      return;
    }
  }
}

/**
 * Make a newly added field visible in views that enumerate fields explicitly. Forms that list their
 * fields (gallery, practice, links, queue) get it too; when an app holds several kinds of record
 * (filtered views, e.g. Riff's sessions and sources) only the primary view's form does.
 */
function exposeField(spec: AppSpecInput, field: FieldInput, after?: string): void {
  const primary = spec.views.find((v) => v.type !== 'summary');
  for (const v of spec.views) {
    if (v.type === 'journal' && v.showFieldIds && !v.showFieldIds.includes(field.id)) v.showFieldIds.push(field.id);
    if (v.type === 'list' && v.columnFieldIds && v.columnFieldIds.length < 8 && field.type !== 'long_text') v.columnFieldIds.push(field.id);
    if (v.type === 'board' && v.cardFieldIds && v.cardFieldIds.length < 6 && (field.type === 'date' || field.type === 'select' || field.type === 'text')) v.cardFieldIds.push(field.id);
    if (v.formFieldIds && !v.formFieldIds.includes(field.id) && v.formFieldIds.length < 30 && (!v.filter || v === primary)) {
      const at = after ? v.formFieldIds.indexOf(after) : -1;
      if (at >= 0) v.formFieldIds.splice(at + 1, 0, field.id); else v.formFieldIds.push(field.id);
    }
  }
}

/**
 * Where a photo's details (Camera, Shutter, Aperture) go: right under its caption, as in "Add camera
 * settings to my photo notes" (reference 07), else under its note. Undefined for an app without a gallery.
 */
export function detailAnchor(spec: Pick<SpecLike, 'fields' | 'views'>): string | undefined {
  const gallery = spec.views.find((v) => v.type === 'gallery');
  if (!gallery || gallery.type !== 'gallery') return undefined;
  for (const id of [gallery.captionFieldId, gallery.noteFieldId]) {
    if (!id || !spec.fields.some((x) => x.id === id && !x.hidden)) continue;
    if (!gallery.formFieldIds || gallery.formFieldIds.includes(id)) return id;
  }
  return undefined;
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
  // Numbers people write with spaces, plus signs or leading zeros are text ("Phone number", "Postcode").
  if (/\b(phone|mobile|telephone|tel|fax|zip|zip code|postcode|post code|postal code|passport|account|iban)\b/.test(l)) return f.text(id, label);
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
    case 'image': return 'photo';
  }
}

export function patternNoun(pattern: Pattern): string {
  switch (pattern) {
    case 'journal': return 'journal';
    case 'board': return 'board';
    case 'gallery': return 'gallery';
    case 'practice': return 'practice room';
    case 'queue': return 'queue';
    default: return 'tracker';
  }
}

export function purposeWord(purpose: Purpose): string {
  return purpose === 'work' ? 'get things done' : 'explore';
}
