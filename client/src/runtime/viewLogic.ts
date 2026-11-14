/**
 * Pure, testable logic behind the runtime views: which fields a view shows, how records are
 * sorted and grouped, and how board columns are built. No React here.
 */
import { fieldById, visibleFields, type AppSpec, type DueSoonRule, type FieldSpec, type SelectOption, type ViewSpec } from '@shared/appSpec.ts';
import type { AppRecord, RecordValues } from '@shared/records.ts';
import { dueStatus, type DueStatus } from '@shared/rules.ts';
import { parseIsoDate, toIsoDate } from '@shared/time.ts';

export type JournalViewSpec = Extract<ViewSpec, { type: 'journal' }>;
export type BoardViewSpec = Extract<ViewSpec, { type: 'board' }>;
export type ListViewSpec = Extract<ViewSpec, { type: 'list' }>;
export type SummaryViewSpec = Extract<ViewSpec, { type: 'summary' }>;
export type GalleryViewSpec = Extract<ViewSpec, { type: 'gallery' }>;
export type PracticeViewSpec = Extract<ViewSpec, { type: 'practice' }>;
export type LinksViewSpec = Extract<ViewSpec, { type: 'links' }>;
export type QueueViewSpec = Extract<ViewSpec, { type: 'queue' }>;
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

// ---------- gallery ----------

export interface GalleryTiles {
  /** Records with a photo, in the view's order. */
  photos: AppRecord[];
  /** Records without a photo (older text-only entries), newest first. Shown as readable notes. */
  notes: AppRecord[];
}

export function hasImageValue(v: unknown): boolean {
  return typeof v === 'string' && v.trim() !== '';
}

/** Split records into photo tiles and text-only notes; both sorted by the view's date (creation time as tiebreak). */
export function galleryTiles(view: GalleryViewSpec, records: AppRecord[]): GalleryTiles {
  const dir = view.sort === 'oldest' ? 1 : -1;
  const byDate = (a: AppRecord, b: AppRecord) => (cmpStr(recordDate(a, view.dateFieldId), recordDate(b, view.dateFieldId)) || cmpStr(a.createdAt, b.createdAt)) * dir;
  const photos = records.filter((r) => hasImageValue(r.values[view.imageFieldId])).sort(byDate);
  const notes = records
    .filter((r) => !hasImageValue(r.values[view.imageFieldId]))
    .sort((a, b) => -(cmpStr(recordDate(a, view.dateFieldId), recordDate(b, view.dateFieldId)) || cmpStr(a.createdAt, b.createdAt)));
  return { photos, notes };
}

/** Caption shown on a tile: the caption field, else the note's first line, else nothing. */
export function galleryCaption(view: GalleryViewSpec, record: AppRecord): string {
  const cap = view.captionFieldId ? record.values[view.captionFieldId] : undefined;
  if (typeof cap === 'string' && cap.trim()) return cap.trim();
  const note = view.noteFieldId ? record.values[view.noteFieldId] : undefined;
  if (typeof note === 'string' && note.trim()) {
    const line = note.trim().split('\n')[0] as string;
    return line.length > 80 ? `${line.slice(0, 77)}…` : line;
  }
  return '';
}

/** Fields shown in the lightbox under the photo (everything visible except image, caption, note and date). */
export function galleryDetailFields(spec: AppSpec, view: GalleryViewSpec): FieldSpec[] {
  return resolveFields(spec, undefined, [view.imageFieldId, view.captionFieldId, view.noteFieldId, view.dateFieldId], () => visibleFields(spec));
}

// ---------- links ----------

