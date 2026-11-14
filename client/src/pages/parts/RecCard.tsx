import { Link } from 'react-router';
import type { Pattern } from '@shared/appSpec.ts';
import type { ProfileFact, Recommendation } from '@shared/context.ts';
import { AppIcon } from '../../components/AppIcon.tsx';
import { Skeleton } from '../../components/ui.tsx';
import { PurposeBadge } from './badges.tsx';
import { truncate } from './helpers.ts';

/** A tiny mock of what the app would look like, built from the recommendation's preview lines. */
function PreviewMock({ lines, pattern }: { lines: string[]; pattern: Pattern }) {
  if (pattern === 'board') {
    return (
      <div className="st-preview st-preview-cols" aria-label="Preview">
        {lines.map((line, i) => (
          <div className="st-preview-col" key={`${i}-${line}`}>
            <span className="st-preview-col-title" title={line}>{line}</span>
            <span className="st-preview-card" />
            <span className="st-preview-card short" />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="st-preview" aria-label="Preview">
      {lines.map((line, i) => (
        <div className="st-preview-row" key={`${i}-${line}`}>
          {pattern === 'tracker' ? (
            <span className="st-preview-bar" style={{ width: `${26 + ((i * 29) % 40)}%` }} />
          ) : (
            <span className="st-preview-dot" />
          )}
          <span title={line}>{line}</span>
        </div>
      ))}
    </div>
  );
}

interface RecCardProps {
  rec: Recommendation;
  facts: Map<string, ProfileFact>;
  onDismiss: (rec: Recommendation) => void;
  busy: boolean;
}

export function RecCard({ rec, facts, onDismiss, busy }: RecCardProps) {
  const evidence = rec.evidenceFactIds.map((id) => facts.get(id)).filter((f): f is ProfileFact => Boolean(f));
  const built = rec.status === 'built' && Boolean(rec.builtAppId);
  return (
    <article className="card st-rec-card" data-testid="rec-card" data-purpose={rec.purpose} data-rec-id={rec.id}>
      <div className="st-rec-head">
        <AppIcon icon={rec.icon} size={56} title={rec.title} />
        <div className="st-rec-title">
          <h3>{rec.title}</h3>
          <div className="row" style={{ gap: 6 }}>
            <PurposeBadge purpose={rec.purpose} />
            {built && <span className="badge badge-ok">Built</span>}
          </div>
        </div>
      </div>
      <p className="muted">{rec.tagline}</p>
      <PreviewMock lines={rec.previewLines} pattern={rec.pattern} />
      <div className="st-why">
        <p className="eyebrow">Why this fits you</p>
        <p className="small">{rec.reason}</p>
        {evidence.length > 0 && (
          <div className="chips" data-testid="rec-evidence">
            {evidence.map((f) => (
              <span key={f.id} className="chip" title={f.value}>
                {truncate(f.value, 60)}
              </span>
            ))}
          </div>
        )}
      </div>
      <p className="small">
        <strong>First action:</strong> {rec.firstAction}
      </p>
      <div className="st-rec-actions">
        {built ? (
          <Link to={`/apps/${rec.builtAppId}/`} className="btn btn-primary" data-testid="rec-open">
            Open app
          </Link>
        ) : (
          <Link to={`/recommendations/${rec.id}`} className="btn btn-primary" data-testid="rec-build">
            Build this for me
          </Link>
        )}
        {!built && (
          <button type="button" className="btn btn-ghost" onClick={() => onDismiss(rec)} disabled={busy} data-testid="rec-dismiss">
            Not for me
          </button>
        )}
      </div>
    </article>
  );
}

export function RecCardSkeletons({ message, testId }: { message: string; testId?: string }) {
  return (
    <div className="stack" data-testid={testId}>
      <p className="muted" role="status" aria-live="polite">
        {message}
      </p>
      <div className="grid st-rec-grid" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="card st-rec-card">
            <div className="st-rec-head">
              <Skeleton h={56} w={56} style={{ borderRadius: 14 }} />
              <div className="st-rec-title" style={{ flex: 1 }}>
                <Skeleton h={22} w="70%" />
                <Skeleton h={16} w="40%" />
              </div>
            </div>
            <Skeleton h={16} />
            <Skeleton h={96} />
            <Skeleton h={16} w="85%" />
            <Skeleton h={44} />
          </div>
        ))}
      </div>
    </div>
  );
}
