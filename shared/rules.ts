/**
 * Deterministic rules over records: due-soon/overdue status, summary metrics, prompt rotation.
 * Pure functions; the same code runs in the browser and on the server (tests).
 */
import type { AppSpec, DueSoonRule, MetricSpec, PromptRotationRule } from './appSpec.ts';
import type { AppRecord } from './records.ts';
import { daysBetween, dayOfYear, isoWeekNumber, parseIsoDate, startOfMonthIso, startOfWeekIso, todayIso, toIsoDate } from './time.ts';

export type DueStatus = 'overdue' | 'due_today' | 'due_soon' | 'scheduled' | 'done' | 'none';

export function isDone(record: AppRecord, rule: Pick<DueSoonRule, 'doneFieldId' | 'stageFieldId' | 'doneStageValues'>): boolean {
  if (rule.doneFieldId && record.values[rule.doneFieldId] === true) return true;
  if (rule.stageFieldId && rule.doneStageValues?.length) {
    const stage = record.values[rule.stageFieldId];
    if (typeof stage === 'string' && rule.doneStageValues.includes(stage)) return true;
  }
  return false;
}

/**
 * Due status relative to the local calendar date of `now`.
 * - done beats everything;
 * - overdue: due date strictly before today;
 * - due_today: due date is today;
 * - due_soon: today < due ≤ today + withinDays;
 * - scheduled: further out; none: no valid date.
 */
export function dueStatus(record: AppRecord, rule: DueSoonRule, now: Date = new Date()): DueStatus {
  if (isDone(record, rule)) return 'done';
  const due = record.values[rule.dateFieldId];
  if (typeof due !== 'string' || !parseIsoDate(due)) return 'none';
  const diff = daysBetween(todayIso(now), due);
  if (diff === null) return 'none';
  if (diff < 0) return 'overdue';
  if (diff === 0) return 'due_today';
  if (diff <= rule.withinDays) return 'due_soon';
  return 'scheduled';
}

export function dueLabel(status: DueStatus, due: string | undefined, now: Date = new Date()): string {
  if (!due) return '';
  const diff = daysBetween(todayIso(now), due) ?? 0;
  switch (status) {
    case 'overdue':
      return diff === -1 ? 'Overdue by 1 day' : `Overdue by ${-diff} days`;
    case 'due_today':
      return 'Due today';
    case 'due_soon':
      return diff === 1 ? 'Due tomorrow' : `Due in ${diff} days`;
    case 'scheduled':
      return `Due in ${diff} days`;
    case 'done':
      return 'Done';
    default:
      return '';
  }
}

export interface DueSummary {
  overdue: AppRecord[];
  dueToday: AppRecord[];
  dueSoon: AppRecord[];
  attention: AppRecord[]; // overdue + today + soon, sorted by due date
}

export function summarizeDue(records: AppRecord[], rule: DueSoonRule, now: Date = new Date()): DueSummary {
  const overdue: AppRecord[] = [];
  const dueToday: AppRecord[] = [];
  const dueSoon: AppRecord[] = [];
  for (const r of records) {
    const s = dueStatus(r, rule, now);
    if (s === 'overdue') overdue.push(r);
    else if (s === 'due_today') dueToday.push(r);
    else if (s === 'due_soon') dueSoon.push(r);
  }
  const byDue = (a: AppRecord, b: AppRecord) => String(a.values[rule.dateFieldId]).localeCompare(String(b.values[rule.dateFieldId]));
  overdue.sort(byDue);
  dueSoon.sort(byDue);
  return { overdue, dueToday, dueSoon, attention: [...overdue, ...dueToday, ...dueSoon] };
}

/** Find the due-soon rule that applies to a board view, if any. */
export function dueRuleFor(spec: AppSpec, dueFieldId?: string): DueSoonRule | undefined {
  const rules = spec.rules.filter((r): r is DueSoonRule => r.type === 'due_soon');
  if (dueFieldId) return rules.find((r) => r.dateFieldId === dueFieldId) ?? rules[0];
  return rules[0];
}

// ---------- metrics ----------

