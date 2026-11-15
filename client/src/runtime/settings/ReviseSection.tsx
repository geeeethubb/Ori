/**
 * Edit with Ori. A plain-language request becomes a proposal that is reviewed before anything changes:
 * a short checklist in future tense, "before → after" lines when a default changes, "Keep your …" only
 * when every entry is kept, and the affected screen drawn from the proposed definition with the
 * person's latest entry (or a labelled example). The preview saves nothing. "Apply change" sends the
 * preview's base version and proposal id, so a retried apply is never applied twice and a stale preview
 * is refused; "Keep current version" leaves the app as it is. "<App> is unchanged" is said only when Ori
 * answered; an apply whose answer was lost is checked first (the app read again, or the same apply sent
 * again), and one that fails after the sheet was closed is reported in a toast that reopens the review.
 * One flow serves the app's Edit sheet and the settings section (where the suggestion card and the
 * feedback box live too). The companion shows the real operation: thinking while a preview is
 * prepared, building while a change is applied.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent, type RefObject } from 'react';
import { Link } from 'react-router';
import type { AppDetailDto, ImprovementSuggestionDto, RevisionPreviewDto } from '@shared/api.ts';
import { formFieldsFor, recordMatchesView, viewTypeLabel, type AppSpec, type DueSoonRule, type FieldSpec, type RuleSpec, type ViewSpec } from '@shared/appSpec.ts';
import type { AppRecord, RecordValues } from '@shared/records.ts';
import { strandedRecords } from '@shared/revision.ts';
import { api, ApiError, describeError } from '../../api.ts';
import { AppIcon } from '../../components/AppIcon.tsx';
import { OriCompanion } from '../../components/ori/OriCompanion.tsx';
import { useOriMood, type OriMoodHandle } from '../../components/ori/useOriMood.ts';
import { ErrorBanner, Icons, Sheet, useToast } from '../../components/ui.tsx';
import { AppPreview } from '../AppPreview.tsx';
import { AuthImage } from '../AuthImage.tsx';
import { FieldInput } from '../FieldInput.tsx';
import { postEvent, stableStringify, useMediaQuery } from '../runtimeUtils.ts';
import { resolveTheme } from '../theme.ts';
import { undoChange } from './HistorySection.tsx';

interface Props {
  appId: string;
  detail: AppDetailDto;
  onDetail: (detail: AppDetailDto) => void;
  /** The app's entries as loaded: what a change keeps, and the latest entry its preview shows. */
  records?: AppRecord[];
}

interface SuggestionResponse {
  suggestion: ImprovementSuggestionDto | null;
  generatedBy: 'anthropic' | 'sample';
}

// ---------- what a change does, in plain words (pure; covered by settings/revisionReview.test.ts) ----------

export interface BeforeAfter {
  label: string;
  before: string;
  after: string;
}

export interface RevisionReviewModel {
  /** What will change, one short line each, in future tense. */
  checklist: string[];
  /** Defaults and names that change, e.g. "Default session: 15 min → 10 min". */
  beforeAfter: BeforeAfter[];
  /** Fields the change adds or shows again; the preview focuses on them. */
  newFieldIds: string[];
  /** Fields whose label, requirement, choices or hint change. */
  changedFieldIds: string[];
  /** Fields the change hides (what was saved in them stays). */
  hiddenFieldIds: string[];
}

const quote = (s: string) => `“${s}”`;
const dayCount = (n: number) => `${n} day${n === 1 ? '' : 's'}`;
const capital = (s: string) => (s ? `${s.charAt(0).toUpperCase()}${s.slice(1)}` : s);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const hasValue = (v: unknown) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0);
const viewName = (v: ViewSpec) => v.title ?? capital(viewTypeLabel(v.type));
const ruleName = (r: RuleSpec) => (r.type === 'prompt_rotation' ? r.title : (r.label ?? 'Due soon'));
const THEME_NAMES: Record<string, string> = { bright: 'Bright', paper: 'Paper', charcoal: 'Charcoal', ink: 'Ink', mint: 'Mint', lilac: 'Lilac', sunset: 'Sunset' };

