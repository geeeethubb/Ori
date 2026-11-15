/**
 * What a proposed change says about itself, kept true by construction. Used by the sample planner and,
 * as deterministic post-steps, on the live planner's proposals:
 * - alignDurationCopy: when a change moves the default session (a timer's first preset) from A to B
 *   minutes, copy that states A (tagline, empty-state hint, tab names, button labels, prompt titles)
 *   says B in the same proposal, so the preview, the applied app and an undo all agree (audit P1-02).
 *   The app's name is never changed here; a note says so when it still states A.
 * - alignSpecDurations: the same for a new app whose first preset came from the request.
 * - proposalSummary: one short, future-tense summary of what WOULD change; nothing has changed yet.
 * - looksAlreadyDone: a summary written as if the change were already made.
 * - rekeyReservedFields: a new field never takes an id that an earlier version used.
 */
import { designFor, viewTypeLabel, type AppSpec, type AppSpecInput, type ViewSpec } from '../../../shared/appSpec.ts';
import { slugifyFieldId } from '../../../shared/ids.ts';
import { applyRevision, type RevisionOp } from '../../../shared/revision.ts';
import { minutesCount, minutesWords, rewriteMinutes } from './durations.ts';
import { cameraDetailsIn, detailAnchor } from './heuristics.ts';
import { clip, joinNatural } from './text.ts';

type Op<K extends RevisionOp['op']> = Extract<RevisionOp, { op: K }>;

const q = (s: string) => `“${s}”`;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const days = (n: number) => `${n} day${n === 1 ? '' : 's'}`;

/** The default session of an app: the first preset of its first practice timer, or null without one. */
export function defaultSessionMinutes(spec: Pick<AppSpecInput, 'views'>): number | null {
  const v = spec.views.find((x) => x.type === 'practice');
  if (!v || v.type !== 'practice') return null;
  return v.presets?.[0] ?? 10;
}

export interface DurationAlignment {
  ops: RevisionOp[];
  /** Old and new default session, when the change moves it. */
  from: number | null;
  to: number | null;
  /** True when copy now states the new length (added ops, or an op the change already had). */
  copyChanged: boolean;
  /** Ops added only to keep the copy true. */
  copyOps: RevisionOp[];
  /** Plain words when the app's name still states the old length (names are never changed for the person). */
  note: string | null;
}

/** Copy that states the old default session says the new one, inside the same proposal. */
export function alignDurationCopy(before: AppSpec, ops: RevisionOp[]): DurationAlignment {
  const unchanged: DurationAlignment = { ops, from: null, to: null, copyChanged: false, copyOps: [], note: null };
  const dry = applyRevision(before, ops);
  if (!dry.ok || !dry.spec) return unchanged;
  const from = defaultSessionMinutes(before);
  const to = defaultSessionMinutes(dry.spec);
  if (from === null || to === null || from === to) return unchanged;
  const after = dry.spec;
  const out: RevisionOp[] = ops.map((o) => structuredClone(o));
  const copyOps: RevisionOp[] = [];
  let changed = false;
  const fix = (s: string | undefined) => (s ? rewriteMinutes(s, from, to) : { text: '', count: 0 });
  const add = (op: RevisionOp) => {
    out.push(op);
    copyOps.push(op);
    changed = true;
  };

  const tagline = fix(after.tagline);
  if (tagline.count) {
    const rename = out.find((o): o is Op<'rename_app'> => o.op === 'rename_app');
    if (rename) {
      rename.tagline = tagline.text;
      changed = true;
    } else add({ op: 'rename_app', name: after.name, tagline: tagline.text });
  }
  const hint = fix(after.emptyStateHint);
  if (hint.count) {
    const set = out.find((o): o is Op<'set_empty_state_hint'> => o.op === 'set_empty_state_hint');
    if (set) {
      set.hint = hint.text;
      changed = true;
    } else add({ op: 'set_empty_state_hint', hint: hint.text });
  }
  for (const v of after.views) {
    const title = fix(v.title);
    const label = fix(v.addLabel);
    if (!title.count && !label.count) continue;
    const view: ViewSpec = { ...structuredClone(v), ...(title.count ? { title: title.text } : {}), ...(label.count ? { addLabel: label.text } : {}) };
    const existing = out.find((o): o is Op<'replace_view'> | Op<'add_view'> => (o.op === 'replace_view' && o.viewId === v.id) || (o.op === 'add_view' && o.view.id === v.id));
    if (existing) {
      existing.view = view;
      changed = true;
    } else add({ op: 'replace_view', viewId: v.id, view });
  }
  for (const r of after.rules) {
    if (r.type !== 'prompt_rotation') continue;
    const title = fix(r.title);
    if (!title.count) continue;
    const rule = { ...structuredClone(r), title: title.text };
    const existing = out.find((o): o is Op<'replace_rule'> | Op<'add_rule'> => (o.op === 'replace_rule' && o.ruleId === r.id) || (o.op === 'add_rule' && o.rule.id === r.id));
    if (existing) {
      existing.rule = rule;
      changed = true;
    } else add({ op: 'replace_rule', ruleId: r.id, rule });
  }
  const note = fix(after.name).count ? `The name ${q(after.name)} still says ${minutesWords(from)}; ask to rename it if you like.` : null;
  if (!changed) return { ...unchanged, from, to, note };
  // Never trade a working proposal for nicer words: copy that no longer fits the limits is left as it was.
  if (!applyRevision(before, out).ok) return { ...unchanged, from, to, note };
  return { ops: out, from, to, copyChanged: true, copyOps, note };
}

