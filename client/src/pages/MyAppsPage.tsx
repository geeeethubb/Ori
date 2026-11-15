/**
 * My apps, the launcher (reference 05; ORI_DESIGN_SPEC section 6). The companion with "Your little
 * world"; "Continue in <App>" from real recent use (lastOpenedAt) with Open; the apps as icon tiles
 * with short names, the first one selected on arrival so its actions are ready (as in 05). The
 * selected tile says Open: tapping it again (or Enter) opens the app. Its card offers Open, Edit with
 * Ori (?edit=1) and Add to home screen (?install=1) on the app's own URL, so editing and installing
 * happen in the app itself; settings, pin and archive stay in a small "More" menu. An archived app
 * offers Restore and Open instead. Archiving or restoring keeps the app selected in its new group and
 * moves focus to its tile. "Make something new" opens the Agent ready to write (/agent?start=new).
 * Archived apps collapse; importing an app file stays a quiet disclosure.
 */
import { BRAND, REFERENCE_APP_ICONS, referenceIcon, type ReferenceAppKey } from '@shared/brand.ts';
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent, type RefObject } from 'react';
import { Link, useNavigate } from 'react-router';
import type { AppDetailDto, AppSummaryDto } from '@shared/api.ts';
import type { AppSpec, Pattern } from '@shared/appSpec.ts';
import { api, describeError } from '../api.ts';
import { AppIcon } from '../components/AppIcon.tsx';
import { OriCompanion } from '../components/ori/OriCompanion.tsx';
import { ActionMenu, ErrorBanner, Icons, Skeleton, useToast } from '../components/ui.tsx';
import { ExampleTag } from './parts/badges.tsx';
import { useLoad } from './parts/useLoad.ts';
import { usePageTitle } from './parts/usePageTitle.ts';
import './pages.css';
import './launcher.css';

const PATTERN_WORDS: Record<Pattern, string> = {
  journal: 'A journal',
  board: 'A board',
  tracker: 'A tracker',
  gallery: 'A photo gallery',
  practice: 'A practice room',
  queue: 'A next-action queue',
};

const EMPTY_ICONS: ReferenceAppKey[] = ['light', 'riff', 'people'];

/**
 * "Make something new": the Agent's own way to arrive ready to write. It focuses the composer once,
 * keeps it in view instead of jumping to the latest exchange, then drops the parameter (a reload
 * does not focus it again).
 */
export const MAKE_NEW_PATH = '/agent?start=new';

type Patch = { pinned?: boolean; archived?: boolean };

/** Every launcher action goes to the app's own URL, so editing and adding to the home screen happen in the app. */
export function appLinks(app: Pick<AppSummaryDto, 'id' | 'launchPath'>): { open: string; edit: string; install: string; settings: string } {
  const open = app.launchPath || `/apps/${app.id}/`;
  return { open, edit: `${open}?edit=1`, install: `${open}?install=1`, settings: `/apps/${app.id}/settings` };
}

const newestFirst = (a: AppSummaryDto, b: AppSummaryDto) => b.createdAt.localeCompare(a.createdAt);

/** Pinned first, then newest first. Opening an app never reshuffles the tiles, like icons on a home screen. */
export function launcherOrder(apps: readonly AppSummaryDto[]): { active: AppSummaryDto[]; archived: AppSummaryDto[] } {
  const active = apps.filter((a) => !a.archivedAt).sort((a, b) => Number(b.pinned) - Number(a.pinned) || newestFirst(a, b));
  const archived = apps.filter((a) => Boolean(a.archivedAt)).sort(newestFirst);
  return { active, archived };
}

/** The app to continue in: the most recently opened one that is not archived. Never a guess: none was opened, none shown. */
export function continueApp(apps: readonly AppSummaryDto[]): AppSummaryDto | null {
  let best: AppSummaryDto | null = null;
  let bestAt = -Infinity;
  for (const a of apps) {
    const at = a.lastOpenedAt ? Date.parse(a.lastOpenedAt) : Number.NaN;
    if (a.archivedAt || Number.isNaN(at)) continue;
    if (at > bestAt) {
      best = a;
      bestAt = at;
    }
  }
  return best;
}