/** "a", "a and b", "a, b and c". */
export function listOf(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** A view without what other lines already explain: which fields it lists, its title, timer settings. */
function viewRest(v: ViewSpec): string {
  const rest: Record<string, unknown> = { ...v };
  for (const k of ['formFieldIds', 'showFieldIds', 'columnFieldIds', 'cardFieldIds', 'title', 'addLabel', 'presets', 'defaultTempo', 'tempoHelper']) delete rest[k];
  return JSON.stringify(rest);
}

/**
 * What a proposed definition changes, compared with the current one, in the person's words: future
 * tense (nothing has happened yet), and "before → after" for defaults such as the first timer preset.
 */
export function describeRevision(before: AppSpec, after: AppSpec): RevisionReviewModel {
  const checklist: string[] = [];
  const beforeAfter: BeforeAfter[] = [];
  const newFieldIds: string[] = [];
  const changedFieldIds: string[] = [];
  const hiddenFieldIds: string[] = [];

  // Fields.
  const added: FieldSpec[] = [];
  for (const f of after.fields) {
    const was = before.fields.find((x) => x.id === f.id);
    if (!was) {
      if (!f.hidden) added.push(f);
      continue;
    }
    if (was.hidden && !f.hidden) {
      newFieldIds.push(f.id);
      checklist.push(`${quote(f.label)} will show again.`);
      continue;
    }
    if (!was.hidden && f.hidden) {
      hiddenFieldIds.push(f.id);
      checklist.push(`${quote(was.label)} will be hidden. What you saved in it stays.`);
      continue;
    }
    if (f.hidden) continue;
    let touched = false;
    if (was.label !== f.label) {
      checklist.push(`${quote(was.label)} will be called ${quote(f.label)}.`);
      touched = true;
    }
    if (Boolean(was.required) !== Boolean(f.required)) {
      checklist.push(f.required ? `${quote(f.label)} will be needed for new ${after.entryNoun.plural}.` : `${quote(f.label)} will be optional.`);
      touched = true;
    }
    if (was.type === 'select' && f.type === 'select') {
      const extra = f.options.filter((o) => !was.options.some((x) => x.value === o.value));
      if (extra.length) {
        checklist.push(`${listOf(extra.map((o) => quote(o.label)))} will be ${extra.length === 1 ? 'a choice' : 'choices'} in ${quote(f.label)}.`);
        touched = true;
      }
    }
    const hint = (x: FieldSpec) => [x.help ?? '', (x as { placeholder?: string }).placeholder ?? ''];
    if (!touched && !same(hint(was), hint(f))) {
      checklist.push(`The hint for ${quote(f.label)} will change.`);
      touched = true;
    }
    if (touched) changedFieldIds.push(f.id);
  }
  if (added.length) {
    // In the order the form shows them (several fields placed after the same one land reversed in the definition).
    const formOrder = after.views.flatMap((v) => (v.type === 'summary' ? [] : formFieldsFor(after, v).map((f) => f.id)));
    const rank = (id: string) => {
      const i = formOrder.indexOf(id);
      return i < 0 ? Number.MAX_SAFE_INTEGER : i;
    };
    added.sort((a, b) => rank(a.id) - rank(b.id));
    newFieldIds.unshift(...added.map((f) => f.id));
    checklist.unshift(`${listOf(added.map((f) => quote(f.label)))} will be added to each ${after.entryNoun.singular}.`);
  }

  // The app itself.
  if (before.name !== after.name) {
    beforeAfter.push({ label: 'Name', before: before.name, after: after.name });
    checklist.push(`The app will be called ${quote(after.name)}.`);
  }
  if ((before.tagline ?? '') !== (after.tagline ?? '')) {
    beforeAfter.push({ label: 'Headline', before: before.tagline || 'None', after: after.tagline || 'None' });
    checklist.push(after.tagline ? 'The headline will change.' : 'The headline will be removed.');
  }
  if (!same(before.icon, after.icon)) checklist.push('The icon will change.');
  // The look as it shows (a reference app's legacy look is shown in its Ori identity), so the lines match the screen.
  const lookBefore = resolveTheme(before).design;
  const lookAfter = resolveTheme(after).design;
  if (!same(lookBefore, lookAfter)) {
    if (lookBefore.theme !== lookAfter.theme) beforeAfter.push({ label: 'Look', before: THEME_NAMES[lookBefore.theme] ?? lookBefore.theme, after: THEME_NAMES[lookAfter.theme] ?? lookAfter.theme });
    if (lookBefore.accent !== lookAfter.accent) beforeAfter.push({ label: 'Accent', before: capital(lookBefore.accent), after: capital(lookAfter.accent) });
    checklist.push(`The look will change.`);
  }
  if (before.entryNoun.plural !== after.entryNoun.plural) {
    beforeAfter.push({ label: 'Entries', before: capital(before.entryNoun.plural), after: capital(after.entryNoun.plural) });
    checklist.push(`Entries will be called ${quote(after.entryNoun.plural)}.`);
  }
  if ((before.emptyStateHint ?? '') !== (after.emptyStateHint ?? '')) checklist.push('The hint on an empty page will change.');

  // Views (tabs).
  const shown = new Set([...newFieldIds, ...hiddenFieldIds]);
  for (const v of after.views) {
    const was = before.views.find((x) => x.id === v.id);
    if (!was) {
      checklist.push(`A ${quote(viewName(v))} tab will be added.`);
      continue;
    }
    if (same(was, v)) continue;
    let explained = false;
    if ((was.title ?? '') !== (v.title ?? '') && v.title) {
      checklist.push(`The ${quote(viewName(was))} tab will be called ${quote(v.title)}.`);
      explained = true;
    }
    if (v.addLabel && was.addLabel !== v.addLabel) {
      beforeAfter.push({ label: 'Button', before: was.addLabel ?? 'Add', after: v.addLabel });
      checklist.push(`The button will read ${quote(v.addLabel)}.`);
      explained = true;
    }
    if (was.type === 'practice' && v.type === 'practice') {
      const from = was.presets[0];
      const to = v.presets[0];
      if (from !== undefined && to !== undefined && from !== to) {
        beforeAfter.push({ label: 'Default session', before: `${from} min`, after: `${to} min` });
        checklist.push(`Sessions will start at ${to} minutes.`);
        explained = true;
      } else if (!same(was.presets, v.presets)) {
        beforeAfter.push({ label: 'Session lengths', before: `${was.presets.join(', ')} min`, after: `${v.presets.join(', ')} min` });
        checklist.push(`The timer will offer ${listOf(v.presets.map(String))} minutes.`);
        explained = true;
      }
      if (was.defaultTempo !== v.defaultTempo) {
        beforeAfter.push({ label: 'Metronome', before: `${was.defaultTempo} bpm`, after: `${v.defaultTempo} bpm` });
        checklist.push(`The metronome will start at ${v.defaultTempo} bpm.`);
        explained = true;
      }
      if (was.tempoHelper !== v.tempoHelper) {
        checklist.push(v.tempoHelper ? 'The metronome will be shown.' : 'The metronome will be hidden.');
        explained = true;
      }
    }
    // A field added to or hidden from the app also changes which fields a view lists: said above.
    const formBefore = formFieldsFor(before, was).map((f) => f.id);
    const formAfter = formFieldsFor(after, v).map((f) => f.id);
    const joined = formAfter.filter((id) => !formBefore.includes(id) && !shown.has(id));
    if (joined.length) {
      checklist.push(`${listOf(joined.map((id) => quote(after.fields.find((f) => f.id === id)?.label ?? id)))} will be in the ${quote(viewName(v))} form.`);
      explained = true;
    }
    if (!explained && viewRest(was) !== viewRest(v)) checklist.push(`The ${quote(viewName(v))} tab will change.`);
  }
  for (const v of before.views) {
    if (!after.views.some((x) => x.id === v.id)) checklist.push(`The ${quote(viewName(v))} tab will be removed. Its entries stay in your other tabs.`);
  }

  // Rules (due-soon highlights, rotating prompts).
  for (const r of after.rules) {
    const was = before.rules.find((x) => x.id === r.id);
    if (!was) {
      checklist.push(r.type === 'due_soon' ? `Anything due within ${dayCount(r.withinDays)} will be highlighted.` : `A ${r.cadence} prompt, ${quote(r.title)}, will be added.`);
      continue;
    }
    if (same(was, r)) continue;
    if (was.type === 'due_soon' && r.type === 'due_soon' && was.withinDays !== r.withinDays) {
      beforeAfter.push({ label: 'Due soon', before: `within ${dayCount(was.withinDays)}`, after: `within ${dayCount(r.withinDays)}` });
      checklist.push(`Anything due within ${dayCount(r.withinDays)} will be highlighted.`);
      continue;
    }
    if (was.type === 'prompt_rotation' && r.type === 'prompt_rotation') {
      if (was.cadence !== r.cadence) beforeAfter.push({ label: 'Prompts', before: capital(was.cadence), after: capital(r.cadence) });
      if (!same(was.prompts, r.prompts)) checklist.push(`The ${r.cadence} prompts will change.`);
      else if (was.cadence !== r.cadence) checklist.push(`Prompts will change ${r.cadence === 'daily' ? 'every day' : 'every week'}.`);
      if (was.title !== r.title) checklist.push(`The prompt will be called ${quote(r.title)}.`);
      continue;
    }
    checklist.push(`${quote(ruleName(r))} will change.`);
  }
  for (const r of before.rules) {
    if (!after.rules.some((x) => x.id === r.id)) checklist.push(r.type === 'due_soon' ? 'Items due soon will no longer be highlighted.' : `The ${quote(r.title)} prompt will be removed.`);
  }

  return { checklist, beforeAfter, newFieldIds, changedFieldIds, hiddenFieldIds };
}

/** Fields the change hides that hold something the person saved. */
function hiddenWithValues(before: AppSpec, after: AppSpec, records: { values: RecordValues }[]): FieldSpec[] {
  return after.fields.filter((f) => f.hidden && !before.fields.find((x) => x.id === f.id)?.hidden && records.some((r) => hasValue(r.values[f.id])));
}

/**
 * True when the change keeps every entry as it is: each one still shows in a tab, and no field holding
 * something the person saved is hidden. (Revisions never delete entries; this is about what stays in view.)
 */
export function keepsEveryEntry(before: AppSpec, after: AppSpec, records: { values: RecordValues }[]): boolean {
  if (hiddenWithValues(before, after, records).length) return false;
  return strandedRecords(before, after, records).count === 0;
}

/** What a kept change keeps, in the app's own words: "photos and notes", "sessions and notes", "follow-ups". */
export function keptWhat(spec: AppSpec): string {
  const notes = spec.fields.some((f) => f.type === 'long_text' && !f.hidden);
  return `${spec.entryNoun.plural}${notes ? ' and notes' : ''}`;
}

/** What the toast says after Apply, true to what happened. */
export function appliedMessage(input: { alreadyApplied: boolean; before: AppSpec; after: AppSpec; records: { values: RecordValues }[] }): string {
  const { alreadyApplied, before, after, records } = input;
  if (alreadyApplied) return 'That change was already applied. Undo is in History.';
  if (!records.length) return 'Updated.';
  if (keepsEveryEntry(before, after, records)) return `Updated. Existing ${keptWhat(after)} kept.`;
  const hidden = hiddenWithValues(before, after, records);
  if (hidden.length) {
    const one = hidden.length === 1;
    return `Updated. ${listOf(hidden.map((f) => quote(f.label)))} ${one ? 'is' : 'are'} hidden; what you saved in ${one ? 'it' : 'them'} is kept.`;
  }
  return 'Updated. Every entry is still saved, but some no longer show in a tab.';
}

/**
 * Outcome examples for this kind of app, each one a change Ori can preview (they fill the request; the
 * person still presses Preview change).
 */
export function editExamples(spec: AppSpec): string[] {
  const out: string[] = [];
  const has = (rx: RegExp) => spec.fields.some((f) => !f.hidden && rx.test(f.label));
  const dark = resolveTheme(spec).dark;
  const gallery = spec.views.find((v) => v.type === 'gallery');
  const practice = spec.views.find((v) => v.type === 'practice');
  const queue = spec.views.find((v) => v.type === 'queue');
  const due = spec.rules.find((r): r is DueSoonRule => r.type === 'due_soon');
  if (gallery) {
    if (!has(/camera|shutter|aperture/i)) out.push('Add camera settings to my photo notes');
    if (!has(/\blens\b/i)) out.push('Add a field for the lens');
  } else if (practice && practice.type === 'practice') {
    const now = practice.presets[0] ?? 15;
    const shorter = [5, 10, 15, 20].filter((n) => n < now).pop();
    if (shorter) out.push(`Make my sessions shorter: ${shorter} minutes`);
    if (practice.tempoHelper) out.push(`Set the metronome to ${practice.defaultTempo === 60 ? 80 : 60} bpm`);
    if (!has(/song|piece|tune/i)) out.push('Add a field for which song');
  } else if (queue && !has(/\bmet\b/i)) {
    out.push('Add a field for how we met');
  }
  if (due) out.push(`Highlight anything due within ${due.withinDays === 5 ? 7 : 5} days`);
  // A follow-up queue keeps its own look (People is white and orange): a useful field instead of "darker".
  if (queue && !has(/\b(work|company|employer)\b/i)) out.push('Add a field for the company');
  if (!gallery && !practice && !queue) {
    if (!has(/\bnext\b/i)) out.push('Add a field for the next step');
    const rotation = spec.rules.find((r) => r.type === 'prompt_rotation');
    if (!rotation || (rotation.type === 'prompt_rotation' && rotation.cadence !== 'daily')) out.push('Add a daily prompt');
  }
  out.push(dark ? 'Use the paper look' : 'Make it darker');
  return out.slice(0, 3);
}

/**
 * Which screen shows the change: the form or entry a field change touches (fields added or changed in
 * it, and fields it will no longer show), otherwise the whole app.
 */
export type ChangeFocus = { mode: 'record'; view: ViewSpec; fieldIds: string[]; hiddenIds: string[]; record: AppRecord | null } | { mode: 'app' } | { mode: 'none' };

/** The newest entry, preferring one with a photo when the view shows photos. */
export function latestEntry(view: ViewSpec, records: AppRecord[]): AppRecord | null {
  const mine = records.filter((r) => recordMatchesView(view, r.values));
  const withPhoto = view.type === 'gallery' ? mine.filter((r) => hasValue(r.values[view.imageFieldId])) : [];
  const pool = withPhoto.length ? withPhoto : mine;
  return [...pool].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
}

/**
 * The screen to preview. A hidden field has left its form, so `before` (the current definition) says
 * which form it was in; without it, hidden fields are not placed.
 */
export function changeFocus(after: AppSpec, model: RevisionReviewModel, records: AppRecord[], before?: AppSpec): ChangeFocus {
  const ids = [...model.newFieldIds, ...model.changedFieldIds];
  const hidden = model.hiddenFieldIds;
  const forms = after.views
    .filter((v) => v.type !== 'summary')
    .map((view) => {
      const inForm = new Set(formFieldsFor(after, view).map((f) => f.id));
      const was = before?.views.find((v) => v.id === view.id);
      const wasInForm = new Set(before && was ? formFieldsFor(before, was).map((f) => f.id) : []);
      return { view, fieldIds: ids.filter((id) => inForm.has(id)), hiddenIds: hidden.filter((id) => wasInForm.has(id)) };
    });
  // The form that shows an added or changed field first; else the form a hidden field leaves.
  const hit = forms.find((f) => f.fieldIds.length) ?? forms.find((f) => f.hiddenIds.length);
  if (hit) return { mode: 'record', ...hit, record: latestEntry(hit.view, records) };
  return model.checklist.length ? { mode: 'app' } : { mode: 'none' };
}

/** A saved value in a few words, for the line that says a hidden field keeps it. */
function savedText(field: FieldSpec, value: unknown): string {
  if (!hasValue(value)) return '';
  if (field.type === 'select') return field.options.find((o) => o.value === value)?.label ?? String(value);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.map(String).join(', ');
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  return '';
}

/** The line that names an entry in its preview: a caption, what was practised, who and what next. */
function entryHeadline(spec: AppSpec, view: ViewSpec, values: RecordValues): string {
  const pick = (id: string | undefined) => {
    const v = id ? values[id] : undefined;
    return typeof v === 'string' ? v.trim() : '';
  };
  const firstText = () => {
    const f = spec.fields.find((x) => (x.type === 'text' || x.type === 'long_text') && !x.hidden && pick(x.id));
    return f ? pick(f.id) : '';
  };
  switch (view.type) {
    case 'gallery':
      return pick(view.captionFieldId) || pick(view.noteFieldId);
    case 'practice':
      return pick(view.focusFieldId) || firstText();
    case 'queue':
      return [pick(view.personFieldId), pick(view.actionFieldId)].filter(Boolean).join(': ');
    case 'links':
      return pick(view.titleFieldId) || pick(view.urlFieldId);
    case 'journal':
      return pick(view.titleFieldId) || firstText();
    case 'board':
    case 'list':
      return pick(view.titleFieldId) || firstText();
    default:
      return firstText();
  }
}

/** A labelled example for an app with no entries yet: a public example photo and the caption's own placeholder. */
function exampleValues(spec: AppSpec, view: ViewSpec): RecordValues {
  const out: RecordValues = {};
  if (view.type === 'gallery') out[view.imageFieldId] = 'example:light-1';
  for (const f of formFieldsFor(spec, view)) {
    const placeholder = (f as { placeholder?: string }).placeholder;
    if ((f.type === 'text' || f.type === 'long_text') && placeholder && placeholder !== 'Optional') out[f.id] = placeholder;
  }
  return out;
}

const noop = () => undefined;

/**
 * The affected entry, drawn with the proposed definition and the app's own look: real field controls,
 * inert. A field the change hides is a line saying so, with what was saved in it (it is kept).
 */
function RecordChangePreview({ spec, view, fieldIds, hiddenIds, record }: { spec: AppSpec; view: ViewSpec; fieldIds: string[]; hiddenIds: string[]; record: AppRecord | null }) {
  const theme = useMemo(() => resolveTheme(spec), [spec]);
  const values = record?.values ?? exampleValues(spec, view);
  const image = view.type === 'gallery' ? values[view.imageFieldId] : undefined;
  const headline = entryHeadline(spec, view, values);
  const fields = formFieldsFor(spec, view).filter((f) => fieldIds.includes(f.id));
  const hidden = spec.fields.filter((f) => hiddenIds.includes(f.id));
  return (
    <div className="rt-root rt-change-preview" {...theme.attrs} style={theme.style as CSSProperties} inert data-testid="rt-change-preview">
      <div className="rt-cp-bar">
        <AppIcon icon={spec.icon} name={spec.name} size={24} title="" />
        <span className="rt-cp-name">{spec.name}</span>
        {!record && <span className="rt-cp-example">Example</span>}
      </div>
      {typeof image === 'string' && image ? <AuthImage value={image} alt="" className="rt-cp-photo" fit="cover" loading="eager" /> : null}
      {headline && <p className="rt-cp-headline">{headline}</p>}
      <div className="rt-cp-fields">
        {fields.map((f) => (
          <div key={f.id} className="rt-cp-field">
            <FieldInput field={f} value={values[f.id] ?? null} onChange={noop} />
          </div>
        ))}
        {hidden.map((f) => {
          const saved = record ? savedText(f, values[f.id]) : '';
          return (
            <p key={f.id} className="rt-cp-hidden" data-testid="rt-change-hidden">
              <span className="rt-cp-hidden-label">{f.label}</span>
              <span>{saved ? `Hidden. ${quote(saved)} is kept.` : 'Hidden. What you saved in it is kept.'}</span>
            </p>
          );
        })}
      </div>
    </div>
  );
}

// ---------- the flow: preview, apply, keep current version ----------

/** What happened after Apply, for the toast. `version` is the version the apply made (the one Undo reverses). */
export interface AppliedChange {
  message: string;
  version: number | null;
}

export interface RevisionError {
  message: string;
  code: string;
  during: 'preview' | 'apply';
  /** Ori answered and nothing was applied, so "<App> is unchanged." is true. */
  unchanged?: boolean;
}

/** A failed preview or apply in words, saying the app is unchanged only when that is known. */
export function revisionErrorText(error: Pick<RevisionError, 'message' | 'unchanged'>, appName: string): string {
  return error.unchanged ? `${error.message} ${appName} is unchanged.` : error.message;
}

/** Apply's answer was lost and checking could not tell whether the change was made. */
export const UNCONFIRMED_APPLY = 'We couldn’t confirm the change. Try again; it won’t be applied twice.';
/** Apply's answer was lost, and the app shows the change was never made. */
export const UNREACHED_APPLY = 'The change didn’t go through.';

type ApplyResponse = AppDetailDto & { changes: string[]; alreadyApplied?: boolean };
type ApplyBody = { ops: RevisionPreviewDto['ops']; summary: string; baseVersion: number; proposalId: string; recommendationId?: string };

/** What an Apply whose answer was lost turned out to do. */
export type LostApplyOutcome = { state: 'applied'; res: ApplyResponse } | { state: 'not_applied' } | { state: 'unknown' };

/**
 * After Apply's answer was lost (offline, timed out), find out whether the change was made before saying
 * anything about it. The app is read again: at the preview's base version nothing was applied; one version
 * later with exactly the previewed definition, it was. Otherwise the same apply is sent again, which Ori
 * answers as already applied (its proposal was accepted) or refuses as stale without applying it twice.
 */
export async function checkLostApply(
  appId: string,
  body: ApplyBody,
  previewSpec: AppSpec,
  io: { read: () => Promise<AppDetailDto | null>; resend: () => Promise<ApplyResponse> } = {
    read: () => api<AppDetailDto>(`/api/apps/${appId}`).catch(() => null),
    resend: () => api<ApplyResponse>(`/api/apps/${appId}/revisions/apply`, { method: 'POST', body }),
  },
): Promise<LostApplyOutcome> {
  const fresh = await io.read();
  if (fresh && fresh.version === body.baseVersion) return { state: 'not_applied' };
  if (fresh && fresh.version === body.baseVersion + 1 && stableStringify(fresh.spec) === stableStringify(previewSpec)) {
    return { state: 'applied', res: { ...fresh, changes: [], alreadyApplied: true } };
  }
  try {
    return { state: 'applied', res: await io.resend() };
  } catch (err) {
    // Stale means something else changed the app first, so this change was not applied: say that.
    if (err instanceof ApiError && err.code === 'stale_preview') throw err;
    return { state: 'unknown' };
  }
}

export interface RevisionFlow {
  request: string;
  setRequest: (text: string) => void;
  preview: RevisionPreviewDto | null;
  busy: 'preview' | 'apply' | null;
  error: RevisionError | null;
  runPreview: (text: string) => Promise<void>;
  apply: () => Promise<void>;
  /** "Keep current version": the proposal is declined and nothing changes. */
  keepCurrent: () => void;
  /** Back to the request (its text stays). */
  rephrase: () => void;
  /** The surface closed: a pending preview's answer is dropped; an apply in flight still finishes and is reported. */
  abandon: () => void;
}

interface FlowOptions {
  appId: string;
  detail: AppDetailDto;
  onDetail: (detail: AppDetailDto) => void;
  records: AppRecord[];
  ori?: OriMoodHandle;
  /** The Agent or Playground proposal this change came from, marked applied in the same step. */
  recommendationId?: string;
  onApplied?: (change: AppliedChange) => void;
  /**
   * False while the surface is closed (the Edit sheet): an apply that fails then is told in a toast,
   * with `onReview` as its action, instead of only inside the closed surface. Default true.
   */
  visible?: boolean;
  /** Opens the surface again on the failed change (the toast's "Review"). */
  onReview?: () => void;
}

export function useRevisionFlow({ appId, detail, onDetail, records, ori, recommendationId, onApplied, visible = true, onReview }: FlowOptions): RevisionFlow {
  const { toast } = useToast();
  const [request, setRequest] = useState('');
  const [preview, setPreview] = useState<RevisionPreviewDto | null>(null);
  const [busy, setBusy] = useState<'preview' | 'apply' | null>(null);
  const [error, setError] = useState<RevisionFlow['error']>(null);
  const previewSeq = useRef(0);
  const inFlight = useRef<'preview' | 'apply' | null>(null);
  /** The companion operation this flow started last (0 when there is none to stop). */
  const opToken = useRef(0);
  /** A proposal whose apply may have landed without an answer: a later refusal no longer proves "unchanged". */
  const unconfirmed = useRef<string | null>(null);
  const mounted = useRef(true);
  const latest = useRef({ detail, records, onDetail, onApplied, visible, onReview });
  useEffect(() => {
    latest.current = { detail, records, onDetail, onApplied, visible, onReview };
  });
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // A preview belongs to the version it was made from: after any change (an undo, another device) it is gone.
  useEffect(() => {
    setPreview((p) => (p && p.baseVersion !== undefined && p.baseVersion !== detail.version ? null : p));
  }, [detail.version]);

  const runPreview = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || inFlight.current) return;
      inFlight.current = 'preview';
      const mine = ++previewSeq.current;
      const token = ori?.begin('revision') ?? 0;
      opToken.current = token;
      setBusy('preview');
      setError(null);
      setPreview(null);
      try {
        const p = await api<RevisionPreviewDto>(`/api/apps/${appId}/revisions/preview`, { method: 'POST', body: { request: trimmed }, timeoutMs: 90_000 });
        if (mine !== previewSeq.current) return;
        setPreview(p);
        if (p.ops.length) ori?.discover(token);
        else ori?.clarify(token);
      } catch (err) {
        if (mine !== previewSeq.current) return;
        setError({ message: describeError(err), code: err instanceof ApiError ? err.code : 'error', during: 'preview' });
        ori?.fail(token);
      } finally {
        if (mine === previewSeq.current) {
          setBusy(null);
          inFlight.current = null;
        }
      }
    },
    [appId, ori],
  );

  const apply = useCallback(async () => {
    const p = preview;
    if (!p || !p.ops.length || inFlight.current) return;
    inFlight.current = 'apply';
    const token = ori?.begin('apply') ?? 0;
    opToken.current = token;
    const base = latest.current.detail;
    const name = base.spec.name;
    const body: ApplyBody = { ops: p.ops, summary: p.summary, baseVersion: p.baseVersion ?? base.version, proposalId: p.proposalId, ...(recommendationId ? { recommendationId } : {}) };
    setBusy('apply');
    setError(null);

    const succeed = (res: ApplyResponse) => {
      // The change is made: the app shows it even if this surface was closed meanwhile.
      latest.current.onDetail({ app: res.app, spec: res.spec, version: res.version, canUndo: res.canUndo });
      // "Already applied" is this person's own earlier try whose answer was lost; while the version it
      // made is still the app's current one, it is reported (and undone) like any apply.
      const ours = !res.alreadyApplied || res.version === body.baseVersion + 1;
      const message = appliedMessage({ alreadyApplied: !ours, before: base.spec, after: res.spec, records: latest.current.records });
      ori?.succeed(token);
      opToken.current = 0;
      unconfirmed.current = null;
      setPreview(null);
      setRequest('');
      latest.current.onApplied?.({ message, version: ours ? res.version : null });
    };
    const fail = (next: RevisionError) => {
      setError(next);
      if (latest.current.visible && mounted.current) {
        ori?.fail(token);
        return;
      }
      // The surface was closed meanwhile: the person is told here, with a way back to the review.
      ori?.cancel(token);
      opToken.current = 0;
      const review = mounted.current ? latest.current.onReview : undefined;
      toast(revisionErrorText(next, name), { kind: 'error', durationMs: 12_000, ...(review ? { action: { label: 'Review', onClick: review } } : {}) });
    };
    const stale = async () => {
      const fresh = await api<AppDetailDto>(`/api/apps/${appId}`).catch(() => null);
      if (fresh) latest.current.onDetail(fresh);
      setPreview(null);
      fail({ message: `${name} changed since this preview was made, so nothing was applied. Preview the change again.`, code: 'stale_preview', during: 'preview' });
    };

    /** What became of the change when Apply did not answer with it: applied after all, refused, or unknown. */
    const settleFailure = async (err: unknown): Promise<ApplyResponse | null> => {
      if (err instanceof ApiError && err.status > 0) {
        if (err.code === 'stale_preview') {
          await stale();
          return null;
        }
        if (unconfirmed.current !== p.proposalId) {
          // Ori refused it, so nothing changed: the preview and the request stay for another try.
          fail({ message: describeError(err), code: err.code, during: 'apply', unchanged: true });
          return null;
        }
      }
      // The answer was lost (or an earlier try's was): check what happened before saying anything.
      let outcome: LostApplyOutcome;
      try {
        outcome = await checkLostApply(appId, body, p.previewSpec);
      } catch {
        // Only a stale refusal comes back from the check: something else changed the app first.
        await stale();
        return null;
      }
      if (outcome.state === 'applied') return outcome.res;
      if (outcome.state === 'not_applied') {
        unconfirmed.current = null;
        fail({ message: UNREACHED_APPLY, code: 'not_applied', during: 'apply', unchanged: true });
      } else {
        unconfirmed.current = p.proposalId;
        fail({ message: UNCONFIRMED_APPLY, code: 'unconfirmed', during: 'apply' });
      }
      return null;
    };

    try {
      let res: ApplyResponse | null;
      try {
        res = await api<ApplyResponse>(`/api/apps/${appId}/revisions/apply`, { method: 'POST', body });
      } catch (err) {
        res = await settleFailure(err);
      }
      if (res) succeed(res);
    } finally {
      setBusy(null);
      inFlight.current = null;
    }
  }, [preview, appId, ori, recommendationId, toast]);

  const keepCurrent = useCallback(() => {
    if (preview?.ops.length) postEvent(appId, 'revision_declined', { proposalId: preview.proposalId });
    // An apply of this preview may have landed without an answer: show the app as it really is now.
    if (preview && unconfirmed.current === preview.proposalId) {
      unconfirmed.current = null;
      void api<AppDetailDto>(`/api/apps/${appId}`).then((fresh) => latest.current.onDetail(fresh), () => undefined);
    }
    setPreview(null);
    setError(null);
    ori?.cancel(opToken.current);
    opToken.current = 0;
  }, [preview, appId, ori]);

  const rephrase = useCallback(() => {
    setPreview(null);
    setError(null);
    ori?.cancel(opToken.current);
    opToken.current = 0;
  }, [ori]);

  const abandon = useCallback(() => {
    if (inFlight.current === 'preview') {
      previewSeq.current++;
      inFlight.current = null;
      setBusy(null);
    }
    if (inFlight.current !== 'apply') {
      ori?.cancel(opToken.current);
      opToken.current = 0;
    }
  }, [ori]);

  return { request, setRequest, preview, busy, error, runPreview, apply, keepCurrent, rephrase, abandon };
}

