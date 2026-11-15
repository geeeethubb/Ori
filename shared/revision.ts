/**
 * Revisions: a bounded set of operations that turn spec version N into N+1.
 * Every operation is additive or reversible; field removal is modeled as hiding, so values stay
 * recoverable. Unsupported requests are declined with an alternative instead of guessed.
 * In the product this is "Make this more me": preview first, accept, undo any time.
 */
import { z } from 'zod';
import {
  AppIconSchema, AppSpecSchema, DesignPatchSchema, DesignSchema, FieldSchema, RuleSchema, SelectOptionSchema, ViewSchema,
  designFor, fieldTypeLabel, recordMatchesView, viewRoles, viewTypeLabel, type AppSpec, type FieldSpec, type FieldType, type RuleSpec, type ViewSpec,
} from './appSpec.ts';
import { FIELD_ID_PATTERN } from './ids.ts';

const fieldId = z.string().regex(FIELD_ID_PATTERN);
const label = z.string().trim().min(1).max(60);

export const RevisionOpSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('add_field'), field: FieldSchema, afterFieldId: fieldId.optional() }),
  z.object({
    op: z.literal('update_field'),
    fieldId,
    patch: z.object({
      label: label.optional(),
      help: z.string().trim().max(160).optional(),
      placeholder: z.string().trim().max(160).optional(),
      required: z.boolean().optional(),
    }),
  }),
  z.object({ op: z.literal('hide_field'), fieldId }),
  z.object({ op: z.literal('unhide_field'), fieldId }),
  z.object({ op: z.literal('add_select_option'), fieldId, option: SelectOptionSchema }),
  z.object({ op: z.literal('rename_app'), name: label, tagline: z.string().trim().max(120).optional() }),
  z.object({ op: z.literal('set_icon'), icon: AppIconSchema }),
  /** Change the app's look (theme, accent, typography, density, artwork); any subset, the rest is kept. */
  z.object({ op: z.literal('set_design'), design: DesignPatchSchema }),
  z.object({ op: z.literal('add_view'), view: ViewSchema }),
  z.object({ op: z.literal('replace_view'), viewId: fieldId, view: ViewSchema }),
  z.object({ op: z.literal('remove_view'), viewId: fieldId }),
  z.object({ op: z.literal('add_rule'), rule: RuleSchema }),
  z.object({ op: z.literal('replace_rule'), ruleId: fieldId, rule: RuleSchema }),
  z.object({ op: z.literal('remove_rule'), ruleId: fieldId }),
  z.object({ op: z.literal('set_empty_state_hint'), hint: z.string().trim().max(160) }),
  z.object({ op: z.literal('set_entry_noun'), singular: label, plural: label }),
]);
export type RevisionOp = z.infer<typeof RevisionOpSchema>;

export const UnsupportedRequestSchema = z.object({
  request: z.string().max(400),
  reason: z.string().max(400),
  alternative: z.string().max(400),
});

/** What the model (or heuristic planner) proposes; shown to the user before anything changes. */
export const RevisionProposalSchema = z.object({
  summary: z.string().trim().min(1).max(300),
  ops: z.array(RevisionOpSchema).max(20),
  unsupported: z.array(UnsupportedRequestSchema).max(10).default([]),
});
export type RevisionProposal = z.infer<typeof RevisionProposalSchema>;

export interface ApplyResult {
  ok: boolean;
  spec?: AppSpec;
  changes: string[];
  errors: string[];
}

function describeField(f: FieldSpec): string {
  return `“${f.label}” (${fieldTypeLabel(f.type)})`;
}

const THEME_WORDS: Record<string, string> = {
  bright: 'the bright theme', paper: 'the paper theme', charcoal: 'the charcoal theme', ink: 'the ink theme', mint: 'the mint theme', lilac: 'the lilac theme', sunset: 'the sunset theme',
};

const dayCount = (n: number) => `${n} day${n === 1 ? '' : 's'}`;

function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** A hint quoted back in a change line, shortened at a word and without its closing full stop. */
function quoteHint(s: string): string {
  const t = s.trim().replace(/[.!]+$/, '');
  return t.length <= 90 ? t : `${t.slice(0, 89).replace(/\s+\S*$/, '')}…`;
}

