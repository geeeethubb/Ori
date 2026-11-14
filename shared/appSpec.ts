/**
 * AppSpec: the validated, bounded definition of a personal app.
 *
 * The runtime renders ONLY what this schema allows (an allowlist of field types, views, rules and
 * design options). No generated code is ever executed. Field IDs are stable: labels, order, views,
 * rules and design may change across versions while records keep their field-id → value maps.
 *
 * Schema version stays 1: the redesign extended it ADDITIVELY (image field, gallery / practice /
 * links / queue views, per-view filters and forms, a design block). Every spec written by the
 * previous prototype still validates and renders through the compatibility defaults below.
 */
import { z } from 'zod';
import { FIELD_ID_PATTERN } from './ids.ts';
import { ICON_COLORS, ICON_SYMBOLS, type IconColor } from './icons.ts';

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
  /** A photo uploaded by the owner; the value is the media id (served owner-scoped by /api/media/:id). */
  FieldBase.extend({ type: z.literal('image') }),
]);
export type FieldSpec = z.infer<typeof FieldSchema>;
export type FieldType = FieldSpec['type'];
export const FIELD_TYPES = ['text', 'long_text', 'date', 'number', 'select', 'checkbox', 'rating', 'url', 'tags', 'image'] as const satisfies readonly FieldType[];

// ---------- views ----------

const viewId = z.string().regex(FIELD_ID_PATTERN);

const ViewBase = z.object({
  id: viewId,
  title: label.optional(),
  /**
   * Only records whose `fieldId` equals `value` belong to this view, and the view's form sets it.
   * Lets one app hold several kinds of record (e.g. practice sessions and saved sources).
   */
  filter: z.object({ fieldId, value: z.string().trim().min(1).max(40) }).optional(),
  /** Fields this view's create/edit form shows, in order. Omitted → every visible field. */
  formFieldIds: z.array(fieldId).max(30).optional(),
  /** Label of the view's primary action, e.g. "Add photo", "Save session". */
  addLabel: z.string().trim().min(1).max(40).optional(),
});

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

/** Photography: a contact sheet of real photos with a short caption/observation each. */
export const GalleryViewSchema = ViewBase.extend({
  type: z.literal('gallery'),
  imageFieldId: fieldId,
  captionFieldId: fieldId.optional(),
  noteFieldId: fieldId.optional(),
  dateFieldId: fieldId.optional(),
  columns: z.union([z.literal(2), z.literal(3), z.literal(4)]).default(3),
  sort: z.enum(['newest', 'oldest']).default('newest'),
});

/** Music and other timed practice: a session timer (+ tempo helper) that saves a small result. */
export const PracticeViewSchema = ViewBase.extend({
  type: z.literal('practice'),
  /** number field that receives the elapsed minutes */
  minutesFieldId: fieldId,
  focusFieldId: fieldId.optional(),
  tempoFieldId: fieldId.optional(),
  /** rating or select field for "how it felt" */
  feelFieldId: fieldId.optional(),
  notesFieldId: fieldId.optional(),
  dateFieldId: fieldId.optional(),
  /** Minute presets offered by the timer; the first is the default. */
  presets: z.array(z.number().int().min(1).max(180)).min(1).max(6).default([10, 15, 25]),
  defaultTempo: z.number().int().min(30).max(240).default(72),
  tempoHelper: z.boolean().default(true),
});

/** Saved sources: links the person keeps (songs, reels, articles) with a note and status. */
export const LinksViewSchema = ViewBase.extend({
  type: z.literal('links'),
  urlFieldId: fieldId,
  titleFieldId: fieldId.optional(),
  noteFieldId: fieldId.optional(),
  kindFieldId: fieldId.optional(),
  tagsFieldId: fieldId.optional(),
});

