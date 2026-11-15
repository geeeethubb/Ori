/**
 * What you've shared (/settings/memory): everything Ori and the Playground work from, grouped as
 * interests, current needs, routines & tools, recent changes and open questions; then sources and the
 * things you shared with Ori. Confirmed and inferred stay distinct, facts only the example profile states
 * say so, conflicts ask for a decision, and anything can be edited, removed or forgotten. Apps keep
 * their own records.
 */
import { BRAND } from '@shared/brand.ts';
import { useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router';
import type { ContextOverviewDto } from '@shared/api.ts';
import type { ProfileFact } from '@shared/context.ts';
import { api, describeError } from '../api.ts';
import { ErrorBanner, Icons, Skeleton, useToast } from '../components/ui.tsx';
import { ExampleTag } from './parts/badges.tsx';
import { groupFactsForMemory, pluralize } from './parts/helpers.ts';
import { AddInterestForm, CaptureRow, ConflictCard, FactRow, SourceRow } from './parts/MemoryParts.tsx';
import { useLoad } from './parts/useLoad.ts';
import { usePageTitle } from './parts/usePageTitle.ts';
import './pages.css';

export function MemoryPage() {
  usePageTitle(`What you've shared · ${BRAND.name}`);
  const { toast } = useToast();
  const location = useLocation();
  const importNote = (location.state as { note?: string | null } | null)?.note ?? null;
  const [noteDismissed, setNoteDismissed] = useState(false);
  const { data, error, loading, reload, setData } = useLoad(() => api<ContextOverviewDto>('/api/context'));

  const sources = data?.sources ?? [];
  const captures = data?.captures ?? [];
  const sourceById = useMemo(() => new Map(sources.map((s) => [s.id, s])), [sources]);
  const { groups, conflicts, total } = useMemo(() => groupFactsForMemory(data?.facts ?? []), [data]);

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
      toast('Removed. It no longer informs suggestions.');
    } catch (err) {
      fail(err);
    }
  }
  async function keepFact(fact: ProfileFact): Promise<void> {
    try {
      await api<{ facts: ProfileFact[] }>(`/api/context/facts/${fact.id}/keep`, { method: 'POST' });
      toast('Kept. The other version is gone.');
      reload();
    } catch (err) {
      fail(err);
    }
  }
  async function removeSource(id: string): Promise<void> {
    try {
      await api(`/api/context/sources/${id}`, { method: 'DELETE' });
      toast('Source removed, with what we learned only from it. Apps keep their own records.', { durationMs: 6000 });
      reload();
    } catch (err) {
      fail(err);
    }
  }
  async function forgetCapture(id: string): Promise<void> {
    try {
      await api(`/api/agent/captures/${id}`, { method: 'DELETE' });
      setData((prev) => (prev ? { ...prev, captures: prev.captures.filter((c) => c.id !== id) } : prev));
      toast('Forgotten. Its proposals are gone; apps you made keep their data.', { durationMs: 6000 });
    } catch (err) {
      fail(err);
    }
  }
  async function addInterest(interest: string): Promise<boolean> {
    try {
      await api('/api/context/interests', { method: 'POST', body: { interest } });
      toast('Added as a confirmed interest.');
      reload();
      return true;
    } catch (err) {
      fail(err);
      return false;
    }
  }

  if (loading && !data) {
    return (
      <div className="container-narrow stack-l me" aria-busy="true">
        <Skeleton h={40} w="50%" />
        <Skeleton h={20} w="80%" />
        <Skeleton h={120} />
        <Skeleton h={160} />
      </div>
    );
  }
  if (error && !data) {
    return (
      <div className="container-narrow stack-l me">
        <h1>What you've shared</h1>
        <ErrorBanner message={error} onRetry={reload} />
      </div>
    );
  }

  const nothing = total === 0 && sources.length === 0 && captures.length === 0;
  // When only the example profile is here, say it once for the page.
  const onlyExample = sources.length > 0 && sources.every((s) => s.kind === 'sample') && captures.length === 0;
  const questions = groups.find((g) => g.key === 'questions');
  const showQuestions = conflicts.length > 0 || (questions?.facts.length ?? 0) > 0;

  return (
    <div className="container-narrow me">
      <header className="me-head">
        <Link to="/settings" className="st-back">{Icons.back} Settings</Link>
        <h1>What you've shared</h1>
        <p className="lede" data-testid="memory-count">
          {nothing
            ? 'Nothing yet. Everything you share stays editable here, and suggestions only use what you keep.'
            : `${pluralize(total, 'thing', 'things')} Ori works from, out of ${pluralize(sources.length, 'source')} and ${pluralize(captures.length, 'thing', 'things')} you shared. Edit or remove anything; apps keep their own records.`}
        </p>
        {onlyExample && (
          <p className="me-example" data-testid="memory-example-note">
            <ExampleTag />
            <span>Everything here comes from the example profile, not from you. Remove it under Sources whenever you like.</span>
          </p>
        )}
      </header>

      {importNote && !noteDismissed && (
        <div className="banner banner-info" role="status">
          <span>{importNote}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setNoteDismissed(true)}>Dismiss</button>
        </div>
      )}
      {error && <ErrorBanner message={error} onRetry={reload} />}

      {groups
        .filter((g) => g.key !== 'questions')
        .filter((g) => g.key === 'interests' || g.facts.length > 0)
        .map((g) => (
          <section key={g.key} className="me-group" data-testid={`mem-group-${g.key}`} aria-labelledby={`me-${g.key}`}>
            <div className="me-group-head">
              <h2 id={`me-${g.key}`}>{g.title}</h2>
              <span className="small muted">{g.hint}</span>
            </div>
            {g.facts.length > 0 ? (
              <ul className="me-list card">
                {g.facts.map((f) => <FactRow key={f.id} fact={f} sourceById={sourceById} onEdit={editFact} onRemove={removeFact} />)}
              </ul>
            ) : (
              <p className="small muted me-none">Nothing here yet.</p>
            )}
            {g.key === 'interests' && (
              <div className="me-add">
                <AddInterestForm onAdd={addInterest} buttonLabel="Add interest" placeholder="Something you want to explore, in a few words" />
                <span className="field-help">Counts as confirmed. The Playground picks it up on the next refresh.</span>
              </div>
            )}
          </section>
        ))}

      {showQuestions && questions && (
        <section className="me-group" data-testid="mem-group-questions" aria-labelledby="me-questions">
          <div className="me-group-head">
            <h2 id="me-questions">Open questions</h2>
            <span className="small muted">Contradictions and uncertain notes. Keep the one that is true today.</span>
          </div>
          {conflicts.map((group, i) => <ConflictCard key={group[0]?.conflictGroup ?? i} facts={group} sourceById={sourceById} onKeep={keepFact} />)}
          {questions.facts.length > 0 && (
            <ul className="me-list card">
              {questions.facts.map((f) => <FactRow key={f.id} fact={f} sourceById={sourceById} onEdit={editFact} onRemove={removeFact} />)}
            </ul>
          )}
        </section>
      )}

      {sources.length > 0 && (
        <section className="me-group" aria-labelledby="me-sources">
          <div className="me-group-head">
            <h2 id="me-sources">Sources</h2>
            <span className="small muted">Where the notes above came from. Removing a source also removes what we learned only from it.</span>
          </div>
          <ul className="me-list card">
            {sources.map((s) => <SourceRow key={s.id} source={s} onRemove={removeSource} />)}
          </ul>
        </section>
      )}

      {captures.length > 0 && (
        <section className="me-group" aria-labelledby="me-captures">
          <div className="me-group-head">
            <h2 id="me-captures">Things you shared</h2>
            <span className="small muted">Notes, links and photos you gave Ori, with what was actually read.</span>
          </div>
          <ul className="me-list card">
            {captures.map((c) => <CaptureRow key={c.id} capture={c} onForget={forgetCapture} />)}
          </ul>
        </section>
      )}

      <aside className="me-note">
        <h3 className="small">What forgetting does</h3>
        <p className="small muted">
          Removing a note, a source or something you shared stops it from informing suggestions and proposals, and removes the proposals that came only from it. Apps you already made are separate: they keep their own records until you archive or export them.
        </p>
      </aside>

      <div className="row">
        <Link to="/settings/import" className="btn btn-secondary">{Icons.upload} Bring context from your AI</Link>
        <Link to="/agent?start=new" className="btn btn-ghost">{Icons.agent} Share something with Ori</Link>
        {total > 0 && <Link to="/playground" className="btn btn-ghost" data-testid="memory-go-playground">See the Playground {Icons.arrowRight}</Link>}
      </div>
    </div>
  );
}
