/**
 * Make it yours (/make/:recId).
 *
 * An app to make (image 04, "See it. Shape it. Make it yours."): the REAL runtime previews the
 * proposal with labelled example content that is never saved, next to one or two choices that change
 * it: what it should focus on and how long a timer session is (both go to the app designer, so the
 * app's own words say the length it starts at), and which layout it opens on when it has two layouts of
 * the same entries. On a phone the page leads with a compact example strip in the app's own look, then
 * the choices and Make mine, with the whole preview one tap away; nothing floats over it. "Make mine"
 * then shows one truthful pending state (the build endpoint has no stages) and Ready only once the
 * server has returned the app: Open, Add to home screen, Copy app link. A proposal makes one app; a
 * repeat shows Ready for the same app. The companion's mood follows these operations only.
 *
 * Explorations, a change to an app you have, opening an app you have and keeping a save live here too.
 */
import { BRAND } from '@shared/brand.ts';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import type { AppDetailDto, BuildResponseDto, ContextOverviewDto, ProposalDetailDto, ProposalPreviewDto, RecordsPageDto, RevisionPreviewDto } from '@shared/api.ts';
import { AppSpecSchema, type AppSpec, type ViewSpec, type ViewType } from '@shared/appSpec.ts';
import { readStatusLabel, type ProfileFact, type Recommendation } from '@shared/context.ts';
import type { IconSymbol } from '@shared/icons.ts';
// Pure and shared: the same domain reading that writes the example records names them here.
import { exampleLabel, focusPlaceholder, hasExamplePhotos, previewRecords } from '@shared/previewContent.ts';
import type { AppRecord } from '@shared/records.ts';
import { api, apiBase, ApiError, describeError } from '../api.ts';
import { useAuth } from '../auth.tsx';
import { AppIcon } from '../components/AppIcon.tsx';
import { OriCompanion } from '../components/ori/OriCompanion.tsx';
import { useOriMood, type OriMoodHandle, type OriToken } from '../components/ori/useOriMood.ts';
import { Disclosure, ErrorBanner, Glyph, Icons, Skeleton, Spinner, useToast } from '../components/ui.tsx';
import { AppPreview } from '../runtime/AppPreview.tsx';
import { appSettingsPath, copyText, stableStringify } from '../runtime/runtimeUtils.ts';
import { resolveTheme } from '../runtime/theme.ts';
import { AppStrip } from './MakeStrip.tsx';
import { ExampleTag, FactStatusChip } from './parts/badges.tsx';
import { MINUTE_CHOICES, PROPOSAL_KIND_LABELS, describeFields, describeRule, describeView } from './parts/helpers.ts';
import { useLoad } from './parts/useLoad.ts';
import { usePageTitle } from './parts/usePageTitle.ts';
import './pages.css';
import './make.css';

interface ActionError {
  message: string;
  code: string;
  status: number;
}

/** A build that answers this quickly goes straight to Ready; a slower one shows the Make step while it runs. */
const MAKING_STEP_DELAY_MS = 250;

/** A tap on a session length waits this long for another tap before the designer is asked again. */
export const LENGTH_SETTLE_MS = 400;

// ---------- pure helpers (exported for tests) ----------

/** What the person chose before Make mine that is applied on this device (the rest goes to the designer). */
export interface MakeChoices {
  /** The view the app opens on (offered only when it has two layouts of the same entries). */
  startViewId: string | null;
}

/**
 * What the preview is designed with: the focus words and the timer's session length (null: the
 * designer's own default). Both go to the app designer, which keeps every word about the length true
 * (tagline, hints, tab and button names, prompt titles and its own description); review finding 1.
 */
export interface DraftTarget {
  words: string;
  length: number | null;
}

/** A design the page has on show, with what it was asked for. */
export interface Draft {
  dto: ProposalPreviewDto;
  /** The focus words this preview was designed with. */
  focus: string;
  /** The session length it was asked for (null: the designer's own default). */
  minutes: number | null;
}

export const targetKey = (t: DraftTarget): string => JSON.stringify([t.words, t.length]);

/** The default session a design starts at: its timer's first preset, or null without a timer. */
export function sessionLength(spec: AppSpec): number | null {
  const v = spec.views.find((x) => x.type === 'practice');
  return v?.type === 'practice' ? (v.presets[0] ?? null) : null;
}

/**
 * Whether a design already answers these choices: the same focus words, and the length it was asked
 * for or the length it starts at. Asking for what a design already is never asks the designer again,
 * and a designer that settles on another length (the words said so) is not asked forever.
 */
export function draftAnswers(draft: Pick<Draft, 'focus' | 'minutes'> & { dto: { spec: AppSpec } }, target: DraftTarget): boolean {
  if (draft.focus !== target.words) return false;
  if (target.length === null || draft.minutes === target.length) return true;
  const starts = sessionLength(draft.dto.spec);
  return starts === null || starts === target.length;
}

/** What the designer is asked: the focus words, and the length as the session the app starts at. */
export function draftBody(t: DraftTarget): { instructions: string; choices: { timeBudgetMinutes?: number } } {
  return { instructions: t.words, choices: t.length ? { timeBudgetMinutes: t.length } : {} };
}

/** What the preview does next for the current choices. */
export type DraftStep =
  /** The design on show answers them: keep it (and drop any answer for older choices). */
  | { kind: 'keep' }
  /** Their design is on its way, or it failed and waits for Try again or a new choice. */
  | { kind: 'wait' }
  /** Ask the designer: at once for the first preview, new words or Make mine; a length once the taps settle. */
  | { kind: 'request'; delayMs: number };

export function nextDraftStep(s: { draft: Draft | null; target: DraftTarget; inflightKey: string | null; failedKey: string | null; makeAfterDraft: boolean }): DraftStep {
  if (s.draft && draftAnswers(s.draft, s.target)) return { kind: 'keep' };
  const key = targetKey(s.target);
  if (s.inflightKey === key || s.failedKey === key) return { kind: 'wait' };
  const lengthOnly = Boolean(s.draft) && !s.makeAfterDraft && s.draft?.focus === s.target.words;
  return { kind: 'request', delayMs: lengthOnly ? LENGTH_SETTLE_MS : 0 };
}

/** The same app, whatever order the designer wrote its keys in: a new design that changed nothing. */
export function sameDesign(a: AppSpec, b: AppSpec): boolean {
  return stableStringify(a) === stableStringify(b);
}

/** What to say when focus words changed nothing (review finding 6), instead of "Preview updated". */
export function unchangedNote(words: string, sample: boolean): string {
  return `The preview did not change. ${sample ? 'Sample mode' : 'The designer'} could not apply “${words}”. You can make it now and ask Edit with Ori later.`;
}

const entryKind = (v: ViewSpec): string => (v.filter ? `${v.filter.fieldId}=${v.filter.value}` : '*');

/**
 * Layouts of the same entries ("Gallery | Journal"): views of the app's first kind of entry, one per
 * view type. A view of another kind of entry (Riff's saved sources) is not a layout of the first. When
 * the app opens on a summary, the summary is offered first, so the choice always shows where it opens.
 */
export function layoutChoices(spec: AppSpec): ViewSpec[] {
  const data = spec.views.filter((v) => v.type !== 'summary');
  const first = data[0];
  if (!first) return [];
  const same = data.filter((v) => entryKind(v) === entryKind(first));
  const distinct = same.filter((v, i) => same.findIndex((w) => w.type === v.type) === i);
  if (distinct.length < 2) return [];
  const opens = spec.views[0];
  return opens?.type === 'summary' ? [opens, ...distinct.slice(0, 2)] : distinct.slice(0, 3);
}