/** People and follow-through: a next-action queue grouped by due state or by person. */
export const QueueViewSchema = ViewBase.extend({
  type: z.literal('queue'),
  personFieldId: fieldId,
  actionFieldId: fieldId,
  dueFieldId: fieldId.optional(),
  /** Either a checkbox that marks completion… */
  doneFieldId: fieldId.optional(),
  /** …or a select stage field with the values that count as done. */
  stageFieldId: fieldId.optional(),
  doneStageValues: z.array(z.string()).max(20).default([]),
  contextFieldId: fieldId.optional(),
  channelFieldId: fieldId.optional(),
  groupBy: z.enum(['due', 'person']).default('due'),
});

export const ViewSchema = z.discriminatedUnion('type', [
  JournalViewSchema, BoardViewSchema, ListViewSchema, SummaryViewSchema,
  GalleryViewSchema, PracticeViewSchema, LinksViewSchema, QueueViewSchema,
]);
export type ViewSpec = z.infer<typeof ViewSchema>;
export type ViewType = ViewSpec['type'];
export const VIEW_TYPES = ['journal', 'board', 'list', 'summary', 'gallery', 'practice', 'links', 'queue'] as const satisfies readonly ViewType[];

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

// ---------- design (Studio Pop: each app has its own identity) ----------

export const APP_THEMES = ['bright', 'paper', 'charcoal', 'ink', 'mint', 'lilac', 'sunset'] as const;
export type AppTheme = (typeof APP_THEMES)[number];
export const APP_TYPOGRAPHY = ['editorial', 'display', 'compact'] as const;
export type AppTypography = (typeof APP_TYPOGRAPHY)[number];
export const APP_DENSITY = ['airy', 'regular', 'compact'] as const;
export const APP_ARTWORK = ['none', 'stripes', 'grid', 'halftone', 'waves'] as const;

export const DesignSchema = z.object({
  /** Surface palette. bright = parent canvas; paper/charcoal = photography; ink = listening room; mint = people. */
  theme: z.enum(APP_THEMES).default('bright'),
  /** Accent color; defaults to the icon color. */
  accent: z.enum(ICON_COLORS).optional(),
  typography: z.enum(APP_TYPOGRAPHY).default('editorial'),
  density: z.enum(APP_DENSITY).default('regular'),
  artwork: z.enum(APP_ARTWORK).default('none'),
});
export type AppDesign = z.infer<typeof DesignSchema>;

/** A partial look change (every field optional, no defaults), merged over the current design. */
export const DesignPatchSchema = z.object({
  theme: z.enum(APP_THEMES).optional(),
  accent: z.enum(ICON_COLORS).optional(),
  typography: z.enum(APP_TYPOGRAPHY).optional(),
  density: z.enum(APP_DENSITY).optional(),
  artwork: z.enum(APP_ARTWORK).optional(),
});
export type AppDesignPatch = z.infer<typeof DesignPatchSchema>;

// ---------- spec ----------

export const AppIconSchema = z.object({ symbol: z.enum(ICON_SYMBOLS), color: z.enum(ICON_COLORS) });
export type AppIcon = z.infer<typeof AppIconSchema>;

export const PURPOSES = ['work', 'explore'] as const;
export type Purpose = (typeof PURPOSES)[number];
/** Collection shape. The first four are the original patterns; the rest arrived with the redesign. */
export const PATTERNS = ['journal', 'board', 'tracker', 'gallery', 'practice', 'queue'] as const;
export type Pattern = (typeof PATTERNS)[number];

/** Capability vocabulary used by proposals and summaries (derived from a spec by capabilitiesOf). */
export const CAPABILITIES = [
  'journal', 'board', 'list', 'summary', 'gallery', 'photo_upload', 'practice_timer', 'tempo', 'source_links', 'next_actions', 'due_soon', 'prompts',
] as const;
export type Capability = (typeof CAPABILITIES)[number];