/** What the person will notice when a view is replaced: before → after for its defaults, tab name and button. */
function viewChangeLines(prev: ViewSpec, next: ViewSpec): string[] {
  const generic = `Update the ${viewTypeLabel(next.type)} view.`;
  if (prev.type !== next.type) return [generic];
  const lines: string[] = [];
  if (prev.type === 'practice' && next.type === 'practice') {
    if (prev.presets[0] !== next.presets[0]) lines.push(`Default session: ${prev.presets[0]} min → ${next.presets[0]} min.`);
    const sameSet = prev.presets.length === next.presets.length && prev.presets.every((p) => next.presets.includes(p));
    if (!sameSet) lines.push(`Timer presets: ${prev.presets.join(', ')} → ${next.presets.join(', ')} min.`);
    if (prev.defaultTempo !== next.defaultTempo) lines.push(`Metronome: ${prev.defaultTempo} bpm → ${next.defaultTempo} bpm.`);
    if (prev.tempoHelper !== next.tempoHelper) lines.push(`Metronome: ${prev.tempoHelper ? 'on' : 'off'} → ${next.tempoHelper ? 'on' : 'off'}.`);
  }
  if (next.title && prev.title !== next.title) lines.push(`Tab name: “${prev.title ?? viewTypeLabel(prev.type)}” → “${next.title}”.`);
  if (next.addLabel && prev.addLabel !== next.addLabel) lines.push(`Button: “${prev.addLabel ?? 'Add'}” → “${next.addLabel}”.`);
  return lines.length ? lines : [generic];
}

/** Before → after for a replaced rule: the due-soon window, or the prompts' rhythm and title. */
function ruleChangeLines(prev: RuleSpec | undefined, next: RuleSpec): string[] {
  if (next.type === 'due_soon') {
    return [prev?.type === 'due_soon' && prev.withinDays !== next.withinDays
      ? `Due-soon window: ${dayCount(prev.withinDays)} → ${dayCount(next.withinDays)}.`
      : `Change the due-soon window to ${dayCount(next.withinDays)}.`];
  }
  const lines: string[] = [];
  if (prev?.type === 'prompt_rotation') {
    if (prev.cadence !== next.cadence) lines.push(`Prompts: ${prev.cadence} → ${next.cadence}.`);
    if (prev.title !== next.title) lines.push(`Prompt title: “${prev.title}” → “${next.title}”.`);
    if (prev.prompts.join('\n') !== next.prompts.join('\n')) lines.push(`Update the ${next.cadence} prompts.`);
  }
  return lines.length ? lines : [`Update the ${next.cadence} prompts.`];
}

/**
 * Field ids a view role, a view filter or a due rule depends on. Hiding one would break the app (a
 * queue without its person, a timer without its minutes), so every revision refuses it.
 */
export function boundFieldIds(spec: AppSpec): Set<string> {
  const ids = new Set<string>();
  for (const v of spec.views) {
    for (const r of viewRoles(v)) if (r.structural) ids.add(r.fieldId);
    if (v.filter) ids.add(v.filter.fieldId);
  }
  for (const r of spec.rules) {
    if (r.type !== 'due_soon') continue;
    ids.add(r.dateFieldId);
    if (r.stageFieldId) ids.add(r.stageFieldId);
    if (r.doneFieldId) ids.add(r.doneFieldId);
  }
  return ids;
}

/** Bound fields plus those a summary metric measures (the Sample planner also declines to hide these). */
export function structuralFieldIds(spec: AppSpec): Set<string> {
  const ids = boundFieldIds(spec);
  for (const v of spec.views) {
    if (v.type === 'summary') for (const m of v.metrics) if (m.fieldId && m.kind !== 'count') ids.add(m.fieldId);
  }
  return ids;
}

/** Every field id an app has ever defined, with its type: an id is never reused for a different type. */
export function reservedFieldTypes(specs: AppSpec[]): Map<string, FieldType> {
  const out = new Map<string, FieldType>();
  for (const s of specs) for (const f of s.fields) out.set(f.id, f.type);
  return out;
}

export interface ApplyOptions {
  /** Ids used by earlier versions (see reservedFieldTypes); re-adding one with another type is refused. */
  reserved?: Map<string, FieldType>;
}