/** Hostname without "www." for a saved link, or the raw text when it is not a URL. */
export function linkHost(url: unknown): string {
  const s = typeof url === 'string' ? url.trim() : '';
  if (!s) return '';
  try {
    return new URL(s).hostname.replace(/^www\./, '');
  } catch {
    return s.replace(/^https?:\/\//, '').split('/')[0] ?? s;
  }
}

/** Saved sources, newest first. */
export function linkRows(records: AppRecord[]): AppRecord[] {
  return [...records].sort((a, b) => -cmpStr(a.createdAt, b.createdAt));
}

// ---------- queue ----------

export type QueueGroupKey = 'overdue' | 'today' | 'soon' | 'later' | 'done';
export const QUEUE_GROUP_ORDER: QueueGroupKey[] = ['overdue', 'today', 'soon', 'later', 'done'];
export const QUEUE_GROUP_LABELS: Record<QueueGroupKey, string> = { overdue: 'Overdue', today: 'Today', soon: 'Coming up', later: 'Later', done: 'Done' };

export interface QueueGroup {
  key: QueueGroupKey;
  label: string;
  records: AppRecord[];
}

/** The due rule a queue view works with: its own due/done config, with the spec's matching rule for `withinDays`. */
export function queueRule(spec: AppSpec, view: QueueViewSpec): DueSoonRule {
  const specRule = spec.rules.find((r): r is DueSoonRule => r.type === 'due_soon' && (!view.dueFieldId || r.dateFieldId === view.dueFieldId));
  return {
    id: `queue_${view.id}`,
    type: 'due_soon',
    dateFieldId: view.dueFieldId ?? specRule?.dateFieldId ?? '__none__',
    withinDays: specRule?.withinDays ?? 3,
    doneFieldId: view.doneFieldId,
    stageFieldId: view.stageFieldId,
    doneStageValues: view.doneStageValues,
  };
}

export function dueGroupKey(status: DueStatus): QueueGroupKey {
  switch (status) {
    case 'overdue':
      return 'overdue';
    case 'due_today':
      return 'today';
    case 'due_soon':
      return 'soon';
    case 'done':
      return 'done';
    default:
      return 'later';
  }
}

function dueKeyOf(record: AppRecord, rule: DueSoonRule): string {
  const v = record.values[rule.dateFieldId];
  return typeof v === 'string' && parseIsoDate(v) ? v : '9999-12-31';
}

/** Open items: soonest due first (undated last), then newest first. Done items: most recently updated first. */
export function sortQueueItems(records: AppRecord[], rule: DueSoonRule, done = false): AppRecord[] {
  return [...records].sort((a, b) => (done ? -cmpStr(a.updatedAt, b.updatedAt) : cmpStr(dueKeyOf(a, rule), dueKeyOf(b, rule)) || -cmpStr(a.createdAt, b.createdAt)));
}

/** Next actions grouped by due state (items without a date land in "later"). Every group is returned, empty ones included. */
export function queueGroups(spec: AppSpec, view: QueueViewSpec, records: AppRecord[], now: Date = new Date()): QueueGroup[] {
  const rule = queueRule(spec, view);
  const buckets: Record<QueueGroupKey, AppRecord[]> = { overdue: [], today: [], soon: [], later: [], done: [] };
  for (const r of records) buckets[dueGroupKey(dueStatus(r, rule, now))].push(r);
  return QUEUE_GROUP_ORDER.map((key) => ({ key, label: QUEUE_GROUP_LABELS[key], records: sortQueueItems(buckets[key], rule, key === 'done') }));
}

export interface PersonGroup {
  key: string;
  label: string;
  records: AppRecord[];
  openCount: number;
}

/** Display name of the person on a record. */
export function personName(view: QueueViewSpec, record: AppRecord): string {
  const v = record.values[view.personFieldId];
  return typeof v === 'string' && v.trim() ? v.trim() : 'Someone';
}

/** Short name: the part before a comma, bracket, dash or " from " / " at " / " met ". */
export function personShortName(full: string): string {
  const cut = full.split(/\s*[,(–—-]\s*|\s+(?:from|at|met|via|of)\s+/i)[0] ?? full;
  return cut.trim() || full.trim();
}

/** One or two initials for the avatar. */
export function personInitials(full: string): string {
  const short = personShortName(full);
  const words = short.split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  const caps = words.filter((w) => /^[A-Z]/.test(w));
  const pick = (caps.length >= 2 ? caps : words).slice(0, 2);
  return pick.map((w) => (w[0] ?? '').toUpperCase()).join('').slice(0, 2) || '?';
}

/** Next actions grouped by person; people with the soonest open action first, done items last within a person. */
export function queueByPerson(spec: AppSpec, view: QueueViewSpec, records: AppRecord[], now: Date = new Date()): PersonGroup[] {
  const rule = queueRule(spec, view);
  const map = new Map<string, { label: string; open: AppRecord[]; done: AppRecord[] }>();
  for (const r of records) {
    const label = personName(view, r);
    const key = personShortName(label).toLowerCase();
    const g = map.get(key) ?? { label: personShortName(label), open: [], done: [] };
    if (dueStatus(r, rule, now) === 'done') g.done.push(r);
    else g.open.push(r);
    map.set(key, g);
  }
  const groups = [...map.entries()].map(([key, g]) => {
    const open = sortQueueItems(g.open, rule);
    return { key, label: g.label, records: [...open, ...sortQueueItems(g.done, rule, true)], openCount: open.length, soonest: open[0] ? dueKeyOf(open[0], rule) : '9999-12-32' };
  });
  groups.sort((a, b) => cmpStr(a.soonest, b.soonest) || cmpStr(a.label.toLowerCase(), b.label.toLowerCase()));
  return groups.map(({ soonest: _soonest, ...g }) => g);
}

export function queueIsDone(spec: AppSpec, view: QueueViewSpec, record: AppRecord): boolean {
  return dueStatus(record, queueRule(spec, view)) === 'done';
}

/**
 * The values patch that completes (or reopens) a queue item: toggles the done checkbox, or moves the
 * stage to the first done value / back to the first open option. Null when the view cannot complete.
 */
export function completionPatch(spec: AppSpec, view: QueueViewSpec, record: AppRecord): RecordValues | null {
  if (view.doneFieldId) return { [view.doneFieldId]: record.values[view.doneFieldId] !== true };
  if (view.stageFieldId) {
    const field = fieldById(spec, view.stageFieldId);
    if (!field || field.type !== 'select') return null;
    const done = view.doneStageValues.filter((v) => field.options.some((o) => o.value === v));
    if (!done.length) return null;
    const current = record.values[view.stageFieldId];
    const isDone = typeof current === 'string' && done.includes(current);
    if (isDone) {
      const open = field.options.find((o) => !done.includes(o.value));
      return open ? { [view.stageFieldId]: open.value } : null;
    }
    return { [view.stageFieldId]: done[0] as string };
  }
  return null;
}

/** A long-text field meant as a message draft (id or label mentions "draft"); copied, never sent. */
export function draftFieldFor(spec: AppSpec): FieldSpec | undefined {
  return spec.fields.find((f) => f.type === 'long_text' && !f.hidden && /draft/i.test(`${f.id} ${f.label}`));
}

/** Short one-line snippet (first line, trimmed to `max` characters). */
export function snippet(v: unknown, max = 90): string {
  if (typeof v !== 'string') return '';
  const line = v.trim().split('\n')[0] ?? '';
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

// ---------- practice ----------

/** "mm:ss" for a duration in milliseconds (never negative; hours fold into minutes). */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Minutes to save for a session: elapsed time rounded (at least 1); the selected preset when the timer never ran. */
export function elapsedMinutes(elapsedMs: number, presetMinutes: number): number {
  if (elapsedMs < 1000) return Math.max(1, Math.round(presetMinutes));
  return Math.max(1, Math.round(elapsedMs / 60_000));
}

export const TEMPO_MIN = 30;
export const TEMPO_MAX = 240;

export function clampTempo(n: number): number {
  if (!Number.isFinite(n)) return 72;
  return Math.min(TEMPO_MAX, Math.max(TEMPO_MIN, Math.round(n)));
}

/** Recent sessions for the compact list under the timer: newest by date, then creation. */
export function recentSessions(view: PracticeViewSpec, records: AppRecord[], n = 5): AppRecord[] {
  return [...records].sort((a, b) => -(cmpStr(recordDate(a, view.dateFieldId), recordDate(b, view.dateFieldId)) || cmpStr(a.createdAt, b.createdAt))).slice(0, n);
}