/** A new app's copy states the default it really starts at (after the request's length became its first preset). */
export function alignSpecDurations(spec: AppSpecInput, from: number, to: number): number {
  if (from === to) return 0;
  let count = 0;
  const fix = (s: string) => {
    const r = rewriteMinutes(s, from, to);
    count += r.count;
    return r.text;
  };
  if (spec.tagline) spec.tagline = fix(spec.tagline);
  if (spec.emptyStateHint) spec.emptyStateHint = fix(spec.emptyStateHint);
  for (const v of spec.views) {
    if (v.title) v.title = fix(v.title);
    if (v.addLabel) v.addLabel = fix(v.addLabel);
  }
  for (const r of spec.rules ?? []) if (r.type === 'prompt_rotation' && r.title) r.title = fix(r.title);
  return count;
}

/** Make `minutes` the first preset of the app's practice timer; returns the preset it replaced, or null. */
export function setSessionDefault(spec: AppSpecInput, minutes: number): number | null {
  const v = spec.views.find((x) => x.type === 'practice');
  if (!v || v.type !== 'practice') return null;
  const presets = v.presets ?? [10, 15, 25];
  const from = presets[0] ?? null;
  if (from === minutes) return null;
  v.presets = [minutes, ...presets.filter((p) => p !== minutes)].slice(0, 6);
  return from;
}

export interface SummaryOptions {
  /** Future-tense sentences for particular ops (keyed by the op's JSON), used instead of the generic one. */
  sentences?: Map<string, string>;
  /** From alignDurationCopy: ops added only to keep the copy true, summarised by one sentence. */
  copyOps?: RevisionOp[];
  /** Set when the copy was aligned: the length it now states. */
  copyMinutes?: number | null;
  note?: string | null;
  unsupportedCount?: number;
}