/** Apply operations in order; returns a validated new spec plus readable change lines. */
export function applyRevision(current: AppSpec, ops: RevisionOp[], options: ApplyOptions = {}): ApplyResult {
  const spec: AppSpec = structuredClone(current);
  const changes: string[] = [];
  const errors: string[] = [];
  const find = (id: string) => spec.fields.find((f) => f.id === id);
  /** Where each added field's line sits, so several new fields read as one line. */
  const added: { at: number; field: FieldSpec }[] = [];

  for (const op of ops) {
    switch (op.op) {
      case 'add_field': {
        if (find(op.field.id)) { errors.push(`A field with id "${op.field.id}" already exists`); break; }
        const usedAs = options.reserved?.get(op.field.id);
        if (usedAs && usedAs !== op.field.type) {
          errors.push(`“${op.field.id}” held ${fieldTypeLabel(usedAs)} values in an earlier version; a ${fieldTypeLabel(op.field.type)} field needs another name so saved values are never misread.`);
          break;
        }
        const idx = op.afterFieldId ? spec.fields.findIndex((f) => f.id === op.afterFieldId) : -1;
        if (idx >= 0) spec.fields.splice(idx + 1, 0, op.field); else spec.fields.push(op.field);
        // Make the field visible in views that enumerate fields explicitly. Forms: every unfiltered view,
        // plus the primary form-bearing view (summaries have no form) so the field is always reachable.
        // In a form it sits right after afterFieldId when the form has that field (Light's camera details
        // under the caption), otherwise at the end.
        const primaryForm = spec.views.find((v) => v.type !== 'summary');
        for (const v of spec.views) {
          if (v.type === 'journal' && v.showFieldIds) v.showFieldIds.push(op.field.id);
          if (v.type === 'list' && v.columnFieldIds && v.columnFieldIds.length < 8) v.columnFieldIds.push(op.field.id);
          const takesForm = !v.filter || v === primaryForm;
          if (takesForm && v.formFieldIds && !v.formFieldIds.includes(op.field.id)) {
            const at = op.afterFieldId ? v.formFieldIds.indexOf(op.afterFieldId) : -1;
            if (at >= 0) v.formFieldIds.splice(at + 1, 0, op.field.id); else v.formFieldIds.push(op.field.id);
          }
        }
        added.push({ at: changes.length, field: op.field });
        changes.push(`Add ${describeField(op.field)}. Existing ${spec.entryNoun.plural} keep their data; this field starts empty for them${op.field.required ? ` and stays optional when you edit them (required only for new ${spec.entryNoun.plural})` : ''}.`);
        break;
      }
      case 'update_field': {
        const f = find(op.fieldId);
        if (!f) { errors.push(`Unknown field "${op.fieldId}"`); break; }
        const before = f.label;
        Object.assign(f, Object.fromEntries(Object.entries(op.patch).filter(([, v]) => v !== undefined)));
        changes.push(op.patch.label && op.patch.label !== before ? `Rename “${before}” to “${op.patch.label}”.` : `Update “${f.label}”.`);
        if (op.patch.required === true) changes.push(`“${f.label}” becomes required for new ${spec.entryNoun.plural}; existing ones are not changed.`);
        break;
      }
      case 'hide_field': {
        const f = find(op.fieldId);
        if (!f) { errors.push(`Unknown field "${op.fieldId}"`); break; }
        if (f.hidden) break;
        if (boundFieldIds(spec).has(f.id)) {
          errors.push(`“${f.label}” is what this app is built around, so it can't be hidden. You can rename it instead.`);
          break;
        }
        f.hidden = true;
        f.required = false;
        for (const v of spec.views) {
          if (v.type === 'journal' && v.showFieldIds) v.showFieldIds = v.showFieldIds.filter((id) => id !== f.id);
          if (v.type === 'list' && v.columnFieldIds) v.columnFieldIds = v.columnFieldIds.filter((id) => id !== f.id);
          if (v.type === 'board' && v.cardFieldIds) v.cardFieldIds = v.cardFieldIds.filter((id) => id !== f.id);
          if (v.formFieldIds) v.formFieldIds = v.formFieldIds.filter((id) => id !== f.id);
        }
        changes.push(`Hide “${f.label}”. Saved values are kept and can be restored later.`);
        break;
      }
      case 'unhide_field': {
        const f = find(op.fieldId);
        if (!f) { errors.push(`Unknown field "${op.fieldId}"`); break; }
        f.hidden = false;
        const primaryForm = spec.views.find((v) => v.type !== 'summary');
        for (const v of spec.views) {
          if (v.type === 'journal' && v.showFieldIds && !v.showFieldIds.includes(f.id)) v.showFieldIds.push(f.id);
          if (v.formFieldIds && !v.formFieldIds.includes(f.id) && (!v.filter || v === primaryForm)) v.formFieldIds.push(f.id);
        }
        changes.push(`Show “${f.label}” again.`);
        break;
      }
      case 'add_select_option': {
        const f = find(op.fieldId);
        if (!f || f.type !== 'select') { errors.push(`"${op.fieldId}" is not a choice field`); break; }
        if (f.options.some((o) => o.value === op.option.value)) break;
        f.options.push(op.option);
        changes.push(`Add option “${op.option.label}” to “${f.label}”.`);
        break;
      }
      case 'rename_app': {
        const before = spec.name;
        const beforeTagline = spec.tagline;
        spec.name = op.name;
        if (op.tagline !== undefined) spec.tagline = op.tagline;
        if (before !== op.name) changes.push(`Rename the app from “${before}” to “${op.name}”.`);
        if (op.tagline !== undefined && op.tagline !== (beforeTagline ?? '')) {
          changes.push(!op.tagline ? 'Remove the tagline.' : beforeTagline ? `Tagline: “${beforeTagline}” → “${op.tagline}”.` : `Tagline: “${op.tagline}”.`);
        }
        break;
      }
      case 'set_icon':
        spec.icon = op.icon;
        changes.push('Change the app icon.');
        break;
      case 'set_design': {
        // Start from the resolved look (compatibility defaults included) so a theme-only change keeps the rest.
        const merged = { ...designFor(spec), ...Object.fromEntries(Object.entries(op.design).filter(([, v]) => v !== undefined)) };
        spec.design = DesignSchema.parse(merged);
        const bits: string[] = [];
        if (op.design.theme) bits.push(THEME_WORDS[op.design.theme] ?? op.design.theme);
        if (op.design.accent) bits.push(`${/^[aeiou]/.test(op.design.accent) ? 'an' : 'a'} ${op.design.accent} accent`);
        if (op.design.typography) bits.push(`${op.design.typography} typography`);
        if (op.design.density) bits.push(`${op.design.density} spacing`);
        if (op.design.artwork) bits.push(op.design.artwork === 'none' ? 'no artwork' : `${op.design.artwork} artwork`);
        changes.push(bits.length ? `Change the look: ${bits.join(', ')}. Your ${spec.entryNoun.plural} are untouched.` : 'Keep the current look.');
        break;
      }
      case 'add_view':
        if (spec.views.some((v) => v.id === op.view.id)) { errors.push(`View "${op.view.id}" already exists`); break; }
        spec.views.push(op.view);
        changes.push(`Add a ${viewTypeLabel(op.view.type)} view${op.view.title ? ` “${op.view.title}”` : ''}.`);
        break;
      case 'replace_view': {
        const i = spec.views.findIndex((v) => v.id === op.viewId);
        if (i < 0) { errors.push(`Unknown view "${op.viewId}"`); break; }
        const prev = spec.views[i] as ViewSpec;
        spec.views[i] = op.view;
        changes.push(...viewChangeLines(prev, op.view));
        break;
      }
      case 'remove_view': {
        if (spec.views.length <= 1) { errors.push('An app needs at least one view'); break; }
        const before = spec.views.length;
        spec.views = spec.views.filter((v) => v.id !== op.viewId);
        if (spec.views.length !== before) changes.push('Remove a view.');
        break;
      }
      case 'add_rule':
        if (spec.rules.some((r) => r.id === op.rule.id)) { errors.push(`Rule "${op.rule.id}" already exists`); break; }
        spec.rules.push(op.rule);
        changes.push(op.rule.type === 'due_soon'
          ? `Highlight items due within ${op.rule.withinDays} day${op.rule.withinDays === 1 ? '' : 's'} and anything overdue.`
          : `Add a rotating ${op.rule.cadence} prompt (${op.rule.prompts.length} prompts).`);
        break;
      case 'replace_rule': {
        const i = spec.rules.findIndex((r) => r.id === op.ruleId);
        if (i < 0) { errors.push(`Unknown rule "${op.ruleId}"`); break; }
        const prevRule = spec.rules[i];
        spec.rules[i] = op.rule;
        changes.push(...ruleChangeLines(prevRule, op.rule));
        break;
      }
      case 'remove_rule': {
        const before = spec.rules.length;
        spec.rules = spec.rules.filter((r) => r.id !== op.ruleId);
        if (spec.rules.length !== before) changes.push('Remove a rule.');
        break;
      }
      case 'set_empty_state_hint':
        spec.emptyStateHint = op.hint;
        changes.push(op.hint ? `Update the hint shown before the first ${spec.entryNoun.singular}: “${quoteHint(op.hint)}”.` : `Remove the hint shown before the first ${spec.entryNoun.singular}.`);
        break;
      case 'set_entry_noun':
        spec.entryNoun = { singular: op.singular, plural: op.plural };
        changes.push(`Call items “${op.plural}”.`);
        break;
    }
  }

  // Several new fields read as one line: "Add “Camera”, “Shutter” and “Aperture” (short text). …"
  if (added.length > 1) {
    const first = added[0] as { at: number; field: FieldSpec };
    const sameType = added.every((a) => a.field.type === first.field.type);
    const names = joinList(added.map((a) => (sameType ? `“${a.field.label}”` : describeField(a.field))));
    const required = added.some((a) => a.field.required);
    const noun = spec.entryNoun.plural;
    const line = `Add ${names}${sameType ? ` (${fieldTypeLabel(first.field.type)})` : ''}. Existing ${noun} keep their data; these fields start empty for them${required ? ` and stay optional when you edit them (required only for new ${noun})` : ''}.`;
    const lines = new Set(added.map((a) => a.at));
    const merged = changes.flatMap((c, i) => (i === first.at ? [line] : lines.has(i) ? [] : [c]));
    changes.splice(0, changes.length, ...merged);
  }

  if (errors.length) return { ok: false, changes, errors };
  const parsed = AppSpecSchema.safeParse(spec);
  if (!parsed.success) {
    return { ok: false, changes, errors: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) };
  }
  return { ok: true, spec: parsed.data, changes, errors: [] };
}

