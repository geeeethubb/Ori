import { useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import type { AppDetailDto } from '@shared/api.ts';
import type { ProfileFact, Recommendation } from '@shared/context.ts';
import { api, ApiError, describeError } from '../api.ts';
import { useAuth } from '../auth.tsx';
import { AppIcon } from '../components/AppIcon.tsx';
import { ErrorBanner, Icons, Skeleton, Spinner } from '../components/ui.tsx';
import { FactStatusChip, PurposeBadge } from './parts/badges.tsx';
import { DraftPreview, type DraftDto } from './parts/DraftPreview.tsx';
import { useLoad } from './parts/useLoad.ts';
import { usePageTitle } from './parts/usePageTitle.ts';
import './pages.css';

interface RecommendationDetail {
  recommendation: Recommendation;
  evidence: ProfileFact[];
}

interface ActionError {
  message: string;
  code: string;
}

const SUGGESTIONS = {
  explore: ['Add a weekly challenge', 'Add a reflection field', 'Track a rating'],
  work: ['Add a due date and highlight overdue items', "Add a 'next step' field", 'Add a priority choice'],
} as const;

export function RecommendationPage() {
  const { recId } = useParams();
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const { data, error, loading, reload } = useLoad(() => api<RecommendationDetail>(`/api/recommendations/${recId}`), [recId]);
  const rec = data?.recommendation;
  usePageTitle(rec ? `${rec.title} · AI App Store` : 'App detail · AI App Store');

  const [instructions, setInstructions] = useState('');
  const [draft, setDraft] = useState<DraftDto | null>(null);
  const [draftFor, setDraftFor] = useState<string | null>(null);
  const [phase, setPhase] = useState<'idle' | 'drafting' | 'building'>('idle');
  const [actError, setActError] = useState<ActionError | null>(null);
  const lastAction = useRef<(() => Promise<void>) | null>(null);

  if (!recId) return <Navigate to="/for-you" replace />;

  const busy = phase !== 'idle';
  const draftIsCurrent = draft !== null && draftFor === instructions;

  function failed(err: unknown) {
    if (err instanceof ApiError && err.isAuth) void refresh();
    setActError({ message: describeError(err), code: err instanceof ApiError ? err.code : 'error' });
  }

  async function preview(): Promise<DraftDto | null> {
    setPhase('drafting');
    setActError(null);
    try {
      const d = await api<DraftDto>(`/api/recommendations/${recId}/draft`, { method: 'POST', body: { instructions }, timeoutMs: 120_000 });
      setDraft(d);
      setDraftFor(instructions);
      return d;
    } catch (err) {
      failed(err);
      return null;
    } finally {
      setPhase('idle');
    }
  }

  async function build(): Promise<void> {
    // Without a current preview, design the app first, then build it in one go.
    const d = draftIsCurrent ? draft : await preview();
    if (!d) return;
    setPhase('building');
    setActError(null);
    try {
      const res = await api<AppDetailDto>(`/api/recommendations/${recId}/build`, {
        method: 'POST',
        body: { spec: d.spec, description: d.description, instructions },
        timeoutMs: 120_000,
      });
      navigate(`/apps/${res.app.id}/`, { replace: true });
    } catch (err) {
      failed(err);
      setPhase('idle');
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
  const appendSuggestion = (text: string) => setInstructions((prev) => (prev.trim() ? `${prev.trimEnd()}\n${text}` : text));

  if (loading && !data) {
    return (
      <div className="container-narrow stack-l" aria-busy="true">
        <Skeleton h={20} w="20%" />
        <div className="st-detail-head">
          <Skeleton h={72} w={72} style={{ borderRadius: 16 }} />
          <div className="stack" style={{ flex: 1 }}>
            <Skeleton h={36} w="60%" />
            <Skeleton h={20} w="80%" />
          </div>
        </div>
        <Skeleton h={120} />
        <Skeleton h={200} />
      </div>
    );
  }
  if (!rec) {
    return (
      <div className="container-narrow stack-l">
        <Link to="/for-you" className="st-back">{Icons.back}For You</Link>
        <ErrorBanner message={error ?? 'We could not find that recommendation.'} onRetry={reload} />
      </div>
    );
  }

  const suggestions = SUGGESTIONS[rec.purpose];
  const built = rec.status === 'built' && Boolean(rec.builtAppId);

  return (
    <div className="container-narrow stack-l">
      <Link to="/for-you" className="st-back" data-testid="rec-back">{Icons.back}For You</Link>

      <header className="st-detail-head">
        <AppIcon icon={rec.icon} size={72} title={rec.title} />
        <div className="st-detail-title">
          <div className="row" style={{ gap: 8 }}>
            <PurposeBadge purpose={rec.purpose} />
            {built && <span className="badge badge-ok">Built</span>}
          </div>
          <h1>{rec.title}</h1>
          <p className="lede">{rec.tagline}</p>
        </div>
      </header>

      <p>{rec.description}</p>

      <section className="card card-pad stack" aria-labelledby="st-why-title">
        <h2 id="st-why-title" className="st-h2-sm">Why this fits you</h2>
        <p>{rec.reason}</p>
        {data.evidence.length > 0 && (
          <ul className="st-evidence" data-testid="rec-evidence">
            {data.evidence.map((f) => (
              <li key={f.id}>
                <span className="st-fact-value">{f.value}</span>
                <FactStatusChip status={f.status} />
              </li>
            ))}
          </ul>
        )}
        <p className="small">
          <strong>First thing you'll do:</strong> {rec.firstAction}
        </p>
      </section>

      {built && (
        <div className="banner banner-ok">
          <span>You already built this one.</span>
          <Link to={`/apps/${rec.builtAppId}/`} className="btn btn-primary" data-testid="rec-open-app">
            Open app
          </Link>
        </div>
      )}

      <section className="card card-pad stack" aria-labelledby="st-make-title">
        <h2 id="st-make-title" className="st-h2-sm">Make it yours</h2>
        <p className="small muted">Tell us how you would use it, in your own words. Optional.</p>
        <div className="st-suggestions" aria-label="Quick suggestions">
          {suggestions.map((s) => (
            <button key={s} type="button" onClick={() => appendSuggestion(s)} disabled={busy}>
              {s}
            </button>
          ))}
        </div>
        <textarea
          className="textarea"
          data-testid="build-instructions"
          placeholder="e.g. Make it a weekly challenge and add a place to note what I learned"
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          rows={4}
          maxLength={1500}
          disabled={busy}
        />
        {actError &&
          (actError.code === 'premium_paused' ? (
            <div className="banner banner-warn" role="alert">
              <span>
                Your free trial has ended, so building is paused. You can still open and export your apps. <Link to="/pricing">See plans</Link>
              </span>
            </div>
          ) : (
            <ErrorBanner message={actError.message} onRetry={() => void lastAction.current?.()} />
          ))}
        {phase === 'drafting' && (
          <div className="st-status muted" role="status" aria-live="polite" data-testid="build-drafting">
            <Spinner />
            <span>Designing your app… 15–40 seconds</span>
          </div>
        )}
        {phase === 'building' && (
          <div className="st-status muted" role="status" aria-live="polite" data-testid="build-building">
            <Spinner />
            <span>Building and saving your app…</span>
          </div>
        )}
        <div className="st-build-actions">
          <button type="button" className="btn btn-secondary" data-testid="build-preview" onClick={runPreview} disabled={busy}>
            Preview my app
          </button>
          {!draft && (
            <button type="button" className="btn btn-primary" data-testid="build-confirm" onClick={runBuild} disabled={busy}>
              Build this for me
            </button>
          )}
        </div>
      </section>

      {draft && <DraftPreview draft={draft} stale={!draftIsCurrent} onBuild={runBuild} building={busy} />}
    </div>
  );
}
