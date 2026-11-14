/** Settings for one app: make this more me, suggestions, history, home-screen guide, data, collection. */
import { Link } from 'react-router';
import type { AppDetailDto } from '@shared/api.ts';
import { AppIcon } from '../components/AppIcon.tsx';
import { Icons } from '../components/ui.tsx';
import { CollectionSection } from './settings/CollectionSection.tsx';
import { DataSection } from './settings/DataSection.tsx';
import { HistorySection } from './settings/HistorySection.tsx';
import { InstallGuide } from './settings/InstallGuide.tsx';
import { ReviseSection } from './settings/ReviseSection.tsx';
import { appHomePath, COLLECTION_LABEL } from './runtimeUtils.ts';

interface Props {
  appId: string;
  detail: AppDetailDto;
  recordCount: number;
  /** Showing a cached copy: only the home-screen guide is useful. */
  offline: boolean;
  onDetail: (detail: AppDetailDto) => void;
}

export function AppSettingsPage({ appId, detail, recordCount, offline, onDetail }: Props) {
  const { spec } = detail;
  return (
    <div className="rt-page rt-settings" data-testid="rt-settings">
      <div className="rt-settings-top">
        <Link to={appHomePath(appId)} className="rt-backlink" data-testid="rt-settings-back">
          {Icons.back}
          <span>Back to {spec.name}</span>
        </Link>
        <Link to="/apps" className="rt-backlink rt-backlink-quiet" data-testid="rt-settings-collection">
          {COLLECTION_LABEL}
        </Link>
      </div>
      <header className="rt-identity rt-identity-compact">
        <AppIcon icon={spec.icon} size={40} title={`${spec.name} icon`} className="rt-identity-icon" />
        <div className="rt-identity-text">
          <h1 className="rt-app-name rt-settings-title">Settings</h1>
          <p className="rt-tagline">{spec.name}</p>
        </div>
      </header>
      {offline ? (
        <>
          <div className="banner banner-warn" role="status">
            <span>You're offline. Changes, history and data tools come back when you reconnect.</span>
          </div>
          <InstallGuide appId={appId} name={spec.name} />
        </>
      ) : (
        <>
          <ReviseSection appId={appId} detail={detail} onDetail={onDetail} />
          <HistorySection appId={appId} detail={detail} onDetail={onDetail} />
          <InstallGuide appId={appId} name={spec.name} />
          <DataSection appId={appId} name={spec.name} />
          <CollectionSection appId={appId} detail={detail} recordCount={recordCount} onDetail={onDetail} />
        </>
      )}
    </div>
  );
}
