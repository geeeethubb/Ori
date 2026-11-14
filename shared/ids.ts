/** Stable identifiers shared by client, server, and the Android shell. */

/** App IDs are unguessable, URL-safe, and validated at every boundary (routes, shortcuts). */
export const APP_ID_PATTERN = /^[A-Za-z0-9_-]{8,32}$/;
/** Field IDs are stable snake_case keys; labels can change, IDs never do. */
export const FIELD_ID_PATTERN = /^[a-z][a-z0-9_]{0,39}$/;
/** Generic short IDs (records, sources, facts, recommendations). */
export const SHORT_ID_PATTERN = /^[A-Za-z0-9_-]{8,40}$/;

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';

/** 16 URL-safe random characters (~96 bits). Works in browsers and Node. */
export function newId(length = 16): string {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[(bytes[i] as number) & 63];
  return out;
}

export function isAppId(value: unknown): value is string {
  return typeof value === 'string' && APP_ID_PATTERN.test(value);
}

/** Turn a label into a stable field id candidate, e.g. "Next experiment" -> "next_experiment". */
export function slugifyFieldId(label: string, taken: Iterable<string> = []): string {
  const base =
    label
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .replace(/^[^a-z]+/, '')
      .slice(0, 32) || 'field';
  const used = new Set(taken);
  let candidate = base;
  let n = 2;
  while (used.has(candidate)) candidate = `${base}_${n++}`;
  return candidate;
}
