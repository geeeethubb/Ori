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
const WHEN_RX = /\b(?:(?:on|by|this|next|before)\s+)?(?:today|tonight|tomorrow|this weekend|next week|(?:sun|mon|tues?|wed(?:nes)?|thu(?:rs?)?|fri|sat(?:ur)?)(?:day)?)\b/i;

/** The person's own words for when (e.g. "Thursday", "by Friday", "tomorrow"), if a note has any. */
export function findWhenWords(text: string): string | null {
  const m = WHEN_RX.exec(text);
  return m ? m[0].trim() : null;
}

/**
 * A suggested date for words like "Thursday" or "tomorrow", in the person's own calendar. Only a
 * suggestion: the UI shows it next to the original words and nothing is stored until they confirm.
 * A bare weekday means the next one after today (said on a Thursday, "Thursday" means next week).
 */
export function suggestDateFor(words: string, now: Date = new Date()): string | null {
  const w = words.toLowerCase();
  const today = todayIso(now);
  if (/\b(today|tonight)\b/.test(w)) return today;
  if (/\btomorrow\b/.test(w)) return addDays(today, 1);
  const idx = WEEKDAYS.findIndex((d) => new RegExp(`\\b${d.slice(0, 3)}`).test(w));
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
