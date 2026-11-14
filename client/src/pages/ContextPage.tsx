import { BRAND } from '@shared/brand.ts';
import { useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router';
import type { ContextOverviewDto } from '@shared/api.ts';
import { FACT_CATEGORIES, FACT_CATEGORY_LABELS, type ProfileFact } from '@shared/context.ts';
import { api, describeError } from '../api.ts';
import { EmptyState, ErrorBanner, Skeleton, useToast } from '../components/ui.tsx';
import { AddInterestForm, ConflictCard, FactRow, SourceRow } from './parts/ContextParts.tsx';
import { pluralize } from './parts/helpers.ts';
import { useLoad } from './parts/useLoad.ts';
import { usePageTitle } from './parts/usePageTitle.ts';
import './pages.css';

export function ContextPage() {
  usePageTitle(`What you've shared · ${BRAND.name}`);
  const { toast } = useToast();
  const location = useLocation();
  const importNote = (location.state as { note?: string | null } | null)?.note ?? null;
  const [noteDismissed, setNoteDismissed] = useState(false);
  const { data, error, loading, reload, setData } = useLoad(() => api<ContextOverviewDto>('/api/context'));

  const facts = useMemo(() => (data?.facts ?? []).filter((f) => f.status !== 'removed'), [data]);
  const sources = data?.sources ?? [];
  const sourceById = useMemo(() => new Map(sources.map((s) => [s.id, s])), [sources]);

  const conflictGroups = useMemo(() => {
    const groups = new Map<string, ProfileFact[]>();
    for (const f of facts) {
      if (f.status === 'conflict' && f.conflictGroup) groups.set(f.conflictGroup, [...(groups.get(f.conflictGroup) ?? []), f]);
    }
    return [...groups.entries()].filter(([, group]) => group.length > 1);
  }, [facts]);
  const inConflictGroup = useMemo(() => new Set(conflictGroups.flatMap(([, group]) => group.map((f) => f.id))), [conflictGroups]);
  const grouped = useMemo(
    () =>
      FACT_CATEGORIES.map((category) => ({
        category,
        label: FACT_CATEGORY_LABELS[category],
        facts: facts.filter((f) => f.category === category && !inConflictGroup.has(f.id)),
      })).filter((g) => g.facts.length > 0),
    [facts, inConflictGroup],
  );

  const replaceFact = (fact: ProfileFact) => setData((prev) => (prev ? { ...prev, facts: prev.facts.map((f) => (f.id === fact.id ? fact : f)) } : prev));
  const dropFact = (id: string) => setData((prev) => (prev ? { ...prev, facts: prev.facts.filter((f) => f.id !== id) } : prev));
  const fail = (err: unknown) => toast(describeError(err), { kind: 'error' });

  async function editFact(fact: ProfileFact, value: string): Promise<boolean> {
    try {
      const res = await api<{ fact: ProfileFact }>(`/api/context/facts/${fact.id}`, { method: 'PATCH', body: { value } });
      replaceFact(res.fact);
      toast('Updated');
      return true;
    } catch (err) {
      fail(err);
      return false;
    }
  }
  async function removeFact(fact: ProfileFact): Promise<void> {
    try {
      await api(`/api/context/facts/${fact.id}`, { method: 'PATCH', body: { status: 'removed' } });
      dropFact(fact.id);
      toast('Removed from your context');
    } catch (err) {
      fail(err);
    }
  }
  async function keepFact(fact: ProfileFact): Promise<void> {
    try {
      await api<{ facts: ProfileFact[] }>(`/api/context/facts/${fact.id}/keep`, { method: 'POST' });
      toast('Kept. The other version is gone from your context.');
      reload();
    } catch (err) {
      fail(err);
    }
  }
  async function removeSource(id: string): Promise<void> {
    try {
      await api(`/api/context/sources/${id}`, { method: 'DELETE' });
      toast('Removed. Recommendations will refresh. Apps you already built keep their own records.', { durationMs: 6000 });
      reload();
    } catch (err) {
      fail(err);
    }
  }
  async function addInterest(interest: string): Promise<boolean> {
    try {
      await api('/api/context/interests', { method: 'POST', body: { interest } });
      toast('Added. We will look for apps around it.');
      reload();
      return true;
    } catch (err) {
      fail(err);
      return false;
    }
  }

  if (loading && !data) {
    return (
      <div className="container-narrow stack-l" aria-busy="true">
        <Skeleton h={40} w="50%" />
        <Skeleton h={20} w="80%" />
        <Skeleton h={120} />
        <Skeleton h={160} />
      </div>
    );
  }
  if (error && !data) {
    return (
      <div className="container-narrow stack-l">
        <h1>Your Context</h1>
        <ErrorBanner message={error} onRetry={reload} />
      </div>
    );
  }

  const total = facts.length;
  return (
    <div className="container-narrow stack-l">
      <header className="st-page-head">
        <h1>Your Context</h1>
        <p className="lede" data-testid="context-count">
          {total === 0
            ? 'Nothing here yet. Everything you bring stays editable, and recommendations only use what you keep.'
            : `${pluralize(total, 'thing', 'things')} we know about you, from ${pluralize(sources.length, 'source')}. Edit or remove anything; recommendations only use what stays.`}
        </p>
      </header>

      {importNote && !noteDismissed && (
        <div className="banner banner-info" role="status">
          <span>{importNote}</span>
          <button type="button" className="btn btn-ghost" onClick={() => setNoteDismissed(true)}>
            Dismiss
          </button>
        </div>
      )}
      {error && <ErrorBanner message={error} onRetry={reload} />}

      {total === 0 ? (
        <EmptyState
          title="Bring your context to get started"
          body="Paste the profile your AI wrote, upload a file, or write a few lines about what you are working on and what you are curious about."
          action={
            <Link to="/settings/import" className="btn btn-primary" data-testid="context-import">
              Bring your context
            </Link>
          }
        />
      ) : (
        <>
          <section className="card card-pad stack">
            <h2 className="st-h2-sm">Something new you want to explore?</h2>
            <p className="small muted">Add an interest even if nothing you imported mentions it. It counts as confirmed.</p>
            <AddInterestForm onAdd={addInterest} />
          </section>

          {conflictGroups.length > 0 && (
            <section className="st-section">
              <h2>Needs a decision</h2>
              <p className="small muted">These contradict each other. Keep the one that is true today; the rest leave your context.</p>
              {conflictGroups.map(([group, groupFacts]) => (
                <ConflictCard key={group} facts={groupFacts} sourceById={sourceById} onKeep={keepFact} />
              ))}
            </section>
          )}

          {grouped.map((g) => (
            <section key={g.category} className="st-section" data-testid={`fact-group-${g.category}`}>
              <h2>{g.label}</h2>
              <div className="card">
                {g.facts.map((f) => (
                  <FactRow key={f.id} fact={f} sourceById={sourceById} onEdit={editFact} onRemove={removeFact} />
                ))}
              </div>
            </section>
          ))}
        </>
      )}

      {sources.length > 0 && (
        <section className="st-section">
          <h2>Sources</h2>
          <div className="card">
            {sources.map((s) => (
              <SourceRow key={s.id} source={s} onRemove={removeSource} />
            ))}
          </div>
          <p className="small muted">Removing a source also removes what we learned only from it. Apps you already built keep their own records.</p>
        </section>
      )}

      <p className="small muted">
        <Link to="/settings/import">Bring more context</Link>
      </p>

      {total > 0 && (
        <div className="card st-sticky-cta">
          <div>
            <strong>Ready for recommendations?</strong>
            <div className="small muted">They are grounded in what is on this page.</div>
          </div>
          <Link to="/playground" className="btn btn-primary" data-testid="store-go-for-you">
            See your recommendations
          </Link>
        </div>
      )}
    </div>
  );
}