export const AppSpecSchema = z
  .object({
    schemaVersion: z.literal(APP_SPEC_SCHEMA_VERSION),
    name: label,
    tagline: z.string().trim().max(120).optional(),
    purpose: z.enum(PURPOSES),
    pattern: z.enum(PATTERNS),
    icon: AppIconSchema,
    /** Absent on apps built before the redesign; see designFor(). */
    design: DesignSchema.optional(),
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
    const checkDoneStages = (stageFieldId: string | undefined, done: string[], where: (string | number)[]) => {
      const stage = stageFieldId ? fields.get(stageFieldId) : undefined;
      if (stage?.type === 'select') {
        const values = new Set(stage.options.map((o) => o.value));
        done.forEach((d) => {
          if (!values.has(d)) ctx.addIssue({ code: 'custom', path: where, message: `"${d}" is not an option of ${stage.id}` });
        });
      }
    };
    spec.views.forEach((v, i) => {
      const p = ['views', i];
      if (v.filter) {
        need(v.filter.fieldId, [...p, 'filter', 'fieldId'], ['select', 'text']);
        const ff = fields.get(v.filter.fieldId);
        if (ff?.type === 'select' && !ff.options.some((o) => o.value === v.filter?.value)) {
          ctx.addIssue({ code: 'custom', path: [...p, 'filter', 'value'], message: `"${v.filter.value}" is not an option of ${ff.id}` });
        }
      }
      v.formFieldIds?.forEach((id, j) => need(id, [...p, 'formFieldIds', j]));
      if (v.type === 'journal') {
        need(v.dateFieldId, [...p, 'dateFieldId'], ['date']);
        need(v.titleFieldId, [...p, 'titleFieldId']);
        v.showFieldIds?.forEach((id, j) => need(id, [...p, 'showFieldIds', j]));
      } else if (v.type === 'board') {
        need(v.stageFieldId, [...p, 'stageFieldId'], ['select']);
        need(v.titleFieldId, [...p, 'titleFieldId']);
        need(v.dueFieldId, [...p, 'dueFieldId'], ['date']);
        v.cardFieldIds?.forEach((id, j) => need(id, [...p, 'cardFieldIds', j]));
        checkDoneStages(v.stageFieldId, v.doneStageValues, [...p, 'doneStageValues']);
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
      } else if (v.type === 'gallery') {
        need(v.imageFieldId, [...p, 'imageFieldId'], ['image']);
        need(v.captionFieldId, [...p, 'captionFieldId'], ['text', 'long_text']);
        need(v.noteFieldId, [...p, 'noteFieldId'], ['text', 'long_text']);
        need(v.dateFieldId, [...p, 'dateFieldId'], ['date']);
      } else if (v.type === 'practice') {
        need(v.minutesFieldId, [...p, 'minutesFieldId'], ['number']);
        need(v.focusFieldId, [...p, 'focusFieldId'], ['text', 'long_text']);
        need(v.tempoFieldId, [...p, 'tempoFieldId'], ['number']);
        need(v.feelFieldId, [...p, 'feelFieldId'], ['rating', 'select']);
        need(v.notesFieldId, [...p, 'notesFieldId'], ['text', 'long_text']);
        need(v.dateFieldId, [...p, 'dateFieldId'], ['date']);
      } else if (v.type === 'links') {
        need(v.urlFieldId, [...p, 'urlFieldId'], ['url']);
        need(v.titleFieldId, [...p, 'titleFieldId'], ['text']);
        need(v.noteFieldId, [...p, 'noteFieldId'], ['text', 'long_text']);
        need(v.kindFieldId, [...p, 'kindFieldId'], ['select']);
        need(v.tagsFieldId, [...p, 'tagsFieldId'], ['tags']);
      } else if (v.type === 'queue') {
        need(v.personFieldId, [...p, 'personFieldId'], ['text']);
        need(v.actionFieldId, [...p, 'actionFieldId'], ['text', 'long_text']);
        need(v.dueFieldId, [...p, 'dueFieldId'], ['date']);
        need(v.doneFieldId, [...p, 'doneFieldId'], ['checkbox']);
        need(v.stageFieldId, [...p, 'stageFieldId'], ['select']);
        need(v.contextFieldId, [...p, 'contextFieldId'], ['text', 'long_text']);
        need(v.channelFieldId, [...p, 'channelFieldId'], ['select']);
        if (!v.doneFieldId && !v.stageFieldId) ctx.addIssue({ code: 'custom', path: p, message: 'A queue needs doneFieldId or stageFieldId so actions can be completed' });
        checkDoneStages(v.stageFieldId, v.doneStageValues, [...p, 'doneStageValues']);
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

/** Fields the given view's create/edit form shows (its filter field is set automatically, not shown). */
export function formFieldsFor(spec: AppSpec, view: ViewSpec): FieldSpec[] {
  const base = view.formFieldIds
    ? view.formFieldIds.map((id) => fieldById(spec, id)).filter((f): f is FieldSpec => Boolean(f) && !f?.hidden)
    : visibleFields(spec);
  return base.filter((f) => f.id !== view.filter?.fieldId);
}

/** Records that belong to a view (all of them when the view has no filter). */
export function recordMatchesView(view: ViewSpec, values: Record<string, unknown>): boolean {
  if (!view.filter) return true;
  return values[view.filter.fieldId] === view.filter.value;
}

/**
 * Design with compatibility defaults. Apps built before the redesign have no design block; they get
 * a sensible identity from their pattern so old apps keep working without looking identical.
 */
export function designFor(spec: Pick<AppSpec, 'design' | 'pattern' | 'icon' | 'purpose'>): Required<AppDesign> {
  const d = spec.design;
  const fallbackTheme: AppTheme = spec.pattern === 'gallery' ? 'paper' : spec.pattern === 'practice' ? 'ink' : spec.pattern === 'queue' ? 'mint' : 'bright';
  const accent: IconColor = d?.accent ?? spec.icon.color;
  return {
    theme: d?.theme ?? fallbackTheme,
    accent,
    typography: d?.typography ?? (spec.pattern === 'practice' ? 'display' : spec.pattern === 'queue' || spec.pattern === 'board' ? 'compact' : 'editorial'),
    density: d?.density ?? 'regular',
    artwork: d?.artwork ?? 'none',
  };
}

/** The real capabilities a spec exercises; used for proposals ("update an existing app") and launcher labels. */
export function capabilitiesOf(spec: Pick<AppSpec, 'views' | 'rules' | 'fields'>): Capability[] {
  const out = new Set<Capability>();
  for (const v of spec.views) {
    if (v.type === 'journal') out.add('journal');
    if (v.type === 'board') out.add('board');
    if (v.type === 'list') out.add('list');
    if (v.type === 'summary') out.add('summary');
    if (v.type === 'gallery') { out.add('gallery'); out.add('photo_upload'); }
    if (v.type === 'practice') { out.add('practice_timer'); if (v.tempoHelper) out.add('tempo'); }
    if (v.type === 'links') out.add('source_links');
    if (v.type === 'queue') out.add('next_actions');
  }
  if (spec.fields.some((f) => f.type === 'image' && !f.hidden)) out.add('photo_upload');
  for (const r of spec.rules) {
    if (r.type === 'due_soon') out.add('due_soon');
    if (r.type === 'prompt_rotation') out.add('prompts');
  }
  return [...out];
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
    case 'image': return 'photo';
  }
}

/** Human-friendly name for a view type. */
export function viewTypeLabel(type: ViewType): string {
  switch (type) {
    case 'journal': return 'journal';
    case 'board': return 'board';
    case 'list': return 'list';
    case 'summary': return 'summary';
    case 'gallery': return 'photo gallery';
    case 'practice': return 'practice timer';
    case 'links': return 'saved sources';
    case 'queue': return 'next-action queue';
  }
}
