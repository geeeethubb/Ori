import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import type { ContextOverviewDto, RecommendationsDto } from '@shared/api.ts';
import type { Recommendation } from '@shared/context.ts';
import { api, ApiError, describeError } from '../api.ts';
import { useAuth } from '../auth.tsx';
import { EmptyState, ErrorBanner, useToast } from '../components/ui.tsx';
import { ModeBadge } from './parts/badges.tsx';
import { AddInterestForm } from './parts/ContextParts.tsx';
import { RecCard, RecCardSkeletons } from './parts/RecCard.tsx';
import { useLoad } from './parts/useLoad.ts';
import { usePageTitle } from './parts/usePageTitle.ts';
import './pages.css';

interface ForYouData {
  recs: RecommendationsDto;
  context: ContextOverviewDto;
}

interface ActionError {
  message: string;
  code: string;
}

const THINKING = 'Reading your context and thinking about apps for you… about 20 seconds.';

export function ForYouPage() {
  usePageTitle('For You · AI App Store');
  const { user, refresh } = useAuth();
  const { toast } = useToast();
  const { data, error, loading, reload, setData } = useLoad<ForYouData>(async () => {
    const [recs, context] = await Promise.all([api<RecommendationsDto>('/api/recommendations'), api<ContextOverviewDto>('/api/context')]);
    return { recs, context };
  });
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<ActionError | null>(null);
  const [dismissing, setDismissing] = useState<string | null>(null);
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

  // First visit with context but no recommendations yet: start generating without a click.
  useEffect(() => {
    if (!data || autoRan.current) return;
    autoRan.current = true;
    if (data.recs.recommendations.length === 0 && data.context.facts.length > 0) void generate();
  }, [data, generate]);

  const recs = data?.recs.recommendations ?? [];
  const hasContext = (data?.context.facts.length ?? 0) > 0;
  const factMap = useMemo(() => new Map((data?.context.facts ?? []).map((f) => [f.id, f])), [data]);
  const aboutToAutoGenerate = Boolean(data) && !autoRan.current && recs.length === 0 && hasContext;

  async function dismiss(rec: Recommendation) {
    setDismissing(rec.id);
    try {
      await api(`/api/recommendations/${rec.id}/dismiss`, { method: 'POST' });
      setData((prev) => (prev ? { ...prev, recs: { ...prev.recs, recommendations: prev.recs.recommendations.filter((r) => r.id !== rec.id) } } : prev));
      toast('Okay, we will leave that one out.');
    } catch (err) {
      toast(describeError(err), { kind: 'error' });
    } finally {
      setDismissing(null);
    }
  }

  async function exploreNew(interest: string): Promise<boolean> {
    try {
      await api('/api/context/interests', { method: 'POST', body: { interest } });
      toast('Added. Finding apps around it…');
      void generate();
      return true;
    } catch (err) {
      toast(describeError(err), { kind: 'error' });
      return false;
    }
  }

  const noContextEmpty = (
    <EmptyState
      title="Start with your context"
      body="Bring a profile from your AI, upload a file or write a few lines, and we will find apps for your work and your curiosity."
      action={
        <Link to="/import" className="btn btn-primary" data-testid="recs-import">
          Bring your context
        </Link>
      }
    />
  );

  let body: ReactNode;
  if (loading && !data) body = <RecCardSkeletons message="Loading your recommendations…" />;
  else if (error && !data) body = <ErrorBanner message={error} onRetry={reload} />;
  else if (generating || aboutToAutoGenerate) body = <RecCardSkeletons message={THINKING} testId="recs-loading" />;
  else if (genError?.code === 'no_context') body = noContextEmpty;
  else if (genError?.code === 'premium_paused') {
    body = (
      <div className="banner banner-warn" role="alert">
        <span>
          Your free trial has ended, so new recommendations are paused. You can still open and export your apps. <Link to="/pricing">See plans</Link>
        </span>
      </div>
    );
  } else if (genError) body = <ErrorBanner message={genError.message} onRetry={() => void generate()} />;
  else if (recs.length === 0 && !hasContext) body = noContextEmpty;
  else if (recs.length === 0) {
    body = (
      <EmptyState
        title="Nothing to show yet"
        body="Try refreshing, or tell us an interest below."
        action={
          <button type="button" className="btn btn-primary" onClick={() => void generate()}>
            Refresh recommendations
          </button>
        }
      />
    );
  } else {
    body = (
      <div className="grid st-rec-grid" data-testid="recs-grid">
        {recs.map((rec) => (
          <RecCard key={rec.id} rec={rec} facts={factMap} onDismiss={(r) => void dismiss(r)} busy={dismissing === rec.id} />
        ))}
      </div>
    );
  }

  return (
    <div className="container stack-l">
      <header className="st-page-head">
        <div className="st-head-row">
          <div>
            <h1>{user?.displayName ? `For you, ${user.displayName}` : 'For you'}</h1>
            <p className="lede">Apps that fit your workflows and your curiosity.</p>
          </div>
          <div className="row">
            <ModeBadge mode={user?.modelMode} />
            <button type="button" className="btn btn-secondary" data-testid="recs-refresh" onClick={() => void generate()} disabled={generating || !hasContext}>
              Refresh
            </button>
          </div>
        </div>
      </header>

      {data?.recs.stale && !generating && (
        <div className="banner banner-info" role="status" data-testid="recs-stale">
          <span>Your context changed. Refresh to get recommendations that match.</span>
          <button type="button" className="btn btn-secondary" onClick={() => void generate()}>
            Refresh recommendations
          </button>
        </div>
      )}
      {error && data && <ErrorBanner message={error} onRetry={reload} />}

      {body}

      {hasContext && (
        <section className="card card-pad st-explore">
          <h2 className="st-h2-sm">Explore something new</h2>
          <p className="small muted">Tell us an interest you want to start, even if nothing above shows it yet.</p>
          <AddInterestForm
            onAdd={exploreNew}
            buttonLabel="Find apps for this"
            testId="recs-explore-submit"
            inputTestId="recs-explore-input"
            placeholder="e.g. birdwatching, learning Italian, a weekly dinner with friends"
          />
        </section>
      )}
    </div>
  );
}