/**
 * The line version history keeps for an applied change, built from applyRevision's change lines. Those
 * lines are imperative or before → after ("Add “Camera” … (short text).", "Default session: 10 min → 5 min."),
 * so they still read correctly after the change; a proposal's summary is a preview in the future tense and
 * is not a history line. Whole lines only, within `max` characters (an export allows 300), with a count of
 * the lines left out.
 */
export function changeHistoryLine(changes: string[], max = 300): string {
  const lines = changes.map((c) => c.replace(/\s+/g, ' ').trim()).filter(Boolean);
  if (!lines.length) return 'No visible change.';
  const more = (n: number) => (n > 0 ? ` And ${n} more change${n === 1 ? '' : 's'}.` : '');
  let text = '';
  let kept = 0;
  for (const line of lines) {
    const next = text ? `${text} ${line}` : line;
    if (next.length + more(lines.length - kept - 1).length > max) break;
    text = next;
    kept++;
  }
  if (!kept) {
    const tail = more(lines.length - 1);
    const first = lines[0] ?? '';
    text = `${first.slice(0, Math.max(1, max - tail.length - 1)).replace(/\s+\S*$/, '')}…`;
    kept = 1;
  }
  return `${text}${more(lines.length - kept)}`;
}

export interface RecordLike {
  values: Record<string, unknown>;
}

