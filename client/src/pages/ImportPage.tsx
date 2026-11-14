import { useCallback, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import type { ContextSource, ProfileFact } from '@shared/context.ts';
import { api, ApiError, describeError } from '../api.ts';
import { useAuth } from '../auth.tsx';
import { ErrorBanner, Spinner, useToast } from '../components/ui.tsx';
import { ManualImport, PasteImport, SampleCard, UploadImport, type SampleProfile, type SourceBody } from './parts/ImportParts.tsx';
import { usePageTitle } from './parts/usePageTitle.ts';
import './pages.css';

interface SourceResponse {
  source: ContextSource;
  facts: ProfileFact[];
  note?: string;
  generatedBy: 'anthropic' | 'sample';
}

type Tab = 'paste' | 'upload' | 'manual';
const TABS: { id: Tab; label: string }[] = [
  { id: 'paste', label: 'Paste' },
  { id: 'upload', label: 'Upload a file' },
  { id: 'manual', label: 'Short profile' },
];

export function ImportPage() {
  usePageTitle('Bring your context · AI App Store');
  const navigate = useNavigate();
  const { toast } = useToast();
  const { refresh } = useAuth();
  const [tab, setTab] = useState<Tab>('paste');
  const [busy, setBusy] = useState<'source' | 'sample' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastAttempt = useRef<(() => Promise<void>) | null>(null);

  const finish = useCallback(
    (res: SourceResponse, kind: 'source' | 'sample') => {
      const n = res.facts.length;
      if (kind === 'sample') toast('Sample context added');
      else if (n === 0) toast('Nothing new to add yet');
      else toast(`Added ${n} ${n === 1 ? 'thing' : 'things'} we learned`);
      navigate('/context', { state: { note: res.note ?? null } });
    },
    [navigate, toast],
  );

  const run = useCallback(
    async (kind: 'source' | 'sample', path: string, body: unknown) => {
      const attempt = async () => {
        setBusy(kind);
        setError(null);
        try {
          finish(await api<SourceResponse>(path, { method: 'POST', body, timeoutMs: 90_000 }), kind);
        } catch (err) {
          if (err instanceof ApiError && err.isAuth) void refresh();
          setError(describeError(err));
        } finally {
          setBusy(null);
        }
      };
      lastAttempt.current = attempt;
      await attempt();
    },
    [finish, refresh],
  );

  const importSource = (body: SourceBody) => void run('source', '/api/context/sources', body);
  const importSample = (profile: SampleProfile) => void run('sample', '/api/context/sample', { profile });
  const isBusy = busy !== null;

  return (
    <div className="container-narrow stack-l">
      <header className="st-page-head">
        <p className="eyebrow">Your context</p>
        <h1>Bring your context</h1>
        <p className="lede">
          Your AI already knows what you are working on and what you are curious about. Bring that here, and we will find apps that fit.
        </p>
        <p className="small muted">We only use what you paste here. Nothing is read from your accounts.</p>
      </header>

      {isBusy && (
        <div className="banner banner-info" role="status" aria-live="polite" data-testid="store-import-busy">
          <Spinner />
          <span>{busy === 'sample' ? 'Adding sample context…' : 'Reading your context… this usually takes 10–30 seconds.'}</span>
        </div>
      )}
      {error && <ErrorBanner message={error} onRetry={() => void lastAttempt.current?.()} />}

      <div className="tabs" role="tablist" aria-label="Ways to bring your context">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} data-testid={`store-import-tab-${t.id}`}>
            {t.label}
          </button>
        ))}
      </div>
      <section className="card card-pad st-tabs-panel" role="tabpanel">
        {tab === 'paste' && <PasteImport busy={isBusy} onImport={(text, label) => importSource({ kind: 'paste', label, text })} />}
        {tab === 'upload' && <UploadImport busy={isBusy} onImport={(text, label) => importSource({ kind: 'upload', label, text })} />}
        {tab === 'manual' && <ManualImport busy={isBusy} onImport={(text) => importSource({ kind: 'manual', label: 'Short profile', text })} />}
      </section>

      <SampleCard busy={isBusy} onPick={importSample} />

      <p className="small muted">
        Already brought something? <Link to="/context">See Your Context</Link>.
      </p>
    </div>
  );
}
