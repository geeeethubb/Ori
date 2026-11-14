/**
 * Pure, testable logic behind the runtime views: which fields a view shows, how records are
 * sorted and grouped, and how board columns are built. No React here.
 */
import { fieldById, visibleFields, type AppSpec, type DueSoonRule, type FieldSpec, type SelectOption, type ViewSpec } from '@shared/appSpec.ts';
import type { AppRecord } from '@shared/records.ts';
import type { DueStatus } from '@shared/rules.ts';
import { parseIsoDate, toIsoDate } from '@shared/time.ts';

export type JournalViewSpec = Extract<ViewSpec, { type: 'journal' }>;
export type BoardViewSpec = Extract<ViewSpec, { type: 'board' }>;
export type ListViewSpec = Extract<ViewSpec, { type: 'list' }>;
export type SummaryViewSpec = Extract<ViewSpec, { type: 'summary' }>;
export type SelectFieldSpec = Extract<FieldSpec, { type: 'select' }>;

export function isEmptyValue(v: unknown): boolean {
  return v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
}

const cmpStr = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** YYYY-MM-DD for a record: the given date field when valid, else its local creation date. */
export function recordDate(record: AppRecord, dateFieldId?: string): string {
  const raw = dateFieldId ? record.values[dateFieldId] : undefined;
  if (typeof raw === 'string' && parseIsoDate(raw)) return raw;
  const created = new Date(record.createdAt);
  return Number.isNaN(created.getTime()) ? '' : toIsoDate(created);
}

/** Resolve a list of field IDs to visible fields, skipping unknown, hidden, excluded and duplicate IDs. */
export function resolveFields(spec: AppSpec, ids: string[] | undefined, exclude: (string | undefined)[], fallback: () => FieldSpec[]): FieldSpec[] {
  const skip = new Set(exclude.filter((x): x is string => typeof x === 'string'));
  const list = ids ? ids.map((id) => fieldById(spec, id)).filter((f): f is FieldSpec => Boolean(f)) : fallback();
  const seen = new Set<string>();
  return list.filter((f) => {
    if (f.hidden || skip.has(f.id) || seen.has(f.id)) return false;
    seen.add(f.id);
    return true;
  });
}

// ---------- journal ----------

export function journalFields(spec: AppSpec, view: JournalViewSpec): FieldSpec[] {
  return resolveFields(spec, view.showFieldIds, [view.titleFieldId, view.dateFieldId], () => visibleFields(spec));
}

export interface DateGroup {
  date: string;
  records: AppRecord[];
}

/** Entries sorted by the view's date field (creation time as tiebreak) and grouped by day. */
export function journalGroups(view: JournalViewSpec, records: AppRecord[]): DateGroup[] {
  const asc = view.sort === 'oldest';
  const sorted = [...records].sort((a, b) => {
    const c = cmpStr(recordDate(a, view.dateFieldId), recordDate(b, view.dateFieldId)) || cmpStr(a.createdAt, b.createdAt);
    return asc ? c : -c;
  });
  const groups: DateGroup[] = [];
  for (const r of sorted) {
    const date = recordDate(r, view.dateFieldId);
    const last = groups[groups.length - 1];
    if (last && last.date === date) last.records.push(r);
    else groups.push({ date, records: [r] });
  }
  return groups;
}

// ---------- board ----------

export interface BoardColumn {
  option: SelectOption;
  done: boolean;
  records: AppRecord[];
}

export interface BoardLayout {
  stageField: SelectFieldSpec | null;
  columns: BoardColumn[];
  /** Cards whose stage value is not one of the options (should be rare). */
  other: AppRecord[];
}

export function boardCardFields(spec: AppSpec, view: BoardViewSpec): FieldSpec[] {
  return resolveFields(spec, view.cardFieldIds, [view.titleFieldId, view.stageFieldId], () => []);
}

export function boardLayout(spec: AppSpec, view: BoardViewSpec, records: AppRecord[], rule?: DueSoonRule, include?: (r: AppRecord) => boolean): BoardLayout {
  const field = fieldById(spec, view.stageFieldId);
  if (!field || field.type !== 'select') return { stageField: null, columns: [], other: [] };
  const stageField: SelectFieldSpec = field;
  const keep = include ?? (() => true);
  const dueKey = (r: AppRecord): string => {
    const v = rule ? r.values[rule.dateFieldId] : undefined;
    return typeof v === 'string' && parseIsoDate(v) ? v : '9999-12-31';
  };
  const sortCards = (list: AppRecord[]): AppRecord[] =>
    [...list].sort((a, b) => (rule ? cmpStr(dueKey(a), dueKey(b)) : 0) || -cmpStr(a.createdAt, b.createdAt));
  const known = new Set(stageField.options.map((o) => o.value));
  const columns = stageField.options.map((option) => ({
    option,
    done: view.doneStageValues.includes(option.value),
    records: sortCards(records.filter((r) => r.values[stageField.id] === option.value && keep(r))),
  }));
  const other = sortCards(records.filter((r) => !known.has(String(r.values[stageField.id])) && keep(r)));
  return { stageField, columns, other };
}

export function dueBadgeClass(status: DueStatus): string {
  switch (status) {
    case 'overdue':
      return 'badge badge-danger';
    case 'due_today':
    case 'due_soon':
      return 'badge badge-warn';
    case 'done':
      return 'badge badge-ok';
    case 'scheduled':
      return 'badge';
    default:
      return '';
  }
}

/** "2 overdue · 1 due today · 3 due soon" (zero counts are left out). */
export function dueSummaryLine(counts: { overdue: number; dueToday: number; dueSoon: number }): string {
  const parts: string[] = [];
  if (counts.overdue) parts.push(`${counts.overdue} overdue`);
  if (counts.dueToday) parts.push(`${counts.dueToday} due today`);
  if (counts.dueSoon) parts.push(`${counts.dueSoon} due soon`);
  return parts.join(' · ');
}

// ---------- list ----------

export function listColumns(spec: AppSpec, view: ListViewSpec): FieldSpec[] {
  return resolveFields(spec, view.columnFieldIds, [view.titleFieldId], () =>
    visibleFields(spec)
      .filter((f) => f.type !== 'long_text')
      .slice(0, 4),
  );
}

export function compareValues(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
  if (Array.isArray(a) && Array.isArray(b)) return a.length - b.length;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

/** Rows sorted by the view's sort field and direction; empty values always sink to the bottom. */
export function listRows(spec: AppSpec, view: ListViewSpec, records: AppRecord[]): AppRecord[] {
  const field = fieldById(spec, view.sortFieldId);
  const dir = view.sortDir === 'asc' ? 1 : -1;
  return [...records].sort((a, b) => {
    if (field) {
      const av = a.values[field.id];
      const bv = b.values[field.id];
      const ea = isEmptyValue(av);
      const eb = isEmptyValue(bv);
      if (ea !== eb) return ea ? 1 : -1;
      if (!ea) {
        const c = compareValues(av, bv);
        if (c !== 0) return c * dir;
      }
    }
    return cmpStr(a.createdAt, b.createdAt) * dir;
  });
}

// ---------- summary ----------

export function recentRecords(records: AppRecord[], n = 3): AppRecord[] {
  return [...records].sort((a, b) => -cmpStr(a.createdAt, b.createdAt)).slice(0, n);
}