const hasValue = (v: unknown) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0);

/**
 * A value the person entered, as opposed to the form's untouched default (an unticked box, the first
 * choice, a preset number). Undo only carries a newer field along when someone entered something in it.
 */
function enteredValue(f: FieldSpec, v: unknown): boolean {
  if (!hasValue(v)) return false;
  if (f.type === 'checkbox') return v !== (f.default ?? false);
  if (f.type === 'select') return v !== (f.default ?? f.options[0]?.value);
  if (f.type === 'date') return f.default === undefined || f.default === 'today' || v !== f.default;
  if ('default' in f && f.default !== undefined) return JSON.stringify(v) !== JSON.stringify(f.default);
  return true;
}

/** Entries that some list view of `before` shows but no list view of `after` would show. */
export function strandedRecords(before: AppSpec, after: AppSpec, records: RecordLike[]): { count: number; views: string[] } {
  const shownIn = (spec: AppSpec, r: RecordLike) => spec.views.filter((v) => v.type !== 'summary' && recordMatchesView(v, r.values));
  let count = 0;
  const views = new Set<string>();
  for (const r of records) {
    const was = shownIn(before, r);
    if (!was.length || shownIn(after, r).length) continue; // already hidden before, or still reachable
    count++;
    for (const v of was) views.add(v.title ?? viewTypeLabel(v.type));
  }
  return { count, views: [...views] };
}