function sentenceFor(before: AppSpec, op: RevisionOp): string | null {
  const field = (id: string) => before.fields.find((f) => f.id === id);
  const label = (id: string) => field(id)?.label ?? id.replace(/_/g, ' ');
  switch (op.op) {
    case 'update_field': {
      const f = field(op.fieldId);
      if (!f) return null;
      if (op.patch.label && op.patch.label !== f.label) return `${q(f.label)} will be called ${q(op.patch.label)}.`;
      if (op.patch.required === true) return `${q(f.label)} will be required for new ${before.entryNoun.plural}.`;
      if (op.patch.required === false) return `${q(f.label)} will be optional.`;
      return `${q(f.label)} will get new wording.`;
    }
    case 'hide_field':
      return `${q(label(op.fieldId))} will be hidden; its saved values stay.`;
    case 'unhide_field':
      return `${q(label(op.fieldId))} will show again.`;
    case 'add_select_option':
      return `${q(op.option.label)} will be a new choice in ${q(label(op.fieldId))}.`;
    case 'rename_app': {
      // A new name says it all; the tagline's before and after are in the change list.
      if (op.name !== before.name) return `${before.name} will be called ${q(op.name)}.`;
      if (op.tagline === undefined || op.tagline === (before.tagline ?? '')) return null;
      return op.tagline ? `Its tagline will read ${q(op.tagline)}.` : 'Its tagline will be removed.';
    }
    case 'set_icon':
      return `${before.name} will get a new icon.`;
    case 'set_design': {
      const theme = op.design.theme && op.design.theme !== designFor(before).theme ? op.design.theme : null;
      return theme ? `${before.name} will use the ${theme} look.` : `${before.name}’s look will change.`;
    }
    case 'add_view':
      return `A new ${q(op.view.title ?? viewTypeLabel(op.view.type))} tab will be added.`;
    case 'replace_view': {
      const prev = before.views.find((v) => v.id === op.viewId);
      if (prev?.type === 'practice' && op.view.type === 'practice') {
        const next = op.view.presets;
        // A new list that drops lengths ("change the presets to 5, 10 and 20 minutes") is named in full.
        const listed = prev.presets.some((p) => !next.includes(p));
        const bits: string[] = [];
        const timer = prev.presets[0] !== next[0] && !listed;
        if (timer) bits.push(`the timer will start at ${minutesCount(next[0] ?? 10)}`);
        if (prev.defaultTempo !== op.view.defaultTempo) bits.push(`the metronome ${timer ? 'at' : 'will start at'} ${op.view.defaultTempo} bpm`);
        if (prev.tempoHelper !== op.view.tempoHelper) bits.push(op.view.tempoHelper ? 'the metronome will show' : 'the metronome will be hidden');
        const list = listed ? `The timer presets will be ${joinNatural(next.map(String))} minutes, starting at ${next[0]}.` : null;
        if (list || bits.length) return [list, bits.length ? `${cap(joinNatural(bits))}.` : null].filter(Boolean).join(' ');
        if (prev.presets.join() !== next.join()) return `The timer presets will be ${next.join(', ')} minutes.`;
      }
      return `The ${q(op.view.title ?? prev?.title ?? viewTypeLabel(op.view.type))} tab will change.`;
    }
    case 'remove_view': {
      const v = before.views.find((x) => x.id === op.viewId);
      return `The ${q(v?.title ?? (v ? viewTypeLabel(v.type) : 'extra'))} tab will be removed; your ${before.entryNoun.plural} stay.`;
    }
    case 'add_rule':
      return op.rule.type === 'due_soon' ? `Anything due within ${days(op.rule.withinDays)} will be highlighted.` : `A rotating ${op.rule.cadence} prompt will be added.`;
    case 'replace_rule': {
      if (op.rule.type === 'due_soon') return `Anything due within ${days(op.rule.withinDays)} will be highlighted.`;
      const prev = before.rules.find((r) => r.id === op.ruleId);
      if (prev?.type === 'prompt_rotation' && prev.cadence !== op.rule.cadence) return `The prompts will change ${op.rule.cadence === 'daily' ? 'every day' : 'every week'}.`;
      return `The ${op.rule.cadence} prompts will change.`;
    }
    case 'remove_rule': {
      const prev = before.rules.find((r) => r.id === op.ruleId);
      if (!prev) return null;
      return prev.type === 'due_soon' ? 'Items due soon will no longer be highlighted.' : `The ${prev.cadence} prompt will be removed.`;
    }
    case 'set_empty_state_hint':
      return `The hint before the first ${before.entryNoun.singular} will change.`;
    case 'set_entry_noun':
      return `${cap(before.entryNoun.plural)} will be called ${q(op.plural)}.`;
    default:
      return null;
  }
}

/**
 * One short, future-tense summary of what a change WOULD do (the preview comes before anything changes):
 * "Light will get “Camera”, “Shutter” and “Aperture” on each photo." The preview shows it above the change
 * lines, which already say what happens to saved entries ("Existing photos keep their data"), so the
 * summary does not repeat that. It is a preview, not a history line (see changeHistoryLine).
 */
