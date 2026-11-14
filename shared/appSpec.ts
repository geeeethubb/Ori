/**
 * AppSpec: the validated, bounded definition of a personal app.
 *
 * The runtime renders ONLY what this schema allows (an allowlist of field types, views and
 * rules). No generated code is ever executed. Field IDs are stable: labels, order, views and
 * rules may change across versions while records keep their field-id → value maps.
 */
import { z } from 'zod';
import { FIELD_ID_PATTERN } from './ids.ts';
import { ICON_COLORS, ICON_SYMBOLS } from './icons.ts';

export const APP_SPEC_SCHEMA_VERSION = 1 as const;

// ---------- fields ----------

const fieldId = z.string().regex(FIELD_ID_PATTERN, 'Field IDs must be snake_case (a-z, 0-9, _)');
const label = z.string().trim().min(1).max(60);
const shortText = z.string().trim().max(160);

const FieldBase = z.object({
  id: fieldId,
  label,
  help: shortText.optional(),
  placeholder: shortText.optional(),
  required: z.boolean().optional(),
  /** Hidden fields are not shown in forms/views but their stored values are preserved. */
  hidden: z.boolean().optional(),
});

export const SelectOptionSchema = z.object({
  value: z.string().trim().min(1).max(40),
  label: z.string().trim().min(1).max(40),
  color: z.enum(ICON_COLORS).optional(),
});
export type SelectOption = z.infer<typeof SelectOptionSchema>;

