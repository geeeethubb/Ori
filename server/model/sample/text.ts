/**
 * Small, deterministic text helpers shared by the sample adapter: normalisation, light stemming,
 * sentence splitting, similarity and quoting. No randomness, no locale-dependent behaviour.
 */

export const STOPWORDS = new Set<string>([
  'a', 'an', 'the', 'and', 'or', 'but', 'so', 'if', 'then', 'than', 'that', 'this', 'these', 'those', 'it', 'its',
  'i', 'me', 'my', 'mine', 'we', 'our', 'you', 'your', 'he', 'she', 'they', 'them', 'their', 'his', 'her',
  'is', 'am', 'are', 'was', 'were', 'be', 'been', 'being', 'do', 'does', 'did', 'have', 'has', 'had', 'having',
  'to', 'of', 'in', 'on', 'at', 'for', 'from', 'with', 'without', 'by', 'about', 'into', 'over', 'after', 'before',
  'up', 'down', 'out', 'off', 'as', 'not', 'no', 'yes', 'can', 'could', 'would', 'should', 'will', 'may', 'might',
  'just', 'also', 'still', 'very', 'really', 'quite', 'some', 'any', 'all', 'each', 'every', 'most', 'more', 'less',
  'other', 'another', 'much', 'many', 'few', 'lot', 'lots', 'own', 'same', 'such', 'only', 'even', 'ever', 'never',
  'there', 'here', 'where', 'when', 'what', 'which', 'who', 'how', 'why', 'because', 'while', 'until', 'since',
  'want', 'wants', 'wanted', 'like', 'likes', 'liked', 'keep', 'keeps', 'make', 'makes', 'making', 'get', 'gets',
  'getting', 'go', 'going', 'goes', 'start', 'started', 'starting', 'use', 'uses', 'using', 'used', 'need', 'needs',
  'time', 'times', 'week', 'weeks', 'weekly', 'day', 'days', 'daily', 'month', 'months', 'monthly', 'year', 'years',
  'morning', 'mornings', 'evening', 'evenings', 'night', 'nights', 'today', 'now', 'recently', 'recent', 'current',
  'chat', 'chats', 'conversation', 'said', 'say', 'says', 'one', 'two', 'three', 'four', 'five', 'thing', 'things',
  'stuff', 'way', 'ways', 'people', 'person', 'something', 'anything', 'everything', 'new', 'old', 'good', 'better',
  'best', 'bad', 'well', 'often', 'usually', 'sometimes', 'always', 'again', 'already', 'yet', 'back', 'around',
  'confirmed', 'inferred', 'per', 'via', 'etc', 'pm', 'im', 'ive', 'dont', 'doesnt', 'isnt', 'wasnt', 'cant',
  'wont', 'didnt', 'both', 'either', 'neither', 'whether', 'sure', 'unsure', 'maybe', 'probably', 'think',
  'thought', 'feel', 'feels', 'felt', 'know', 'knows', 'knew', 'little', 'bit', 'which', 'another',
]);

/** Lower-case, strip accents and punctuation, collapse whitespace. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’‘`]/g, "'")
    .replace(/[^a-z0-9'\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Very light suffix stemmer: enough to match practice / practicing / practiced. */
export function stem(word: string): string {
  let w = word.toLowerCase().replace(/'s$/, '').replace(/'/g, '');
  if (w.length > 5 && w.endsWith('ing')) w = w.slice(0, -3);
  else if (w.length > 4 && w.endsWith('ed')) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith('es')) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1);
  if (w.length > 4 && w.endsWith('e')) w = w.slice(0, -1);
  const last = w[w.length - 1];
  if (w.length > 3 && last !== undefined && last === w[w.length - 2] && !/[aeiou]/.test(last)) w = w.slice(0, -1);
  return w;
}

/** Content tokens: normalised, stop-words removed, stemmed, length >= 3. */
export function contentTokens(text: string): string[] {
  const out: string[] = [];
  for (const raw of normalize(text).split(' ')) {
    if (!raw || STOPWORDS.has(raw)) continue;
    const s = stem(raw);
    if (s.length >= 3 && !STOPWORDS.has(s)) out.push(s);
  }
  return out;
}

export function jaccard(a: Iterable<string>, b: Iterable<string>): number {
  const sa = new Set(a);
  const sb = new Set(b);
  if (sa.size === 0 && sb.size === 0) return 1;
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter++;
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** Remove Markdown decoration but keep the words. */
export function stripMarkdown(line: string): string {
  return line
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/(^|\s)\*([^*\s][^*]*)\*(?=\s|$|[.,;:!?])/g, '$1$2')
    .replace(/(^|\s)_([^_\s][^_]*)_(?=\s|$|[.,;:!?])/g, '$1$2')
    .replace(/^\s*(?:[-*+•]|\d+[.)])\s+/, '')
    .replace(/^\s*>\s?/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Split prose into sentences (keeps abbreviations like "e.g." reasonably intact). */
export function splitSentences(text: string): string[] {
  const out: string[] = [];
  const MARK = '\u0001';
  for (const para of text.split(/\n+/)) {
    const cleaned = para.replace(/\s+/g, ' ').trim();
    if (!cleaned) continue;
    const parts = cleaned
      .replace(/\b(e\.g|i\.e|vs|etc|approx|dr|mr|ms|mrs|st)\./gi, (m) => m.replace('.', MARK))
      .split(/(?<=[.!?])\s+(?=[A-Z0-9"“(])/)
      .map((s) => s.split(MARK).join('.').trim())
      .filter(Boolean);
    out.push(...parts);
  }
  return out;
}

/** Cut text at a word boundary so it fits `max` characters (an ellipsis counts as one). */
export function clip(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, Math.max(1, max - 1));
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.5 ? cut.slice(0, space) : cut).replace(/[\s,;:.-]+$/, '')}…`;
}

/**
 * A short quotable snippet around a match position, in the user's own words. Falls back to the
 * start of the text when no position is given.
 */
export function snippet(text: string, at: number | undefined, max = 60): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t.replace(/[.;:]+$/, '');
  if (at === undefined || at < 0) return clip(t, max);
  const half = Math.floor(max / 2);
  let start = Math.max(0, at - half);
  let end = Math.min(t.length, start + max - 2);
  if (end - start < max - 2) start = Math.max(0, end - (max - 2));
  if (start > 0) {
    const sp = t.indexOf(' ', start);
    if (sp >= 0 && sp < at) start = sp + 1;
  }
  if (end < t.length) {
    const sp = t.lastIndexOf(' ', end);
    if (sp > at) end = sp;
  }
  const core = t.slice(start, end).replace(/^[\s,;:.-]+|[\s,;:.-]+$/g, '');
  return `${start > 0 ? '…' : ''}${core}${end < t.length ? '…' : ''}`;
}

export function quote(s: string): string {
  return `"${s.replace(/"/g, "'")}"`;
}

/** Join items as "a", "a and b", "a, b and c". */
export function joinNatural(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Capitalise the first letter only. */
export function sentenceCase(s: string): string {
  const t = s.trim();
  const first = t[0];
  return first ? first.toUpperCase() + t.slice(1) : t;
}

export function uniq<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}
