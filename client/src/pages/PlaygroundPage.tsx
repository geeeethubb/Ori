/**
 * Playground: "A little more you." (docs/ori/ORI_DESIGN_SPEC.md section 6, images 03 and 01).
 *
 * Visually varied ideas: a wide feature and smaller cards whose previews follow each idea's own
 * domain, one relevance sentence, a "Preview" pill and "Why this?" each. "Something unexpected" opens
 * an exploration the Playground really has (else a starter in the Agent); "Make something new" opens
 * the Agent composer. The filters mean something (Explore: ideas for interests; Everyday: useful
 * things) and only appear when both kinds exist. One small "Update app ideas" control (audit P2-01)
 * keeps the current cards readable while new ones are made (their Preview waits, because the server
 * replaces the whole open set when it finishes), and a failed update never swaps them for unlabelled
 * samples. Replies to things shared with the Agent stay in that conversation.
 */
import { BRAND } from '@shared/brand.ts';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import type { AppSummaryDto, ContextOverviewDto, RecommendationsDto } from '@shared/api.ts';
import type { Recommendation } from '@shared/context.ts';
import { api, ApiError, describeError } from '../api.ts';
import { useAuth } from '../auth.tsx';
import { OriCompanion } from '../components/ori/OriCompanion.tsx';
import { ErrorBanner, Icons, useToast } from '../components/ui.tsx';
import { ExampleTag, ModeBadge } from './parts/badges.tsx';
import { availableFilters, filterIdeas, pickFeature, playgroundIdeas, playgroundSpans, type PlaygroundFilter } from './parts/helpers.ts';
import { AddInterestForm } from './parts/MemoryParts.tsx';
import { MiniPreview } from './parts/MiniPreview.tsx';
import { MakeNewCard, PlayCard, ProposalSkeletons, UnexpectedCard, citedBy, onlyExampleGrounded } from './parts/ProposalBits.tsx';
import { useLoad } from './parts/useLoad.ts';
import { usePageTitle } from './parts/usePageTitle.ts';
import './pages.css';
import './playground.css';

interface PlaygroundData {
  recs: RecommendationsDto;
  context: ContextOverviewDto;
  apps: AppSummaryDto[];
}

interface ActionError {
  message: string;
  code: string;
}

const FILTER_LABELS: Record<PlaygroundFilter, string> = { for_you: 'For you', explore: 'Explore', everyday: 'Everyday' };
const MAKING = 'Ori is putting a few ideas together from what you shared…';

/**
 * Ideas an update swaps out: the server replaces every open idea (fresh or out of date) when the new
 * set is ready, so these wait instead of opening a preview that is about to go. Made apps stay.
 */
function replaced(rec: Recommendation): boolean {
  return rec.status === 'fresh' || rec.status === 'stale';
}

