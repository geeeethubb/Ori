import type { Purpose } from '@shared/appSpec.ts';
import type { FactStatus } from '@shared/context.ts';
import { purposeLabel } from './helpers.ts';

/** Work and explore badges differ only in colour; nothing else about a card changes. */
export function PurposeBadge({ purpose }: { purpose: Purpose }) {
  return <span className={`badge ${purpose === 'work' ? 'badge-work' : 'badge-explore'}`}>{purposeLabel(purpose)}</span>;
}

/** The one Sample-mode / Live-AI indicator. Rendered once per screen, never per card. */
export function ModeBadge({ mode, testId }: { mode: 'anthropic' | 'sample' | null | undefined; testId?: string }) {
  if (mode === 'anthropic') {
    return (
      <span className="badge badge-live" title="Replies, proposals and apps come from a live AI model" data-testid={testId ? `${testId}-live` : undefined}>
        Live AI
      </span>
    );
  }
  if (mode === 'sample') {
    return (
      <span className="badge badge-sample" title="No AI key configured: replies and proposals come from the built-in catalog" data-testid={testId}>
        Sample mode
      </span>
    );
  }
  return null;
}

/**
 * Confirmed / Inferred / Needs a decision. A fact that only the example profile states says so, so a
 * fictional profile never reads as something confirmed about the person (audit P1-04).
 */
export function FactStatusChip({ status, example = false }: { status: FactStatus; example?: boolean }) {
  if (status === 'confirmed') return <span className={`badge ${example ? 'badge-sample' : 'badge-ok'}`}>{example ? 'Example · confirmed' : 'Confirmed'}</span>;
  if (status === 'conflict') return <span className="badge badge-warn">Needs a decision</span>;
  if (status === 'inferred') return <span className={`badge${example ? ' badge-sample' : ''}`}>{example ? 'Example · inferred' : 'Inferred'}</span>;
  return null;
}

export function SampleBadge() {
  return <span className="badge badge-sample">Sample</span>;
}

/** Tiny tag for clearly-labelled example content (sample apps, example captures). */
export function ExampleTag({ className }: { className?: string }) {
  return <span className={`badge badge-sample${className ? ` ${className}` : ''}`}>Example</span>;
}