/** The toast after Apply: true to what happened, with the data-safe Undo of exactly that change. */
export function useAppliedToast(appId: string, onDetail: (detail: AppDetailDto) => void): (change: AppliedChange) => void {
  const { toast } = useToast();
  const onDetailRef = useRef(onDetail);
  useEffect(() => {
    onDetailRef.current = onDetail;
  }, [onDetail]);
  return useCallback(
    (change: AppliedChange) => {
      const version = change.version;
      if (version === null) {
        toast(change.message);
        return;
      }
      toast(change.message, {
        kind: 'success',
        mood: 'success',
        action: {
          label: 'Undo',
          onClick: () => {
            undoChange(appId, version).then(
              (r) => {
                onDetailRef.current(r.detail);
                toast(r.kept[0] ? `Change undone. ${r.kept[0]}` : 'Change undone. Your entries are kept.', { durationMs: 6000 });
              },
              (err: unknown) => toast(`${describeError(err)} Undo is also in History.`, { kind: 'error', durationMs: 9000 }),
            );
          },
        },
      });
    },
    [appId, toast],
  );
}

// ---------- the two steps: ask, then review ----------

interface AskProps {
  flow: RevisionFlow;
  /** The visible label of the request box. */
  prompt: string;
  name: string;
  examples: string[];
  ori: OriMoodHandle;
  inputRef?: RefObject<HTMLTextAreaElement | null>;
}

