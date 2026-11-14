/**
 * Revisions: a bounded set of operations that turn spec version N into N+1.
 * Every operation is additive or reversible; field removal is modeled as hiding, so values stay
 * recoverable. Unsupported requests are declined with an alternative instead of guessed.
 * In the product this is "Make this more me": preview first, accept, undo any time.
 */
import { z } from 'zod';
import {
  AppIconSchema, AppSpecSchema, DesignSchema, FieldSchema, RuleSchema, SelectOptionSchema, ViewSchema,
  fieldTypeLabel, viewTypeLabel, type AppSpec, type FieldSpec,
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
  /** Change the app's look (theme, accent, typography, density, artwork); any subset. */
  z.object({ op: z.literal('set_design'), design: DesignSchema.partial() }),
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

/** Apply operations in order; returns a validated new spec plus readable change lines. */
export function applyRevision(current: AppSpec, ops: RevisionOp[]): ApplyResult {
  const spec: AppSpec = structuredClone(current);
  const changes: string[] = [];
  const errors: string[] = [];
  const find = (id: string) => spec.fields.find((f) => f.id === id);

  for (const op of ops) {
    switch (op.op) {
      case 'add_field': {
        if (find(op.field.id)) { errors.push(`A field with id "${op.field.id}" already exists`); break; }
        const idx = op.afterFieldId ? spec.fields.findIndex((f) => f.id === op.afterFieldId) : -1;
        if (idx >= 0) spec.fields.splice(idx + 1, 0, op.field); else spec.fields.push(op.field);
        // Make the field visible in views that enumerate fields explicitly.
        for (const v of spec.views) {
          if (v.type === 'journal' && v.showFieldIds) v.showFieldIds.push(op.field.id);
          if (v.type === 'list' && v.columnFieldIds && v.columnFieldIds.length < 8) v.columnFieldIds.push(op.field.id);
          if (v.formFieldIds && !v.formFieldIds.includes(op.field.id) && !v.filter) v.formFieldIds.push(op.field.id);
        }
        changes.push(`Add ${describeField(op.field)}. Existing ${spec.entryNoun.plural} keep their data; this field starts empty for them.`);
        break;
      }
      case 'update_field': {
        const f = find(op.fieldId);
        if (!f) { errors.push(`Unknown field "${op.fieldId}"`); break; }
        const before = f.label;
        Object.assign(f, Object.fromEntries(Object.entries(op.patch).filter(([, v]) => v !== undefined)));
        changes.push(op.patch.label && op.patch.label !== before ? `Rename “${before}” to “${op.patch.label}”.` : `Update “${f.label}”.`);
        break;
      }
      case 'hide_field': {
        const f = find(op.fieldId);
        if (!f) { errors.push(`Unknown field "${op.fieldId}"`); break; }
        if (f.hidden) break;
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
        for (const v of spec.views) {
          if (v.type === 'journal' && v.showFieldIds && !v.showFieldIds.includes(f.id)) v.showFieldIds.push(f.id);
          if (v.formFieldIds && !v.formFieldIds.includes(f.id) && !v.filter) v.formFieldIds.push(f.id);
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
        spec.name = op.name;
        if (op.tagline !== undefined) spec.tagline = op.tagline;
        changes.push(before === op.name ? 'Update the tagline.' : `Rename the app from “${before}” to “${op.name}”.`);
        break;
      }
      case 'set_icon':
        spec.icon = op.icon;
        changes.push('Change the app icon.');
        break;
      case 'set_design': {
        const merged = { ...(spec.design ?? {}), ...Object.fromEntries(Object.entries(op.design).filter(([, v]) => v !== undefined)) };
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
        spec.views[i] = op.view;
        changes.push(`Update the ${viewTypeLabel(op.view.type)} view.`);
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
        spec.rules[i] = op.rule;
        changes.push(op.rule.type === 'due_soon' ? `Change the due-soon window to ${op.rule.withinDays} days.` : `Update the ${op.rule.cadence} prompts.`);
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
        changes.push('Update the empty-state hint.');
        break;
      case 'set_entry_noun':
        spec.entryNoun = { singular: op.singular, plural: op.plural };
        changes.push(`Call items “${op.plural}”.`);
        break;
    }
  }

  if (errors.length) return { ok: false, changes, errors };
  const parsed = AppSpecSchema.safeParse(spec);
  if (!parsed.success) {
    return { ok: false, changes, errors: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) };
  }
  return { ok: true, spec: parsed.data, changes, errors: [] };
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
