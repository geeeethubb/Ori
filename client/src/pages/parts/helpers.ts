/**
 * Pure helpers for the storefront pages. No React and no DOM so they are unit-testable.
 */
import { fieldTypeLabel, type AppSpec, type Purpose, type RuleSpec, type ViewSpec } from '@shared/appSpec.ts';
import type { UserDto } from '@shared/api.ts';
import type { FactStatus, SourceKind } from '@shared/context.ts';

/**
 * Only same-site paths may be used as a post-login destination: a single leading slash, no
 * scheme, no protocol-relative URL, no control characters or whitespace.
 */
export function safeNextPath(raw: string | null | undefined, fallback: string): string {
  if (!raw) return fallback;
  const s = raw.trim();
  if (!s.startsWith('/') || s.startsWith('//') || s.startsWith('/\\')) return fallback;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\s]/.test(s)) return fallback;
  return s;
}

export function purposeLabel(purpose: Purpose): string {
  return purpose === 'work' ? 'Get things done' : 'Explore life';
}

export function truncate(text: string, max = 60): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

export function pluralize(n: number, singular: string, plural = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

export function formatDate(iso: string | null | undefined, withYear = true): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}) });
}

/** "just now", "5 min ago", "yesterday", "3 days ago", or a short date. */
export function relativeTime(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return '';
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return '';
  const minutes = Math.round((now.getTime() - then.getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return formatDate(iso, then.getFullYear() !== now.getFullYear());
}

/** Whole days until `untilIso` (never negative). */
export function daysLeft(untilIso: string, now: Date = new Date()): number {
  const end = new Date(untilIso).getTime();
  if (Number.isNaN(end)) return 0;
  return Math.max(0, Math.ceil((end - now.getTime()) / 86_400_000));
}

export const SOURCE_KIND_LABELS: Record<SourceKind, string> = {
  paste: 'Pasted text',
  upload: 'Uploaded file',
  manual: 'Short profile',
  sample: 'Sample context',
  chosen_interest: 'Something you chose',
  capture: 'Shared with the agent',
};

export const FACT_STATUS_LABELS: Record<FactStatus, string> = {
  confirmed: 'Confirmed',
  inferred: 'Inferred',
  conflict: 'Needs a decision',
  removed: 'Removed',
};

export const PLAN_LABELS: Record<UserDto['plan'], string> = {
  trial: 'Free trial',
  intro: 'Introductory plan, $7.50 a month',
  personal: 'Personal plan, $15 a month',
  paused: 'Paused: view and export only',
};

/** Heuristic: text files have few control characters and no NUL / replacement characters. */
export function looksLikeText(text: string): boolean {
  if (!text.trim()) return false;
  if (text.includes('\u0000') || text.includes('�')) return false;
  const sample = text.slice(0, 20_000);
  let control = 0;
  for (let i = 0; i < sample.length; i++) {
    const c = sample.charCodeAt(i);
    if (c < 32 && c !== 9 && c !== 10 && c !== 13) control++;
  }
  return control / sample.length < 0.01;
}

/** Flatten a parsed JSON document into its string values, one per line ("key: value" for object members). */
export function flattenJsonText(value: unknown): string {
  const lines: string[] = [];
  const walk = (v: unknown, key: string | null, depth: number): void => {
    if (depth > 24 || lines.length >= 5_000) return;
    if (typeof v === 'string') {
      const s = v.trim();
      if (s) lines.push(key ? `${key}: ${s}` : s);
      return;
    }
    if (Array.isArray(v)) {
      for (const item of v) walk(item, null, depth + 1);
      return;
    }
    if (v && typeof v === 'object') {
      for (const [k, item] of Object.entries(v as Record<string, unknown>)) walk(item, k, depth + 1);
    }
  };
  walk(value, null, 0);
  return lines.join('\n');
}

export interface ManualProfileInput {
  working: string;
  explore: string;
  routines: string;
  tools: string;
}

/** Compose the "short profile" answers into a small Markdown document; empty when nothing was written. */
export function composeManualProfile(input: ManualProfileInput): string {
  const sections: Array<[string, string]> = [
    ['What I am working on', input.working],
    ['What I want to get better at or explore', input.explore],
    ['Routines and constraints', input.routines],
    ['Tools I use', input.tools],
  ];
  const filled = sections.filter(([, v]) => v.trim().length > 0).map(([h, v]) => `## ${h}\n\n${v.trim()}`);
  return filled.length ? `# My short profile\n\n${filled.join('\n\n')}\n` : '';
}

/** Plain-words description of a view for the build preview. */
export function describeView(spec: AppSpec, view: ViewSpec): string {
  switch (view.type) {
    case 'journal':
      return view.title ? `Journal view: ${view.title}` : 'Journal view';
    case 'board': {
      const stage = spec.fields.find((f) => f.id === view.stageFieldId);
      const columns = stage?.type === 'select' ? stage.options.map((o) => o.label).join(', ') : '';
      return columns ? `Board with columns: ${columns}` : 'Board view';
    }
    case 'list':
      return view.title ? `List view: ${view.title}` : 'List view';
    case 'summary':
      return `Summary: ${view.metrics.map((m) => m.label).join(', ')}`;
    case 'gallery':
      return `Photo gallery${view.title ? `: ${view.title}` : ''} (${view.columns} across)`;
    case 'practice':
      return `Practice timer with ${view.presets.join(' / ')} minute presets${view.tempoHelper ? ' and a tempo helper' : ''}`;
    case 'links':
      return view.title ? `Saved sources: ${view.title}` : 'Saved sources';
    case 'queue':
      return `Next-action queue grouped by ${view.groupBy === 'person' ? 'person' : 'what is due'}`;
  }
}

/** Plain-words description of a rule for the build preview. */
export function describeRule(rule: RuleSpec): string {
  if (rule.type === 'due_soon') {
    const n = rule.withinDays;
    const window = n === 0 ? 'due today' : n === 1 ? 'due by tomorrow' : `due within ${n} days`;
    return `Highlights anything ${window}, and anything overdue${rule.label ? ` (${rule.label})` : ''}.`;
  }
  const n = rule.prompts.length;
  return `${rule.title}: a ${rule.cadence} prompt that rotates through ${n} ${n === 1 ? 'idea' : 'ideas'}.`;
}

export interface FieldSummary {
  label: string;
  type: string;
  required: boolean;
}

export function describeFields(spec: AppSpec): FieldSummary[] {
  return spec.fields.filter((f) => !f.hidden).map((f) => ({ label: f.label, type: fieldTypeLabel(f.type), required: Boolean(f.required) }));
}
