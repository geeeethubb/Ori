/**
 * Playground: "A few things you might be into." An editorial grid (one featured proposal plus
 * smaller cards) with mini previews, one sentence of reason, one action, and a quiet "Why this?".
 * No blank wall: one interest, one shared inspiration or one labelled example is enough to start.
 */
import { BRAND } from '@shared/brand.ts';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import type { CaptureResultDto, ContextOverviewDto, RecommendationsDto } from '@shared/api.ts';
import type { Capture, ProfileFact, Recommendation } from '@shared/context.ts';
import { api, ApiError, describeError } from '../api.ts';
import { useAuth } from '../auth.tsx';
import { ErrorBanner, Icons, useToast } from '../components/ui.tsx';
import { ExampleTag, ModeBadge } from './parts/badges.tsx';
import { pickFeatured } from './parts/helpers.ts';
import { AddInterestForm } from './parts/MemoryParts.tsx';
import { MiniPreview } from './parts/MiniPreview.tsx';
import { ProposalCard, ProposalSkeletons } from './parts/ProposalBits.tsx';
import { useLoad } from './parts/useLoad.ts';
import { usePageTitle } from './parts/usePageTitle.ts';
import './pages.css';

interface PlaygroundData {
  recs: RecommendationsDto;
  context: ContextOverviewDto;
}

interface ActionError {
  message: string;
  code: string;
}

const THINKING = 'Looking at what you shared and putting a few possibilities together…';

