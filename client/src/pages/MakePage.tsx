/**
 * Make mine (/make/:recId): the proposal, why it fits, then the one or two choices that matter,
 * a preview rendered by the REAL runtime with labelled example content, and "Make mine".
 * Explorations, updates to an existing app and "just keep it" live here too.
 */
import { BRAND } from '@shared/brand.ts';
import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import type { AppDetailDto, ProposalDetailDto, ProposalPreviewDto, RevisionPreviewDto } from '@shared/api.ts';
import { AppSpecSchema, type AppTheme } from '@shared/appSpec.ts';
import { READ_STATUS_LABELS, type Recommendation } from '@shared/context.ts';
import { api, ApiError, describeError } from '../api.ts';
import { useAuth } from '../auth.tsx';
import { AppIcon } from '../components/AppIcon.tsx';
import { Disclosure, ErrorBanner, Icons, Skeleton, Spinner, useToast } from '../components/ui.tsx';
import { AppPreview } from '../runtime/AppPreview.tsx';
import { FactStatusChip } from './parts/badges.tsx';
import { DEFAULT_MINUTES, LOOKS, MINUTE_CHOICES, PROPOSAL_KIND_LABELS, defaultLook, describeFields, describeRule, describeView, wantsTimeBudget } from './parts/helpers.ts';
import { useLoad } from './parts/useLoad.ts';
import { usePageTitle } from './parts/usePageTitle.ts';
import './pages.css';

type MakeState = 'idle' | 'planning' | 'generating' | 'validating' | 'ready' | 'failed';

interface ActionError {
  message: string;
  code: string;
}

const STATE_TEXT: Record<Exclude<MakeState, 'idle'>, string> = {
  planning: 'Planning: putting the proposal and your choices together.',
  generating: 'Generating the app definition…',
  validating: 'Validating the definition against the app contract…',
  ready: 'Ready. This is the real app, shown with example content.',
  failed: 'Could not design the app.',
};

const nextFrame = () => new Promise<void>((resolve) => window.setTimeout(resolve, 0));