export function proposalSummary(before: AppSpec, ops: RevisionOp[], opts: SummaryOptions = {}): string {
  const noun = before.entryNoun;
  const skip = new Set(opts.copyOps ?? []);
  const sentences: string[] = [];
  const push = (s: string | null | undefined) => {
    if (s && !sentences.includes(s)) sentences.push(s);
  };
  const added = ops.filter((o): o is Op<'add_field'> => o.op === 'add_field' && !skip.has(o));
  if (added.length) push(`${before.name} will get ${joinNatural(added.map((o) => q(o.field.label)))} on each ${noun.singular}.`);
  for (const op of ops) {
    if (skip.has(op) || op.op === 'add_field') continue;
    push(opts.sentences?.get(JSON.stringify(op)) ?? sentenceFor(before, op));
  }
  if (opts.copyMinutes) push(`Its wording will say ${minutesWords(opts.copyMinutes)} too.`);
  if (!sentences.length) push('Nothing about how it works will change.');
  let summary = sentences.slice(0, 3).join(' ');
  const more = sentences.length - 3;
  if (more > 0) summary += ` And ${more} more change${more === 1 ? '' : 's'}.`;
  if (opts.note && summary.length + opts.note.length < 260) summary += ` ${opts.note}`;
  const n = opts.unsupportedCount ?? 0;
  if (n) summary += ` ${n === 1 ? 'One request is' : `${n} requests are`} not included; see below.`;
  return clip(summary, 300);
}

const DONE_RX = /^(?:(?:ok(?:ay)?|done|great|sure)[,.!]?\s+)?(?:i(?:['’]ve| have)?\s+)?(?:added|renamed|changed|updated|set|made|removed|hid|switched|moved|turned|gave|created|replaced|applied|adjusted|reordered|tweaked)\b|\b(?:has|have) been (?:added|changed|updated|renamed|set|made|removed|applied|hidden)\b|\b(?:is|are) now\b|\bnow (?:has|have|shows|starts|says|uses)\b/i;

/** A summary written as if the change already happened ("Added a Camera field", "The timer is now 5 minutes"). */
export function looksAlreadyDone(summary: string): boolean {
  return DONE_RX.test(summary.trim());
}

/**
 * A photo's details (Camera, Lens, Shutter, Aperture, ISO) sit right under its caption, in the order asked,
 * as in reference 07, whatever placement a model chose; other new fields keep theirs. A no-op for an app
 * without a gallery.
 */
export function placePhotoDetails(spec: AppSpec, ops: RevisionOp[]): RevisionOp[] {
  let after = detailAnchor(spec);
  if (!after) return ops;
  return ops.map((o) => {
    if (o.op !== 'add_field' || !cameraDetailsIn(o.field.label, true).length || !after) return o;
    const placed: RevisionOp = { ...o, afterFieldId: after };
    after = o.field.id;
    return placed;
  });
}

const FIELD_REF_KEY = /^(?:fieldId|[a-z]+FieldId)$/;
const FIELD_LIST_KEY = /^[a-z]+FieldIds$/;

function remapRefs(value: unknown, rename: Map<string, string>, key = ''): unknown {
  if (Array.isArray(value)) return value.map((v) => (FIELD_LIST_KEY.test(key) && typeof v === 'string' ? rename.get(v) ?? v : remapRefs(v, rename)));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = typeof v === 'string' && FIELD_REF_KEY.test(k) ? rename.get(v) ?? v : remapRefs(v, rename, k);
    return out;
  }
  return value;
}

/**
 * Ids earlier versions used stay taken, so a new field never inherits an old field's saved values: an
 * added field whose id was used before gets a fresh one, everywhere the change refers to it.
 */
export function rekeyReservedFields(spec: AppSpec, ops: RevisionOp[], reserved: Iterable<string> = []): RevisionOp[] {
  const current = new Set(spec.fields.map((f) => f.id));
  const old = new Set([...reserved].filter((id) => !current.has(id)));
  if (!old.size) return ops;
  const taken = new Set<string>([...current, ...old, ...ops.flatMap((o) => (o.op === 'add_field' ? [o.field.id] : []))]);
  const rename = new Map<string, string>();
  for (const o of ops) {
    if (o.op !== 'add_field' || !old.has(o.field.id) || rename.has(o.field.id)) continue;
    const id = slugifyFieldId(o.field.label, taken);
    taken.add(id);
    rename.set(o.field.id, id);
  }
  if (!rename.size) return ops;
  return ops.map((o) => {
    const next = remapRefs(o, rename) as RevisionOp;
    if (o.op === 'add_field' && next.op === 'add_field') return { ...next, field: { ...next.field, id: rename.get(o.field.id) ?? o.field.id } };
    return next;
  });
}