export function PlaygroundPage() {
  usePageTitle(`Playground · ${BRAND.name}`);
  const { user, refresh } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { data, error, loading, reload, setData } = useLoad<PlaygroundData>(async () => {
    const [recs, context] = await Promise.all([api<RecommendationsDto>('/api/recommendations'), api<ContextOverviewDto>('/api/context')]);
    return { recs, context };
  });
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<ActionError | null>(null);
  const [dismissing, setDismissing] = useState<string | null>(null);
  const [quick, setQuick] = useState('');
  const [sharing, setSharing] = useState(false);
  const [sampleBusy, setSampleBusy] = useState(false);
  const autoRan = useRef(false);

  const generate = useCallback(async () => {
    setGenerating(true);
    setGenError(null);
    try {
      const [recs, context] = await Promise.all([
        api<RecommendationsDto>('/api/recommendations/generate', { method: 'POST', body: {}, timeoutMs: 120_000 }),
        api<ContextOverviewDto>('/api/context'),
      ]);
      setData({ recs, context });
    } catch (err) {
      if (err instanceof ApiError && err.isAuth) void refresh();
      setGenError({ message: describeError(err), code: err instanceof ApiError ? err.code : 'error' });
    } finally {
      setGenerating(false);
    }
  }, [setData, refresh]);

  const facts = data?.context.facts ?? [];
  const captures = data?.context.captures ?? [];
  const hasContext = facts.some((f) => f.status !== 'removed') || captures.length > 0;
  const all = data?.recs.recommendations ?? [];
  const visible = useMemo(() => all.filter((r) => r.kind !== 'keep'), [all]);
  const ordered = useMemo(() => {
    const featured = pickFeatured(visible);
    return featured ? [featured, ...visible.filter((r) => r.id !== featured.id)] : visible;
  }, [visible]);
  const factMap = useMemo(() => new Map(facts.map((f) => [f.id, f])), [facts]);
  const captureMap = useMemo(() => new Map(captures.map((c) => [c.id, c])), [captures]);

  // First visit with context but no proposals yet: start without a click.
  useEffect(() => {
    if (!data || autoRan.current) return;
    autoRan.current = true;
    if (visible.length === 0 && hasContext) void generate();
  }, [data, visible.length, hasContext, generate]);
  const aboutToAutoGenerate = Boolean(data) && !autoRan.current && visible.length === 0 && hasContext;

  async function dismiss(rec: Recommendation) {
    setDismissing(rec.id);
    try {
      await api(`/api/recommendations/${rec.id}/dismiss`, { method: 'POST' });
      setData((prev) => (prev ? { ...prev, recs: { ...prev.recs, recommendations: prev.recs.recommendations.filter((r) => r.id !== rec.id) } } : prev));
      toast('Left out. That is not recorded as a fact about you.');
    } catch (err) {
      toast(describeError(err), { kind: 'error' });
    } finally {
      setDismissing(null);
    }
  }

  async function addInterest(interest: string): Promise<boolean> {
    try {
      await api('/api/context/interests', { method: 'POST', body: { interest } });
      toast('Added. Finding a few possibilities…');
      void generate();
      return true;
    } catch (err) {
      toast(describeError(err), { kind: 'error' });
      return false;
    }
  }

  async function trySample() {
    setSampleBusy(true);
    try {
      await api('/api/context/sample', { method: 'POST', body: { profile: 'founder-photographer' }, timeoutMs: 90_000 });
    } catch (err) {
      // Already added is fine: generate from it anyway.
      if (!(err instanceof ApiError && err.status === 409)) {
        toast(describeError(err), { kind: 'error' });
        setSampleBusy(false);
        return;
      }
    }
    setSampleBusy(false);
    void generate();
  }

  async function quickShare(e: FormEvent) {
    e.preventDefault();
    const value = quick.trim();
    if (!value || sharing) return;
    setSharing(true);
    try {
      const isUrl = /^https?:\/\/\S+$/i.test(value);
      const res = await api<CaptureResultDto>('/api/agent/captures', { method: 'POST', body: isUrl ? { url: value } : { text: value }, timeoutMs: 120_000 });
      if (res.error) toast(res.error, { kind: 'error', durationMs: 8000 });
      navigate('/agent');
    } catch (err) {
      toast(describeError(err), { kind: 'error' });
      setSharing(false);
    }
  }

  const empty = (variant: 'no-context' | 'nothing') => (
    <section className="pg-empty" data-testid="pg-empty" aria-labelledby="pg-empty-title">
      <div className="pg-empty-art" aria-hidden="true">
        <MiniPreview pattern="practice" theme="ink" />
        <MiniPreview pattern="gallery" theme="paper" />
        <MiniPreview pattern="queue" theme="mint" />
      </div>
      <div className="pg-empty-body">
        <h2 id="pg-empty-title">{variant === 'nothing' ? 'Nothing to show yet.' : 'Start with one thing you are into.'}</h2>
        <p className="muted">
          {variant === 'nothing'
            ? 'Refresh to try again, or add one more interest below.'
            : 'One interest is enough; the Playground grows as you share more. Nothing is read from your accounts.'}
        </p>
        <AddInterestForm onAdd={addInterest} buttonLabel="Find ideas" testId="pg-add-interest-submit" inputTestId="pg-add-interest-input" placeholder="e.g. film photography, learning guitar, keeping up with people I meet" />
        <div className="pg-empty-alt">
          <Link to="/agent" className="btn btn-secondary">{Icons.agent} Share an inspiration</Link>
          <button type="button" className="btn btn-ghost" onClick={() => void trySample()} disabled={sampleBusy || generating} data-testid="pg-try-example">
            <ExampleTag /> Try a labelled example
          </button>
          {variant === 'nothing' && (
            <button type="button" className="btn btn-ghost" onClick={() => void generate()} disabled={generating}>
              {Icons.refresh} Refresh
            </button>
          )}
        </div>
      </div>
    </section>
  );

  let body: ReactNode;
  if (loading && !data) body = <ProposalSkeletons message="Loading your playground…" />;
  else if (error && !data) body = <ErrorBanner message={error} onRetry={reload} />;
  else if (generating || aboutToAutoGenerate || sampleBusy) body = <ProposalSkeletons message={THINKING} testId="pg-loading" />;
  else if (genError?.code === 'premium_paused') {
    body = (
      <div className="banner banner-warn" role="alert">
        <span>Your free trial has ended, so new proposals are paused. You can still open and export your apps. <Link to="/pricing">See plans</Link></span>
      </div>
    );
  } else if (genError?.code === 'no_context') body = empty('no-context');
  else if (genError) body = <ErrorBanner message={genError.message} onRetry={() => void generate()} />;
  else if (ordered.length === 0) body = empty(hasContext ? 'nothing' : 'no-context');
  else {
    body = (
      <div className="pg-grid" data-testid="pg-grid">
        {ordered.map((rec, i) => (
          <ProposalCard
            key={rec.id}
            proposal={rec}
            variant={i === 0 ? 'featured' : 'grid'}
            featuredTestId={i === 0 ? 'pg-featured' : undefined}
            facts={rec.evidenceFactIds.map((id) => factMap.get(id)).filter((f): f is ProfileFact => Boolean(f))}
            captures={rec.sourceCaptureIds.map((id) => captureMap.get(id)).filter((c): c is Capture => Boolean(c))}
            testIds={{ card: 'pg-card', action: 'pg-action', why: 'pg-why', dismiss: 'pg-dismiss' }}
            onDismiss={(r) => void dismiss(r)}
            dismissing={dismissing === rec.id}
          />
        ))}
      </div>
    );
  }

  const mode = data?.recs.generatedBy ?? user?.modelMode ?? null;

  return (
    <div className="container pg">
      <header className="pg-head">
        <div className="pg-head-text">
          <h1>A few things you might be into.</h1>
          <p className="muted">Grounded in what you shared. Explore one, make it yours, or add it to an app you already have.</p>
        </div>
        <div className="pg-head-actions">
          <ModeBadge mode={mode} testId="pg-sample-badge" />
          <button type="button" className="btn btn-secondary" data-testid="pg-refresh" onClick={() => void generate()} disabled={generating || !hasContext || !data}>
            {Icons.refresh} Refresh
          </button>
        </div>
      </header>

      <form className="pg-composer" onSubmit={(e) => void quickShare(e)} aria-label="Share something with the agent">
        <span className="pg-composer-icon" aria-hidden="true">{Icons.agent}</span>
        <input
          className="pg-composer-input"
          data-testid="pg-capture-input"
          placeholder="What caught your attention?"
          aria-label="What caught your attention?"
          value={quick}
          onChange={(e) => setQuick(e.target.value)}
          maxLength={4000}
          disabled={sharing}
        />
        {quick.trim() ? (
          <button type="submit" className="btn btn-primary btn-sm" data-testid="pg-capture-send" disabled={sharing}>
            {sharing ? 'Sharing…' : 'Share'}
          </button>
        ) : (
          <Link to="/agent" className="btn btn-ghost btn-sm pg-composer-link" data-testid="pg-open-agent">
            <span className="pg-composer-link-text">Open the agent</span> {Icons.arrowRight}
          </Link>
        )}
      </form>

      {data?.recs.stale && !generating && (
        <div className="banner banner-info" role="status" data-testid="pg-stale">
          <span>What you shared changed since these were made. Refresh for proposals that match.</span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void generate()}>Refresh</button>
        </div>
      )}
      {data?.recs.generatedBy === 'sample' && user?.modelMode === 'anthropic' && !generating && ordered.length > 0 && (
        <p className="tiny faint">These came from the built-in catalog{data.recs.fallbackReason ? ` (${data.recs.fallbackReason})` : ''}. Refresh to use live AI.</p>
      )}
      {error && data && <ErrorBanner message={error} onRetry={reload} />}

      {body}
    </div>
  );
}
