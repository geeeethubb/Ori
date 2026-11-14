/**
 * My apps: a launcher grid of distinct icons and names. Tap opens the app; management sits in a
 * small menu per tile (Open, Settings, Pin, Archive). A compact recently-opened strip appears once
 * there are enough apps to need it. Archived apps collapse; import stays a quiet details block.
 */
import { BRAND } from '@shared/brand.ts';
import { useMemo, type ChangeEvent } from 'react';
import { Link } from 'react-router';
import type { AppDetailDto, AppSummaryDto } from '@shared/api.ts';
import type { Pattern } from '@shared/appSpec.ts';
import { api, describeError } from '../api.ts';
import { AppIcon } from '../components/AppIcon.tsx';
import { ActionMenu, ErrorBanner, Icons, Skeleton, useToast } from '../components/ui.tsx';
import { ExampleTag } from './parts/badges.tsx';
import { relativeTime } from './parts/helpers.ts';
import { useLoad } from './parts/useLoad.ts';
import { usePageTitle } from './parts/usePageTitle.ts';
import './pages.css';

const PATTERN_WORDS: Record<Pattern, string> = {
  journal: 'A journal',
  board: 'A board',
  tracker: 'A tracker',
  gallery: 'A photo gallery',
  practice: 'A practice room',
  queue: 'A next-action queue',
};

function byRecent(a: AppSummaryDto, b: AppSummaryDto): number {
  return (b.lastOpenedAt ?? b.updatedAt).localeCompare(a.lastOpenedAt ?? a.updatedAt);
}

interface TileProps {
  app: AppSummaryDto;
  onPatch: (app: AppSummaryDto, body: { pinned?: boolean; archived?: boolean }) => void;
}

function AppTile({ app, onPatch }: TileProps) {
  const launch = app.launchPath || `/apps/${app.id}/`;
  const archived = Boolean(app.archivedAt);
  return (
    <article className={`ap-tile${archived ? ' is-archived' : ''}`} data-testid="app-tile" data-app-id={app.id} data-pinned={app.pinned || undefined}>
      <Link to={launch} className="ap-tile-open" data-testid="app-tile-open" aria-label={`Open ${app.name}`}>
        <span className="ap-tile-icon">
          <AppIcon icon={app.icon} size={60} title="" />
          {app.pinned && <span className="ap-tile-pin" aria-hidden="true">{Icons.pin}</span>}
        </span>
        <span className="ap-tile-name">{app.name}</span>
        <span className="ap-tile-tagline">{app.tagline || PATTERN_WORDS[app.pattern]}</span>
        {app.isSample && <ExampleTag className="ap-tile-example" />}
      </Link>
      <ActionMenu
        label={`More for ${app.name}`}
        testId="app-tile-menu"
        className="ap-tile-menu"
        items={[
          { key: 'open', label: 'Open', icon: Icons.open, to: launch, testId: 'app-menu-open' },
          { key: 'settings', label: 'Settings', icon: Icons.gear, to: `/apps/${app.id}/settings`, testId: 'app-menu-settings' },
          { key: 'pin', label: app.pinned ? 'Unpin' : 'Pin', icon: app.pinned ? Icons.pinOff : Icons.pin, onSelect: () => onPatch(app, { pinned: !app.pinned }), testId: 'app-menu-pin' },
          archived
            ? { key: 'restore', label: 'Restore', icon: Icons.refresh, onSelect: () => onPatch(app, { archived: false }), testId: 'app-menu-restore' }
            : { key: 'archive', label: 'Archive', icon: Icons.archive, onSelect: () => onPatch(app, { archived: true }), testId: 'app-menu-archive' },
        ]}
      />
    </article>
  );
}

