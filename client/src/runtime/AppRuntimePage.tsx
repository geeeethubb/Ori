/**
 * Entry point for /apps/:appId/* (outside the storefront chrome). Validates the ID, signs the
 * person in IN PLACE when needed, loads the app, keeps an offline copy, and routes between
 * the app itself and its settings. Only validated AppSpecs are rendered; no generated code runs.
 * The root wears the app's own identity (theme, typography, density) via resolveTheme.
 */
import { useEffect, useMemo, useRef, type CSSProperties } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router';
import type { AppDetailDto } from '@shared/api.ts';
import { APP_ID_PATTERN } from '@shared/ids.ts';
import type { AppRecord } from '@shared/records.ts';
import { useAuth } from '../auth.tsx';
import { useInstallMeta } from '../hooks/useInstallMeta.ts';
import { AppHome } from './AppHome.tsx';
import { AppSettingsPage } from './AppSettingsPage.tsx';
import { RuntimeSignIn } from './RuntimeSignIn.tsx';
import { LoadErrorScreen, NotFoundScreen, OfflineBanner, RuntimeSkeleton } from './RuntimeStates.tsx';
import { resolveTheme } from './theme.ts';
import { appHomePath, bootTarget, postEvent, readCache } from './runtimeUtils.ts';
import { useAppData, type AppData } from './useAppData.ts';
import './runtime.css';

export function AppRuntimePage() {
  const params = useParams();
  const rawId = params.appId ?? '';
  const appId = APP_ID_PATTERN.test(rawId) ? rawId : null;
  const { user, loading, offline: authOffline, refresh } = useAuth();
  const data = useAppData(appId ?? '', Boolean(appId && user), user?.id);
  const { state, reload } = data;
  const detail = state.kind === 'ready' || state.kind === 'offline' ? state.detail : null;

  // Title, manifest, icons and theme color follow THIS app (the server injects the same on a fresh request).
  useInstallMeta(appId ? (detail ? { appId, name: detail.spec.name, icon: detail.spec.icon } : bootTarget(appId)) : null);

  // Once per mount: record that the app was opened (feeds "last opened" and suggestions).
  const opened = useRef(false);
  useEffect(() => {
    if (state.kind !== 'ready' || !appId || opened.current) return;
    opened.current = true;
    postEvent(appId, 'app_opened');
  }, [state.kind, appId]);

  // A 401 while using the app: re-check the session. If it is gone, the sign-in panel appears in place.
  useEffect(() => {
    if (state.kind !== 'unauthenticated') return;
    void refresh().then((u) => {
      if (u) void reload();
    });
  }, [state.kind, refresh, reload]);

  if (!appId) return <NotFoundScreen kind="invalid" />;
  if (loading) return <RuntimeSkeleton />;

  if (!user) {
    // No session and no network: the last saved copy on this device is better than a dead end.
    const cached = authOffline ? readCache(appId) : null;
    if (cached) return <Shell appId={appId} detail={cached.detail} records={cached.records} offline savedAt={cached.savedAt} onRetry={() => void refresh()} />;
    return <RuntimeSignIn appId={appId} />;
  }

  switch (state.kind) {
    case 'not_found':
      return <NotFoundScreen kind="missing" />;
    case 'error':
      return <LoadErrorScreen message={state.message} onRetry={() => void reload()} busy={data.reloading} />;
    case 'offline':
      return <Shell appId={appId} detail={state.detail} records={state.records} offline savedAt={state.savedAt} onRetry={() => void reload()} busy={data.reloading} />;
    case 'ready':
      return <Shell appId={appId} detail={state.detail} records={state.records} data={data} />;
    default:
      return <RuntimeSkeleton />;
  }
}

interface ShellProps {
  appId: string;
  detail: AppDetailDto;
  records: AppRecord[];
  /** Present when live; omitted for the read-only offline copy. */
  data?: AppData;
  offline?: boolean;
  savedAt?: string;
  onRetry?: () => void;
  busy?: boolean;
}

const noop = () => undefined;

function Shell({ appId, detail, records, data, offline = false, savedAt, onRetry, busy }: ShellProps) {
  const actions = data && !offline ? { createRecord: data.createRecord, updateRecord: data.updateRecord, deleteRecord: data.deleteRecord } : undefined;
  const theme = useMemo(() => resolveTheme(detail.spec), [detail.spec]);
  return (
    <div className="rt-root" data-testid="rt-app" data-offline={offline || undefined} {...theme.attrs} style={theme.style as CSSProperties}>
      {offline && savedAt && onRetry && <OfflineBanner savedAt={savedAt} onRetry={onRetry} busy={busy} />}
      <Routes>
        <Route path="/" element={<AppHome appId={appId} detail={detail} records={records} actions={actions} />} />
        <Route path="settings" element={<AppSettingsPage appId={appId} detail={detail} recordCount={records.length} offline={offline} onDetail={data?.setDetail ?? noop} />} />
        <Route path="*" element={<Navigate to={appHomePath(appId)} replace />} />
      </Routes>
    </div>
  );
}