export function RevisionAsk({ flow, prompt, name, examples, ori, inputRef }: AskProps) {
  const inputId = useId();
  const pending = flow.busy === 'preview';
  const previewError = flow.error?.during === 'preview' ? flow.error : null;
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      void flow.runPreview(flow.request);
    }
  };
  return (
    <div className="ori-ask">
      <label className="ori-ask-label" htmlFor={inputId}>
        {prompt}
      </label>
      <div className="ori-ask-row">
        <OriCompanion {...ori.companion} size={40} className="ori-ask-ori" />
        <textarea
          id={inputId}
          ref={inputRef}
          className="textarea ori-ask-input"
          data-testid="rt-revise-input"
          value={flow.request}
          onChange={(e) => {
            flow.setRequest(e.target.value);
            ori.typing();
          }}
          onKeyDown={onKey}
          onFocus={ori.focus}
          onBlur={ori.blur}
          placeholder={examples[0] ? `For example: ${examples[0]}` : 'For example: add a field for the next step'}
          rows={3}
          disabled={pending}
        />
      </div>
      {examples.length > 0 && (
        <div className="ori-examples" role="group" aria-label={`Example changes for ${name}`}>
          {examples.map((ex) => (
            <button key={ex} type="button" className="ori-chip" data-testid="rt-edit-example" disabled={pending} aria-pressed={flow.request.trim() === ex} onClick={() => flow.setRequest(ex)}>
              {ex}
            </button>
          ))}
        </div>
      )}
      {pending && (
        <p className="ori-pending" role="status">
          <span className="spinner" aria-hidden="true" />
          Ori is preparing a preview. Nothing changes yet.
        </p>
      )}
      {previewError && (
        <div className="ori-error" data-testid="rt-revise-error">
          <ErrorBanner message={previewError.message} onRetry={flow.request.trim() ? () => void flow.runPreview(flow.request) : undefined} retryLabel="Try again" retryTestId="rt-revise-retry" />
          {previewError.code === 'premium_paused' && (
            <Link to="/pricing" className="btn btn-secondary btn-sm">
              See plans
            </Link>
          )}
        </div>
      )}
      <div className="ori-ask-footer">
        <button type="button" className="btn btn-primary btn-lg btn-block ori-go" data-testid="rt-revise-preview" onClick={() => void flow.runPreview(flow.request)} disabled={!flow.request.trim() || pending}>
          Preview change
          {Icons.arrowRight}
        </button>
      </div>
    </div>
  );
}

