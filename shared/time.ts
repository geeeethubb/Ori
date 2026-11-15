/** Local-calendar date helpers. Records store dates as YYYY-MM-DD strings (no timezone). */

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayIso(now: Date = new Date()): string {
  return toIsoDate(now);
}

/** Parse YYYY-MM-DD as a local date at midnight; returns null for anything else. */
export function parseIsoDate(s: unknown): Date | null {
  if (typeof s !== 'string' || !ISO_DATE.test(s)) return null;
  const [y, m, d] = s.split('-').map(Number) as [number, number, number];
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return date;
}

export function addDays(iso: string, days: number): string {
  const d = parseIsoDate(iso);
  if (!d) return iso;
  d.setDate(d.getDate() + days);
  return toIsoDate(d);
}

/** Whole calendar days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(fromIso: string, toIso: string): number | null {
  const a = parseIsoDate(fromIso);
  const b = parseIsoDate(toIso);
  if (!a || !b) return null;
  const ms = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  return Math.round(ms / 86_400_000);
}

/** Monday-based start of the week containing `now`, as YYYY-MM-DD. */
export function startOfWeekIso(now: Date = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dow = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - dow);
  return toIsoDate(d);
}

export function startOfMonthIso(now: Date = new Date()): string {
  return toIsoDate(new Date(now.getFullYear(), now.getMonth(), 1));
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const DAY_FULL = 'sunday|monday|tuesday|wednesday|thursday|friday|saturday';
const DAY_ABBR = 'sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat';
// Whole words only: "month" is not Monday, "wedding" is not Wednesday.
const WHEN_FULL_RX = new RegExp(`\\b(?:(?:on|by|this|next|before)\\s+)?(?:today|tonight|tomorrow|this weekend|next week|${DAY_FULL})\\b`, 'gi');
// Short forms count only after on/by/this/next/before: "he sat the exam" is not Saturday.
const WHEN_ABBR_RX = new RegExp(`\\b(?:on|by|this|next|before)\\s+(?:${DAY_ABBR})\\b\\.?`, 'gi');

interface WhenPhrase {
  text: string;
  index: number;
  /** Introduced by by / on / before: a deadline rather than a passing mention. */
  deadline: boolean;
}

function whenPhrases(text: string): WhenPhrase[] {
  const out: WhenPhrase[] = [];
  for (const rx of [WHEN_FULL_RX, WHEN_ABBR_RX]) {
    rx.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = rx.exec(text))) out.push({ text: m[0].trim(), index: m.index, deadline: /^(?:by|on|before)\b/i.test(m[0]) });
  }
  out.sort((a, b) => a.index - b.index || b.text.length - a.text.length);
  return out.filter((p, i) => !out.some((q, j) => j < i && q.index <= p.index && q.index + q.text.length >= p.index + p.text.length));
}

/** The person's own words for when (e.g. "Thursday", "by Friday", "tomorrow"), if a note has any; a deadline wins. */
export function findWhenWords(text: string): string | null {
  const all = whenPhrases(text);
  if (!all.length) return null;
  return (all.find((p) => p.deadline) ?? all[0]!).text;
}

/** More than one time that could be meant, with no single deadline among them: then no date is suggested. */
export function ambiguousWhen(text: string): boolean {
  const all = whenPhrases(text);
  const deadlines = all.filter((p) => p.deadline);
  if (deadlines.length) return new Set(deadlines.map((p) => p.text.toLowerCase())).size > 1;
  return new Set(all.map((p) => p.text.toLowerCase())).size > 1;
}

/**
 * A suggested date for words like "Thursday" or "tomorrow", in the person's own calendar. Only a
 * suggestion: the UI shows it next to the original words and nothing is stored until they confirm.
 * A bare weekday means the next one after today (said on a Thursday, "Thursday" means next week).
 */
export function suggestDateFor(words: string, now: Date = new Date()): string | null {
  // The same rules as finding the words: "he sat the exam" or "sat" alone never become Saturday.
  const phrase = findWhenWords(words);
  if (!phrase) return null;
  const w = phrase.toLowerCase();
  const today = todayIso(now);
  if (/\b(today|tonight)\b/.test(w)) return today;
  if (/\btomorrow\b/.test(w)) return addDays(today, 1);
  const day = new RegExp(`\\b(${DAY_FULL}|${DAY_ABBR})\\b`).exec(w)?.[1];
  if (!day) return null;
  const idx = WEEKDAYS.findIndex((d) => d.startsWith(day.slice(0, 3)));
  if (idx < 0) return null;
  const ahead = ((idx - now.getDay() + 7) % 7) || 7;
  return addDays(today, ahead);
}

/** ISO-8601 week number (1–53) for weekly prompt rotation. */
export function isoWeekNumber(now: Date = new Date()): number {
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

export function dayOfYear(now: Date = new Date()): number {
  const start = new Date(now.getFullYear(), 0, 0);
  return Math.floor((now.getTime() - start.getTime()) / 86_400_000);
}

/** "Today", "Yesterday", "Tomorrow", or a readable date. */
export function friendlyDate(iso: string, now: Date = new Date()): string {
  const diff = daysBetween(todayIso(now), iso);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  const d = parseIsoDate(iso);
  if (!d) return iso;
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}