export function MakePage() {
  const { recId } = useParams();
  const { data, error, loading, reload } = useLoad(() => api<ProposalDetailDto>(`/api/recommendations/${recId}`), [recId]);
  const rec = data?.recommendation;
  usePageTitle(rec ? `${rec.title} · ${BRAND.name}` : `Make mine · ${BRAND.name}`);

  if (!recId) return <Navigate to="/playground" replace />;

  if (loading && !data) {
    return (
      <div className="container-narrow stack-l mk" aria-busy="true">
        <Skeleton h={20} w="20%" />
        <div className="mk-head">
          <Skeleton h={64} w={64} style={{ borderRadius: 16 }} />
          <div className="stack" style={{ flex: 1 }}>
            <Skeleton h={14} w="20%" />
            <Skeleton h={36} w="60%" />
            <Skeleton h={20} w="80%" />
          </div>
        </div>
        <Skeleton h={120} />
        <Skeleton h={220} />
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

  const backTo = rec.captureId ? '/agent' : '/playground';
  return (
    <div className="container-narrow stack-l mk">
      <Link to={backTo} className="st-back" data-testid="make-back">{Icons.back} {rec.captureId ? 'Agent' : 'Playground'}</Link>

      <header className="mk-head">
        <AppIcon icon={rec.icon} size={64} title={`${rec.title} icon`} />
        <div className="mk-head-text">
          <span className="eyebrow">{PROPOSAL_KIND_LABELS[rec.kind]}</span>
          <h1 data-testid="make-title">{rec.title}</h1>
          <p className="lede">{rec.tagline}</p>
        </div>
      </header>

      <p className="mk-desc">{rec.description}</p>

      <section className="mk-why" aria-labelledby="mk-why-title">
        <h2 id="mk-why-title" className="st-h2-sm">Why it fits</h2>
        <p>{rec.reason}</p>
        {(data.evidence.length > 0 || data.captures.length > 0) && (
          <ul className="pc-evidence" data-testid="make-evidence">
            {data.captures.map((c) => (
              <li key={c.id}>
                <span className="pc-evidence-kind">{c.sourceLabel}</span>
                <span className="pc-evidence-text">{c.text || c.linkMeta?.title || c.url || 'Screenshot'}</span>
                <span className="pc-evidence-status">{READ_STATUS_LABELS[c.readStatus]}</span>
              </li>
            ))}
            {data.evidence.map((f) => (
              <li key={f.id}>
                <span className="pc-evidence-kind">From your memory</span>
                <span className="pc-evidence-text">{f.value}</span>
                <FactStatusChip status={f.status} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {rec.kind === 'new_app' && <NewAppFlow rec={rec} />}
      {rec.kind === 'explore' && <ExploreFlow rec={rec} />}
      {rec.kind === 'update_app' && <UpdateFlow rec={rec} detail={data} />}
      {rec.kind === 'keep' && <KeepFlow rec={rec} />}
    </div>
  );
}

// ---------- new_app: choices → real preview → Make mine ----------

function NewAppFlow({ rec }: { rec: Recommendation }) {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const wantsTime = wantsTimeBudget(rec);
  const [minutes, setMinutes] = useState<number>(DEFAULT_MINUTES);
  const [look, setLook] = useState<AppTheme>(() => defaultLook(rec));
  const [instructions, setInstructions] = useState('');
  const [state, setState] = useState<MakeState>('idle');
  const [draft, setDraft] = useState<ProposalPreviewDto | null>(null);
  const [draftKey, setDraftKey] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);
  const [err, setErr] = useState<ActionError | null>(null);
  const lastAction = useRef<(() => Promise<void>) | null>(null);
  const previewRef = useRef<HTMLElement>(null);

  const inputsKey = JSON.stringify({ minutes: wantsTime ? minutes : null, look, instructions: instructions.trim() });
  const draftCurrent = draft !== null && draftKey === inputsKey;
  const busy = building || state === 'planning' || state === 'generating' || state === 'validating';
  const built = rec.status === 'built' && Boolean(rec.builtAppId);

  useEffect(() => {
    if (state === 'ready' && previewRef.current) previewRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [state, draftKey]);

  function fail(e: unknown) {
    if (e instanceof ApiError && e.isAuth) void refresh();
    setErr({ message: describeError(e), code: e instanceof ApiError ? e.code : 'error' });
  }

  async function preview(): Promise<ProposalPreviewDto | null> {
    setErr(null);
    setState('planning');
    const body = { instructions: instructions.trim(), choices: { ...(wantsTime ? { timeBudgetMinutes: minutes } : {}), look } };
    try {
      await nextFrame();
      setState('generating');
      const d = await api<ProposalPreviewDto>(`/api/recommendations/${rec.id}/draft`, { method: 'POST', body, timeoutMs: 120_000 });
      setState('validating');
      await nextFrame();
      const parsed = AppSpecSchema.safeParse(d.spec);
      if (!parsed.success) throw new Error(`The app definition did not pass validation (${parsed.error.issues[0]?.message ?? 'invalid'}). Try the preview again.`);
      setDraft({ ...d, spec: parsed.data });
      setDraftKey(inputsKey);
      setState('ready');
      return d;
    } catch (e) {
      fail(e);
      setState('failed');
      return null;
    }
  }

  async function build(): Promise<void> {
    const d = draftCurrent ? draft : await preview();
    if (!d) return;
    setBuilding(true);
    setErr(null);
    try {
      const res = await api<AppDetailDto>(`/api/recommendations/${rec.id}/build`, {
        method: 'POST',
        body: { spec: d.spec, description: d.description, instructions: instructions.trim() },
        timeoutMs: 120_000,
      });
      navigate(`/apps/${res.app.id}/`, { replace: true });
    } catch (e) {
      fail(e);
      setBuilding(false);
    }
  }

  const runPreview = () => {
    lastAction.current = async () => {
      await preview();
    };
    void preview();
  };
  const runBuild = () => {
    lastAction.current = build;
    void build();
  };
  const retry = () => void lastAction.current?.();

  return (
    <>
      {built && (
        <div className="banner banner-ok">
          <span>You already made this one.</span>
          <Link to={`/apps/${rec.builtAppId}/`} className="btn btn-primary btn-sm" data-testid="make-open-built">Open app</Link>
        </div>
      )}

      <section className="mk-choices card card-pad" aria-labelledby="mk-choices-title">
        <div>
          <h2 id="mk-choices-title" className="st-h2-sm">Make it yours</h2>
          <p className="small muted">Only the choices that change the app. Everything else is designed for you and can change later with “Make this more me”.</p>
        </div>

        {wantsTime && (
          <fieldset className="mk-choice">
            <legend className="field-label">How long is a session?</legend>
            <div className="choice-chips" role="radiogroup" aria-label="Minutes per session">
              {MINUTE_CHOICES.map((m) => (
                <button key={m} type="button" role="radio" aria-checked={minutes === m} className="choice-chip" data-testid={`make-choice-minutes-${m}`} onClick={() => setMinutes(m)} disabled={busy}>
                  {Icons.timer} {m} min
                </button>
              ))}
            </div>
            <span className="field-help">Becomes the first timer preset. You can still pick another length each time.</span>
          </fieldset>
        )}

        <fieldset className="mk-choice">
          <legend className="field-label">Look</legend>
          <div className="choice-chips" role="radiogroup" aria-label="Look">
            {LOOKS.map((l) => (
              <button key={l.id} type="button" role="radio" aria-checked={look === l.id} className="choice-chip" data-testid={`make-choice-look-${l.id}`} onClick={() => setLook(l.id)} disabled={busy}>
                <span className="swatch" style={{ background: `linear-gradient(135deg, ${l.swatch[0]} 50%, ${l.swatch[1]} 50%)` }} aria-hidden="true" />
                {l.label}
              </button>
            ))}
          </div>
        </fieldset>

        <label className="field">
          <span className="field-label">Anything else? <span className="faint">(optional)</span></span>
          <textarea
            className="textarea mk-extra"
            data-testid="make-instructions"
            rows={2}
            placeholder="e.g. add a place to note what I learned"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            maxLength={1500}
            disabled={busy}
          />
        </label>
      </section>

      {draft && (
        <section className="mk-preview" ref={previewRef} aria-labelledby="mk-preview-title">
          <div className="mk-preview-head">
            <div>
              <h2 id="mk-preview-title" className="st-h2-sm">This is the real app</h2>
              <p className="muted">{draft.description}</p>
            </div>
            {draft.generatedBy === 'sample' && (
              <span className="badge badge-sample" title={draft.fallbackReason ?? 'Designed from the built-in catalog'}>Sample mode</span>
            )}
          </div>
          {!draftCurrent && (
            <div className="banner banner-warn">
              <span>Your choices changed since this preview. “Make mine” previews again with the new choices first.</span>
            </div>
          )}
          <AppPreview spec={draft.spec} records={draft.previewRecords} />
          {draft.unsupported.length > 0 && (
            <div className="mk-unsupported" data-testid="make-unsupported">
              <h3 className="small">Not included</h3>
              <ul>
                {draft.unsupported.map((u, i) => (
                  <li key={i}>
                    <span>
                      <strong>{u.request}</strong> — {u.reason}
                    </span>
                    <span className="muted">Instead: {u.alternative}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <Disclosure summary="What is inside" testId="make-inside">
            <ul className="mk-inside">
              {describeFields(draft.spec).map((f, i) => (
                <li key={`f-${i}`}>
                  <span>{f.label}{f.required ? ' (required)' : ''}</span>
                  <span className="faint">{f.type}</span>
                </li>
              ))}
              {draft.spec.views.map((v) => (
                <li key={v.id}><span>{describeView(draft.spec, v)}</span></li>
              ))}
              {draft.spec.rules.map((r) => (
                <li key={r.id}><span>{describeRule(r)}</span></li>
              ))}
            </ul>
          </Disclosure>
        </section>
      )}

      <div className="mk-bar" role="group" aria-label="Preview and make">
        {err &&
          (err.code === 'premium_paused' ? (
            <div className="banner banner-warn" role="alert">
              <span>Your trial has ended, so making apps is paused. You can still open and export your apps. <Link to="/pricing">See plans</Link></span>
            </div>
          ) : (
            <ErrorBanner message={err.message} onRetry={retry} retryTestId="make-retry" />
          ))}
        {state !== 'idle' && (
          <p className={`mk-state mk-state-${state}`} data-testid="make-state" data-state={state} role="status" aria-live="polite">
            {state === 'planning' || state === 'generating' || state === 'validating' ? <Spinner /> : state === 'ready' ? Icons.check2 : Icons.help}
            <span>{STATE_TEXT[state]}</span>
          </p>
        )}
        {building && (
          <p className="mk-state" role="status" aria-live="polite" data-testid="make-building">
            <Spinner />
            <span>Making it yours: saving the app at its own address…</span>
          </p>
        )}
        <div className="mk-actions">
          <button type="button" className="btn btn-secondary" data-testid="make-preview-button" onClick={runPreview} disabled={busy}>
            {draft ? 'Preview again' : 'Preview'}
          </button>
          <button type="button" className="btn btn-primary btn-lg" data-testid="make-mine" onClick={runBuild} disabled={busy}>
            {building ? 'Making it yours…' : 'Make mine'}
          </button>
        </div>
      </div>
    </>
  );
}

// ---------- explore: steps, no app ----------

function ExploreFlow({ rec }: { rec: Recommendation }) {
  const steps = rec.explorationSteps ?? [];
  const [done, setDone] = useState<boolean[]>(() => steps.map(() => false));
  const toggle = (i: number) => setDone((d) => d.map((v, j) => (j === i ? !v : v)));
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
        body: { ops: preview.ops, summary: preview.summary, baseVersion: preview.baseVersion, proposalId: preview.proposalId },
      });
      await api(`/api/recommendations/${rec.id}/applied`, { method: 'POST' });
      setPhase('done');
      toast(`Added to ${target?.name ?? 'your app'}. Its entries are untouched; undo lives in the app's settings.`, { durationMs: 6000 });
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
        <AppIcon icon={target.icon} size={48} title={`${target.name} icon`} />
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
          <span>Added to {target.name}. Entries are kept; undo is in the app's settings.</span>
          <Link to={`/apps/${target.id}/`} className="btn btn-primary btn-sm" data-testid="make-update-open">Open app</Link>
        </div>
      ) : nothing ? (
        <div className="mk-rev" data-testid="make-update-nothing" role="status">
          <p className="mk-rev-summary">{nothing}</p>
          <p className="small muted">
            Nothing would change in {target.name}, so there is nothing to accept. The proposal stays here. You can phrase the change in your own words from the app's settings, under “Make this more me”.
          </p>
          <div className="mk-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setNothing(null)}>Not now</button>
            <Link to={`/apps/${target.id}/settings`} className="btn btn-primary" data-testid="make-update-settings">Phrase it in the app's settings</Link>
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
            <button type="button" className="btn btn-ghost" onClick={() => setPreview(null)} disabled={busy}>Not now</button>
            <button type="button" className="btn btn-primary" data-testid="make-update-accept" onClick={() => void accept()} disabled={busy}>
              {phase === 'accepting' ? 'Applying…' : 'Accept'}
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

function KeepFlow({ rec }: { rec: Recommendation }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const kept = rec.status === 'kept';
  async function keep() {
    setBusy(true);
    try {
      await api(`/api/recommendations/${rec.id}/keep`, { method: 'POST' });
      toast('Kept. It stays a source; nothing else changes.');
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
          {kept ? 'Kept' : busy ? 'Keeping…' : 'Keep'}
        </button>
        <Link to="/agent" className="btn btn-ghost">Back to the agent</Link>
      </div>
    </section>
  );
}