export function MyAppsPage() {
  usePageTitle(`My apps · ${BRAND.name}`);
  const { toast } = useToast();
  const { data, error, loading, reload, setData } = useLoad(() => api<{ apps: AppSummaryDto[] }>('/api/apps'));
  const apps = data?.apps ?? [];
  const active = useMemo(() => apps.filter((a) => !a.archivedAt).sort((a, b) => Number(b.pinned) - Number(a.pinned) || byRecent(a, b)), [apps]);
  const archived = useMemo(() => apps.filter((a) => Boolean(a.archivedAt)).sort(byRecent), [apps]);
  const recent = useMemo(() => (active.length >= 4 ? active.filter((a) => a.lastOpenedAt).sort(byRecent).slice(0, 4) : []), [active]);

  async function patch(app: AppSummaryDto, body: { pinned?: boolean; archived?: boolean }) {
    try {
      const res = await api<AppDetailDto>(`/api/apps/${app.id}`, { method: 'PATCH', body });
      setData((prev) => (prev ? { apps: prev.apps.map((a) => (a.id === app.id ? res.app : a)) } : prev));
      if (body.archived === true) toast(`${app.name} archived. It keeps its entries; restore it any time.`);
      else if (body.archived === false) toast(`${app.name} is back.`);
      else if (body.pinned !== undefined) toast(body.pinned ? `${app.name} pinned.` : `${app.name} unpinned.`);
    } catch (err) {
      toast(describeError(err), { kind: 'error' });
    }
  }

  async function importAppFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      const format = parsed && typeof parsed === 'object' ? (parsed as { format?: unknown }).format : undefined;
      if (format !== 'ai-app-store/app-export') throw new Error('That is not an app file exported from here.');
      const res = await api<AppDetailDto>('/api/apps/import', { method: 'POST', body: parsed });
      toast(`Imported ${res.app.name}`);
      reload();
    } catch (err) {
      toast(err instanceof SyntaxError ? 'That file is not valid JSON.' : describeError(err), { kind: 'error' });
    }
  }

  let body;
  if (loading && !data) {
    body = (
      <div className="ap-grid" aria-busy="true">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="ap-tile ap-tile-skeleton">
            <Skeleton h={60} w={60} style={{ borderRadius: 14 }} />
            <Skeleton h={16} w="70%" />
            <Skeleton h={12} w="50%" />
          </div>
        ))}
      </div>
    );
  } else if (error && !data) {
    body = <ErrorBanner message={error} onRetry={reload} />;
  } else if (apps.length === 0) {
    body = (
      <section className="ap-empty" data-testid="apps-empty" aria-labelledby="ap-empty-title">
        <div className="ap-empty-icons" aria-hidden="true">
          <AppIcon icon={{ symbol: 'guitar', color: 'ink' }} size={48} title="" />
          <AppIcon icon={{ symbol: 'aperture', color: 'charcoal' }} size={48} title="" />
          <AppIcon icon={{ symbol: 'contact', color: 'mint' }} size={48} title="" />
        </div>
        <h2 id="ap-empty-title">Your first app is one conversation away.</h2>
        <p className="muted">Share something that caught your attention, or pick a proposal in the Playground. Each app gets its own look, its own address and a spot on your home screen.</p>
        <div className="row" style={{ justifyContent: 'center' }}>
          <Link to="/agent" className="btn btn-primary" data-testid="apps-empty-agent">{Icons.agent} Share something</Link>
          <Link to="/playground" className="btn btn-secondary" data-testid="apps-empty-playground">{Icons.playground} See the Playground</Link>
        </div>
      </section>
    );
  } else {
    body = (
      <>
        {recent.length > 0 && (
          <section className="ap-recent" data-testid="apps-recent" aria-label="Recently opened">
            <span className="eyebrow">Recently opened</span>
            <div className="ap-recent-row">
              {recent.map((a) => (
                <Link key={a.id} to={a.launchPath || `/apps/${a.id}/`} className="ap-recent-chip">
                  <AppIcon icon={a.icon} size={28} title="" />
                  <span className="ap-recent-name">{a.name}</span>
                  <span className="faint tiny">{relativeTime(a.lastOpenedAt)}</span>
                </Link>
              ))}
            </div>
          </section>
        )}
        {active.length > 0 ? (
          <div className="ap-grid" data-testid="apps-grid">
            {active.map((a) => <AppTile key={a.id} app={a} onPatch={(app, b) => void patch(app, b)} />)}
          </div>
        ) : (
          <p className="muted" data-testid="apps-grid">Everything is archived. Restore an app below to use it again.</p>
        )}
        {archived.length > 0 && (
          <details className="disclosure ap-archived" data-testid="apps-archived">
            <summary>
              <span className="disclosure-chevron" aria-hidden="true">{Icons.chevronRight}</span>
              <span>Archived ({archived.length})</span>
            </summary>
            <div className="disclosure-body">
              <p className="small muted">Archived apps keep their entries and their address. Restore one from its menu.</p>
              <div className="ap-grid">
                {archived.map((a) => <AppTile key={a.id} app={a} onPatch={(app, b) => void patch(app, b)} />)}
              </div>
            </div>
          </details>
        )}
      </>
    );
  }

  return (
    <div className="container ap">
      <header className="ap-head">
        <div>
          <h1>My apps</h1>
          <p className="muted">Each one opens straight into its task. Add any of them to your home screen from its settings.</p>
        </div>
        {apps.length > 0 && (
          <Link to="/playground" className="btn btn-secondary">{Icons.plus} Make another</Link>
        )}
      </header>
      {error && data && <ErrorBanner message={error} onRetry={reload} />}
      {body}
      <details className="disclosure ap-import">
        <summary>
          <span className="disclosure-chevron" aria-hidden="true">{Icons.chevronRight}</span>
          <span>Import an app file</span>
        </summary>
        <div className="disclosure-body">
          <p className="small muted">Choose a JSON file exported from an app's settings. It becomes a new app with its own entries.</p>
          <input type="file" className="st-file-input" accept=".json,application/json" onChange={(e) => void importAppFile(e)} data-testid="collection-import-file" aria-label="App export file" />
        </div>
      </details>
    </div>
  );
}
