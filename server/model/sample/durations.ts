/**
 * Durations in the words people use and in an app's own copy. A request's "ten-minute", "10 min",
 * "half an hour" or "a quarter of an hour" becomes a number of minutes (the default a new practice app
 * starts at). When that default changes, copy that states the old length ("ten minutes on the clock",
 * "Start 10:00") is rewritten in the same style, so the timer and the words about it agree.
 * Deterministic and locale-free; shared by the sample adapter and the live adapter's post-steps.
 */

const SMALL = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

/** Number words from one to ninety-nine; longer forms first so "sixteen" never reads as "six". */
const NUM_WORD = '(?:(?:twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[\\s-](?:one|two|three|four|five|six|seven|eight|nine)(?![a-z]))?|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|one|two|three|four|five|six|seven|eight|nine|ten)';
/** Not part of a longer number or word ("15" in "115", "five" in "thirty-five", "5" in "1.5"). */
const NOT_AFTER = "(?<![\\w.:'\\u2019\\-\\u2013])";
const DASH = '[-\\u2013]';

/** One length of time, as a regex source without capture groups, for patterns like "N minutes ... timer". */
export const DURATION_SOURCE = `(?:(?:an|one)\\s+hour\\s+and\\s+a\\s+half|(?:a\\s+)?half(?:\\s+an|${DASH}an)?(?:\\s|${DASH})+hour|(?:a\\s+)?quarter(?:\\s+of\\s+an|\\s+an)?(?:\\s|${DASH})+hour|${NOT_AFTER}(?:\\d{1,3}|${NUM_WORD})\\s*${DASH}?\\s*min(?:ute)?s?|${NOT_AFTER}(?:an|\\d{1,2}|${NUM_WORD})\\s*${DASH}?\\s*(?:hours?|hrs?))(?![a-z])`;

/** 1-99 in words ("twenty-five"); null outside that range. */
export function numberWord(n: number): string | null {
  if (!Number.isInteger(n) || n < 1 || n > 99) return null;
  if (n < 20) return SMALL[n] ?? null;
  const tens = TENS[Math.floor(n / 10)] ?? '';
  const unit = n % 10;
  return unit ? `${tens}-${SMALL[unit]}` : tens;
}

/** A number written in digits or words ("12", "twelve", "twenty five", "Twenty-Five"); null otherwise. */
export function parseNumber(s: string): number | null {
  const t = s.trim().toLowerCase();
  if (/^\d{1,3}$/.test(t)) return Number(t);
  const parts = t.split(/[\s-]+/).filter(Boolean);
  if (parts.length === 1) {
    const small = SMALL.indexOf(parts[0] ?? '');
    if (small >= 1) return small;
    const tens = TENS.indexOf(parts[0] ?? '');
    return tens >= 2 ? tens * 10 : null;
  }
  if (parts.length === 2) {
    const tens = TENS.indexOf(parts[0] ?? '');
    const unit = SMALL.indexOf(parts[1] ?? '');
    if (tens >= 2 && unit >= 1 && unit <= 9) return tens * 10 + unit;
  }
  return null;
}

/** "five minutes", "one minute", "120 minutes". */
export function minutesWords(n: number): string {
  return `${numberWord(n) ?? n} minute${n === 1 ? '' : 's'}`;
}

/** "1 minute", "15 minutes": a count in digits with the right noun. */
export function minutesCount(n: number): string {
  return `${n} minute${n === 1 ? '' : 's'}`;
}

/**
 * Groups: 1 "an hour and a half", 2 "half an hour", 3 "a quarter of an hour",
 * 4-6 number, separator, minute unit ("10 minutes", "Ten-minute", "10min"),
 * 7-9 number, separator, hour unit ("an hour", "2 hours", "one-hour").
 */
