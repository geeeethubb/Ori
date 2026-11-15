/**
 * Settings for one app: Edit with Ori (and a suggestion), history and undo, add to home screen, data,
 * collection. A link to a section (#edit, #history, #install, #data, from the app's "..." menu) scrolls
 * to it and puts focus on its heading.
 */
import { useEffect } from 'react';
import { Link, useLocation } from 'react-router';
import type { AppDetailDto } from '@shared/api.ts';
import type { AppRecord } from '@shared/records.ts';
import { AppIcon } from '../components/AppIcon.tsx';
import { Icons } from '../components/ui.tsx';
import { CollectionSection } from './settings/CollectionSection.tsx';
import { DataSection } from './settings/DataSection.tsx';
import { HistorySection } from './settings/HistorySection.tsx';
import { InstallGuide } from './settings/InstallGuide.tsx';
import { ReviseSection } from './settings/ReviseSection.tsx';
import { appHomePath, useStandalone } from './runtimeUtils.ts';

interface Props {
  appId: string;
  detail: AppDetailDto;
  records: AppRecord[];
  /** Showing a cached copy: only the home-screen guide is useful. */
  offline: boolean;
  onDetail: (detail: AppDetailDto) => void;
}

const SECTIONS = new Set(['edit', 'history', 'install', 'data']);

export function AppSettingsPage({ appId, detail, records, offline, onDetail }: Props) {
  const { spec } = detail;
  const standalone = useStandalone();
  const { hash } = useLocation();

  useEffect(() => {
    const id = hash.replace(/^#/, '');
    if (!SECTIONS.has(id)) return;
    const frame = window.requestAnimationFrame(() => {
      const section = document.getElementById(id);
      if (!section) return;
      section.scrollIntoView({ block: 'start' });
      const heading = section.querySelector<HTMLElement>('h2');
      if (heading) {
        heading.tabIndex = -1;
        heading.focus({ preventScroll: true });
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [hash]);

  return (
    <div className="rt-page rt-settings" data-testid="rt-settings">
      <div className="rt-settings-top">
        <Link to={appHomePath(appId)} className="rt-backlink" data-testid="rt-settings-back">
          {Icons.back}
          <span>Back to {spec.name}</span>
        </Link>
        {!standalone && (
          <Link to="/apps" className="rt-backlink rt-backlink-quiet" data-testid="rt-settings-collection">
            My apps
          </Link>
        )}
      </div>
      <header className="rt-settings-head">
        <AppIcon icon={spec.icon} name={spec.name} size={40} title="" />
        <div className="rt-settings-head-text">
          <h1 className="rt-settings-title">Settings</h1>
          <p className="rt-settings-app">{spec.name}</p>
        </div>
      </header>
      {offline ? (
        <>
          <div className="banner banner-warn" role="status">
            <span>You're offline. Edit with Ori, history and data tools come back when you reconnect.</span>
          </div>
          <InstallGuide appId={appId} name={spec.name} icon={spec.icon} />
        </>
      ) : (
        <>
          <ReviseSection appId={appId} detail={detail} onDetail={onDetail} records={records} />
          <HistorySection appId={appId} detail={detail} onDetail={onDetail} />
          <InstallGuide appId={appId} name={spec.name} icon={spec.icon} />
          <DataSection appId={appId} name={spec.name} />
          <CollectionSection appId={appId} detail={detail} recordCount={records.length} onDetail={onDetail} />
        </>
      )}
    </div>
  );
}