/** Session lengths to offer: the timer's own presets plus the length the person asked for, shortest first. */
export function minuteChoices(spec: AppSpec | null, asked?: number | null): number[] {
  const practice = spec?.views.find((v) => v.type === 'practice');
  const base: number[] = practice?.type === 'practice' ? practice.presets : [...MINUTE_CHOICES];
  const valid = (n: number) => Number.isInteger(n) && n >= 1 && n <= 180;
  const out = [...new Set([...base, ...(asked && valid(asked) ? [asked] : [])].filter(valid))].sort((a, b) => a - b);
  // Never more than six, and never without the length the person asked for.
  while (out.length > 6) out.splice(out.findLastIndex((n) => n !== asked), 1);
  return out;
}

/**
 * The design with the layout choice applied: the chosen view first. Ids, fields and bindings are
 * untouched. The session length is not applied here: the designer sets it, so the words agree.
 */
export function withChoices(spec: AppSpec, choices: MakeChoices): AppSpec {
  const start = choices.startViewId ? spec.views.find((v) => v.id === choices.startViewId) : undefined;
  if (!start || spec.views[0]?.id === start.id) return spec;
  return { ...spec, views: [start, ...spec.views.filter((v) => v.id !== start.id)] };
}

/** The app's own address, absolute: the server's origin inside the Android shell, this page's on the web. */
export function appLink(appId: string, origin: string): string {
  return `${origin.replace(/\/+$/, '')}/apps/${encodeURIComponent(appId)}/`;
}

/** Whether a link only opens on this computer (a localhost address), so it cannot be sent to a phone as it is. */
export function isLocalOnly(link: string): boolean {
  try {
    const host = new URL(link).hostname.replace(/^\[|\]$/g, '');
    return host === 'localhost' || host.endsWith('.localhost') || host === '::1' || host === '0.0.0.0' || /^127\./.test(host);
  } catch {
    return false;
  }
}

/** Whether trying the same request again can help (a lost connection or a server hiccup, not a refusal). */
export function retryable(err: Pick<ActionError, 'status' | 'code'>): boolean {
  return err.status === 0 || err.status >= 500 || err.code === 'timeout' || err.code === 'network';
}

const LAYOUT_NAMES: Record<ViewType, string> = { gallery: 'Gallery', journal: 'Journal', list: 'List', board: 'Board', summary: 'Summary', practice: 'Timer', links: 'Sources', queue: 'Queue' };
const LAYOUT_ICONS: Record<ViewType, IconSymbol> = { gallery: 'image', journal: 'notebook', list: 'checklist', board: 'kanban', summary: 'chart', practice: 'timer', links: 'link', queue: 'people' };

function actionError(e: unknown): ActionError {
  if (e instanceof ApiError) return { message: e.message, code: e.code, status: e.status };
  return { message: describeError(e), code: 'error', status: 0 };
}

export function MakePage() {
  const { recId } = useParams();
  const { data, error, loading, reload } = useLoad(() => api<ProposalDetailDto>(`/api/recommendations/${recId}`), [recId]);
  const rec = data?.recommendation;
  usePageTitle(rec ? `${rec.kind === 'new_app' ? `Make ${rec.title} yours` : rec.title} · ${BRAND.name}` : `Make it yours · ${BRAND.name}`);

  if (!recId) return <Navigate to="/playground" replace />;

  if (loading && !data) {
    return (
      <div className="make make-loading" aria-busy="true">
        <Skeleton h={20} w={110} />
        <div className="make-head-row">
          <Skeleton h={56} w={56} style={{ borderRadius: 16 }} />
          <Skeleton h={34} w="60%" />
        </div>
        <Skeleton h={320} style={{ borderRadius: 22 }} />
        <Skeleton h={52} style={{ borderRadius: 999 }} />
      </div>
    );
  }
  if (!rec || !data) {
    return (
      <div className="container-narrow stack-l mk">
        <Link to="/playground" className="st-back">{Icons.back} Playground</Link>
        <ErrorBanner message={error ?? 'That proposal is no longer here.'} onRetry={reload} />
      </div>
    );
  }

  const back: Back = rec.captureId ? { to: '/agent', label: 'Agent' } : { to: '/playground', label: 'Playground' };
  if (rec.kind === 'new_app') return <NewAppFlow key={rec.id} rec={rec} detail={data} back={back} />;
  return (
    <div className="container-narrow stack-l mk">
      <BackLink back={back} />

      <header className="mk-head">
        <AppIcon icon={rec.icon} name={rec.title} size={64} title={`${rec.title} icon`} />
        <div className="mk-head-text">
          <span className="eyebrow">{PROPOSAL_KIND_LABELS[rec.kind]}</span>
          <h1 data-testid="make-title">{rec.title}</h1>
          <p className="lede">{rec.tagline}</p>
        </div>
      </header>

      <p className="mk-desc">{rec.description}</p>

      {data.stale && <StaleBanner reason={data.stale} back={back} />}
      {rec.kind === 'explore' && <ExploreFlow rec={rec} />}
      {rec.kind === 'update_app' && <UpdateFlow rec={rec} detail={data} />}
      {rec.kind === 'keep' && <KeepFlow rec={rec} />}
      {rec.kind === 'use_app' && <UseFlow rec={rec} detail={data} />}

      <WhyThis rec={rec} detail={data} />
    </div>
  );
}

// ---------- shared pieces ----------

interface Back {
  to: string;
  label: string;
}

function BackLink({ back }: { back: Back }) {
  return (
    <Link to={back.to} className="st-back make-back" data-testid="make-back">
      {Icons.back} {back.label}
    </Link>
  );
}

function StaleBanner({ reason, back }: { reason: string; back: Back }) {
  return (
    <div className="banner banner-warn" role="status" data-testid="make-stale">
      <span>{reason}</span>
      <Link to={back.to} className="btn btn-secondary btn-sm">Back</Link>
    </div>
  );
}

