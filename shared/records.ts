/**
 * AppRecord values: a stable field-id → value map validated against the current spec.
 * Values for hidden or unknown field IDs are preserved untouched so revisions never lose data.
 */
import type { AppSpec, FieldSpec } from './appSpec.ts';
import { SHORT_ID_PATTERN } from './ids.ts';
import { parseIsoDate, todayIso } from './time.ts';

export type FieldValue = string | number | boolean | string[] | null;
export type RecordValues = Record<string, unknown>;

export interface AppRecord {
  id: string;
  appId: string;
  values: RecordValues;
  createdAt: string; // ISO timestamp
  updatedAt: string;
}

export const MAX_VALUE_KEYS = 64;
export const MAX_STRING_LENGTH = 20_000;

/** Image values are media ids; preview content uses `example:<name>` which is never stored. */
export const EXAMPLE_IMAGE_PREFIX = 'example:';
export const IMAGE_VALUE_PATTERN = /^(?:[A-Za-z0-9_-]{8,40}|example:[a-z0-9-]{1,40})$/;

export interface ValuesValidation {
  ok: boolean;
  values: RecordValues;
  errors: Record<string, string>;
}

/** Default values for a new record form. */
export function defaultValues(spec: AppSpec, now: Date = new Date()): RecordValues {
  const out: RecordValues = {};
  for (const f of spec.fields) {
    if (f.hidden) continue;
    switch (f.type) {
      case 'date':
        if (f.default === 'today') out[f.id] = todayIso(now);
        else if (f.default) out[f.id] = f.default;
        break;
      case 'select':
        out[f.id] = f.default ?? f.options[0]?.value ?? '';
        break;
      case 'checkbox':
        out[f.id] = f.default ?? false;
        break;
      case 'tags':
        out[f.id] = f.default ?? [];
        break;
      case 'rating':
      case 'number':
        if (f.default !== undefined) out[f.id] = f.default;
        break;
      case 'image':
        break;
      default:
        if (f.default !== undefined) out[f.id] = f.default;
    }
  }
  return out;
}

