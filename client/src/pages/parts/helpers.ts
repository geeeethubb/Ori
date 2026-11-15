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

/** The Playground's two kinds of idea: useful things (Everyday) and new interests (Explore). */
export function purposeLabel(purpose: Purpose): string {
  return purpose === 'work' ? 'Everyday' : 'Explore';
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
  sample: 'Example profile',
  chosen_interest: 'Something you chose',
  capture: 'Shared with Ori',
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

export type ProposalLike = Pick<Recommendation, 'id' | 'kind' | 'status' | 'builtAppId' | 'targetAppId'> & { title?: string };

export interface ProposalAction {
  /** Ori's words for the action: "Preview Light", "Open Riff", "Try it", "Preview change", "Keep inspiration", "Kept". */
  label: string;
  /** The same action for a small pill ("Preview", "Open"); the full label stays its accessible name. */
  short: string;
  to: string;
  emphasis: 'primary' | 'secondary';
}

/** A name short enough to sit inside a button ("Preview Light"); longer titles keep the plain verb. */
export function fitsInButton(name: string | null | undefined): name is string {
  const n = (name ?? '').trim();
  return n.length > 0 && n.length <= 22 && !/[.!?:;]/.test(n);
}

/**
 * The one primary action a proposal card offers, by kind and status. `appName` is the name of the
 * person's app for use_app and update_app (the proposal's own title for a new app).
 */
export function proposalAction(p: ProposalLike, appName?: string | null): ProposalAction {
  const named = (verb: string, name: string | null | undefined) => (fitsInButton(name) ? `${verb} ${name.trim()}` : verb);
  switch (p.kind) {
    case 'explore':
      return { label: 'Try it', short: 'Try it', to: `/make/${p.id}`, emphasis: 'primary' };
    case 'update_app':
      if (p.status === 'applied' && p.targetAppId) return { label: named('Open', appName), short: 'Open', to: `/apps/${p.targetAppId}/`, emphasis: 'primary' };
      return { label: 'Preview change', short: 'Preview change', to: `/make/${p.id}`, emphasis: 'primary' };
    case 'use_app':
      // Opening an app you have is not a change to it: any entry it suggests is confirmed in the app.
      if (!p.targetAppId) return { label: 'Open My apps', short: 'Open', to: '/apps', emphasis: 'primary' };
      return {
        label: named('Open', appName),
        short: 'Open',
        to: p.status === 'fresh' || p.status === 'stale' ? `/apps/${p.targetAppId}/?from=${p.id}` : `/apps/${p.targetAppId}/`,
        emphasis: 'primary',
      };
    case 'keep':
      if (p.status === 'kept') return { label: 'Kept', short: 'Kept', to: '/settings/memory', emphasis: 'secondary' };
      return { label: 'Keep inspiration', short: 'Keep', to: `/make/${p.id}`, emphasis: 'secondary' };
    default:
      if (p.status === 'built' && p.builtAppId) return { label: named('Open', p.title), short: 'Open', to: `/apps/${p.builtAppId}/`, emphasis: 'primary' };
      return { label: named('Preview', p.title), short: 'Preview', to: `/make/${p.id}`, emphasis: 'primary' };
  }
}

export const PROPOSAL_KIND_LABELS: Record<ProposalKind, string> = {
  new_app: 'Make an app',
  explore: 'Explore',
  update_app: 'Change an app',
  keep: 'Keep',
  use_app: 'An app you have',
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

// ---------- domain-aware previews (audit P0-02: a preview never borrows another domain's content) ----------

/**
 * What a proposal is about, for its illustration. "neutral" means no confident match: the preview then
 * uses only the proposal's own words and empty shapes, never another domain's example content.
 */
export type PreviewDomain = 'photo' | 'music' | 'people' | 'sketch' | 'newsletter' | 'reading' | 'fitness' | 'cooking' | 'language' | 'neutral';

/**
 * Every catalog concept's domain, known outright. Concepts without example content of their own
 * (a trip planner, a film log, a budget) are neutral: their previews use only their own words.
 */
const CONCEPT_DOMAINS: Record<string, PreviewDomain> = {
  'light-gallery': 'photo',
  'photo-walk-journal': 'photo',
  'riff-practice': 'music',
  'music-practice-companion': 'music',
  'people-queue': 'people',
  'people-to-follow-up-with': 'people',
  'mentor-check-ins': 'people',
  'customer-conversations': 'people',
  sketchbook: 'sketch',
  'reading-log': 'reading',
  'running-log': 'fitness',
  'recipe-experiments': 'cooking',
  'language-practice': 'language',
  'weekend-explorer': 'neutral',
  'gratitude-reflection': 'neutral',
  'plant-care': 'neutral',
  'climbing-log': 'neutral',
  'trip-planner': 'neutral',
  'energy-sleep-check-in': 'neutral',
  'poetry-notebook': 'neutral',
  'film-log': 'neutral',
  'study-planner': 'neutral',
  'job-search-tracker': 'neutral',
  'side-project-milestones': 'neutral',
  'habit-streaks': 'neutral',
  'content-ideas-board': 'neutral',
  'meeting-notes': 'neutral',
  'budget-check-in': 'neutral',
  'course-assignments': 'neutral',
  'weekly-review': 'neutral',
  'household-projects': 'neutral',
};

/**
 * Words per domain. Strong words name the domain on their own. Weak words are common in other
 * senses ("Travel Light", "Espresso Shots", "Errand Runs", "Plant Friends", "Bass Fishing Log",
 * "Painting the House"), so they only add weight once strong evidence for that domain exists.
 */
const DOMAIN_WORDS: [Exclude<PreviewDomain, 'neutral'>, { strong: RegExp; weak: RegExp }][] = [
  ['people', {
    strong: /\b(?:people|follow[- ]?ups?|following up|catch[- ]?ups?|mentors?|mentees?|investors?|customers?|clients?|networking|introductions?|reply to|keep in touch|reach(?:ing)? out)\b/gi,
    weak: /\b(?:persons?|friends?|conversations?|promises?|promised|owe|contacts|network|colleagues?|relationships?)\b/gi,
  }],
  ['sketch', {
    strong: /\b(?:sketch\w*|drawings?|doodl\w*|illustrat\w*|watercolou?rs?|art journal)\b/gi,
    weak: /\b(?:draw|draws|paint|paints|painting|paintings|art|artwork)\b/gi,
  }],
  ['newsletter', {
    strong: /\b(?:newsletters?|substack|mailing list)\b/gi,
    weak: /\b(?:subscribers?|issues?)\b/gi,
  }],
  ['music', {
    strong: /\b(?:music\w*|guitar\w*|piano|ukulele|drums|drumming|violin|cello|saxophone|trumpet|flute|songwriting|chords?|strum\w*|fingerpick\w*|fingerstyle|metronome|bpm|playing session)\b/gi,
    weak: /\b(?:bass|riffs?|songs?|tempo|listening|singing|band|instruments?)\b/gi,
  }],
  ['photo', {
    // Not photo\w*: "photosynthesis" belongs to plants.
    strong: /\b(?:photos?|photograph\w*|photoshoots?|photobooks?|photo walks?|cameras?|aperture|shutter|contact sheet|golden hour|darkroom|35mm)\b/gi,
    weak: /\b(?:light|shadows?|shots?|lens(?:es)?|exposures?|gallery|prints?|frames?)\b/gi,
  }],
  ['language', {
    // A language name alone is an adjective as often as not ("French press", "Dutch oven").
    strong: /\b(?:vocab\w*|new words|grammar|fluen\w*|duolingo|conjugat\w*|language (?:learning|practice|exchange|lessons?)|learn(?:ing)? (?:spanish|french|german|italian|japanese|korean|mandarin|cantonese|chinese|portuguese|arabic|hindi|russian|dutch)|(?:spanish|french|german|italian|japanese|korean|mandarin|cantonese|chinese|portuguese|arabic|hindi|russian|dutch) (?:lessons?|words|vocab\w*|practice|class(?:es)?))\b/gi,
    weak: /\b(?:languages?|spanish|french|german|italian|japanese|korean|mandarin|cantonese|chinese|portuguese|arabic|hindi|russian|dutch|words|phrases?)\b/gi,
  }],
  ['fitness', {
    // The fitness examples are timed cardio sessions; yoga or a "run" of errands is not that.
    strong: /\b(?:5k|10k|marathons?|jog\w*|workouts?|gym|cycling|swim\w*|running log|run log|training plan)\b/gi,
    weak: /\b(?:runs?|running|runners?|lifting|strength|stretch\w*|yoga|pilates|walks?|pace|miles?|km)\b/gi,
  }],
  ['cooking', {
    strong: /\b(?:cook(?:s|ed|ing|book|books)?|recipes?|bak(?:e|es|ed|ing)|ingredients?|meal prep)\b/gi,
    weak: /\b(?:dish(?:es)?|kitchen|meals?|dinners?|food)\b/gi,
  }],
  ['reading', {
    strong: /\b(?:books|novels?|chapters?|reading list|reading log|book club|audiobooks?)\b/gi,
    weak: /\b(?:reading|book|authors?|pages|library)\b/gi,
  }],
];

/** Icon symbols that point at a domain (one signal at most: icons are reused across apps). */
const ICON_DOMAINS: Partial<Record<string, PreviewDomain>> = {
  camera: 'photo', aperture: 'photo', image: 'photo',
  guitar: 'music', music: 'music', waveform: 'music', levels: 'music', headphones: 'music', piano: 'music', disc: 'music',
  people: 'people', contact: 'people',
  palette: 'sketch', brush: 'sketch',
  dumbbell: 'fitness', footprints: 'fitness', bike: 'fitness',
  utensils: 'cooking',
};

export type DomainSource = Pick<Recommendation, 'title' | 'tagline' | 'description' | 'previewLines' | 'firstAction' | 'icon'> &
  Partial<Pick<Recommendation, 'conceptId' | 'explorationSteps'>>;

/**
 * The domain a proposal's illustration should show (audit P0-02). A catalog concept's domain is
 * known. Anything else needs two independent signals that agree: strong words in two of its own
 * fields, or one field and its icon. Weak words only add weight, ties are neutral, and neutral means
 * the preview shows the proposal's own words, never another domain's example content.
 */
export function previewDomain(rec: DomainSource): PreviewDomain {
  if (rec.conceptId && Object.hasOwn(CONCEPT_DOMAINS, rec.conceptId)) return CONCEPT_DOMAINS[rec.conceptId] ?? 'neutral';
  const fields: [string, number][] = [
    [rec.title, 3],
    [rec.tagline, 2],
    [rec.previewLines.join(' · '), 2],
    [rec.firstAction, 1],
    [rec.description, 1],
    [(rec.explorationSteps ?? []).join(' '), 1],
  ];
  const count = (text: string, rx: RegExp) => text.match(rx)?.length ?? 0;
  const iconDomain = ICON_DOMAINS[rec.icon.symbol];
  let best: PreviewDomain = 'neutral';
  let bestScore = 0;
  let tied = false;
  for (const [domain, words] of DOMAIN_WORDS) {
    let score = 0;
    let signals = iconDomain === domain ? 1 : 0;
    for (const [text, weight] of fields) {
      const n = count(text, words.strong);
      if (n > 0) {
        signals += 1;
        score += n * weight;
      }
    }
    if (signals < 2) continue;
    if (iconDomain === domain) score += 2;
    for (const [text, weight] of fields) score += count(text, words.weak) * weight * 0.5;
    if (score > bestScore) {
      best = domain;
      bestScore = score;
      tied = false;
    } else if (score === bestScore) {
      tied = true;
    }
  }
  return tied ? 'neutral' : best;
}

const NUMBER_WORDS: Record<string, number> = {
  five: 5, ten: 10, fifteen: 15, twenty: 20, 'twenty-five': 25, 'twenty five': 25, thirty: 30, 'forty-five': 45, 'forty five': 45, sixty: 60,
};
/** "Timer: 15 / 10 / 25 min": the first preset is the default. */
const PRESET_LIST_RX = /\b(\d{1,3})(?:\s*\/\s*\d{1,3})+\s*min/i;
const MINUTES_RX = /\b(\d{1,3})\s*(?:-\s*)?(?:min(?:ute)?s?)\b/i;
const MINUTE_WORDS_RX = /\b(five|ten|fifteen|twenty[- ]five|twenty|thirty|forty[- ]five|sixty)[- ](?:min(?:ute)?s?)\b/i;

/** The session length a proposal is about: what the person asked for, else a length its own words name. */
export function proposalMinutes(rec: Pick<Recommendation, 'title' | 'tagline' | 'previewLines' | 'firstAction' | 'description'> & { suggestedMinutes?: number }): number | null {
  if (rec.suggestedMinutes) return rec.suggestedMinutes;
  for (const text of [rec.title, rec.tagline, ...rec.previewLines, rec.firstAction, rec.description]) {
    const digits = PRESET_LIST_RX.exec(text) ?? MINUTES_RX.exec(text);
    if (digits) {
      const n = Number(digits[1]);
      if (n >= 1 && n <= 180) return n;
    }
    const words = MINUTE_WORDS_RX.exec(text);
    if (words?.[1]) {
      const n = NUMBER_WORDS[words[1].toLowerCase()];
      if (n) return n;
    }
  }
  return null;
}

/** Sentences that only quote the person back ("You said “…”.") are grounding, not relevance. */
const QUOTE_ONLY_RX = /^(?:you (?:said|mentioned|shared|saved|noted|wrote)|from what you shared)\b/i;

/**
 * One sentence on why a proposal fits, for a card: the first sentence of the reason that is not just
 * the person's words quoted back (those stay in "Why this?"), else the tagline.
 */
export function relevanceLine(rec: Pick<Recommendation, 'reason' | 'tagline'>, max = 150): string {
  const sentences = rec.reason.trim().split(/(?<=[.!?][”"’)]?)\s+(?=[A-Z“"‘(])/);
  // A piece with an unbalanced quote is the inside of the person's own words, split mid-quote.
  const balanced = (s: string) => (s.match(/"/g)?.length ?? 0) % 2 === 0 && (s.match(/“/g)?.length ?? 0) === (s.match(/”/g)?.length ?? 0);
  const line = sentences.find((s) => s.trim() && !QUOTE_ONLY_RX.test(s.trim()) && balanced(s));
  return truncate(line?.trim() || rec.tagline, max);
}

/**
 * How "Why this?" introduces quoted words that are not only the person's own (audit P1-04): null when
 * nothing cited is an example, else whose words they are ("The example profile says").
 */
export function exampleQuoteLead(facts: { id: string }[], captures: { isExample: boolean }[], exampleFactIds?: ReadonlySet<string>): string | null {
  const profile = facts.filter((f) => exampleFactIds?.has(f.id)).length;
  const tried = captures.filter((c) => c.isExample).length;
  if (profile + tried === 0) return null;
  const own = facts.length + captures.length - profile - tried;
  const source = profile > 0 && tried > 0 ? 'the examples' : profile > 0 ? 'the example profile' : 'the example you tried';
  if (own > 0) return `From you and ${source}:`;
  return `${source.charAt(0).toUpperCase()}${source.slice(1)} ${profile > 0 && tried > 0 ? 'say' : 'says'}`;
}

/** "You shared “…”" where a sentence starts, followed by the quoted words. */
const QUOTE_LEAD_RX = /(^|[.!?]["”’)]?\s+)you (?:said|mentioned|shared|saved|noted|wrote)\s+(?=["“])/gi;

/** A proposal's reason as "Why this?" shows it: example words are never presented as the person's own. */
export function groundedReason(reason: string, lead: string | null): string {
  return lead ? reason.replace(QUOTE_LEAD_RX, (_m, before: string) => `${before}${lead} `) : reason;
}

/** Ori calls an attached picture a photo; stored read statuses and source labels say "screenshot". */
export function photoWords(label: string): string {
  return label.replace(/\bscreenshot(s?)\b/gi, (m: string, s: string) => (m.charAt(0) === 'S' ? `Photo${s}` : `photo${s}`));
}

/**
 * The idea that leads the Playground: an app with real imagery first (photography), then one with a
 * strong identity of its own (a music timer, people and promises), then any app, then the rest.
 */
export function pickFeature<T extends DomainSource & Pick<Recommendation, 'kind' | 'status' | 'pattern'>>(recs: T[]): T | null {
  let best: T | null = null;
  let bestScore = -1;
  for (const r of recs) {
    if (r.kind === 'keep') continue;
    const domain = previewDomain(r);
    let score = r.status === 'fresh' ? 10 : 0;
    score += r.kind === 'new_app' ? 4 : r.kind === 'use_app' || r.kind === 'update_app' ? 2 : 0;
    if (r.kind !== 'explore') {
      if (domain === 'photo') score += 3;
      else if ((domain === 'music' && r.pattern === 'practice') || domain === 'people') score += 2;
      else if (r.pattern === 'gallery' || r.pattern === 'practice' || r.pattern === 'queue') score += 1;
    }
    if (score > bestScore) {
      best = r;
      bestScore = score;
    }
  }
  return best;
}

/** What an entry for an app the person has would hold, in their own terms (nothing is saved until they confirm it there). */
export function draftSummary(draft: NonNullable<Recommendation['recordDraft']>): string[] {
  if (draft.kind === 'follow_up') {
    const when = draft.dueText?.trim();
    return [draft.person?.trim() || 'Someone to follow up with', draft.action?.trim() || 'Follow up', when ? `When: “${when}”, you confirm the date` : 'When: you choose'];
  }
  if (draft.kind === 'source') {
    let where = '';
    try {
      const u = new URL(draft.url ?? '');
      where = `${u.hostname.replace(/^www\./, '')}${u.pathname === '/' ? '' : u.pathname.replace(/\/$/, '')}`;
    } catch {
      where = draft.url ?? '';
    }
    return [draft.title?.trim() || 'Your link', truncate(where, 60)].filter(Boolean);
  }
  return ['Your photo', 'With what you noticed, when you save it'];
}

// ---------- the Agent composer ----------

const URL_IN_TEXT_RX = /\bhttps?:\/\/[^\s<>"]+/gi;

/**
 * A single link pasted into the note becomes the share's link (so it is saved, and labelled, as a link).
 * Text around it stays the note; a separate link field always wins; several links stay in the note.
 */
export function splitSharedLink(text: string, url: string): { text: string; url: string } {
  if (url.trim()) return { text: text.trim(), url: url.trim() };
  const found = text.match(URL_IN_TEXT_RX) ?? [];
  if (found.length !== 1) return { text: text.trim(), url: '' };
  const link = (found[0] as string).replace(/[),.;!?]+$/, '');
  const rest = text
    .replace(link, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+([.,;:!?)])/g, '$1')
    .trim()
    .replace(/\s*[:\-–—]$/, '')
    .trim();
  return { text: rest, url: link };
}

export interface Starter {
  key: 'try' | 'simplify' | 'save';
  label: string;
  /** What the composer starts with; the person finishes the sentence. */
  prefill: string;
}

/** The three first-use starters: they fill the composer, they are not navigation. */
export const STARTERS: readonly Starter[] = [
  { key: 'try', label: 'Something to try', prefill: 'I want to try ' },
  { key: 'simplify', label: 'A task to simplify', prefill: 'Help me keep track of ' },
  { key: 'save', label: 'Just save this', prefill: 'Save this for later ' },
];

/** The words typed after a starter's opening ("pottery" in "I want to try pottery"), or null when the text does not open with it. */
function afterStarter(text: string, prefill: string): string | null {
  const lead = prefill.trim().toLowerCase();
  const lower = text.toLowerCase();
  if (!lower.startsWith(lead)) return null;
  const rest = text.slice(lead.length);
  return rest === '' || /^\s/.test(rest) ? rest.trim() : null;
}

/**
 * The composer text after choosing a starter: an empty note (or another starter) is replaced;
 * anything typed is kept, as typed, after it. Switching starters swaps the opening words and keeps
 * what was typed after them ("I want to try pottery" becomes "Help me keep track of pottery").
 */
export function applyStarter(current: string, prefill: string): string {
  const typed = current.trim();
  if (!typed || STARTERS.some((s) => s.prefill.trim() === typed)) return prefill;
  if (afterStarter(typed, prefill) !== null) return current;
  for (const s of STARTERS) {
    const rest = afterStarter(typed, s.prefill);
    if (rest !== null) return `${prefill}${rest}`;
  }
  return `${prefill}${typed}`;
}

// ---------- the Playground ----------

/**
 * Playground ideas: everything the Playground generated (fresh first, then what you already made or
 * used), never a "just keep it" card and never a reply to something shared with the Agent (that
 * conversation owns those). Titles appear once.
 */
export function playgroundIdeas<T extends Pick<Recommendation, 'kind' | 'status' | 'title'> & { captureId?: string | null }>(recs: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  const order = (r: T) => (r.status === 'fresh' ? 0 : 1);
  for (const r of [...recs].sort((a, b) => order(a) - order(b))) {
    if (r.kind === 'keep' || r.captureId) continue;
    const key = r.title.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

export type PlaygroundFilter = 'for_you' | 'explore' | 'everyday';

/** For you: everything, ranked. Explore: ideas for interests (purpose explore). Everyday: useful things (purpose work). */
export function filterIdeas<T extends Pick<Recommendation, 'purpose'>>(recs: T[], filter: PlaygroundFilter): T[] {
  if (filter === 'explore') return recs.filter((r) => r.purpose === 'explore');
  if (filter === 'everyday') return recs.filter((r) => r.purpose === 'work');
  return recs;
}

/** Filter chips only when they mean something: both kinds of idea are present. */
export function availableFilters(recs: Pick<Recommendation, 'purpose'>[]): PlaygroundFilter[] {
  const explore = recs.some((r) => r.purpose === 'explore');
  const everyday = recs.some((r) => r.purpose === 'work');
  return explore && everyday ? ['for_you', 'explore', 'everyday'] : [];
}

export interface GridSpan {
  /** Columns of a 6-column grid (desktop). */
  lg: number;
  /** Columns of a 2-column grid (tablet). */
  md: number;
  /** Columns of a 2-column grid (phone). */
  sm: number;
}

/**
 * Desktop widths (of 6) for n ideas, filling whole rows: a wide feature beside a tile, then rows of
 * three tiles. Three ideas sit side by side (reference 03); a remainder of two is a tile and a wide
 * card; a remainder of four is two rows of two.
 */
function desktopSpans(n: number): number[] {
  if (n <= 0) return [];
  if (n === 1) return [6];
  if (n === 3) return [2, 2, 2];
  const out = [4, 2];
  let left = n - 2;
  while (left > 0) {
    if (left === 2) {
      out.push(2, 4);
      left = 0;
    } else if (left === 4) {
      out.push(3, 3, 3, 3);
      left = 0;
    } else {
      out.push(2, 2, 2);
      left -= 3;
    }
  }
  return out;
}

/**
 * Column spans for the Playground grid so rows fill without holes and DOM order stays reading order:
 * a wide feature, then tiles, then the special cards ("Something unexpected", "Make something new")
 * in a row of their own at every width, so they stay short banners and never stretch to an idea's
 * height. On tablets and phones an idea left alone in its row widens to finish it.
 */
export function playgroundSpans(cards: number, specials: number): { cards: GridSpan[]; specials: GridSpan[] } {
  const out: GridSpan[] = desktopSpans(cards).map((lg, i) => ({ lg, md: i === 0 ? 2 : 1, sm: i === 0 ? 2 : 1 }));
  const last = out[out.length - 1];
  if (last && out.length > 1) {
    if (out.reduce((n, s) => n + s.md, 0) % 2 === 1) last.md = 2;
    if (out.reduce((n, s) => n + s.sm, 0) % 2 === 1) last.sm = 2;
  }
  // Desktop and tablet: the two side by side; phones: each a full-width banner.
  const sp: GridSpan[] = specials >= 2 ? [{ lg: 3, md: 1, sm: 2 }, { lg: 3, md: 1, sm: 2 }] : specials === 1 ? [{ lg: 6, md: 2, sm: 2 }] : [];
  return { cards: out, specials: sp };
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