function inPeriod(record: AppRecord, metric: MetricSpec, now: Date): boolean {
  if (metric.period === 'all') return true;
  // Prefer the metric's date field when it is a date, else the record creation date.
  const raw = metric.fieldId ? record.values[metric.fieldId] : undefined;
  const iso = typeof raw === 'string' && parseIsoDate(raw) ? raw : toIsoDate(new Date(record.createdAt));
  const today = todayIso(now);
  if (metric.period === 'today') return iso === today;
  if (metric.period === 'week') return iso >= startOfWeekIso(now) && iso <= today;
  return iso >= startOfMonthIso(now) && iso <= today;
}

function passesWhere(record: AppRecord, metric: MetricSpec): boolean {
  const w = metric.where;
  if (!w) return true;
  const v = record.values[w.fieldId];
  switch (w.op) {
    case 'eq': return v === w.value;
    case 'neq': return v !== w.value;
    case 'truthy': return Boolean(v) && !(Array.isArray(v) && v.length === 0);
    case 'falsy': return !v || (Array.isArray(v) && v.length === 0);
  }
}

export interface MetricResult {
  id: string;
  label: string;
  value: number | string | null;
  display: string;
}

export function computeMetric(records: AppRecord[], metric: MetricSpec, now: Date = new Date()): MetricResult {
  const rows = records.filter((r) => passesWhere(r, metric) && inPeriod(r, metric, now));
  const unit = metric.unit ? ` ${metric.unit}` : '';
  const nums = metric.fieldId
    ? rows.map((r) => Number(r.values[metric.fieldId as string])).filter((n) => Number.isFinite(n))
    : [];
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
  switch (metric.kind) {
    case 'count':
      return { id: metric.id, label: metric.label, value: rows.length, display: `${rows.length}${unit}` };
    case 'sum': {
      const s = nums.reduce((a, b) => a + b, 0);
      return { id: metric.id, label: metric.label, value: s, display: `${fmt(s)}${unit}` };
    }
    case 'avg': {
      if (!nums.length) return { id: metric.id, label: metric.label, value: null, display: '–' };
      const a = nums.reduce((x, y) => x + y, 0) / nums.length;
      return { id: metric.id, label: metric.label, value: a, display: `${fmt(a)}${unit}` };
    }
    case 'min':
    case 'max': {
      if (!nums.length) return { id: metric.id, label: metric.label, value: null, display: '–' };
      const v = metric.kind === 'min' ? Math.min(...nums) : Math.max(...nums);
      return { id: metric.id, label: metric.label, value: v, display: `${fmt(v)}${unit}` };
    }
    case 'latest': {
      const sorted = [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const v = sorted[0]?.values[metric.fieldId as string];
      const display = v === undefined || v === null || v === '' ? '–' : Array.isArray(v) ? v.join(', ') : String(v);
      return { id: metric.id, label: metric.label, value: typeof v === 'number' ? v : display, display };
    }
    case 'streak': {
      const days = new Set<string>();
      for (const r of records.filter((x) => passesWhere(x, metric))) {
        const raw = metric.fieldId ? r.values[metric.fieldId] : undefined;
        const iso = typeof raw === 'string' && parseIsoDate(raw) ? raw : toIsoDate(new Date(r.createdAt));
        days.add(iso);
      }
      // Count consecutive days ending today or yesterday.
      let cursor = todayIso(now);
      if (!days.has(cursor)) {
        const y = new Date(now); y.setDate(y.getDate() - 1); cursor = toIsoDate(y);
      }
      let streak = 0;
      while (days.has(cursor)) {
        streak++;
        const d = parseIsoDate(cursor) as Date;
        d.setDate(d.getDate() - 1);
        cursor = toIsoDate(d);
      }
      return { id: metric.id, label: metric.label, value: streak, display: `${streak} day${streak === 1 ? '' : 's'}` };
    }
  }
}

// ---------- prompt rotation ----------

export interface CurrentPrompt {
  index: number;
  text: string;
  periodLabel: string;
}

export function currentPrompt(rule: PromptRotationRule, now: Date = new Date()): CurrentPrompt {
  const n = rule.prompts.length;
  const idx = rule.cadence === 'daily' ? dayOfYear(now) % n : (isoWeekNumber(now) + now.getFullYear()) % n;
  return {
    index: idx,
    text: rule.prompts[idx] as string,
    periodLabel: rule.cadence === 'daily' ? 'Today' : `Week ${isoWeekNumber(now)}`,
  };
}