export function PlaygroundPage() {
  usePageTitle(`Playground · ${BRAND.name}`);
  const { user, refresh } = useAuth();
  const { toast } = useToast();
  const { data, error, loading, reload, setData } = useLoad<PlaygroundData>(async () => {
    const [recs, context, apps] = await Promise.all([
      api<RecommendationsDto>('/api/recommendations'),
      api<ContextOverviewDto>('/api/context'),
      api<{ apps: AppSummaryDto[] }>('/api/apps').catch(() => ({ apps: [] as AppSummaryDto[] })),
    ]);
    return { recs, context, apps: apps.apps };
  });
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<ActionError | null>(null);
  const [dismissing, setDismissing] = useState<string | null>(null);
  const [sampleBusy, setSampleBusy] = useState(false);
  const [filter, setFilter] = useState<PlaygroundFilter>('for_you');
  const autoRan = useRef(false);

  const generate = useCallback(async () => {
    setGenerating(true);
    setGenError(null);
    try {
      const [recs, context] = await Promise.all([
        api<RecommendationsDto>('/api/recommendations/generate', { method: 'POST', body: {}, timeoutMs: 120_000 }),
        api<ContextOverviewDto>('/api/context'),
      ]);
      setData((prev) => ({ recs, context, apps: prev?.apps ?? [] }));
    } catch (err) {
      if (err instanceof ApiError && err.isAuth) void refresh();
      // The ideas already on the page stay; nothing is swapped for unlabelled examples.
      setGenError({ message: describeError(err), code: err instanceof ApiError ? err.code : 'error' });
    } finally {
      setGenerating(false);
    }
  }, [setData, refresh]);

  const facts = useMemo(() => data?.context.facts ?? [], [data]);
  const captures = useMemo(() => data?.context.captures ?? [], [data]);
  const hasContext = facts.some((f) => f.status !== 'removed') || captures.length > 0;
  const ideas = useMemo(() => playgroundIdeas(data?.recs.recommendations ?? []), [data]);
  const filters = useMemo(() => availableFilters(ideas), [ideas]);
  const activeFilter: PlaygroundFilter = filters.includes(filter) ? filter : 'for_you';
  const factMap = useMemo(() => new Map(facts.map((f) => [f.id, f])), [facts]);
  const captureMap = useMemo(() => new Map(captures.map((c) => [c.id, c])), [captures]);
  const appsById = useMemo(() => new Map((data?.apps ?? []).map((a) => [a.id, a])), [data]);
  const exampleFactIds = useMemo(() => {
    const exampleSources = new Set((data?.context.sources ?? []).filter((s) => s.kind === 'sample').map((s) => s.id));
    return new Set(facts.filter((f) => f.sourceIds.some((id) => exampleSources.has(id))).map((f) => f.id));
  }, [data, facts]);

  // An exploration the Playground has becomes "Something unexpected"; the rest fill the grid, best first.
  const { cards, unexpected } = useMemo(() => {
    const shown = filterIdeas(ideas, activeFilter);
    const surprise = activeFilter === 'everyday' ? null : shown.find((r) => r.kind === 'explore' && r.status === 'fresh') ?? null;
    const rest = shown.filter((r) => r !== surprise);
    const featured = pickFeature(rest);
    return { cards: featured ? [featured, ...rest.filter((r) => r.id !== featured.id)] : rest, unexpected: surprise };
  }, [ideas, activeFilter]);
  const showUnexpected = activeFilter !== 'everyday';
  const spans = playgroundSpans(cards.length, showUnexpected ? 2 : 1);
  const mixed = new Set(ideas.map((r) => r.generatedBy)).size > 1;
  // Ideas from the example profile are labelled once for the page when they are all from it, else card by card.
  const allExample = ideas.length > 0 && ideas.every((r) => {
    const cited = citedBy(r, factMap, captureMap);
    return onlyExampleGrounded(cited.facts, cited.captures, exampleFactIds);
  });

  // First visit with something shared but no ideas yet: make them without a click (once).
  useEffect(() => {
    if (!data || autoRan.current) return;
    autoRan.current = true;
    if (ideas.length === 0 && hasContext) void generate();
  }, [data, ideas.length, hasContext, generate]);
  const aboutToAutoGenerate = Boolean(data) && !autoRan.current && ideas.length === 0 && hasContext;

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
      toast('Added. Ori is finding a few ideas…');
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
      // Already added is fine: make ideas from it anyway.
      if (!(err instanceof ApiError && err.status === 409)) {
        toast(describeError(err), { kind: 'error' });
        setSampleBusy(false);
        return;
      }
    }
    setSampleBusy(false);
    void generate();
  }

  const empty = (variant: 'no-context' | 'nothing') => (
    <section className="op-empty" data-testid="pg-empty" aria-labelledby="op-empty-title">
      <div className="op-empty-art" aria-hidden="true">
        <MiniPreview variant="stage" pattern="gallery" theme="paper" domain="photo" className="op-empty-mv" />
        <MiniPreview variant="stage" pattern="practice" theme="ink" domain="music" className="op-empty-mv" />
        <MiniPreview variant="stage" pattern="queue" theme="bright" domain="people" className="op-empty-mv" />
      </div>
      <div className="op-empty-body">
        <h2 id="op-empty-title">{variant === 'nothing' ? 'No ideas yet.' : 'Start with one thing you are into.'}</h2>
        <p className="op-empty-text">
          {variant === 'nothing'
            ? 'Update app ideas to try again, or add one more interest.'
            : 'One interest is enough; the Playground grows as you share more. Nothing is read from your accounts.'}
        </p>
        <AddInterestForm
          onAdd={addInterest}
          buttonLabel="Find ideas"
          testId="pg-add-interest-submit"
          inputTestId="pg-add-interest-input"
          placeholder="Film photography, learning guitar, keeping up with people…"
        />
        <div className="op-empty-alt">
          <Link to="/agent?start=new" className="btn btn-secondary">{Icons.agent} Share something with Ori</Link>
          <button type="button" className="btn btn-ghost" onClick={() => void trySample()} disabled={sampleBusy || generating} data-testid="pg-try-example">
            <ExampleTag /> Try the example profile
          </button>
        </div>
      </div>
    </section>
  );

  const hasCards = ideas.length > 0;
  let body: ReactNode;
  if (loading && !data) body = <ProposalSkeletons message="Opening your Playground…" />;
  else if (error && !data) body = <ErrorBanner message={error} onRetry={reload} />;
  else if (!hasCards && (generating || aboutToAutoGenerate || sampleBusy)) body = <ProposalSkeletons message={MAKING} testId="pg-loading" />;
  else if (!hasCards && genError?.code === 'no_context') body = empty('no-context');
  else if (!hasCards && genError && genError.code !== 'premium_paused') body = <ErrorBanner message={genError.message} onRetry={() => void generate()} retryLabel="Try again" />;
  else if (!hasCards) body = empty(hasContext ? 'nothing' : 'no-context');
  else {
    body = (
      <div className="opc-grid" data-testid="pg-grid" data-filter={activeFilter}>
        {cards.map((rec, i) => (
          <PlayCard
            key={rec.id}
            proposal={rec}
            feature={i === 0}
            span={spans.cards[i] ?? { lg: 2, md: 1, sm: 1 }}
            {...citedBy(rec, factMap, captureMap)}
            exampleFactIds={exampleFactIds}
            app={rec.targetAppId && appsById.get(rec.targetAppId) ? { name: appsById.get(rec.targetAppId)!.name, icon: appsById.get(rec.targetAppId)!.icon } : null}
            onDismiss={(r) => void dismiss(r)}
            dismissing={dismissing === rec.id}
            showProvenance={mixed}
            markExample={allExample ? false : undefined}
            replacing={generating && replaced(rec)}
            testIds={{ card: 'pg-card', action: 'pg-action', why: 'pg-why', dismiss: 'pg-dismiss' }}
          />
        ))}
        {showUnexpected && <UnexpectedCard proposal={unexpected} replacing={generating && unexpected !== null && replaced(unexpected)} span={spans.specials[0] ?? { lg: 3, md: 1, sm: 2 }} />}
        <MakeNewCard span={spans.specials[showUnexpected ? 1 : 0] ?? { lg: 3, md: 1, sm: 2 }} />
      </div>
    );
  }

  const mode = data?.recs.generatedBy ?? user?.modelMode ?? null;
  return (
    <div className="container op">
      <header className="op-head">
        <div className="op-head-text">
          <h1 className="op-title">A little more you.</h1>
          <p className="op-sub">Useful things. New interests. Yours to explore.</p>
        </div>
        <OriCompanion size={72} mood="idle" className="op-ori" />
      </header>

      <div className="op-tools">
        {filters.length > 0 && (
          <div className="op-filters" role="group" aria-label="Show ideas">
            {filters.map((f) => (
              <button key={f} type="button" className="op-chip" aria-pressed={activeFilter === f} onClick={() => setFilter(f)} data-testid={`pg-filter-${f}`}>
                {FILTER_LABELS[f]}
              </button>
            ))}
          </div>
        )}
        <span className="op-tools-spacer" />
        <ModeBadge mode={mode} testId="pg-sample-badge" />
        {/* Nothing to update until something is shared: the empty state says how to start instead. */}
        {(hasContext || hasCards) && (
          <button type="button" className="op-refresh" data-testid="pg-refresh" onClick={() => void generate()} disabled={generating || !hasContext || !data}>
            {generating ? <span className="spinner" aria-hidden="true" /> : Icons.refresh}
            {generating ? 'Updating…' : 'Update app ideas'}
          </button>
        )}
      </div>

      {hasCards && generating && (
        <p className="op-note" role="status" data-testid="pg-updating">Updating app ideas. You can read these meanwhile; Preview comes back when the new ones are ready.</p>
      )}
      {hasCards && !generating && data?.recs.stale && (
        <p className="op-note" role="status" data-testid="pg-stale">What you shared changed since these ideas were made. Update app ideas for ones that match.</p>
      )}
      {hasCards && genError?.code === 'premium_paused' && (
        <div className="banner banner-warn" role="alert">
          <span>Your free trial has ended, so new ideas are paused. You can still open and export your apps. <Link to="/pricing">See plans</Link></span>
        </div>
      )}
      {!hasCards && genError?.code === 'premium_paused' && (
        <div className="banner banner-warn" role="alert">
          <span>Your free trial has ended, so new ideas are paused. You can still open and export your apps. <Link to="/pricing">See plans</Link></span>
        </div>
      )}
      {hasCards && genError && genError.code !== 'premium_paused' && genError.code !== 'no_context' && (
        <ErrorBanner message={`Could not update app ideas: ${genError.message} The ideas below are the ones you had.`} onRetry={() => void generate()} />
      )}
      {data?.recs.generatedBy === 'sample' && user?.modelMode === 'anthropic' && !generating && hasCards && (
        <p className="op-note">These came from the built-in catalog{data.recs.fallbackReason ? ` (${data.recs.fallbackReason})` : ''}. Update app ideas to use live AI.</p>
      )}
      {allExample && !generating && (
        <p className="op-note op-example-note" data-testid="pg-example-note">
          <ExampleTag />
          <span>These ideas come from the example profile, not from anything about you. <Link to="/settings/memory">Remove it in What you've shared</Link>.</span>
        </p>
      )}
      {error && data && <ErrorBanner message={error} onRetry={reload} />}

      {body}
    </div>
  );
}
