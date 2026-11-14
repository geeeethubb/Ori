/**
 * Compact constructors for AppSpec inputs. Every catalog concept assembles its app from these so
 * the shapes stay consistent (stable snake_case ids, sensible defaults) and genuinely differ in
 * fields, views and rules rather than only in name.
 */
import type { AppIcon, AppSpecInput, FieldSpec, Pattern, Purpose, SelectOption } from '../../../shared/appSpec.ts';
import type { IconColor } from '../../../shared/icons.ts';

export type FieldInput = AppSpecInput['fields'][number];
export type ViewInput = AppSpecInput['views'][number];
export type RuleInput = NonNullable<AppSpecInput['rules']>[number];
export type MetricInput = Extract<ViewInput, { type: 'summary' }>['metrics'][number];

type Common = { help?: string; placeholder?: string; required?: boolean };

export const f = {
  date(id = 'date', label = 'Date', opts: Common & { default?: 'today' } = {}): FieldInput {
    return { id, label, type: 'date', default: opts.default ?? 'today', required: opts.required ?? true, ...(opts.help ? { help: opts.help } : {}) };
  },
  due(id = 'due', label = 'Due date', opts: Common = {}): FieldInput {
    return { id, label, type: 'date', ...opts };
  },
  text(id: string, label: string, opts: Common & { maxLength?: number } = {}): FieldInput {
    return { id, label, type: 'text', ...opts };
  },
  long(id: string, label: string, opts: Common = {}): FieldInput {
    return { id, label, type: 'long_text', ...opts };
  },
  number(id: string, label: string, opts: Common & { unit?: string; min?: number; max?: number; step?: number } = {}): FieldInput {
    return { id, label, type: 'number', ...opts };
  },
  rating(id: string, label: string, opts: Common & { max?: number } = {}): FieldInput {
    return { id, label, type: 'rating', max: opts.max ?? 5, ...(opts.help ? { help: opts.help } : {}), ...(opts.required ? { required: true } : {}) };
  },
  checkbox(id: string, label: string, opts: Common = {}): FieldInput {
    return { id, label, type: 'checkbox', ...opts };
  },
  url(id: string, label: string, opts: Common = {}): FieldInput {
    return { id, label, type: 'url', ...opts };
  },
  tags(id: string, label: string, suggestions: string[] = [], opts: Common = {}): FieldInput {
    return { id, label, type: 'tags', ...(suggestions.length ? { suggestions } : {}), ...opts };
  },
  select(id: string, label: string, options: (string | [string, string] | [string, string, IconColor])[], opts: Common & { default?: string } = {}): FieldInput {
    const opt: SelectOption[] = options.map((o) => {
      if (typeof o === 'string') return { value: slugValue(o), label: o };
      const [value, lbl, color] = o;
      return color ? { value, label: lbl, color } : { value, label: lbl };
    });
    return { id, label, type: 'select', options: opt, ...opts };
  },
};

export function slugValue(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'option';
}

interface BaseOpts {
  name: string;
  tagline: string;
  purpose: Purpose;
  icon: AppIcon;
  fields: FieldInput[];
  rules?: RuleInput[];
  entryNoun: { singular: string; plural: string };
  emptyStateHint: string;
}

/** Journal: dated entries + a small summary. */
export function journalSpec(o: BaseOpts & {
  dateFieldId?: string;
  titleFieldId: string;
  viewTitle?: string;
  metrics?: MetricInput[];
}): AppSpecInput {
  const dateFieldId = o.dateFieldId ?? 'date';
  const metrics: MetricInput[] = o.metrics ?? [
    { id: 'this_month', label: `${cap(o.entryNoun.plural)} this month`, kind: 'count', period: 'month', fieldId: dateFieldId },
    { id: 'total', label: `${cap(o.entryNoun.plural)} so far`, kind: 'count' },
    { id: 'streak', label: 'Day streak', kind: 'streak', fieldId: dateFieldId },
  ];
  return base(o, 'journal', [
    { id: 'entries', type: 'journal', title: o.viewTitle ?? cap(o.entryNoun.plural), dateFieldId, titleFieldId: o.titleFieldId, sort: 'newest' },
    { id: 'summary', type: 'summary', title: 'At a glance', metrics },
  ]);
}

