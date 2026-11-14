/**
 * Bring more context (/settings/import): optional accelerators. Paste a profile another AI wrote,
 * upload a file, or answer four short questions. The long export prompt sits behind a copy control;
 * the sample profiles are labelled. Success lands on What you've shared.
 */
import { BRAND } from '@shared/brand.ts';
import { useCallback, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import type { ContextSource, ProfileFact } from '@shared/context.ts';
import { api, ApiError, describeError } from '../api.ts';
import { useAuth } from '../auth.tsx';
import { ErrorBanner, Icons, Spinner, useToast } from '../components/ui.tsx';
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
  { id: 'upload', label: 'Upload' },
  { id: 'manual', label: 'Questions' },
];

export function ImportPage() {
  usePageTitle(`Bring more context · ${BRAND.name}`);
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
      if (kind === 'sample') toast('Example context added and labelled as such.');
      else if (n === 0) toast('Nothing new to add yet');
      else toast(`Added ${n} ${n === 1 ? 'thing' : 'things'} we learned`);
      navigate('/settings/memory', { state: { note: res.note ?? null } });
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
    <div className="container-narrow im">
      <header className="im-head">
        <Link to="/settings" className="st-back">{Icons.back} Settings</Link>
        <h1>Bring more context</h1>
        <p className="lede">
          Optional. The agent learns from what you share as you go; this is a shortcut if another AI already knows what you are working on and curious about.
        </p>
        <p className="small muted">Only what you add here is used. Nothing is read from your accounts or other chats.</p>
      </header>

      {isBusy && (
        <div className="banner banner-info" role="status" aria-live="polite" data-testid="store-import-busy">
          <Spinner />
          <span>{busy === 'sample' ? 'Adding example context…' : 'Reading what you brought… this usually takes 10 to 30 seconds.'}</span>
        </div>
      )}
      {error && <ErrorBanner message={error} onRetry={() => void lastAttempt.current?.()} />}

      <div className="tabs im-tabs" role="tablist" aria-label="Ways to bring context">
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
        Already brought something? <Link to="/settings/memory">See what you've shared</Link>.
      </p>
    </div>
  );
}