const CLAIM_SRC = [
  `(?<![\\w-])((?:an|one)\\s+hour\\s+and\\s+a\\s+half)(?![a-z])`,
  `(?<![\\w-])((?:a\\s+)?half(?:\\s+an|${DASH}an)?(?:\\s|${DASH})+hour)(?![a-z])`,
  `(?<![\\w-])((?:a\\s+)?quarter(?:\\s+of\\s+an|\\s+an)?(?:\\s|${DASH})+hour)(?![a-z])`,
  `${NOT_AFTER}(\\d{1,3}|${NUM_WORD})(\\s*${DASH}\\s*|\\s*)(minutes?|mins?)(?![a-z])`,
  `${NOT_AFTER}(an|\\d{1,2}|${NUM_WORD})(\\s*${DASH}\\s*|\\s+)(hours?|hrs?)(?![a-z])`,
].join('|');

export interface DurationClaim {
  index: number;
  text: string;
  minutes: number;
  /** Number claims keep their number style when rewritten; phrase claims ("half an hour") become words. */
  kind: 'number' | 'phrase';
  number?: string;
  separator?: string;
  unit?: string;
}

/** Every length of time stated in a text, in order. */
export function durationClaims(text: string): DurationClaim[] {
  const out: DurationClaim[] = [];
  const rx = new RegExp(CLAIM_SRC, 'gi');
  let m: RegExpExecArray | null;
  while ((m = rx.exec(text))) {
    const base = { index: m.index, text: m[0] };
    if (m[1]) out.push({ ...base, minutes: 90, kind: 'phrase' });
    else if (m[2]) out.push({ ...base, minutes: 30, kind: 'phrase' });
    else if (m[3]) out.push({ ...base, minutes: 15, kind: 'phrase' });
    else if (m[4]) {
      const n = parseNumber(m[4]);
      if (n !== null && n >= 1) out.push({ ...base, minutes: n, kind: 'number', number: m[4], separator: m[5] ?? '', unit: m[6] ?? 'minutes' });
    } else if (m[7]) {
      const n = m[7].toLowerCase() === 'an' ? 1 : parseNumber(m[7]);
      if (n !== null && n >= 1) out.push({ ...base, minutes: n * 60, kind: 'number', number: m[7], separator: m[8] ?? ' ', unit: m[9] ?? 'hours' });
    }
  }
  return out;
}

/** The first length of time in a request, in minutes (1-180), or null: "a ten-minute session" gives 10. */
export function minutesFromText(text: string): number | null {
  const first = durationClaims(text)[0];
  return first ? Math.max(1, Math.min(180, first.minutes)) : null;
}

/** The person's own phrase for the length, with what it is for when they said so: "15 minutes to practice". */
export function durationPhrase(text: string): string | null {
  const first = durationClaims(text)[0];
  if (!first) return null;
  const after = text.slice(first.index + first.text.length);
  const purpose = /^\s+((?:to|of|for)\s+[a-z]+)/i.exec(after)?.[1];
  return `${first.text}${purpose ? ` ${purpose}` : ''}`.trim();
}

/**
 * The person's own words for a length as a noun phrase that reads after "your": "15 minutes", "ten
 * minutes" (from "a ten-minute session"), "1 minute", "half an hour", "quarter of an hour", "hour and a
 * half", "hour" (from "an hour"). What it is for is kept only when it is the activity itself ("15 minutes
 * to practice"); "half an hour for guitar" gives "half an hour". Null when no length is stated.
 */
export function spokenDuration(text: string): string | null {
  const claim = durationClaims(text)[0];
  if (!claim) return null;
  let words: string;
  if (claim.kind === 'phrase') {
    words = claim.text.replace(/^an?\s+/i, '').replace(/[-–]/g, ' ').replace(/\s+/g, ' ').toLowerCase();
  } else {
    const num = claim.number ?? '';
    const article = /^an?$/i.test(num);
    const count = article ? 1 : parseNumber(num) ?? 0;
    const noun = /^h/i.test(claim.unit ?? '') ? (count === 1 ? 'hour' : 'hours') : count === 1 ? 'minute' : 'minutes';
    words = article ? noun : `${/^\d/.test(num) ? num : num.toLowerCase()} ${noun}`;
  }
  const after = text.slice(claim.index + claim.text.length);
  const purpose = /^\s+(to\s+(?:practi[cs]e|play|learn|rehearse|jam|sketch|draw|shoot))\b/i.exec(after)?.[1];
  return purpose ? `${words} ${purpose.toLowerCase()}` : words;
}