/** Plain-language refusal when a change would leave saved entries reachable from no view. */
export function strandedReason(spec: AppSpec, stranded: { count: number; views: string[] }, what: string): string | null {
  if (!stranded.count) return null;
  const noun = stranded.count === 1 ? spec.entryNoun.singular : spec.entryNoun.plural;
  return `${stranded.count} ${noun} ${stranded.count === 1 ? 'is' : 'are'} only shown in “${stranded.views.join('”, “')}”, which ${what} doesn't have, so nothing was changed.`;
}

export interface UndoPlan {
  ok: boolean;
  spec?: AppSpec;
  /** What stays saved although the earlier design doesn't show it (shown before and after the undo). */
  kept: string[];
  /** Why the undo can't run safely, in plain words. */
  blocked: string[];
}

/**
 * Data-safe design undo. The earlier version's design comes back, but nothing saved since is orphaned:
 * fields added later that hold values come along hidden (their ids stay reserved, the values stay intact
 * and can be shown again), and choices that entries use stay available. An undo that would leave entries
 * reachable from no view, or would read saved values as another type, is refused with the reason.
 */
export function planUndo(current: AppSpec, previous: AppSpec, records: RecordLike[]): UndoPlan {
  const spec: AppSpec = structuredClone(previous);
  const kept: string[] = [];
  const blocked: string[] = [];
  const noun = (n: number) => (n === 1 ? current.entryNoun.singular : current.entryNoun.plural);
  for (const f of current.fields) {
    const n = records.filter((r) => hasValue(r.values[f.id])).length;
    const pf = spec.fields.find((x) => x.id === f.id);
    if (!pf) {
      // Values stay stored either way; the field definition only comes along when someone entered
      // something in it, so undoing "add a checkbox" really removes it when every box is unticked.
      const entered = records.filter((r) => enteredValue(f, r.values[f.id])).length;
      if (!entered) continue;
      spec.fields.push({ ...structuredClone(f), hidden: true, required: false } as FieldSpec);
      kept.push(`“${f.label}” stays saved in ${entered} ${noun(entered)}. It is hidden for now; you can show it again any time.`);
      continue;
    }
    if (pf.type !== f.type) {
      if (n) blocked.push(`“${f.label}” holds ${fieldTypeLabel(f.type)} values that the earlier version would read as ${fieldTypeLabel(pf.type)}.`);
      continue;
    }
    if (pf.type === 'select' && f.type === 'select') {
      for (const o of f.options) {
        if (pf.options.some((x) => x.value === o.value)) continue;
        const used = records.filter((r) => r.values[f.id] === o.value).length;
        if (!used) continue;
        pf.options.push(structuredClone(o));
        kept.push(`The choice “${o.label}” in “${pf.label}” stays, because ${used} ${noun(used)} use${used === 1 ? 's' : ''} it.`);
      }
    }
  }
  const stranded = strandedReason(current, strandedRecords(current, spec, records), 'the earlier version');
  if (stranded) blocked.push(stranded);
  if (blocked.length) return { ok: false, kept, blocked };
  const parsed = AppSpecSchema.safeParse(spec);
  if (!parsed.success) return { ok: false, kept, blocked: ['The earlier version cannot hold what you saved since, so nothing was changed.'] };
  return { ok: true, spec: parsed.data, kept, blocked };
}

/** Field IDs whose values are affected by a set of ops (for UI hints). */
export function fieldsTouched(ops: RevisionOp[]): string[] {
  const ids = new Set<string>();
  for (const op of ops) {
    if ('fieldId' in op) ids.add(op.fieldId);
    if (op.op === 'add_field') ids.add(op.field.id);
  }
  return [...ids];
}
