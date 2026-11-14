/**
 * Pure helpers for the storefront pages. No React and no DOM so they are unit-testable.
 */
import { designFor, fieldTypeLabel, type AppSpec, type AppTheme, type Pattern, type Purpose, type RuleSpec, type ViewSpec } from '@shared/appSpec.ts';
import type { UserDto } from '@shared/api.ts';
import type { FactCategory, FactStatus, ProfileFact, ProposalKind, Recommendation, SourceKind } from '@shared/context.ts';

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

/** The first sentence of a short text (used where a card shows one reason and the rest sits in a disclosure). */
export function firstSentence(text: string): string {
  const t = text.trim();
  const m = /^[\s\S]*?[.!?](?=\s|$)/.exec(t);
  return m ? m[0].trim() : t;
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

// ---------- proposals (shared by the Agent thread, the Playground and Make mine) ----------

export type ProposalLike = Pick<Recommendation, 'id' | 'kind' | 'status' | 'builtAppId' | 'targetAppId'>;

export interface ProposalAction {
  label: 'Explore' | 'Make mine' | 'Open' | 'Add to app' | 'Keep' | 'Kept';
  to: string;
  emphasis: 'primary' | 'secondary';
}

/** The one primary action a proposal card offers, by kind and status. */
export function proposalAction(p: ProposalLike): ProposalAction {
  switch (p.kind) {
    case 'explore':
      return { label: 'Explore', to: `/make/${p.id}`, emphasis: 'primary' };
    case 'update_app':
      if (p.status === 'applied' && p.targetAppId) return { label: 'Open', to: `/apps/${p.targetAppId}/`, emphasis: 'primary' };
      return { label: 'Add to app', to: `/make/${p.id}`, emphasis: 'primary' };
    case 'keep':
      if (p.status === 'kept') return { label: 'Kept', to: '/settings/memory', emphasis: 'secondary' };
      return { label: 'Keep', to: `/make/${p.id}`, emphasis: 'secondary' };
    default:
      if (p.status === 'built' && p.builtAppId) return { label: 'Open', to: `/apps/${p.builtAppId}/`, emphasis: 'primary' };
      return { label: 'Make mine', to: `/make/${p.id}`, emphasis: 'primary' };
  }
}

export const PROPOSAL_KIND_LABELS: Record<ProposalKind, string> = {
  new_app: 'Make an app',
  explore: 'Explore',
  update_app: 'Add to an app',
  keep: 'Keep',
};

/** Time budget chips: shown only when the app would actually use a practice timer. */
export const MINUTE_CHOICES = [10, 15, 25] as const;
export const DEFAULT_MINUTES = 15;

export function wantsTimeBudget(rec: Pick<Recommendation, 'capabilities' | 'pattern'>): boolean {
  return rec.pattern === 'practice' || rec.capabilities.includes('practice_timer');
}

export interface LookOption {
  id: AppTheme;
  label: string;
  /** Swatch colours: background, accent. */
  swatch: [string, string];
}

/** The seven app looks the runtime knows (runtime owns the exact variables; these are swatches). */
export const LOOKS: LookOption[] = [
  { id: 'bright', label: 'Bright', swatch: ['#F7F8FC', '#3147F2'] },
  { id: 'paper', label: 'Paper', swatch: ['#FAF8F4', '#FF6A3D'] },
  { id: 'charcoal', label: 'Charcoal', swatch: ['#181A1F', '#DBCBFF'] },
  { id: 'ink', label: 'Ink', swatch: ['#162039', '#DFFF76'] },
  { id: 'mint', label: 'Mint', swatch: ['#F3FBF7', '#BCEED6'] },
  { id: 'lilac', label: 'Lilac', swatch: ['#F1EAFF', '#DBCBFF'] },
  { id: 'sunset', label: 'Sunset', swatch: ['#FFF1EA', '#FF6A3D'] },
];

/** The look a proposal would get by default (its design, else the pattern's compatibility default). */
export function defaultLook(rec: Pick<Recommendation, 'design' | 'pattern' | 'icon' | 'purpose'>): AppTheme {
  return designFor({ design: rec.design, pattern: rec.pattern, icon: rec.icon, purpose: rec.purpose }).theme;
}

/** Pick the proposal that leads the Playground grid: the first fresh app-shaped proposal, else the first card. */
export function pickFeatured<T extends Pick<Recommendation, 'kind' | 'status' | 'pattern'>>(recs: T[]): T | null {
  if (recs.length === 0) return null;
  const rich: Pattern[] = ['practice', 'gallery', 'queue'];
  return (
    recs.find((r) => r.status === 'fresh' && r.kind === 'new_app' && rich.includes(r.pattern)) ??
    recs.find((r) => r.status === 'fresh' && (r.kind === 'new_app' || r.kind === 'update_app')) ??
    recs.find((r) => r.kind !== 'keep') ??
    recs[0] ??
    null
  );
}

// ---------- memory ("What you've shared") ----------

export type MemoryGroupKey = 'interests' | 'needs' | 'routines' | 'changes' | 'questions';

export interface MemoryGroup {
  key: MemoryGroupKey;
  title: string;
  hint: string;
  categories: FactCategory[];
  facts: ProfileFact[];
}

export interface MemoryGroups {
  groups: MemoryGroup[];
  /** Facts that contradict each other, grouped; the person keeps one. */
  conflicts: ProfileFact[][];
  total: number;
}

const MEMORY_GROUPS: Omit<MemoryGroup, 'facts'>[] = [
  { key: 'interests', title: 'Interests', hint: 'What you are curious about or want to get better at.', categories: ['interest'] },
  { key: 'needs', title: 'Current needs', hint: 'Goals, projects and responsibilities right now.', categories: ['goal', 'project'] },
  { key: 'routines', title: 'Routines & tools', hint: 'How your days run and what you already use.', categories: ['routine', 'tool'] },
  { key: 'changes', title: 'Recent changes', hint: 'Things that may make older notes stale.', categories: ['change'] },
  { key: 'questions', title: 'Open questions', hint: 'Uncertain or contradictory notes to settle.', categories: ['uncertainty'] },
];

/** Group editable facts the way the memory page shows them; removed facts and resolved conflicts drop out. */
export function groupFactsForMemory(facts: ProfileFact[]): MemoryGroups {
  const live = facts.filter((f) => f.status !== 'removed');
  const byConflict = new Map<string, ProfileFact[]>();
  for (const f of live) {
    if (f.status === 'conflict' && f.conflictGroup) byConflict.set(f.conflictGroup, [...(byConflict.get(f.conflictGroup) ?? []), f]);
  }
  const conflicts = [...byConflict.values()].filter((g) => g.length > 1);
  const inConflict = new Set(conflicts.flat().map((f) => f.id));
  const groups = MEMORY_GROUPS.map((g) => ({ ...g, facts: live.filter((f) => g.categories.includes(f.category) && !inConflict.has(f.id)) }));
  return { groups, conflicts, total: live.length };
}

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