/**
 * The second line of "Continue in <App>": a practice app's default plan (its first timer preset: a
 * plan, never time played), otherwise how many entries it holds, in the app's own words.
 */
export function continueLine(app: Pick<AppSummaryDto, 'recordCount'>, spec: Pick<AppSpec, 'views' | 'entryNoun'> | null): string {
  const practice = spec?.views.find((v) => v.type === 'practice');
  const plan = practice?.type === 'practice' ? practice.presets[0] : undefined;
  if (plan) return `${plan}-minute plan`;
  const noun = spec?.entryNoun ?? { singular: 'entry', plural: 'entries' };
  const n = app.recordCount;
  if (n === 0) return `No ${noun.plural} yet`;
  return `${n} ${n === 1 ? noun.singular : noun.plural}`;
}

/** One app's definition, for the Continue line. Null while loading; `failed` falls back to the summary. */
function useAppSpec(appId: string | null): { spec: AppSpec | null; settled: boolean } {
  const [state, setState] = useState<{ id: string; spec: AppSpec | null } | null>(null);
  useEffect(() => {
    if (!appId) return;
    let cancelled = false;
    api<AppDetailDto>(`/api/apps/${appId}`)
      .then((d) => {
        if (!cancelled) setState({ id: appId, spec: d.spec });
      })
      .catch(() => {
        if (!cancelled) setState({ id: appId, spec: null });
      });
    return () => {
      cancelled = true;
    };
  }, [appId]);
  return state && state.id === appId ? { spec: state.spec, settled: true } : { spec: null, settled: false };
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

interface TilesProps {
  apps: AppSummaryDto[];
  selectedId: string | null;
  onSelect: (app: AppSummaryDto, via: 'pointer' | 'keyboard') => void;
  label: string;
  testId?: string;
}

/**
 * The tiles are one radio group: Tab enters it once (at the selected tile), the arrow keys, Home and
 * End move the selection, and Tab moves on to the selected app's actions. The selected tile shows an
 * Open cue and opens the app when activated again: a second tap or click, a double-click, or Enter.
 * Space (the radio key) only ever selects.
 */
export function AppTiles({ apps, selectedId, onSelect, label, testId }: TilesProps) {
  const navigate = useNavigate();
  const listRef = useRef<HTMLUListElement>(null);
  const tabStop = apps.some((a) => a.id === selectedId) ? selectedId : (apps[0]?.id ?? null);
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const current = apps[index];
    if (e.key === 'Enter' && current && current.id === selectedId) {
      e.preventDefault();
      navigate(appLinks(current).open);
      return;
    }
    const last = apps.length - 1;
    const next =
      e.key === 'ArrowRight' || e.key === 'ArrowDown' ? (index >= last ? 0 : index + 1)
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? (index <= 0 ? last : index - 1)
          : e.key === 'Home' ? 0
            : e.key === 'End' ? last
              : -1;
    const app = apps[next];
    if (next < 0 || !app) return;
    e.preventDefault();
    onSelect(app, 'keyboard');
    listRef.current?.querySelectorAll<HTMLButtonElement>('.ln-tile')[next]?.focus();
  };
  return (
    <ul className="ln-grid" role="radiogroup" aria-label={label} ref={listRef} data-testid={testId}>
      {apps.map((app, i) => {
        const selected = app.id === selectedId;
        return (
          <li key={app.id} className="ln-cell" role="none">
            <button
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={app.id === tabStop ? 0 : -1}
              className="ln-tile"
              onClick={(e) => {
                // e.detail is 0 for a keyboard press, which only selects here (Space, or Enter on a tile
                // that is not selected yet); Enter on the selected tile opens it from onKeyDown.
                if (selected && e.detail > 0) navigate(appLinks(app).open);
                else onSelect(app, e.detail > 0 ? 'pointer' : 'keyboard');
              }}
              onKeyDown={(e) => onKeyDown(e, i)}
              data-testid="app-tile"
              data-app-id={app.id}
              data-pinned={app.pinned || undefined}
            >
              <span className="ln-tile-icon">
                <AppIcon icon={app.icon} name={app.name} size={64} title="" />
                {app.pinned && <span className="ln-tile-pin" aria-hidden="true">{Icons.pin}</span>}
              </span>
              <span className="ln-tile-name">{app.name}</span>
              {app.pinned && <span className="sr-only">, pinned</span>}
              {app.isSample && <ExampleTag className="ln-tile-example" />}
              {/* Part of the tile, not a separate control: activating the selected tile opens the app. */}
              {selected && (
                <span className="ln-tile-open" aria-hidden="true" data-testid="app-tile-open-cue">
                  {Icons.open}
                  Open
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

interface ActionsProps {
  app: AppSummaryDto;
  onPatch: (app: AppSummaryDto, body: Patch) => void;
  barRef: RefObject<HTMLElement | null>;
}

/**
 * What you can do with the selected app. Open, Edit with Ori and Add to home screen open the app's own
 * URL. An archived app offers Restore first, and Open; editing it or adding it to the home screen
 * waits until it is restored.
 */
export function AppActions({ app, onPatch, barRef }: ActionsProps) {
  const links = appLinks(app);
  const archived = Boolean(app.archivedAt);
  const restore = () => onPatch(app, { archived: false });
  return (
    <section id="ln-actions" ref={barRef} className="ln-actions" aria-labelledby="ln-actions-title" data-testid="app-actions" data-app-id={app.id} data-archived={archived || undefined}>
      <div className="ln-actions-head">
        <AppIcon icon={app.icon} name={app.name} size={40} title="" />
        <div className="ln-actions-text">
          <h2 id="ln-actions-title">{app.name}</h2>
          {archived ? (
            <span className="ln-actions-status">Archived. Its entries and address are kept.</span>
          ) : (
            <span>{app.tagline || PATTERN_WORDS[app.pattern]}</span>
          )}
        </div>
      </div>
      {archived ? (
        <div className="ln-actions-row ln-actions-row-2">
          <button type="button" className="ln-action ln-action-primary" onClick={restore} data-testid="app-action-restore">
            {Icons.refresh}
            <span>Restore<span className="sr-only"> {app.name}</span></span>
          </button>
          <Link to={links.open} className="ln-action" data-testid="app-action-open">
            {Icons.open}
            <span>Open<span className="sr-only"> {app.name}</span></span>
          </Link>
        </div>
      ) : (
        <div className="ln-actions-row">
          <Link to={links.open} className="ln-action ln-action-primary" data-testid="app-action-open">
            {Icons.open}
            <span>Open<span className="sr-only"> {app.name}</span></span>
          </Link>
          <Link to={links.edit} className="ln-action" data-testid="app-action-edit">
            {Icons.pencil}
            <span>Edit <span className="sr-only">{app.name} </span>with Ori</span>
          </Link>
          <Link to={links.install} className="ln-action" data-testid="app-action-install">
            {Icons.share}
            <span>Add <span className="sr-only">{app.name} </span>to home screen</span>
          </Link>
        </div>
      )}
      {/* Secondary: after the main actions in focus order, shown at the top right. */}
      <ActionMenu
        label={`More for ${app.name}`}
        testId="app-tile-menu"
        className="ln-more"
        align="right"
        items={
          archived
            ? [
                { key: 'settings', label: 'Settings', icon: Icons.gear, to: links.settings, testId: 'app-menu-settings' },
                { key: 'restore', label: 'Restore', icon: Icons.refresh, onSelect: restore, testId: 'app-menu-restore' },
              ]
            : [
                { key: 'settings', label: 'Settings', icon: Icons.gear, to: links.settings, testId: 'app-menu-settings' },
                { key: 'pin', label: app.pinned ? 'Unpin' : 'Pin', icon: app.pinned ? Icons.pinOff : Icons.pin, onSelect: () => onPatch(app, { pinned: !app.pinned }), testId: 'app-menu-pin' },
                { key: 'archive', label: 'Archive', icon: Icons.archive, onSelect: () => onPatch(app, { archived: true }), testId: 'app-menu-archive' },
              ]
        }
      />
    </section>
  );
}

function ContinueRow({ app }: { app: AppSummaryDto }) {
  const { spec, settled } = useAppSpec(app.id);
  return (
    <section className="ln-continue" aria-label={`Continue in ${app.name}`} data-testid="apps-continue" data-app-id={app.id}>
      <AppIcon icon={app.icon} name={app.name} size={48} title="" />
      <div className="ln-continue-text">
        <strong>Continue in {app.name}</strong>
        <span className="ln-continue-line" data-testid="apps-continue-line">{settled ? continueLine(app, spec) : ''}</span>
      </div>
      <Link to={appLinks(app).open} className="btn btn-primary ln-pill" data-testid="apps-continue-open">
        Open<span className="sr-only"> {app.name}</span>
      </Link>
    </section>
  );
}

function MakeSomethingNew() {
  return (
    <Link to={MAKE_NEW_PATH} className="ln-make" data-testid="apps-make-new">
      <span className="ln-make-plus" aria-hidden="true">{Icons.plus}</span>
      <span>Make something new</span>
    </Link>
  );
}

export function MyAppsPage() {
  usePageTitle(`My apps · ${BRAND.name}`);
  const { toast } = useToast();
  const { data, error, loading, reload, setData } = useLoad(() => api<{ apps: AppSummaryDto[] }>('/api/apps'));
  const apps = useMemo(() => data?.apps ?? [], [data]);
  const { active, archived } = useMemo(() => launcherOrder(apps), [apps]);
  const recentApp = useMemo(() => continueApp(apps), [apps]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [archivedOpen, setArchivedOpen] = useState(false);
  const selected = apps.find((a) => a.id === selectedId) ?? null;
  const rootRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLElement | null>(null);
  const revealBar = useRef(false);
  const followTile = useRef<string | null>(null);

  // On arrival the first tile is selected, so its actions are ready (reference 05). Once only: after
  // that the selection is the person's.
  const [arrived, setArrived] = useState(false);
  if (!arrived && data) {
    setArrived(true);
    if (selectedId === null && active[0]) setSelectedId(active[0].id);
  }

  // A tap reveals the actions if they are below the fold; arrow keys never scroll focus away.
  useEffect(() => {
    if (!selectedId || !revealBar.current) return;
    revealBar.current = false;
    barRef.current?.scrollIntoView({ block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }, [selectedId]);

  // Archive and Restore move the app to its other group, which removes the button that was used. If
  // focus went with it, it follows the app to its tile there (the toast announces the change). The
  // app's card, then the tile itself, are brought clear of the header and the tab bar (their scroll
  // margins), so the focused tile is never left under them.
  useEffect(() => {
    const id = followTile.current;
    if (!id) return;
    followTile.current = null;
    const focused = document.activeElement;
    if (focused && focused !== document.body && focused.isConnected) return;
    const tiles = rootRef.current?.querySelectorAll<HTMLButtonElement>('.ln-tile') ?? [];
    const tile = Array.from(tiles).find((t) => t.dataset.appId === id);
    if (!tile) return;
    tile.focus({ preventScroll: true });
    barRef.current?.scrollIntoView({ block: 'nearest' });
    tile.scrollIntoView({ block: 'nearest' });
  }, [apps, archivedOpen]);

  const select = (app: AppSummaryDto, via: 'pointer' | 'keyboard') => {
    revealBar.current = via === 'pointer';
    setSelectedId(app.id);
  };

  async function patch(app: AppSummaryDto, body: Patch) {
    try {
      const res = await api<AppDetailDto>(`/api/apps/${app.id}`, { method: 'PATCH', body });
      setData((prev) => (prev ? { apps: prev.apps.map((a) => (a.id === app.id ? res.app : a)) } : prev));
      if (body.archived !== undefined) {
        // The app stays selected in its new group, so Restore (or Open and the rest) is ready there.
        if (body.archived) setArchivedOpen(true);
        followTile.current = app.id;
      }
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

  const onPatch = (app: AppSummaryDto, body: Patch) => void patch(app, body);
  const selectedActive = selected && !selected.archivedAt ? selected : null;
  const selectedArchived = selected && selected.archivedAt ? selected : null;

  let body;
  if (loading && !data) {
    body = (
      <div className="ln-grid" aria-busy="true" aria-label="Loading your apps">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="ln-skeleton-tile">
            <Skeleton h={64} w={64} style={{ borderRadius: 14 }} />
            <Skeleton h={14} w="60%" />
          </div>
        ))}
      </div>
    );
  } else if (error && !data) {
    body = <ErrorBanner message={error} onRetry={reload} />;
  } else if (apps.length === 0) {
    body = (
      <section className="ln-empty" data-testid="apps-empty" aria-labelledby="ln-empty-title">
        <div className="ln-empty-icons" aria-hidden="true">
          {EMPTY_ICONS.map((key) => (
            <AppIcon key={key} icon={referenceIcon(key)} name={REFERENCE_APP_ICONS[key].name} size={56} title="" />
          ))}
        </div>
        <h2 id="ln-empty-title">Your first app is one conversation away.</h2>
        <p className="muted">Tell Ori what caught your eye. Each app you make gets its own icon, its own link and a spot on your home screen.</p>
        <div className="ln-empty-actions">
          <Link to={MAKE_NEW_PATH} className="btn btn-primary" data-testid="apps-empty-agent">
            {Icons.plus} Make something new
          </Link>
          <Link to="/playground" className="btn btn-secondary" data-testid="apps-empty-playground">
            See the Playground
          </Link>
        </div>
      </section>
    );
  } else {
    body = (
      <>
        {recentApp && <ContinueRow app={recentApp} />}
        {active.length > 0 ? (
          <AppTiles apps={active} selectedId={selectedId} onSelect={select} label="Your apps" testId="apps-grid" />
        ) : (
          <p className="muted" data-testid="apps-grid">Everything is archived. Restore an app below to use it again.</p>
        )}
        {selectedActive ? (
          <AppActions app={selectedActive} onPatch={onPatch} barRef={barRef} />
        ) : (
          active.length > 0 && <p className="ln-hint" data-testid="apps-hint">Select an app to open it, edit it with Ori or add it to your home screen.</p>
        )}
        <MakeSomethingNew />
        {archived.length > 0 && (
          <details className="disclosure ln-archived" data-testid="apps-archived" open={archivedOpen} onToggle={(e) => setArchivedOpen(e.currentTarget.open)}>
            <summary>
              <span className="disclosure-chevron" aria-hidden="true">{Icons.chevronRight}</span>
              <span>Archived ({archived.length})</span>
            </summary>
            <div className="disclosure-body">
              <p className="small muted">Archived apps keep their entries and their address. Select one to restore it.</p>
              <AppTiles apps={archived} selectedId={selectedId} onSelect={select} label="Archived apps" />
              {selectedArchived && <AppActions app={selectedArchived} onPatch={onPatch} barRef={barRef} />}
            </div>
          </details>
        )}
      </>
    );
  }

  return (
    <div className="container ln" ref={rootRef}>
      <header className="ln-head">
        <OriCompanion size={92} />
        <h1>Your little world</h1>
      </header>
      {error && data && <ErrorBanner message={error} onRetry={reload} />}
      {body}
      <details className="disclosure ln-import">
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