/** Same capitalisation as the original ("Ten" gives "Five", "TEN" gives "FIVE"). */
function sameCase(original: string, next: string): string {
  if (original.length > 1 && original === original.toUpperCase() && /[A-Z]/.test(original)) return next.toUpperCase();
  if (/^[A-Z]/.test(original)) return next.charAt(0).toUpperCase() + next.slice(1);
  return next;
}

const singular = (unit: string) => unit.replace(/s$/i, '');
const plural = (unit: string) => (/s$/i.test(unit) ? unit : `${unit}s`);

/** "a" or "an" before a word or number ("an eight-minute", "a one-hour", "an hour"). */
function articleFor(word: string): string {
  const w = word.trim().toLowerCase();
  if (/^\d/.test(w)) return /^(?:8|11|18|8\d)(?!\d)/.test(w) ? 'an' : 'a';
  if (/^(?:one|uni|use|usu|eu)/.test(w)) return 'a';
  if (/^(?:hour|honest|hono)/.test(w)) return 'an';
  return /^[aeiou]/.test(w) ? 'an' : 'a';
}

/** Nouns a length can describe ("a ten-minute session", "half hour sessions"): before one, the length is an adjective. */
const DESCRIBED_RX = /^\s+(?:sessions?|sprints?|practices?|walks?|timers?|blocks?|breaks?|slots?|runs?|routines?|class(?:es)?|lessons?|drills?|rounds?|challenges?|workouts?|warm-?ups?|sketch(?:es)?|drawings?|habits?|exercises?|meditations?|jams?|study|studies|reads?|countdowns?|windows?|chunks?|bursts?|loops?)\b/i;

/** The length as an adjective in the claim's own style: "Twenty-minute", "5-minute", "5 minute", "half-hour", "two-hour". */
function adjectiveClaim(claim: DurationClaim, to: number): { text: string; article: string | null } {
  if (claim.kind === 'phrase') {
    const own = /^(an?)\s+/i.exec(claim.text)?.[1] ?? null;
    const core = own ? claim.text.slice(own.length).trimStart() : claim.text;
    const words = to === 30 ? 'half-hour' : to === 15 ? 'quarter-hour' : to % 60 === 0 ? `${numberWord(to / 60) ?? to / 60}-hour` : `${numberWord(to) ?? to}-minute`;
    return { text: own ? words : sameCase(core, words), article: own };
  }
  const num = claim.number ?? '';
  const own = /^an?$/i.test(num) ? num : null;
  const digits = /^\d/.test(num);
  const hours = /^h/i.test(claim.unit ?? '') && to % 60 === 0;
  const n = hours ? to / 60 : to;
  const value = digits ? String(n) : numberWord(n) ?? String(n);
  const sep = own || /[-–]/.test(claim.separator ?? '') ? '-' : claim.separator ?? '-';
  const unit = hours ? 'hour' : /^mins?$/i.test(claim.unit ?? '') ? 'min' : 'minute';
  const numberText = own || digits ? value : sameCase(num, value);
  return { text: `${numberText}${sep}${own ? unit : sameCase(claim.unit ?? 'minute', unit)}`, article: own };
}

