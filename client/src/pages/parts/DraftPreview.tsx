import type { AppSpec } from '@shared/appSpec.ts';
import { AppIcon } from '../../components/AppIcon.tsx';
import { describeFields, describeRule, describeView } from './helpers.ts';

export interface DraftDto {
  spec: AppSpec;
  description: string;
  unsupported: { request: string; reason: string; alternative: string }[];
  generatedBy: 'anthropic' | 'sample';
}

interface DraftPreviewProps {
  draft: DraftDto;
  /** True when the instructions changed after this draft was made. */
  stale: boolean;
  onBuild: () => void;
  building: boolean;
}

/** What the app will be, in plain words, before anything is saved. */
export function DraftPreview({ draft, stale, onBuild, building }: DraftPreviewProps) {
  const { spec } = draft;
  const fields = describeFields(spec);
  return (
    <section className="card card-pad st-draft" data-testid="build-draft" aria-labelledby="st-draft-title">
      <div className="st-rec-head">
        <AppIcon icon={spec.icon} size={48} title={spec.name} />
        <div className="st-rec-title">
          <h2 id="st-draft-title" style={{ fontSize: '1.3rem' }}>{spec.name}</h2>
          {spec.tagline && <p className="muted small">{spec.tagline}</p>}
        </div>
      </div>
      {stale && (
        <div className="banner banner-warn">
          <span>Your instructions changed since this preview. Building will design the app again with the new instructions.</span>
        </div>
      )}
      <p>{draft.description}</p>
      <div>
        <h3>What you will fill in</h3>
        <ul className="st-draft-list">
          {fields.map((f, i) => (
            <li key={`${i}-${f.label}`}>
              <span>
                {f.label}
                {f.required && <span className="faint"> (required)</span>}
              </span>
              <span className="faint">{f.type}</span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3>How it is shown</h3>
        <ul className="st-draft-list">
          {spec.views.map((v) => (
            <li key={v.id}>
              <span>{describeView(spec, v)}</span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3>What it does for you</h3>
        {spec.rules.length > 0 ? (
          <ul className="st-draft-list">
            {spec.rules.map((r) => (
              <li key={r.id}>
                <span>{describeRule(r)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="small muted">No automatic rules yet. You can add one later with "Make a change".</p>
        )}
      </div>
      {draft.unsupported.length > 0 && (
        <div>
          <h3>Not included</h3>
          <ul className="st-draft-list">
            {draft.unsupported.map((u, i) => (
              <li key={i} className="st-draft-stack">
                <span>
                  <strong>Not included:</strong> {u.request}. {u.reason}
                </span>
                <span className="muted">Instead: {u.alternative}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="st-build-actions">
        <button type="button" className="btn btn-primary btn-lg" data-testid="build-confirm" onClick={onBuild} disabled={building}>
          Build this for me
        </button>
      </div>
    </section>
  );
}