function coerceField(f: FieldSpec, raw: unknown): { value: FieldValue; error?: string } {
  const empty = raw === undefined || raw === null || raw === '' || (Array.isArray(raw) && raw.length === 0);
  if (empty) {
    if (f.required && f.type !== 'checkbox') return { value: null, error: 'Required' };
    if (f.type === 'checkbox') return { value: false };
    if (f.type === 'tags') return { value: [] };
    return { value: null };
  }
  switch (f.type) {
    case 'text':
    case 'long_text':
    case 'url': {
      const s = typeof raw === 'string' ? raw : String(raw);
      const max = f.type === 'text' ? (f.maxLength ?? 500) : f.type === 'url' ? 2000 : MAX_STRING_LENGTH;
      if (s.length > max) return { value: s.slice(0, max), error: `Keep this under ${max} characters` };
      if (f.type === 'url' && !/^https?:\/\//i.test(s.trim())) return { value: s, error: 'Links should start with http:// or https://' };
      return { value: s };
    }
    case 'date': {
      const s = typeof raw === 'string' ? raw.trim() : '';
      if (!parseIsoDate(s)) return { value: null, error: 'Use a date like 2026-11-14' };
      return { value: s };
    }
    case 'number':
    case 'rating': {
      const n = typeof raw === 'number' ? raw : Number(String(raw).trim());
      if (!Number.isFinite(n)) return { value: null, error: 'Enter a number' };
      if (f.type === 'rating') {
        if (!Number.isInteger(n) || n < 0 || n > f.max) return { value: null, error: `Pick 1–${f.max}` };
        return { value: n };
      }
      if (f.min !== undefined && n < f.min) return { value: n, error: `Minimum is ${f.min}` };
      if (f.max !== undefined && n > f.max) return { value: n, error: `Maximum is ${f.max}` };
      return { value: n };
    }
    case 'select': {
      const s = String(raw);
      if (!f.options.some((o) => o.value === s)) return { value: null, error: 'Pick one of the options' };
      return { value: s };
    }
    case 'checkbox':
      return { value: raw === true || raw === 'true' || raw === 1 };
    case 'tags': {
      const arr = Array.isArray(raw) ? raw : String(raw).split(',');
      const tags = Array.from(new Set(arr.map((t) => String(t).trim()).filter(Boolean))).slice(0, 30);
      return { value: tags.map((t) => t.slice(0, 40)) };
    }
    case 'image': {
      const s = typeof raw === 'string' ? raw.trim() : '';
      // Only real media ids are accepted; example images (`example:…`) never reach storage.
      if (!SHORT_ID_PATTERN.test(s)) return { value: null, error: 'Add a photo' };
      return { value: s };
    }
  }
}

/**
 * Validate a submitted values map against the spec. Unknown / hidden keys pass through so
 * nothing is lost; shown fields are coerced and checked. `partial` skips required checks for
 * fields absent from the input (used for PATCH).
 */
export function validateValues(spec: AppSpec, input: unknown, opts: { partial?: boolean } = {}): ValuesValidation {
  const errors: Record<string, string> = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, values: {}, errors: { _: 'Values must be an object' } };
  }
  const raw = input as RecordValues;
  const keys = Object.keys(raw);
  if (keys.length > MAX_VALUE_KEYS) return { ok: false, values: {}, errors: { _: `Too many fields (max ${MAX_VALUE_KEYS})` } };
  const out: RecordValues = {};
  const known = new Map(spec.fields.map((f) => [f.id, f]));
  for (const key of keys) {
    const f = known.get(key);
    const v = raw[key];
    if (!f || f.hidden) {
      // Preserve, but bound size.
      out[key] = typeof v === 'string' ? v.slice(0, MAX_STRING_LENGTH) : v;
      continue;
    }
    const { value, error } = coerceField(f, v);
    if (error) errors[key] = error;
    out[key] = value;
  }
  if (!opts.partial) {
    for (const f of spec.fields) {
      if (f.hidden || !f.required || f.type === 'checkbox') continue;
      if (!(f.id in raw)) errors[f.id] = 'Required';
    }
  }
  return { ok: Object.keys(errors).length === 0, values: out, errors };
}

/** Image field ids whose values are media ids (so a server can check ownership before saving). */
export function imageMediaIds(spec: AppSpec, values: RecordValues): string[] {
  const out: string[] = [];
  for (const f of spec.fields) {
    if (f.type !== 'image') continue;
    const v = values[f.id];
    if (typeof v === 'string' && SHORT_ID_PATTERN.test(v) && !v.startsWith(EXAMPLE_IMAGE_PREFIX)) out.push(v);
  }
  return out;
}

/** Short display string for a value in lists/cards. */
export function formatValue(f: FieldSpec | undefined, v: unknown): string {
  if (v === null || v === undefined || v === '') return '';
  if (!f) return typeof v === 'string' ? v : JSON.stringify(v);
  switch (f.type) {
    case 'select':
      return f.options.find((o) => o.value === v)?.label ?? String(v);
    case 'checkbox':
      return v ? 'Yes' : 'No';
    case 'tags':
      return Array.isArray(v) ? v.join(', ') : String(v);
    case 'number':
      return `${v}${f.unit ? ` ${f.unit}` : ''}`;
    case 'rating':
      return `${v}/${f.max}`;
    case 'image':
      return 'Photo';
    default:
      return String(v);
  }
}

export function recordTitle(spec: AppSpec, record: AppRecord, titleFieldId?: string): string {
  const fid = titleFieldId ?? spec.fields.find((f) => !f.hidden && (f.type === 'text'))?.id;
  const f = spec.fields.find((x) => x.id === fid);
  const v = fid ? record.values[fid] : undefined;
  const s = formatValue(f, v);
  if (s) return s;
  const longText = spec.fields.find((f) => !f.hidden && f.type === 'long_text');
  const lt = longText ? String(record.values[longText.id] ?? '') : '';
  if (lt) return lt.length > 60 ? `${lt.slice(0, 57)}…` : lt;
  return `Untitled ${spec.entryNoun.singular}`;
}