export const FieldSchema = z.discriminatedUnion('type', [
  FieldBase.extend({ type: z.literal('text'), maxLength: z.number().int().min(1).max(500).optional(), default: z.string().max(500).optional() }),
  FieldBase.extend({ type: z.literal('long_text'), default: z.string().max(5000).optional() }),
  FieldBase.extend({ type: z.literal('date'), default: z.union([z.literal('today'), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).optional() }),
  FieldBase.extend({
    type: z.literal('number'),
    min: z.number().optional(),
    max: z.number().optional(),
    step: z.number().positive().optional(),
    unit: z.string().trim().max(16).optional(),
    default: z.number().optional(),
  }),
  FieldBase.extend({
    type: z.literal('select'),
    options: z.array(SelectOptionSchema).min(1).max(20),
    default: z.string().optional(),
  }),
  FieldBase.extend({ type: z.literal('checkbox'), default: z.boolean().optional() }),
  FieldBase.extend({ type: z.literal('rating'), max: z.number().int().min(3).max(10).default(5), default: z.number().int().optional() }),
  FieldBase.extend({ type: z.literal('url'), default: z.string().max(500).optional() }),
  FieldBase.extend({ type: z.literal('tags'), suggestions: z.array(z.string().trim().min(1).max(30)).max(20).optional(), default: z.array(z.string()).optional() }),
]);
export type FieldSpec = z.infer<typeof FieldSchema>;
export type FieldType = FieldSpec['type'];
export const FIELD_TYPES = ['text', 'long_text', 'date', 'number', 'select', 'checkbox', 'rating', 'url', 'tags'] as const satisfies readonly FieldType[];

// ---------- views ----------

const viewId = z.string().regex(FIELD_ID_PATTERN);

const ViewBase = z.object({ id: viewId, title: label.optional() });

export const JournalViewSchema = ViewBase.extend({
  type: z.literal('journal'),
  dateFieldId: fieldId,
  /** Field used as the entry headline (optional; falls back to date). */
  titleFieldId: fieldId.optional(),
  /** Fields shown on each entry in order. Omitted → all visible non-title fields. */
  showFieldIds: z.array(fieldId).max(30).optional(),
  sort: z.enum(['newest', 'oldest']).default('newest'),
});

export const BoardViewSchema = ViewBase.extend({
  type: z.literal('board'),
  /** Must reference a select field; each option becomes a column. */
  stageFieldId: fieldId,
  titleFieldId: fieldId,
  /** Optional date field used for due-soon/overdue highlighting. */
  dueFieldId: fieldId.optional(),
  /** Stage values that count as done (completed cards never show as overdue). */
  doneStageValues: z.array(z.string()).max(20).default([]),
  /** Extra fields shown on the card. */
  cardFieldIds: z.array(fieldId).max(6).optional(),
});

export const ListViewSchema = ViewBase.extend({
  type: z.literal('list'),
  titleFieldId: fieldId,
  columnFieldIds: z.array(fieldId).max(8).optional(),
  sortFieldId: fieldId.optional(),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});

export const MetricSchema = z.object({
  id: viewId,
  label,
  kind: z.enum(['count', 'sum', 'avg', 'min', 'max', 'streak', 'latest']),
  /** Required for sum/avg/min/max/latest; for streak the date field (defaults to createdAt). */
  fieldId: fieldId.optional(),
  period: z.enum(['all', 'today', 'week', 'month']).default('all'),
  /** Optional filter applied before aggregation. */
  where: z
    .object({
      fieldId,
      op: z.enum(['eq', 'neq', 'truthy', 'falsy']),
      value: z.union([z.string(), z.number(), z.boolean()]).optional(),
    })
    .optional(),
  unit: z.string().trim().max(16).optional(),
});
export type MetricSpec = z.infer<typeof MetricSchema>;

export const SummaryViewSchema = ViewBase.extend({
  type: z.literal('summary'),
  metrics: z.array(MetricSchema).min(1).max(6),
});

export const ViewSchema = z.discriminatedUnion('type', [JournalViewSchema, BoardViewSchema, ListViewSchema, SummaryViewSchema]);
export type ViewSpec = z.infer<typeof ViewSchema>;
export type ViewType = ViewSpec['type'];

// ---------- rules (deterministic, bounded) ----------

const RuleBase = z.object({ id: viewId });

export const DueSoonRuleSchema = RuleBase.extend({
  type: z.literal('due_soon'),
  dateFieldId: fieldId,
  withinDays: z.number().int().min(0).max(90).default(3),
  /** Either a checkbox field that marks completion… */
  doneFieldId: fieldId.optional(),
  /** …or a select field + values that count as done. */
  stageFieldId: fieldId.optional(),
  doneStageValues: z.array(z.string()).max(20).optional(),
  label: shortText.optional(),
});

export const PromptRotationRuleSchema = RuleBase.extend({
  type: z.literal('prompt_rotation'),
  cadence: z.enum(['daily', 'weekly']).default('weekly'),
  title: label.default('This week'),
  prompts: z.array(z.string().trim().min(1).max(200)).min(1).max(52),
});

export const RuleSchema = z.discriminatedUnion('type', [DueSoonRuleSchema, PromptRotationRuleSchema]);
export type RuleSpec = z.infer<typeof RuleSchema>;
export type DueSoonRule = z.infer<typeof DueSoonRuleSchema>;
export type PromptRotationRule = z.infer<typeof PromptRotationRuleSchema>;

// ---------- spec ----------

export const AppIconSchema = z.object({ symbol: z.enum(ICON_SYMBOLS), color: z.enum(ICON_COLORS) });
export type AppIcon = z.infer<typeof AppIconSchema>;

export const PURPOSES = ['work', 'explore'] as const;
export type Purpose = (typeof PURPOSES)[number];
export const PATTERNS = ['journal', 'board', 'tracker'] as const;
export type Pattern = (typeof PATTERNS)[number];

export const AppSpecSchema = z
  .object({
    schemaVersion: z.literal(APP_SPEC_SCHEMA_VERSION),
    name: label,
    tagline: z.string().trim().max(120).optional(),
    purpose: z.enum(PURPOSES),
    pattern: z.enum(PATTERNS),
    icon: AppIconSchema,
    fields: z.array(FieldSchema).min(1).max(30),
    views: z.array(ViewSchema).min(1).max(6),
    rules: z.array(RuleSchema).max(10).default([]),
    entryNoun: z.object({ singular: label, plural: label }).default({ singular: 'entry', plural: 'entries' }),
    emptyStateHint: shortText.optional(),
    /** Reserved for future scoped capabilities; must stay empty in this version. */
    permissions: z.array(z.never()).max(0).default([]),
  })
  .superRefine((spec, ctx) => {
    const fields = new Map(spec.fields.map((f) => [f.id, f]));
    if (fields.size !== spec.fields.length) ctx.addIssue({ code: 'custom', path: ['fields'], message: 'Field IDs must be unique' });
    const viewIds = new Set<string>();
    for (const v of spec.views) {
      if (viewIds.has(v.id)) ctx.addIssue({ code: 'custom', path: ['views'], message: `Duplicate view id ${v.id}` });
      viewIds.add(v.id);
    }
    const need = (id: string | undefined, where: (string | number)[], types?: FieldType[]) => {
      if (!id) return;
      const f = fields.get(id);
      if (!f) return ctx.addIssue({ code: 'custom', path: where, message: `Unknown field "${id}"` });
      if (types && !types.includes(f.type)) ctx.addIssue({ code: 'custom', path: where, message: `Field "${id}" must be ${types.join(' or ')}` });
    };
    spec.views.forEach((v, i) => {
      const p = ['views', i];
      if (v.type === 'journal') {
        need(v.dateFieldId, [...p, 'dateFieldId'], ['date']);
        need(v.titleFieldId, [...p, 'titleFieldId']);
        v.showFieldIds?.forEach((id, j) => need(id, [...p, 'showFieldIds', j]));
      } else if (v.type === 'board') {
        need(v.stageFieldId, [...p, 'stageFieldId'], ['select']);
        need(v.titleFieldId, [...p, 'titleFieldId']);
        need(v.dueFieldId, [...p, 'dueFieldId'], ['date']);
        v.cardFieldIds?.forEach((id, j) => need(id, [...p, 'cardFieldIds', j]));
        const stage = fields.get(v.stageFieldId);
        if (stage?.type === 'select') {
          const values = new Set(stage.options.map((o) => o.value));
          v.doneStageValues.forEach((d) => {
            if (!values.has(d)) ctx.addIssue({ code: 'custom', path: [...p, 'doneStageValues'], message: `"${d}" is not an option of ${stage.id}` });
          });
        }
      } else if (v.type === 'list') {
        need(v.titleFieldId, [...p, 'titleFieldId']);
        need(v.sortFieldId, [...p, 'sortFieldId']);
        v.columnFieldIds?.forEach((id, j) => need(id, [...p, 'columnFieldIds', j]));
      } else if (v.type === 'summary') {
        v.metrics.forEach((m, j) => {
          const mp = [...p, 'metrics', j];
          if (['sum', 'avg', 'min', 'max'].includes(m.kind)) {
            if (!m.fieldId) ctx.addIssue({ code: 'custom', path: mp, message: `${m.kind} needs a numeric fieldId` });
            need(m.fieldId, [...mp, 'fieldId'], ['number', 'rating']);
          } else if (m.kind === 'latest') {
            if (!m.fieldId) ctx.addIssue({ code: 'custom', path: mp, message: 'latest needs a fieldId' });
            need(m.fieldId, [...mp, 'fieldId']);
          } else if (m.kind === 'streak') {
            need(m.fieldId, [...mp, 'fieldId'], ['date']);
          }
          if (m.where) need(m.where.fieldId, [...mp, 'where', 'fieldId']);
        });
      }
    });
    spec.rules.forEach((r, i) => {
      const p = ['rules', i];
      if (r.type === 'due_soon') {
        need(r.dateFieldId, [...p, 'dateFieldId'], ['date']);
        need(r.doneFieldId, [...p, 'doneFieldId'], ['checkbox']);
        need(r.stageFieldId, [...p, 'stageFieldId'], ['select']);
        if (r.doneStageValues && !r.stageFieldId) ctx.addIssue({ code: 'custom', path: p, message: 'doneStageValues requires stageFieldId' });
      }
    });
    const selectDefaults = spec.fields.filter((f): f is Extract<FieldSpec, { type: 'select' }> => f.type === 'select');
    selectDefaults.forEach((f) => {
      if (f.default && !f.options.some((o) => o.value === f.default)) {
        ctx.addIssue({ code: 'custom', path: ['fields'], message: `Default "${f.default}" is not an option of ${f.id}` });
      }
    });
  });

export type AppSpec = z.infer<typeof AppSpecSchema>;
/** Input shape (before defaults are applied). */
export type AppSpecInput = z.input<typeof AppSpecSchema>;

export interface SpecValidation {
  ok: boolean;
  spec?: AppSpec;
  errors: string[];
}

export function validateAppSpec(input: unknown): SpecValidation {
  const parsed = AppSpecSchema.safeParse(input);
  if (parsed.success) return { ok: true, spec: parsed.data, errors: [] };
  return {
    ok: false,
    errors: parsed.error.issues.map((i) => `${i.path.join('.') || 'spec'}: ${i.message}`),
  };
}

export function visibleFields(spec: AppSpec): FieldSpec[] {
  return spec.fields.filter((f) => !f.hidden);
}

export function fieldById(spec: AppSpec, id: string | undefined): FieldSpec | undefined {
  return id ? spec.fields.find((f) => f.id === id) : undefined;
}

export function primaryView(spec: AppSpec): ViewSpec {
  return spec.views[0] as ViewSpec;
}

/** Human-friendly name for a field type, used in change previews. */
export function fieldTypeLabel(type: FieldType): string {
  switch (type) {
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
