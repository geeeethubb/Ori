/** Loading, not-found, error and offline states for the runtime shell. */
import { Link } from 'react-router';
import { EmptyState, ErrorBanner, Skeleton } from '../components/ui.tsx';
import { formatSavedAt } from './runtimeUtils.ts';

export function RuntimeSkeleton() {
  return (
    <div className="rt-root">
      <div className="rt-page" aria-busy="true" aria-label="Loading your app">
        <div className="rt-header">
          <Skeleton h={44} w={44} style={{ borderRadius: 12, flex: 'none' }} />
          <div className="rt-header-text stack" style={{ gap: 8 }}>
            <Skeleton h={26} w="60%" />
            <Skeleton h={16} w="40%" />
          </div>
        </div>
        <Skeleton h={88} />
        <Skeleton h={120} />
        <Skeleton h={120} />
      </div>
    </div>
  );
}

export function NotFoundScreen({ kind }: { kind: 'invalid' | 'missing' }) {
  const missing = kind === 'missing';
  return (
    <div className="rt-root">
      <div className="rt-page rt-page-center" data-testid="rt-not-found">
        <EmptyState
          title={missing ? 'We could not find this app in your collection' : 'That link does not look right'}
          body={
            missing
              ? 'It may have been deleted, or it belongs to a different account. Your other apps are safe in your collection.'
              : 'App links look like /apps/your-app-id/. Open your collection to pick the right one.'
          }
          action={
            <Link to="/collection" className="btn btn-primary">
              Go to my collection
            </Link>
          }
        />
      </div>
    </div>
  );
}

export function LoadErrorScreen({ message, onRetry, busy }: { message: string; onRetry: () => void; busy?: boolean }) {
  return (
    <div className="rt-root">
      <div className="rt-page">
        <ErrorBanner message={message} onRetry={onRetry} retryLabel={busy ? 'Retrying…' : 'Try again'} />
        <p className="small muted">Nothing you saved is lost. Your entries live in your account and will show as soon as we can reach it.</p>
        <Link to="/collection" className="rt-backlink">
          Back to collection
        </Link>
      </div>
    </div>
  );
}

export function OfflineBanner({ savedAt, onRetry, busy }: { savedAt: string; onRetry: () => void; busy?: boolean }) {
  return (
    <div className="banner banner-warn rt-offline" role="status" data-testid="rt-offline-banner">
      <span>Offline. Showing your last saved copy from {formatSavedAt(savedAt)}. Changes are disabled until you reconnect.</span>
      <button type="button" className="btn btn-sm btn-secondary" onClick={onRetry} disabled={busy}>
        {busy ? 'Retrying…' : 'Retry'}
      </button>
    </div>
  );
}