interface ReviewProps {
  flow: RevisionFlow;
  spec: AppSpec;
  records: AppRecord[];
  ori: OriMoodHandle;
  headingRef?: RefObject<HTMLHeadingElement | null>;
  onKeep: () => void;
  onRephrase: () => void;
}

export function RevisionReview({ flow, spec, records, ori, headingRef, onKeep, onRephrase }: ReviewProps) {
  const preview = flow.preview;
  const after = preview?.previewSpec ?? spec;
  const model = useMemo(() => describeRevision(spec, after), [spec, after]);
  const focus = useMemo(() => changeFocus(after, model, records, spec), [after, model, records, spec]);
  if (!preview) return null;
  const hasChange = preview.ops.length > 0;
  const checklist = model.checklist.length ? model.checklist : preview.changes;
  const keeps = hasChange && records.length > 0 && keepsEveryEntry(spec, after, records);
  const applying = flow.busy === 'apply';
  const applyError = flow.error?.during === 'apply' ? flow.error : null;
  const noun = spec.entryNoun.singular;
  return (
    <div className="ori-review" data-testid="rt-revise-card">
      <div className="ori-review-head">
        <OriCompanion {...ori.companion} size={52} />
        <div className="ori-review-title">
          <h3 ref={headingRef} tabIndex={-1}>
            {hasChange ? 'Here’s the change' : 'Nothing to change yet'}
          </h3>
          {preview.generatedBy === 'sample' && <span className="badge badge-sample">Sample mode</span>}
        </div>
      </div>
      {hasChange && (
        <ul className="ori-checklist" data-testid="rt-revise-changes">
          {checklist.map((line, i) => (
            <li key={i}>
              <span className="ori-check" aria-hidden="true">
                {Icons.check}
              </span>
              <span>{line}</span>
            </li>
          ))}
          {keeps && (
            <li data-testid="rt-revise-keeps">
              <span className="ori-check" aria-hidden="true">
                {Icons.check}
              </span>
              <span>{`Keep your ${keptWhat(spec)}`}</span>
            </li>
          )}
        </ul>
      )}
      {model.beforeAfter.length > 0 && (
        <dl className="ori-before-after" data-testid="rt-revise-before-after">
          {model.beforeAfter.map((row) => (
            <div key={row.label} className="ori-ba-row">
              <dt>{row.label}</dt>
              <dd>
                <span className="ori-ba-before">{row.before}</span>
                <span className="ori-ba-arrow" aria-hidden="true">
                  →
                </span>
                <span className="sr-only"> becomes </span>
                <strong>{row.after}</strong>
              </dd>
            </div>
          ))}
        </dl>
      )}
      {preview.unsupported.map((u, i) => (
        <div key={i} className="banner banner-warn" data-testid="rt-revise-unsupported">
          <span>
            {hasChange ? 'Not included: ' : ''}
            {u.reason} {u.alternative}
          </span>
        </div>
      ))}
      {hasChange && focus.mode !== 'none' && (
        <figure className="ori-preview">
          <figcaption className="ori-preview-cap">
            <span>Preview</span>
            {model.newFieldIds.length > 0 ? <span className="ori-new-tag">New fields</span> : focus.mode === 'record' && focus.hiddenIds.length > 0 ? <span className="ori-new-tag ori-hidden-tag">{focus.hiddenIds.length === 1 ? 'Hidden field' : 'Hidden fields'}</span> : null}
          </figcaption>
          {focus.mode === 'record' ? (
            <RecordChangePreview spec={after} view={focus.view} fieldIds={focus.fieldIds} hiddenIds={focus.hiddenIds} record={focus.record} />
          ) : (
            <div className="rt-cp-app" inert>
              <AppPreview spec={after} records={[...records].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 12)} label={records.length ? 'Your entries with the change' : 'No entries yet'} />
            </div>
          )}
          <p className="ori-preview-note">
            {focus.mode === 'record'
              ? focus.record
                ? `Your latest ${noun}, with the change. Nothing is saved.`
                : `An example ${noun}, not yours. Nothing is saved.`
              : 'Nothing is saved until you apply.'}
          </p>
        </figure>
      )}
      {/* The decisions, and a failed apply's message, stay in view while the review scrolls. */}
      <div className="ori-review-footer">
        {applyError && <ErrorBanner message={revisionErrorText(applyError, spec.name)} onRetry={() => void flow.apply()} retryLabel="Try again" retryTestId="rt-revise-retry" />}
        <span className="sr-only" role="status">
          {applying ? 'Applying the change.' : ''}
        </span>
        <div className="ori-review-actions">
          {hasChange ? (
            <button type="button" className="btn btn-primary btn-lg btn-block" data-testid="rt-revise-accept" onClick={() => void flow.apply()} disabled={flow.busy !== null}>
              {applying ? 'Applying…' : 'Apply change'}
            </button>
          ) : (
            <button type="button" className="btn btn-primary btn-lg btn-block" data-testid="rt-revise-rephrase" onClick={onRephrase}>
              Change the request
            </button>
          )}
          <button type="button" className="btn btn-secondary btn-lg btn-block" data-testid="rt-revise-decline" onClick={onKeep} disabled={applying}>
            Keep current version
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- the Edit sheet, opened from the app itself ----------

interface EditSheetProps {
  open: boolean;
  onClose: () => void;
  appId: string;
  detail: AppDetailDto;
  records: AppRecord[];
  onDetail: (detail: AppDetailDto) => void;
  /** The app's companion state (shared with its Edit with Ori button). */
  ori: OriMoodHandle;
  onApplied: (change: AppliedChange) => void;
  /** Opens the sheet again: the action of the toast that reports an apply which failed after the sheet closed. */
  onReopen?: () => void;
  /** Takes focus on close when what opened the sheet is gone (that toast's button). */
  fallbackFocus?: () => HTMLElement | null | undefined;
}

/** "Edit <App>": ask, review, apply or keep, without leaving the app. */
export function EditWithOriSheet({ open, onClose, appId, detail, records, onDetail, ori, onApplied, onReopen, fallbackFocus }: EditSheetProps) {
  const { toast } = useToast();
  const name = detail.spec.name;
  const flow = useRevisionFlow({
    appId,
    detail,
    onDetail,
    records,
    ori,
    onApplied: (change) => {
      onApplied(change);
      onClose();
    },
    // Closed while a change is applied: a failure is reported in a toast that reopens the review.
    visible: open,
    onReview: onReopen,
  });
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const examples = useMemo(() => editExamples(detail.spec), [detail.spec]);
  // On a phone the keyboard would cover the examples, so the request box takes focus only with a mouse or trackpad.
  const finePointer = useMediaQuery('(pointer: fine)');
  // A review that arrives takes focus at its heading, so keyboard and screen-reader users land on it.
  useEffect(() => {
    if (flow.preview) headingRef.current?.focus();
  }, [flow.preview]);
  const close = () => {
    flow.abandon();
    onClose();
  };
  const keep = () => {
    flow.keepCurrent();
    onClose();
    toast(`Kept the current version of ${name}.`);
  };
  // Back to the request with its text, ready to change (the review that had focus is gone).
  const rephrase = () => {
    flow.rephrase();
    window.requestAnimationFrame(() => inputRef.current?.focus());
  };
  return (
    <Sheet open={open} onClose={close} title={`Edit ${name}`} className="ori-sheet rt-edit-sheet" testId="rt-edit-sheet" initialFocus={finePointer ? inputRef : undefined} fallbackFocus={fallbackFocus}>
      {flow.preview ? (
        <RevisionReview flow={flow} spec={detail.spec} records={records} ori={ori} headingRef={headingRef} onKeep={keep} onRephrase={rephrase} />
      ) : (
        <RevisionAsk flow={flow} prompt={`Tell Ori what would make ${name} work better for you.`} name={name} examples={examples} ori={ori} inputRef={inputRef} />
      )}
    </Sheet>
  );
}

// ---------- the settings section ----------

export function ReviseSection({ appId, detail, onDetail, records = [] }: Props) {
  const { toast } = useToast();
  const ori = useOriMood({ resetKey: appId });
  const announce = useAppliedToast(appId, onDetail);
  const sectionHeadingRef = useRef<HTMLHeadingElement>(null);
  const flow = useRevisionFlow({
    appId,
    detail,
    onDetail,
    records,
    ori,
    onApplied: (change) => {
      announce(change);
      // The review (and its Apply button) is gone: focus lands on the section, not the top of the page.
      window.requestAnimationFrame(() => sectionHeadingRef.current?.focus());
    },
  });
  const [suggestion, setSuggestion] = useState<ImprovementSuggestionDto | null>(null);
  const [feedback, setFeedback] = useState('');
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const [feedbackNote, setFeedbackNote] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const examples = useMemo(() => editExamples(detail.spec), [detail.spec]);
  const busy = flow.busy;

  // A review that arrives takes focus at its heading; scrolled into view gently.
  useEffect(() => {
    if (!flow.preview) return;
    headingRef.current?.focus({ preventScroll: true });
    headingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [flow.preview]);

  // Suggestions depend on usage and the current definition, so refresh after each change.
  useEffect(() => {
    let alive = true;
    api<SuggestionResponse>(`/api/apps/${appId}/suggestion`)
      .then((r) => {
        if (alive) setSuggestion(r.suggestion);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [appId, detail.version]);

  const keep = () => {
    flow.keepCurrent();
    toast('Kept the current version. Nothing changed.');
    window.requestAnimationFrame(() => inputRef.current?.focus());
  };
  const rephrase = () => {
    flow.rephrase();
    window.requestAnimationFrame(() => inputRef.current?.focus());
  };

  const sendFeedback = async (e: FormEvent) => {
    e.preventDefault();
    const text = feedback.trim();
    if (!text || feedbackBusy) return;
    setFeedbackBusy(true);
    setFeedbackNote(null);
    try {
      const res = await api<SuggestionResponse>(`/api/apps/${appId}/feedback`, { method: 'POST', body: { text }, timeoutMs: 90_000 });
      setFeedback('');
      if (res.suggestion) {
        setSuggestion(res.suggestion);
        setFeedbackNote('Thanks. Here is a change that might help.');
      } else {
        setFeedbackNote('Thanks, noted.');
      }
    } catch (err) {
      setFeedbackNote(describeError(err));
    } finally {
      setFeedbackBusy(false);
    }
  };

  return (
    <>
      <section className="rt-section card card-pad ori-settings-edit" data-testid="rt-revise" id="edit" aria-labelledby="rt-edit-heading">
        <h2 id="rt-edit-heading" ref={sectionHeadingRef} tabIndex={-1}>
          Edit with Ori
        </h2>
        {flow.preview ? (
          <RevisionReview flow={flow} spec={detail.spec} records={records} ori={ori} headingRef={headingRef} onKeep={keep} onRephrase={rephrase} />
        ) : (
          <RevisionAsk flow={flow} prompt="Tell Ori what would make this app work better for you." name={detail.spec.name} examples={examples} ori={ori} inputRef={inputRef} />
        )}
      </section>

      <section className="rt-section card card-pad" data-testid="rt-suggestion">
        <h2>Suggested improvement</h2>
        {suggestion ? (
          <div className="rt-suggestion-card">
            <h3>{suggestion.title}</h3>
            <p className="muted">{suggestion.why}</p>
            <button
              type="button"
              className="btn btn-secondary"
              data-testid="rt-suggestion-preview"
              disabled={busy !== null}
              onClick={() => {
                flow.setRequest(suggestion.request);
                void flow.runPreview(suggestion.request);
                document.getElementById('edit')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
            >
              Preview this change
            </button>
          </div>
        ) : (
          <p className="muted small">Nothing to suggest yet. Use the app for a while, or tell us what is not working.</p>
        )}
        <form className="stack rt-feedback" onSubmit={sendFeedback}>
          <label className="field-label" htmlFor="rt-feedback">
            Tell us what's not working
          </label>
          <textarea
            id="rt-feedback"
            className="textarea"
            data-testid="rt-feedback-input"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            rows={2}
            placeholder="e.g. I keep forgetting to note where I was"
            disabled={feedbackBusy}
          />
          <div className="row-between">
            <span className="small muted" role="status">
              {feedbackNote}
            </span>
            <button type="submit" className="btn btn-secondary" data-testid="rt-feedback-send" disabled={!feedback.trim() || feedbackBusy}>
              {feedbackBusy ? 'Sending…' : 'Send'}
            </button>
          </div>
        </form>
      </section>
    </>
  );
}