/** Which cited facts came from the example profile rather than the person (audit P1-04); null until known. */
function useExampleFacts(evidence: ProfileFact[]): ReadonlySet<string> | null {
  const [ids, setIds] = useState<ReadonlySet<string> | null>(() => (evidence.length ? null : new Set()));
  useEffect(() => {
    if (!evidence.length) return;
    let alive = true;
    api<ContextOverviewDto>('/api/context')
      .then((ctx) => {
        if (!alive) return;
        const examples = new Set(ctx.sources.filter((s) => s.kind === 'sample').map((s) => s.id));
        setIds(new Set(evidence.filter((f) => f.sourceIds.some((id) => examples.has(id))).map((f) => f.id)));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [evidence]);
  return ids;
}

/**
 * "Why this?": the full reason, what it is grounded in (with read status and example provenance) and,
 * once there is a design, how it was designed. Collapsed: the preview and the choices come first.
 */
function WhyThis({ rec, detail, design }: { rec: Recommendation; detail: ProposalDetailDto; design?: ProposalPreviewDto | null }) {
  const exampleFacts = useExampleFacts(detail.evidence);
  // Provenance before the reason: a reason drawn from the example profile is not something the person shared.
  const fromExample = exampleFacts ? detail.evidence.filter((f) => exampleFacts.has(f.id)).length : 0;
  const onlyExample = fromExample > 0 && fromExample === detail.evidence.length && detail.captures.length === 0;
  return (
    <Disclosure summary="Why this?" testId="make-why" summaryTestId="make-why-toggle" className="make-why">
      {fromExample > 0 && (
        <p className="make-why-example" data-testid="make-why-example">
          <ExampleTag />
          <span>{onlyExample ? 'This idea comes from the example profile, not from anything you shared.' : 'Part of this idea comes from the example profile, not from you.'}</span>
        </p>
      )}
      <p>{rec.reason}</p>
      {rec.kind === 'new_app' && <p className="muted">{rec.description}</p>}
      {(detail.captures.length > 0 || detail.evidence.length > 0) && (
        <ul className="pc-evidence" data-testid="make-evidence">
          {detail.captures.map((c) => (
            <li key={c.id}>
              <span className="pc-evidence-kind">{c.sourceLabel}</span>
              <span className="pc-evidence-text">{c.text || c.linkMeta?.title || c.url || 'Screenshot'}</span>
              <span className="pc-evidence-status">{readStatusLabel(c)}</span>
            </li>
          ))}
          {detail.evidence.map((f) => {
            const example = exampleFacts?.has(f.id) ?? false;
            return (
              <li key={f.id}>
                <span className="pc-evidence-kind">{exampleFacts === null ? 'From memory' : example ? 'From the example profile' : 'From your memory'}</span>
                <span className="pc-evidence-text">{f.value}</span>
                {example && <ExampleTag />}
                <FactStatusChip status={f.status} />
              </li>
            );
          })}
        </ul>
      )}
      {design && (
        <div className="make-why-design">
          <span className="make-why-k">How it was designed{design.generatedBy === 'sample' ? ' (Sample mode, from the built-in catalog)' : ''}</span>
          <p>{design.description}</p>
        </div>
      )}
    </Disclosure>
  );
}

// ---------- new_app: see it, shape it, make it yours ----------

export interface Made {
  detail: AppDetailDto;
  /** A repeat of this proposal: the app it already made, not a second one. */
  alreadyBuilt: boolean;
  /** What Make mine carried over from the share, in plain words. */
  carried: string[];
  /** The app's own entries (a photo or a follow-up carried over from a share); null while they load. */
  records: AppRecord[] | null;
}

/** The app's own entries; none when it has none or they cannot be read (the card then shows labelled examples). */
async function loadRecords(detail: AppDetailDto): Promise<AppRecord[]> {
  if (!detail.app.recordCount) return [];
  return api<RecordsPageDto>(`/api/apps/${detail.app.id}/records`).then((r) => r.records).catch(() => []);
}

/** The app this proposal already made, or null when it no longer exists (it can then be made again). */
async function loadMade(appId: string): Promise<Pick<Made, 'detail' | 'records'> | null> {
  try {
    const detail = await api<AppDetailDto>(`/api/apps/${appId}`);
    return { detail, records: await loadRecords(detail) };
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

function NewAppFlow({ rec, detail, back }: { rec: Recommendation; detail: ProposalDetailDto; back: Back }) {
  const { refresh } = useAuth();
  const mood = useOriMood({ resetKey: rec.id });
  const { begin, succeed, fail, cancel } = mood;
  const stale = detail.stale ?? null;
  const builtId = rec.status === 'built' && rec.builtAppId ? rec.builtAppId : null;

  const [focus, setFocus] = useState('');
  const [startViewId, setStartViewId] = useState<string | null>(null);
  // What the preview is designed with. A length the person asked for outranks the template's default (audit P1-01).
  const [target, setTarget] = useState<DraftTarget>(() => ({ words: '', length: rec.suggestedMinutes ?? null }));
  const [draft, setDraft] = useState<Draft | null>(null);
  /** The first design: its timer presets stay on offer while later designs change them. */
  const [firstSpec, setFirstSpec] = useState<AppSpec | null>(null);
  const [drafting, setDrafting] = useState(false);
  /** The last design request that failed, with the choices it was for: asked again only on Try again or a new choice. */
  const [draftFailure, setDraftFailure] = useState<{ key: string; error: ActionError } | null>(null);
  /** Focus words the designer could not apply, in words for the person (review finding 6). */
  const [unchanged, setUnchanged] = useState<string | null>(null);
  const [phase, setPhase] = useState<'checking' | 'preview' | 'making' | 'ready'>(builtId ? 'checking' : 'preview');
  const [showMaking, setShowMaking] = useState(false);
  /** Make mine was pressed: the design for the current choices comes first, then the app is saved once. */
  const [makeAfterDraft, setMakeAfterDraft] = useState(false);
  const [buildError, setBuildError] = useState<ActionError | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [checkTick, setCheckTick] = useState(0);
  const [made, setMade] = useState<Made | null>(null);
  const [justMade, setJustMade] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  /** The preview over the whole screen; on narrow screens, the whole preview in place of the strip. */
  const [full, setFull] = useState(false);
  const [open, setOpen] = useState(false);
  const draftSeq = useRef(0);
  /** The design request on its way, and the choices it was asked with. */
  const inflight = useRef<{ key: string; ctrl: AbortController; token: OriToken } | null>(null);
  /** The design on show, to tell whether a new one changed anything. */
  const shownRef = useRef<Draft | null>(null);
  const buildingRef = useRef(false);
  const makingTimer = useRef<number | null>(null);

  const name = draft?.dto.spec.name ?? rec.title;
  const icon = draft?.dto.spec.icon ?? rec.icon;
  usePageTitle(phase === 'ready' && made ? `${made.detail.spec.name} is yours · ${BRAND.name}` : `Make ${name} yours · ${BRAND.name}`);
  const previewSpec = useMemo(() => (draft ? withChoices(draft.dto.spec, { startViewId }) : null), [draft, startViewId]);
  const designedLength = draft ? sessionLength(draft.dto.spec) : null;
  const minuteOptions = useMemo(() => {
    if (designedLength === null || !firstSpec) return [];
    return [...new Set([...minuteChoices(firstSpec, rec.suggestedMinutes), designedLength])].sort((a, b) => a - b);
  }, [designedLength, firstSpec, rec.suggestedMinutes]);
  // The chip shows what the app will start at once the design answers; the choice itself while it is being designed.
  const settled = Boolean(draft) && !drafting && draftAnswers(draft as Draft, target);
  const pressedLength = settled ? designedLength : (target.length ?? designedLength);
  const layouts = useMemo(() => (draft ? layoutChoices(draft.dto.spec) : []), [draft]);
  // Where the app opens: its first view (a summary included), so the layout choice never claims another.
  const currentStart = previewSpec?.views[0]?.id ?? null;
  const focusWords = focus.trim();
  const showUpdate = Boolean(draft) && focusWords !== draft?.focus;
  const updatingWords = showUpdate && drafting && target.words === focusWords;
  const making = phase === 'making';
  // Once Make mine is pressed the choices are what gets made: they wait until it is done (review finding 2).
  const locked = making || makeAfterDraft;
  const canMake = phase === 'preview' && !stale && Boolean(draft) && !makeAfterDraft;

  // Leaving the page drops any answer still on its way, and the Make step timer with it.
  useEffect(
    () => () => {
      draftSeq.current += 1;
      inflight.current?.ctrl.abort();
      inflight.current = null;
      if (makingTimer.current !== null) window.clearTimeout(makingTimer.current);
    },
    [],
  );

  /** Drop the design request on its way: its answer is ignored and its pending mood ends. */
  const stopDraft = useCallback(() => {
    const f = inflight.current;
    if (!f) return;
    inflight.current = null;
    draftSeq.current += 1;
    f.ctrl.abort();
    cancel(f.token);
    setDrafting(false);
  }, [cancel]);

  /** Ask the app designer for a preview with these choices; the newest request wins, older answers are dropped. */
  const requestDraft = useCallback(
    async (t: DraftTarget) => {
      stopDraft();
      const key = targetKey(t);
      const seq = ++draftSeq.current;
      const ctrl = new AbortController();
      const token = begin('revision');
      inflight.current = { key, ctrl, token };
      const shown = shownRef.current;
      setDrafting(true);
      setDraftFailure(null);
      setAnnouncement(shown ? 'Updating the preview…' : '');
      try {
        const d = await api<ProposalPreviewDto>(`/api/recommendations/${rec.id}/draft`, { method: 'POST', body: draftBody(t), timeoutMs: 120_000, signal: ctrl.signal });
        if (seq !== draftSeq.current) return;
        const parsed = AppSpecSchema.safeParse(d.spec);
        if (!parsed.success) throw new Error('The preview did not come out right. Try again.');
        const next: Draft = { dto: { ...d, spec: parsed.data }, focus: t.words, minutes: t.length };
        // Words the designer could not use change nothing: say so, rather than "Preview updated".
        const ignored = shown !== null && t.words !== '' && t.words !== shown.focus && next.dto.unsupported.length === 0 && sameDesign(shown.dto.spec, next.dto.spec);
        inflight.current = null;
        shownRef.current = next;
        setDraft(next);
        setFirstSpec((s) => s ?? next.dto.spec);
        setUnchanged(ignored ? unchangedNote(t.words, next.dto.generatedBy === 'sample') : null);
        setAnnouncement(!shown ? '' : ignored ? 'The preview did not change.' : 'Preview updated.');
        setDrafting(false);
        cancel(token);
      } catch (e) {
        if (seq !== draftSeq.current) return; // stopped or replaced: that already settled it
        inflight.current = null;
        if (e instanceof ApiError && e.isAuth) void refresh();
        setDraftFailure({ key, error: actionError(e) });
        setAnnouncement('');
        setDrafting(false);
        fail(token);
      }
    },
    [begin, cancel, fail, rec.id, refresh, stopDraft],
  );

  // The preview follows the choices: it starts by itself, a new length is designed once the taps settle,
  // and new focus words (Update preview, Make mine) are designed at once. A design that already answers
  // the choices is kept, and an answer for older choices never replaces it.
  useEffect(() => {
    if (phase !== 'preview' || stale) return;
    const key = targetKey(target);
    const step = nextDraftStep({ draft, target, inflightKey: inflight.current?.key ?? null, failedKey: draftFailure?.key ?? null, makeAfterDraft });
    if (step.kind === 'keep') {
      if (inflight.current && inflight.current.key !== key) stopDraft();
      return;
    }
    if (step.kind === 'wait') return;
    stopDraft();
    const id = window.setTimeout(() => void requestDraft(target), step.delayMs);
    return () => window.clearTimeout(id);
  }, [phase, stale, target, draft, draftFailure, makeAfterDraft, requestDraft, stopDraft]);

  // A repeat visit after Make mine shows Ready for the app it made (one proposal, one app).
  useEffect(() => {
    if (!builtId) return;
    let alive = true;
    setCheckError(null);
    loadMade(builtId)
      .then((m) => {
        if (!alive) return;
        if (m) {
          setMade({ ...m, alreadyBuilt: true, carried: [] });
          setPhase('ready');
        } else {
          setPhase('preview'); // that app was deleted, so this idea can be made again
        }
      })
      .catch((e: unknown) => {
        if (alive) setCheckError(describeError(e));
      });
    return () => {
      alive = false;
    };
  }, [builtId, checkTick]);

  /** Save the design as the person's app, once: the layout they chose and the words and length it was designed with. */
  const build = useCallback(
    async (d: Draft) => {
      if (buildingRef.current) return;
      buildingRef.current = true;
      const spec = withChoices(d.dto.spec, { startViewId });
      const token = begin('create');
      setBuildError(null);
      setFull(false);
      setPhase('making');
      setAnnouncement(`Making ${spec.name} yours…`);
      if (makingTimer.current !== null) window.clearTimeout(makingTimer.current);
      makingTimer.current = window.setTimeout(() => setShowMaking(true), MAKING_STEP_DELAY_MS);
      try {
        // Idempotent per proposal on the server: a retry or a second tab gets the same app back.
        const res = await api<BuildResponseDto>(`/api/recommendations/${rec.id}/build`, {
          method: 'POST',
          body: { spec, description: d.dto.description, instructions: d.focus },
          timeoutMs: 120_000,
        });
        if (!res?.app?.id) throw new Error('The app did not come back from the server. Try again.');
        setMade({ detail: res, alreadyBuilt: Boolean(res.alreadyBuilt), carried: res.carried ?? [], records: null });
        setJustMade(true);
        setAnnouncement('');
        setPhase('ready');
        succeed(token);
        void loadRecords(res).then((records) => {
          setMade((m) => (m && m.detail.app.id === res.app.id ? { ...m, records } : m));
        });
      } catch (e) {
        if (e instanceof ApiError && e.isAuth) void refresh();
        setBuildError(actionError(e));
        setAnnouncement('');
        setPhase('preview');
        fail(token);
      } finally {
        if (makingTimer.current !== null) window.clearTimeout(makingTimer.current);
        makingTimer.current = null;
        setShowMaking(false);
        buildingRef.current = false;
      }
    },
    [begin, fail, rec.id, refresh, startViewId, succeed],
  );

  // Make mine waits for the design of the choices it was pressed with, then saves that design once. When
  // that design fails, nothing was made: the build error says so and its Try again starts Make mine over.
  useEffect(() => {
    if (!makeAfterDraft || phase !== 'preview') return;
    if (draftFailure?.key === targetKey(target)) {
      setMakeAfterDraft(false);
      setBuildError(draftFailure.error);
      return;
    }
    if (draft && draftAnswers(draft, target) && !inflight.current) {
      setMakeAfterDraft(false);
      void build(draft);
    }
  }, [makeAfterDraft, phase, draft, draftFailure, target, build]);

  /** Make mine: the app made is the one previewed, so choices not yet designed are designed first. */
  const make = () => {
    if (!canMake || !draft) return;
    const t: DraftTarget = { words: focusWords, length: target.length };
    setBuildError(null);
    if (draftAnswers(draft, t)) {
      stopDraft();
      if (targetKey(t) !== targetKey(target)) setTarget(t);
      void build(draft);
      return;
    }
    setDraftFailure(null);
    setTarget((cur) => (targetKey(cur) === targetKey(t) ? cur : t));
    setMakeAfterDraft(true);
  };

  /** Update preview (or Enter in the focus field): design these words with the current length. */
  const updatePreview = () => {
    if (!draft || locked) return;
    setDraftFailure(null);
    setTarget((cur) => (cur.words === focusWords ? cur : { ...cur, words: focusWords }));
  };

  /** A session length: designed once the taps settle, so the app's words say the length it starts at. */
  const chooseLength = (minutes: number) => {
    if (locked) return;
    setDraftFailure(null);
    setTarget((cur) => (cur.length === minutes ? cur : { ...cur, length: minutes }));
  };

  /** Try again after a design request failed: the same choices are asked for again. */
  const retryDraft = () => setDraftFailure(null);

  /** Preview again after the server refused a design as invalid: a fresh design for the same choices. */
  const previewAgain = () => {
    setBuildError(null);
    void requestDraft(target);
  };

  const live = (
    <p className="sr-only" role="status" aria-live="polite">
      {announcement}
    </p>
  );

  if (phase === 'checking') {
    return (
      <>
        {live}
        <div className="make make-ready" aria-busy={!checkError}>
          <BackLink back={back} />
          {checkError ? <ErrorBanner message={checkError} onRetry={() => setCheckTick((t) => t + 1)} /> : <ReadySkeleton />}
        </div>
      </>
    );
  }
  if (phase === 'ready' && made) {
    return (
      <>
        {live}
        <ReadyStep made={made} mood={mood} focusHeading={justMade} back={back} onDetail={(d) => setMade((m) => (m && m.detail.app.id === d.app.id ? { ...m, detail: { ...m.detail, ...d } } : m))} />
      </>
    );
  }
  if (making && showMaking) {
    return (
      <>
        {live}
        <MakingStep name={name} icon={icon} mood={mood} />
      </>
    );
  }

  const makeLabel = makeAfterDraft ? 'Updating the preview…' : making ? `Making ${name} yours…` : 'Make mine';
  // One Make mine at a time: in the page's bar, or at the foot of the full-screen preview (review finding 9).
  const makeButton = (
    <button type="button" className="btn btn-primary btn-lg make-mine" onClick={make} disabled={!canMake} aria-busy={making || makeAfterDraft || undefined} data-testid="make-mine">
      {makeLabel}
    </button>
  );
  const unsupported = draft?.dto.unsupported ?? [];

  return (
    <>
      {live}
      <div className="make make-preview-step">
        <header className="make-head">
          <BackLink back={back} />
          <div className="make-head-row">
            <AppIcon icon={icon} name={name} size={56} title="" className="make-head-icon" />
            <h1 data-testid="make-title">Make {name} yours</h1>
          </div>
        </header>

        {stale ? (
          <StaleBanner reason={stale} back={back} />
        ) : (
          <ExampleCard
            name={name}
            label={previewSpec ? exampleLabel(previewSpec) : 'Example preview'}
            spec={previewSpec}
            records={draft?.dto.previewRecords ?? []}
            previewKey={currentStart ?? 'start'}
            sample={draft?.dto.generatedBy === 'sample'}
            sampleReason={draft?.dto.fallbackReason}
            drafting={drafting}
            error={draft ? null : (draftFailure?.error ?? null)}
            onRetry={retryDraft}
            mood={mood}
            makeAction={makeButton}
            full={full}
            onFull={setFull}
            open={open}
            onOpen={setOpen}
          />
        )}

        {/* In reading order everywhere: the choices, what went wrong, Make mine, then the details (review finding 10). */}
        <div className="make-side">
          {draft && !stale && (
            <Choices
              placeholder={focusPlaceholder(draft.dto.spec)}
              focus={focus}
              onFocusChange={(value) => {
                setFocus(value);
                setUnchanged(null);
              }}
              showUpdate={showUpdate}
              updating={updatingWords}
              disabled={locked}
              onUpdate={updatePreview}
              unchanged={unchanged}
              layouts={layouts}
              currentStart={currentStart}
              onLayout={setStartViewId}
              minuteOptions={minuteOptions}
              pressedLength={pressedLength}
              onMinutes={chooseLength}
            />
          )}

          {draft && draftFailure && !buildError && (
            <ErrorBanner message={`The preview was not updated: ${draftFailure.error.message}`} onRetry={retryable(draftFailure.error) ? retryDraft : undefined} retryTestId="make-preview-retry" />
          )}

          {unsupported.length > 0 && (
            <div className="make-unsupported" data-testid="make-unsupported">
              <p className="make-label">Not included</p>
              <ul>
                {unsupported.map((u, i) => (
                  <li key={i}>
                    <strong>{u.request}</strong>: {u.reason}
                    {u.alternative && <span className="muted"> Instead: {u.alternative}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {buildError && <BuildError error={buildError} name={name} mood={mood} onRetry={make} onPreviewAgain={previewAgain} />}

          {!stale && <div className="make-bar">{full ? null : makeButton}</div>}

          <div className="make-details">
            <WhyThis rec={rec} detail={detail} design={draft?.dto ?? null} />
            {previewSpec && <InsideDetails spec={previewSpec} />}
          </div>
        </div>
      </div>
    </>
  );
}

const PAUSED_TEXT = 'Your trial has ended, so making apps is paused. You can still open and export your apps.';

const EXPAND_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M15 3h6v6" />
    <path d="M9 21H3v-6" />
    <path d="m21 3-7 7" />
    <path d="m3 21 7-7" />
  </svg>
);

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface ExampleCardProps {
  name: string;
  label: string;
  spec: AppSpec | null;
  records: AppRecord[];
  /** Changes when the layout choice changes, so the preview opens on the chosen view. */
  previewKey: string;
  sample: boolean;
  sampleReason?: string;
  drafting: boolean;
  /** The first preview failed (there is nothing to show yet). */
  error: ActionError | null;
  onRetry: () => void;
  mood: OriMoodHandle;
  /** Make mine, at the foot of the full-screen preview (the page's own bar hides meanwhile). */
  makeAction: ReactNode;
  /** The preview over the whole screen, as a modal dialog. */
  full: boolean;
  onFull: (full: boolean) => void;
  /** Narrow screens: the whole preview in place of the compact strip. */
  open: boolean;
  onOpen: (open: boolean) => void;
}

/**
 * The labelled example card. Wide screens show the real preview. Narrow screens lead with a compact
 * strip in the app's own look (two example photos, the timer face, the next people), so seeing it,
 * shaping it and making it fit one screen like reference 04; the whole real preview opens in place
 * ("Show the whole preview") or full screen over the parent navigation (audit P0-03), with an obvious
 * way out: Close preview, or Escape. Full screen is a modal: the rest of the page is inert.
 */
function ExampleCard({ name, label, spec, records, previewKey, sample, sampleReason, drafting, error, onRetry, mood, makeAction, full, onFull, open, onOpen }: ExampleCardProps) {
  const cardRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const theme = useMemo(() => (spec ? resolveTheme(spec) : null), [spec]);

  useEffect(() => {
    if (!full) return;
    // Everything outside the dialog leaves the tab order and the accessibility tree (live regions stay).
    const inerted: Element[] = [];
    for (let el: Element | null = cardRef.current; el?.parentElement && el !== document.body; el = el.parentElement) {
      for (const sibling of Array.from(el.parentElement.children)) {
        if (sibling === el || sibling.hasAttribute('inert') || sibling.matches('script, [aria-live], .toast-host')) continue;
        sibling.setAttribute('inert', '');
        inerted.push(sibling);
      }
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      // A photo opened inside the preview closes first.
      if (e.key !== 'Escape' || cardRef.current?.querySelector('.rt-lightbox')) return;
      onFull(false);
      toggleRef.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      for (const el of inerted) el.removeAttribute('inert');
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [full, onFull]);

  // While full screen, Tab stays inside the preview.
  const keepFocusInside = (e: ReactKeyboardEvent) => {
    if (!full || e.key !== 'Tab' || !cardRef.current) return;
    const items = [...cardRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.getClientRects().length > 0);
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <section
      ref={cardRef}
      className={`make-example${full ? ' is-full' : ''}${open ? ' is-open' : ''}`}
      aria-labelledby="make-example-title"
      data-testid="make-example"
      {...(full ? { role: 'dialog', 'aria-modal': true } : {})}
      onKeyDown={keepFocusInside}
    >
      <div className="make-example-head">
        <div className="make-example-titles">
          <h2 id="make-example-title" className="make-example-title">
            {label}
          </h2>
          {sample && (
            <span className="badge badge-sample" title={sampleReason ?? 'Designed from the built-in catalog, not by the AI model'} data-testid="make-sample">
              Sample mode
            </span>
          )}
        </div>
        {spec && (
          <button
            ref={toggleRef}
            type="button"
            className={`btn btn-sm make-example-toggle${full ? ' is-close' : ''}`}
            onClick={() => onFull(!full)}
            aria-label={full ? `Close preview of ${name}` : `Full screen preview of ${name}`}
            data-testid="make-fullscreen"
          >
            {full ? Icons.close : EXPAND_ICON}
            <span className="make-example-toggle-text" aria-hidden="true">
              {full ? 'Close preview' : 'Full screen'}
            </span>
          </button>
        )}
      </div>
      <div className="make-example-stage" aria-busy={drafting || undefined}>
        {spec ? (
          <>
            {theme && (
              <div className="rt-root make-example-strip" {...theme.attrs} style={theme.style as CSSProperties}>
                <AppStrip spec={spec} records={records} />
              </div>
            )}
            <div className="make-example-body" id="make-example-body">
              <AppPreview key={previewKey} spec={spec} records={records} headingLevel={3} />
            </div>
            {drafting && (
              <div className="make-example-updating">
                <OriCompanion {...mood.companion} size={32} />
                <span>Updating the preview…</span>
              </div>
            )}
          </>
        ) : error ? (
          <div className="make-example-state" role="alert" data-testid="make-preview-error">
            <OriCompanion {...mood.companion} size={56} />
            <p>{error.code === 'premium_paused' ? PAUSED_TEXT : error.message}</p>
            {error.code === 'premium_paused' ? (
              <Link to="/pricing" className="btn btn-secondary">See plans</Link>
            ) : retryable(error) ? (
              <button type="button" className="btn btn-secondary" onClick={onRetry} data-testid="make-preview-retry">
                Try again
              </button>
            ) : null}
          </div>
        ) : (
          <div className="make-example-state" data-testid="make-preview-loading">
            <OriCompanion {...mood.companion} size={56} />
            <p>Designing your preview of {name}…</p>
          </div>
        )}
      </div>
      {spec && !full && (
        <button type="button" className="btn btn-ghost make-example-more" aria-expanded={open} aria-controls="make-example-body" onClick={() => onOpen(!open)} data-testid="make-preview-more">
          <span>{open ? 'Show less' : 'Show the whole preview'}</span>
          <span className={`make-example-more-chevron${open ? ' is-open' : ''}`} aria-hidden="true">
            {Icons.chevronDown}
          </span>
        </button>
      )}
      {full && (
        <div className="make-example-foot" data-testid="make-fullscreen-foot">
          {makeAction}
        </div>
      )}
    </section>
  );
}

export interface ChoicesProps {
  placeholder: string;
  focus: string;
  onFocusChange: (value: string) => void;
  /** The typed words differ from the design on show: offer Update preview. */
  showUpdate: boolean;
  /** Those words are being designed now. */
  updating: boolean;
  /** Make mine is under way: the choices are what gets made. */
  disabled: boolean;
  onUpdate: () => void;
  /** Focus words the designer could not apply, said plainly. */
  unchanged: string | null;
  layouts: ViewSpec[];
  currentStart: string | null;
  onLayout: (viewId: string) => void;
  minuteOptions: number[];
  pressedLength: number | null;
  onMinutes: (minutes: number) => void;
}

/** The one or two choices that change the app; everything else is designed and can change later with Edit with Ori. */
export function Choices({ placeholder, focus, onFocusChange, showUpdate, updating, disabled, onUpdate, unchanged, layouts, currentStart, onLayout, minuteOptions, pressedLength, onMinutes }: ChoicesProps) {
  return (
    <section className="make-choices" aria-label="Shape it">
      <form
        className="make-focus"
        onSubmit={(e) => {
          e.preventDefault();
          onUpdate();
        }}
      >
        <label htmlFor="make-focus-input" className="make-label">
          What should it focus on?
        </label>
        <div className="make-focus-row">
          <div className="make-focus-field">
            <span className="make-focus-icon" aria-hidden="true">{Icons.pencil}</span>
            <input
              id="make-focus-input"
              className="make-focus-input"
              type="text"
              value={focus}
              onChange={(e) => onFocusChange(e.target.value)}
              placeholder={placeholder}
              maxLength={300}
              autoComplete="off"
              enterKeyHint="go"
              disabled={disabled}
              aria-describedby={unchanged ? 'make-focus-note' : undefined}
              data-testid="make-instructions"
            />
          </div>
          {showUpdate && (
            <button type="submit" className="btn btn-secondary make-focus-update" disabled={updating || disabled} data-testid="make-preview-button">
              {updating ? 'Updating…' : 'Update preview'}
            </button>
          )}
        </div>
        {unchanged && (
          <p id="make-focus-note" className="make-focus-note" data-testid="make-focus-unchanged">
            {unchanged}
          </p>
        )}
      </form>

      {layouts.length > 1 && (
        <div className="make-choice">
          <span className="make-label" id="make-layout-label">
            Layout
          </span>
          <div className="make-segmented" role="group" aria-labelledby="make-layout-label">
            {layouts.map((v) => (
              <button key={v.id} type="button" aria-pressed={currentStart === v.id} onClick={() => onLayout(v.id)} disabled={disabled} data-testid={`make-choice-layout-${v.id}`} title={v.title}>
                <Glyph symbol={LAYOUT_ICONS[v.type]} size={20} />
                <span>{LAYOUT_NAMES[v.type]}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {minuteOptions.length > 0 && (
        <div className="make-choice">
          <span className="make-label" id="make-minutes-label">
            Session length
          </span>
          <div className="make-chips" role="group" aria-labelledby="make-minutes-label">
            {minuteOptions.map((m) => (
              <button key={m} type="button" className="make-chip" aria-pressed={pressedLength === m} onClick={() => onMinutes(m)} disabled={disabled} data-testid={`make-choice-minutes-${m}`}>
                {m} min
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

/** Make mine failed: the choices stay, the companion says so calmly, and the next step is concrete. */
function BuildError({ error, name, mood, onRetry, onPreviewAgain }: { error: ActionError; name: string; mood: OriMoodHandle; onRetry: () => void; onPreviewAgain: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    const still = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ block: 'center', behavior: still ? 'auto' : 'smooth' });
  }, [error]);
  const paused = error.code === 'premium_paused';
  return (
    <div ref={ref} tabIndex={-1} className="make-error" role="alert" data-testid="make-error">
      <OriCompanion {...mood.companion} size={44} />
      <div className="make-error-text">
        <p>
          <strong>{name} was not made.</strong> {paused ? PAUSED_TEXT : error.message} Your choices are kept.
        </p>
        <div className="make-error-actions">
          {paused ? (
            <Link to="/pricing" className="btn btn-secondary btn-sm">See plans</Link>
          ) : error.code === 'invalid_spec' ? (
            <button type="button" className="btn btn-secondary btn-sm" onClick={onPreviewAgain} data-testid="make-retry">
              Preview again
            </button>
          ) : retryable(error) ? (
            <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry} data-testid="make-retry">
              Try again
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function InsideDetails({ spec }: { spec: AppSpec }) {
  return (
    <Disclosure summary="What's inside" testId="make-inside" className="make-why">
      <ul className="mk-inside">
        {describeFields(spec).map((f, i) => (
          <li key={`f-${i}`}>
            <span>
              {f.label}
              {f.required ? ' (required)' : ''}
            </span>
            <span className="faint">{f.type}</span>
          </li>
        ))}
        {spec.views.map((v) => (
          <li key={v.id}>
            <span>{describeView(spec, v)}</span>
          </li>
        ))}
        {spec.rules.map((r) => (
          <li key={r.id}>
            <span>{describeRule(r)}</span>
          </li>
        ))}
      </ul>
    </Disclosure>
  );
}

/** The one pending state the build endpoint has: no stages, no percentage, no cancel it could not honour. */
export function MakingStep({ name, icon, mood }: { name: string; icon: AppSpec['icon']; mood: OriMoodHandle }) {
  return (
    <div className="make make-making" aria-busy="true" data-testid="make-building">
      <div className="make-making-app">
        <AppIcon icon={icon} name={name} size={48} title="" />
        <span>{name}</span>
      </div>
      <OriCompanion {...mood.companion} size={120} className="make-making-ori" />
      <h1 className="make-making-title">Making {name} yours…</h1>
    </div>
  );
}

function ReadySkeleton() {
  return (
    <div className="make-ready-skeleton">
      <div className="make-head-row">
        <Skeleton h={96} w={96} style={{ borderRadius: 48 }} />
        <Skeleton h={34} w="55%" />
      </div>
      <Skeleton h={200} style={{ borderRadius: 22 }} />
      <Skeleton h={52} style={{ borderRadius: 999 }} />
      <Skeleton h={52} style={{ borderRadius: 999 }} />
    </div>
  );
}

/** Ready: only after the server returned the app (201, or 200 for the app this proposal already made). */
export function ReadyStep({ made, mood, focusHeading, back, onDetail }: { made: Made; mood: OriMoodHandle; focusHeading: boolean; back: Back; onDetail?: (detail: AppDetailDto) => void }) {
  const { app, spec } = made.detail;
  const name = spec.name;
  // An app archived since it was made opens as before; it is restored before it goes on a home screen.
  const archived = Boolean(app.archivedAt);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focusHeading) headingRef.current?.focus();
  }, [focusHeading]);
  // The brief success acknowledgement, then the same Ready expression, still.
  const companion = mood.phase === 'success' ? mood.companion : { mood: 'success' as const, motion: 'none' as const };
  const link = appLink(app.id, apiBase() || (typeof window !== 'undefined' ? window.location.origin : ''));
  const home = app.launchPath || `/apps/${app.id}/`;
  return (
    <div className="make make-ready" data-testid="make-ready">
      <BackLink back={back} />
      <header className="make-ready-head">
        <OriCompanion {...companion} size={96} className="make-ready-ori" />
        <div className="make-ready-titles">
          <h1 ref={headingRef} tabIndex={-1} data-testid="make-ready-title">
            {name} is yours
          </h1>
          <p className="make-ready-status">
            <span className="make-ready-check" aria-hidden="true">{Icons.check}</span>
            Ready to use
          </p>
        </div>
      </header>
      {made.alreadyBuilt && (
        <p className="make-ready-again" data-testid="make-ready-again">
          You made {name} from this idea before. This is the same app, not a copy.
        </p>
      )}
      {archived && <ArchivedNote appId={app.id} name={name} onDetail={onDetail} />}
      <ReadyCard detail={made.detail} records={made.records} />
      {made.carried.length > 0 && (
        <ul className="make-carried" data-testid="make-ready-carried">
          {made.carried.map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ul>
      )}
      <div className="make-ready-actions">
        <Link to={home} className="btn btn-primary btn-lg" data-testid="make-ready-open">
          Open {name}
        </Link>
        {!archived && (
          <Link to={`${home}?install=1`} className="btn btn-secondary btn-lg" data-testid="make-ready-install">
            Add to home screen
          </Link>
        )}
        <CopyLink link={link} />
        <p className="make-ready-own">Your own app. Its own link.</p>
        {isLocalOnly(link) && <p className="make-ready-local">This link uses this computer's own address, so it only opens here.</p>}
      </div>
    </div>
  );
}

/** An app archived since it was made: what that means, and Restore right here (review finding 11). */
function ArchivedNote({ appId, name, onDetail }: { appId: string; name: string; onDetail?: (detail: AppDetailDto) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const restore = async () => {
    setBusy(true);
    setErr(null);
    try {
      onDetail?.(await api<AppDetailDto>(`/api/apps/${appId}`, { method: 'PATCH', body: { archived: false } }));
    } catch (e) {
      setErr(describeError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="make-ready-archived" data-testid="make-ready-archived">
      <p>
        <strong>{name} is archived.</strong> Its entries and its address are kept. Restore it to see it in My apps and add it to your home screen.
      </p>
      {onDetail ? (
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => void restore()} disabled={busy} data-testid="make-ready-restore">
          {busy ? 'Restoring…' : `Restore ${name}`}
        </button>
      ) : (
        <Link to="/apps" className="btn btn-secondary btn-sm">
          My apps
        </Link>
      )}
      {err && (
        <p className="make-ready-archived-error" role="alert">
          {err}
        </p>
      )}
    </div>
  );
}

/** What the card says beside the Example tag on Ready: the examples stay only until the person adds their own. */
export function readyExampleCaption(spec: AppSpec): string {
  return `Shown until you add your own ${hasExamplePhotos(spec) ? 'photos' : spec.entryNoun.plural}.`;
}

/**
 * The new app in its own colours: icon, name, its headline and a strip of what it holds. The person's
 * own entries when it has some (a photo or a follow-up carried over); otherwise labelled examples in
 * the app's own domain, the same ones its preview showed.
 */
function ReadyCard({ detail, records }: { detail: AppDetailDto; records: AppRecord[] | null }) {
  const { spec } = detail;
  const theme = useMemo(() => resolveTheme(spec), [spec]);
  const own = records && records.length > 0 ? records : null;
  const loading = records === null && detail.app.recordCount > 0;
  const examples = useMemo(() => (own || loading ? [] : previewRecords(spec, 3)), [own, loading, spec]);
  return (
    <div className="rt-root make-app-card" {...theme.attrs} style={theme.style as CSSProperties} data-testid="make-ready-card">
      <div className="make-app-card-head">
        <AppIcon icon={spec.icon} name={spec.name} size={44} title="" />
        <div className="make-app-card-text">
          <span className="make-app-card-name">{spec.name}</span>
          {spec.tagline && <span className="make-app-card-tagline">{spec.tagline}</span>}
        </div>
      </div>
      {loading ? <div className="make-strip make-strip-loading" aria-hidden="true" /> : <AppStrip spec={spec} records={own ?? examples} exampleCaption={own ? null : readyExampleCaption(spec)} />}
    </div>
  );
}

/** Copy app link, with copied feedback; when the clipboard is blocked, the link to copy by hand. */
function CopyLink({ link }: { link: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );
  const copy = async () => {
    const ok = await copyText(link);
    setState(ok ? 'copied' : 'failed');
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = ok ? window.setTimeout(() => setState('idle'), 2500) : null;
  };
  return (
    <div className="make-copy">
      <button type="button" className="btn-link make-copy-btn" onClick={() => void copy()} data-testid="make-ready-copy">
        {state === 'copied' ? Icons.check : Icons.link}
        <span>{state === 'copied' ? 'Link copied' : 'Copy app link'}</span>
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {state === 'copied' ? 'Link copied' : ''}
      </span>
      {state === 'failed' && (
        <label className="make-copy-manual">
          <span className="small">Copying was blocked. Select the link and copy it:</span>
          <input className="input" readOnly value={link} onFocus={(e) => e.currentTarget.select()} data-testid="make-ready-link" />
        </label>
      )}
    </div>
  );
}

// ---------- explore: steps, no app ----------

function ExploreFlow({ rec }: { rec: Recommendation }) {
  const steps = rec.explorationSteps ?? [];
  const storageKey = `explore-done:${rec.id}`;
  const [done, setDone] = useState<boolean[]>(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(storageKey) ?? '[]') as unknown;
      return steps.map((_, i) => Array.isArray(saved) && saved[i] === true);
    } catch {
      return steps.map(() => false);
    }
  });
  const toggle = (i: number) =>
    setDone((d) => {
      const next = d.map((v, j) => (j === i ? !v : v));
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        /* per-device convenience only */
      }
      return next;
    });
  const count = done.filter(Boolean).length;
  const offerApp = rec.pattern !== 'journal';
  return (
    <section className="mk-explore card card-pad" aria-labelledby="mk-explore-title">
      <div className="row-between">
        <h2 id="mk-explore-title" className="st-h2-sm">Steps</h2>
        {steps.length > 0 && <span className="small muted">{count} of {steps.length} done (kept on this device only)</span>}
      </div>
      {steps.length > 0 ? (
        <ol className="mk-steps" data-testid="make-explore-steps">
          {steps.map((s, i) => (
            <li key={i} className={done[i] ? 'is-done' : ''}>
              <label className="mk-step">
                <input type="checkbox" checked={Boolean(done[i])} onChange={() => toggle(i)} />
                <span className="mk-step-num" aria-hidden="true">{i + 1}</span>
                <span className="mk-step-text">{s}</span>
              </label>
            </li>
          ))}
        </ol>
      ) : (
        <p className="muted">No steps were written for this one.</p>
      )}
      <p className="mk-first">
        <strong>Start with:</strong> {rec.firstAction}
      </p>
      <p className="small muted">No app needed. Nothing here links to pages we did not get from you.</p>
      {offerApp && (
        <Link to="/agent" className="btn btn-ghost btn-wrap mk-explore-alt" data-testid="make-explore-ask">
          {Icons.agent} Prefer a tool for this? Ask the agent
        </Link>
      )}
    </section>
  );
}

// ---------- update_app: preview a change on an existing app, accept ----------

function UpdateFlow({ rec, detail }: { rec: Recommendation; detail: ProposalDetailDto }) {
  const { toast } = useToast();
  const target = detail.targetApp;
  const [preview, setPreview] = useState<(RevisionPreviewDto & { appId: string }) | null>(null);
  /** The planner found nothing it could safely change (200 with no ops, or 422): say so, offer a way forward. */
  const [nothing, setNothing] = useState<string | null>(null);
  const [phase, setPhase] = useState<'idle' | 'previewing' | 'accepting' | 'done'>('idle');
  const [err, setErr] = useState<string | null>(null);

  if (!target) {
    return (
      <div className="banner banner-warn" role="alert">
        <span>That app is no longer in your collection, so there is nothing to add this to.</span>
        <Link to="/apps" className="btn btn-secondary btn-sm">My apps</Link>
      </div>
    );
  }

  async function previewChange() {
    setPhase('previewing');
    setErr(null);
    setNothing(null);
    try {
      const p = await api<RevisionPreviewDto & { appId: string }>(`/api/recommendations/${rec.id}/update-preview`, { method: 'POST', body: {}, timeoutMs: 120_000 });
      if (!p.ops || p.ops.length === 0) {
        setPreview(null);
        setNothing(p.summary?.trim() || 'Nothing in this proposal maps to a change this app supports.');
      } else {
        setPreview(p);
      }
      setPhase('idle');
    } catch (e) {
      if (e instanceof ApiError && e.status === 422) setNothing(e.message || 'Nothing in this proposal maps to a change this app supports.');
      else setErr(describeError(e));
      setPhase('idle');
    }
  }

  async function accept() {
    if (!preview) return;
    setPhase('accepting');
    setErr(null);
    try {
      await api(`/api/apps/${preview.appId}/revisions/apply`, {
        method: 'POST',
        body: { ops: preview.ops, summary: preview.summary, baseVersion: preview.baseVersion, proposalId: preview.proposalId, recommendationId: rec.id },
      });
      // The apply step already marks the proposal; this is a best-effort confirmation for older servers.
      await api(`/api/recommendations/${rec.id}/applied`, { method: 'POST' }).catch(() => undefined);
      setPhase('done');
      // A revision only adds or reshapes; the server refuses anything that would strand an entry.
      toast(`Updated. Existing entries in ${target?.name ?? 'your app'} kept.`, { durationMs: 6000 });
    } catch (e) {
      setErr(e instanceof ApiError && e.code === 'stale_preview' ? `${e.message} Preview the change again.` : describeError(e));
      setPhase('idle');
      if (e instanceof ApiError && e.code === 'stale_preview') setPreview(null);
    }
  }

  const busy = phase === 'previewing' || phase === 'accepting';
  return (
    <section className="mk-update card card-pad" aria-labelledby="mk-update-title">
      <h2 id="mk-update-title" className="st-h2-sm">Add this to an app you have</h2>
      <div className="mk-target">
        <AppIcon icon={target.icon} name={target.name} size={48} title={`${target.name} icon`} />
        <div>
          <span className="eyebrow">Your app</span>
          <strong className="mk-target-name">{target.name}</strong>
          {target.tagline && <span className="small muted">{target.tagline}</span>}
        </div>
      </div>
      <div className="mk-change">
        <span className="eyebrow">Proposed change</span>
        <p>{rec.updateRequest ?? rec.description}</p>
      </div>
      {err && <ErrorBanner message={err} onRetry={preview ? undefined : () => void previewChange()} />}
      {phase === 'done' ? (
        <div className="banner banner-ok" data-testid="make-update-done">
          <span>
            Updated. Existing entries in {target.name} kept. Undo it from{' '}
            <Link to={`${appSettingsPath(target.id)}#history`} data-testid="make-update-history">
              History and undo
            </Link>{' '}
            in {target.name}.
          </span>
          <Link to={`/apps/${target.id}/`} className="btn btn-primary btn-sm" data-testid="make-update-open">Open {target.name}</Link>
        </div>
      ) : nothing ? (
        <div className="mk-rev" data-testid="make-update-nothing" role="status">
          <p className="mk-rev-summary">{nothing}</p>
          <p className="small muted">
            Nothing would change in {target.name}, so there is nothing to apply. The proposal stays here. You can ask for the change in your own words with Edit with Ori in {target.name}.
          </p>
          <div className="mk-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setNothing(null)}>Not now</button>
            <Link to={`/apps/${target.id}/?edit=1`} className="btn btn-primary" aria-label={`Edit ${target.name} with Ori`} data-testid="make-update-settings">Edit with Ori</Link>
          </div>
        </div>
      ) : preview ? (
        <div className="mk-rev" data-testid="make-update-result">
          <p className="mk-rev-summary">{preview.summary}</p>
          {preview.changes.length > 0 && (
            <ul className="mk-rev-changes">
              {preview.changes.map((c, i) => <li key={i}>{c}</li>)}
            </ul>
          )}
          {preview.unsupported.length > 0 && (
            <ul className="mk-rev-unsupported">
              {preview.unsupported.map((u, i) => (
                <li key={i}><strong>Not included:</strong> {u.request}. {u.reason} <span className="muted">Instead: {u.alternative}</span></li>
              ))}
            </ul>
          )}
          {preview.generatedBy === 'sample' && <span className="badge badge-sample">Sample mode</span>}
          <div className="mk-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setPreview(null)} disabled={busy}>Keep current version</button>
            <button type="button" className="btn btn-primary" data-testid="make-update-accept" onClick={() => void accept()} disabled={busy}>
              {phase === 'accepting' ? 'Applying…' : 'Apply change'}
            </button>
          </div>
        </div>
      ) : (
        <div className="mk-actions">
          <button type="button" className="btn btn-primary" data-testid="make-update-preview" onClick={() => void previewChange()} disabled={busy}>
            {phase === 'previewing' ? 'Previewing…' : 'Preview change'}
          </button>
        </div>
      )}
      {phase === 'previewing' && <p className="mk-state" role="status"><Spinner /><span>Working out a safe change for {target.name}…</span></p>}
    </section>
  );
}

// ---------- keep: a save stays a save ----------

// ---------- use_app: an app the person has already does this ----------

function UseFlow({ rec, detail }: { rec: Recommendation; detail: ProposalDetailDto }) {
  const target = detail.targetApp;
  if (!target || !rec.targetAppId) {
    return <ErrorBanner message="That app is no longer in your collection." />;
  }
  const to = rec.status === 'applied' ? `/apps/${rec.targetAppId}/` : `/apps/${rec.targetAppId}/?from=${rec.id}`;
  const draft = rec.recordDraft;
  return (
    <section className="mk-use card card-pad" aria-labelledby="mk-use-title">
      <h2 id="mk-use-title" className="st-h2-sm">{target.name} already does this</h2>
      <p className="muted">
        {draft
          ? 'It opens with the entry filled in for you to check. Nothing is saved until you save it there, and nothing about the app changes.'
          : 'Open it and start. Nothing about the app changes.'}
      </p>
      <div className="mk-actions">
        <Link to={to} className="btn btn-primary btn-lg" data-testid="make-use-open">{Icons.open} Open {target.name}</Link>
      </div>
    </section>
  );
}

function KeepFlow({ rec }: { rec: Recommendation }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const kept = rec.status === 'kept';
  async function keep() {
    setBusy(true);
    try {
      const res = await api<{ ok: boolean; forgotten?: number }>(`/api/recommendations/${rec.id}/keep`, { method: 'POST' });
      toast(res.forgotten ? 'Kept as a source. What I noted from it was taken out of your memory again.' : 'Kept. It stays a source; nothing else changes.');
      navigate('/agent');
    } catch (e) {
      toast(describeError(e), { kind: 'error' });
      setBusy(false);
    }
  }
  return (
    <section className="mk-keep card card-pad" aria-labelledby="mk-keep-title">
      <span className="mk-keep-icon" aria-hidden="true">{Icons.bookmark}</span>
      <h2 id="mk-keep-title" className="st-h2-sm">A save stays a save.</h2>
      <p className="muted">
        It stays as a source in <Link to="/settings/memory">What you've shared</Link>. No new interest is recorded and no app is made. You can forget it there whenever you like.
      </p>
      <div className="mk-actions">
        <button type="button" className="btn btn-primary" data-testid="make-keep" onClick={() => void keep()} disabled={busy || kept}>
          {kept ? 'Kept' : busy ? 'Keeping…' : 'Keep inspiration'}
        </button>
        <Link to="/agent" className="btn btn-ghost">Back to the agent</Link>
      </div>
    </section>
  );
}