/** Board: stage columns, a title, optional due date with a due-soon rule and an open-count metric. */
export function boardSpec(o: BaseOpts & {
  stageFieldId: string;
  titleFieldId: string;
  dueFieldId?: string;
  doneStageValues: string[];
  cardFieldIds?: string[];
  openLabel?: string;
  doneLabel?: string;
  withinDays?: number;
  viewTitle?: string;
}): AppSpecInput {
  const done = o.doneStageValues[0];
  const metrics: MetricInput[] = [
    { id: 'open', label: o.openLabel ?? `Open ${o.entryNoun.plural}`, kind: 'count', ...(done ? { where: { fieldId: o.stageFieldId, op: 'neq', value: done } } : {}) },
    ...(done ? [{ id: 'done_week', label: o.doneLabel ?? 'Done this week', kind: 'count', period: 'week', where: { fieldId: o.stageFieldId, op: 'eq', value: done } } satisfies MetricInput] : []),
  ];
  const rules: RuleInput[] = [...(o.rules ?? [])];
  if (o.dueFieldId && !rules.some((r) => r.type === 'due_soon')) {
    rules.push({ id: 'due_soon', type: 'due_soon', dateFieldId: o.dueFieldId, withinDays: o.withinDays ?? 3, stageFieldId: o.stageFieldId, doneStageValues: o.doneStageValues, label: 'Needs attention' });
  }
  return base({ ...o, rules }, 'board', [
    {
      id: 'board', type: 'board', title: o.viewTitle ?? cap(o.entryNoun.plural), stageFieldId: o.stageFieldId, titleFieldId: o.titleFieldId,
      ...(o.dueFieldId ? { dueFieldId: o.dueFieldId } : {}), doneStageValues: o.doneStageValues, ...(o.cardFieldIds ? { cardFieldIds: o.cardFieldIds.slice(0, 6) } : {}),
    },
    { id: 'summary', type: 'summary', title: 'At a glance', metrics },
  ]);
}

/** Tracker: summary first (sum/avg/streak), then the list of check-ins. */
export function trackerSpec(o: BaseOpts & {
  metrics: MetricInput[];
  titleFieldId: string;
  columnFieldIds: string[];
  sortFieldId?: string;
  viewTitle?: string;
}): AppSpecInput {
  return base(o, 'tracker', [
    { id: 'progress', type: 'summary', title: o.viewTitle ?? 'Progress', metrics: o.metrics.slice(0, 6) },
    { id: 'log', type: 'list', title: cap(o.entryNoun.plural), titleFieldId: o.titleFieldId, columnFieldIds: o.columnFieldIds.slice(0, 8), sortFieldId: o.sortFieldId ?? 'date', sortDir: 'desc' },
  ]);
}

function base(o: BaseOpts, pattern: Pattern, views: ViewInput[]): AppSpecInput {
  return {
    schemaVersion: 1,
    name: o.name,
    tagline: o.tagline,
    purpose: o.purpose,
    pattern,
    icon: o.icon,
    fields: o.fields,
    views,
    rules: o.rules ?? [],
    entryNoun: o.entryNoun,
    emptyStateHint: o.emptyStateHint,
    permissions: [],
  };
}

export function cap(s: string): string {
  const first = s[0];
  return first ? first.toUpperCase() + s.slice(1) : s;
}

/** Option values of a select field (input or parsed). */
export function selectValues(field: FieldInput | FieldSpec | undefined): string[] {
  return field && field.type === 'select' ? field.options.map((x) => x.value) : [];
}