function rewriteClaim(claim: DurationClaim, to: number): string {
  if (claim.kind === 'phrase') {
    const words = to === 90 ? 'an hour and a half' : to === 60 ? 'an hour' : to === 30 ? 'half an hour' : to === 15 ? 'a quarter of an hour' : minutesWords(to);
    return sameCase(claim.text, words);
  }
  const num = claim.number ?? '';
  const digits = /^\d/.test(num);
  const sep = claim.separator ?? ' ';
  const adjective = /[-–]/.test(sep);
  const unit = claim.unit ?? 'minutes';
  if (/^h/i.test(unit)) {
    if (to % 60 === 0) {
      const h = to / 60;
      const n = digits ? String(h) : h === 1 && num.toLowerCase() === 'an' ? 'an' : numberWord(h) ?? String(h);
      return `${sameCase(num, n)}${sep}${adjective || h === 1 ? singular(unit) : plural(unit)}`;
    }
    const n = digits ? String(to) : numberWord(to) ?? String(to);
    const minuteUnit = adjective || to === 1 ? 'minute' : 'minutes';
    return `${sameCase(num, n)}${sep.trim() ? sep : ' '}${sameCase(unit, minuteUnit)}`;
  }
  const n = digits ? String(to) : numberWord(to) ?? String(to);
  const u = adjective || to === 1 ? singular(unit) : /^mins?$/i.test(unit) ? unit : plural(unit);
  return `${sameCase(num, n)}${sep}${u}`;
}

/**
 * "Start 10:00", "timer at 10:00": a countdown shown as a clock, only next to a timer word. A time of day
 * is never one ("Lessons start at 10:00", "10:00 am").
 */
const CLOCK_RX = /\b(start(?:s|ing)?|timer|clock|countdown)\b([^.!?\n\d]{0,12}?)(\d{1,3}):00(?![\d:])(\s*(?:am|pm|a\.m\.|p\.m\.|o['’]clock)\b)?/gi;

/**
 * Rewrite every claim of `from` minutes to `to` minutes, keeping each claim's style ("Ten-minute"
 * gives "Five-minute", "10 min" gives "5 min", "Start 10:00" gives "Start 5:00"). A length that
 * describes something stays an adjective ("Half-hour sessions" gives "Twenty-minute sessions", "An
 * hour-long session" gives "A ninety-minute session"), with "a" or "an" to match. Other lengths stay.
 */
export function rewriteMinutes(text: string, from: number, to: number): { text: string; count: number } {
  if (!text || from === to) return { text, count: 0 };
  let count = 0;
  let out = '';
  let last = 0;
  for (const claim of durationClaims(text)) {
    if (claim.minutes !== from) continue;
    let end = claim.index + claim.text.length;
    const after = text.slice(end);
    const long = /^[-– ]long\b/i.exec(after);
    const adjective = Boolean(long) || /[-–]/.test(claim.kind === 'phrase' ? claim.text : claim.separator ?? '') || DESCRIBED_RX.test(after);
    let before = text.slice(last, claim.index);
    let replacement: string;
    if (adjective) {
      const adj = adjectiveClaim(claim, to);
      if (adj.article) {
        replacement = `${sameCase(adj.article, articleFor(adj.text))} ${adj.text}`;
      } else {
        replacement = adj.text;
        // "an eleven-minute walk" becomes "a ten-minute walk".
        before = before.replace(/\b(an?)(\s+)$/i, (_m: string, a: string, space: string) => `${sameCase(a, articleFor(adj.text))}${space}`);
      }
      if (long) end += long[0].length;
    } else {
      replacement = rewriteClaim(claim, to);
    }
    out += before + replacement;
    last = end;
    count++;
  }
  out += text.slice(last);
  out = out.replace(CLOCK_RX, (whole: string, word: string, gap: string, mins: string, meridiem: string | undefined) => {
    if (Number(mins) !== from || meridiem) return whole;
    if (/^start/i.test(word) && /\b(?:at|from|by|until|till|around|before|after|on)\b/i.test(gap)) return whole;
    count++;
    return `${word}${gap}${to}:00`;
  });
  return { text: out, count };
}
