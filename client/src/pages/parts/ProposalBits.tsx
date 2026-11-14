/**
 * Proposal card and its "Why this?" disclosure, shared by the Agent thread and the Playground.
 * Outcome-led title, one visible sentence of reason, one primary action; provenance (cited facts
 * and captures) stays behind a low-emphasis disclosure.
 */
import { Link } from 'react-router';
import type { Capture, ProfileFact, Recommendation } from '@shared/context.ts';
import { readStatusLabel } from '@shared/context.ts';
import { AppIcon } from '../../components/AppIcon.tsx';
import { Disclosure } from '../../components/ui.tsx';
import { ExampleTag, FactStatusChip } from './badges.tsx';
import { PROPOSAL_KIND_LABELS, defaultLook, firstSentence, proposalAction, truncate } from './helpers.ts';
import { MiniPreview } from './MiniPreview.tsx';

interface WhyThisProps {
  reason: string;
  facts: ProfileFact[];
  captures: Capture[];
  testId?: string;
  summaryTestId?: string;
  /** Hide the full reason when the card already shows all of it. */
  showReason?: boolean;
  /** Facts that came from the example profile, never from the person: labelled as such. */
  exampleFactIds?: ReadonlySet<string>;
}

/** Low-emphasis disclosure: the full reason and what it is grounded in (facts you approved, things you shared). */
export function WhyThis({ reason, facts, captures, testId, summaryTestId, showReason = true, exampleFactIds }: WhyThisProps) {
  return (
    <Disclosure summary="Why this?" testId={testId} summaryTestId={summaryTestId} className="pc-why-details">
      {showReason && <p>{reason}</p>}
      {facts.length === 0 && captures.length === 0 ? (
        <p className="muted small">Grounded in what you shared; nothing else was read.</p>
      ) : (
        <ul className="pc-evidence">
          {captures.map((c) => (
            <li key={c.id}>
              <span className="pc-evidence-kind">{c.sourceLabel}</span>
              <span className="pc-evidence-text">{c.text ? truncate(c.text, 120) : c.linkMeta?.title ?? c.url ?? 'Screenshot'}</span>
              <span className="pc-evidence-status">{readStatusLabel(c)}</span>
            </li>
          ))}
          {facts.map((f) => {
            const example = exampleFactIds?.has(f.id) ?? false;
            return (
              <li key={f.id}>
                <span className="pc-evidence-kind">{example ? 'From the example profile' : 'From your memory'}</span>
                <span className="pc-evidence-text">{f.value}</span>
                {example && <ExampleTag />}
                <FactStatusChip status={f.status} />
              </li>
            );
          })}
        </ul>
      )}
    </Disclosure>
  );
}

export interface ProposalTestIds {
  card: string;
  action: string;
  why?: string;
  dismiss?: string;
}

interface ProposalCardProps {
  proposal: Recommendation;
  facts?: ProfileFact[];
  captures?: Capture[];
  variant: 'thread' | 'grid' | 'featured';
  testIds: ProposalTestIds;
  onDismiss?: (proposal: Recommendation) => void;
  dismissing?: boolean;
  /** Extra test id for the featured card. */
  featuredTestId?: string;
  /** Show which adapter made this card (set when the list mixes live and sample proposals). */
  showProvenance?: boolean;
  exampleFactIds?: ReadonlySet<string>;
}

export function ProposalCard({ proposal: p, facts = [], captures = [], variant, testIds, onDismiss, dismissing, featuredTestId, showProvenance, exampleFactIds }: ProposalCardProps) {
  const action = proposalAction(p);
  const theme = p.kind === 'explore' ? 'lilac' : p.kind === 'keep' ? 'paper' : defaultLook(p);
  const canDismiss = onDismiss && p.status === 'fresh';
  const sentence = firstSentence(p.reason);
  const hasMore = sentence.length < p.reason.trim().length;
  return (
    <article
      className={`pc pc-${variant}`}
      data-testid={testIds.card}
      data-kind={p.kind}
      data-rec-id={p.id}
      data-status={p.status}
      {...(variant === 'featured' && featuredTestId ? { 'data-featured': 'true' } : {})}
    >
      {variant === 'featured' && featuredTestId && <span className="sr-only" data-testid={featuredTestId}>Featured</span>}
      <Link to={action.to} className="pc-media" tabIndex={-1} aria-hidden="true">
        <MiniPreview pattern={p.pattern} kind={p.kind} theme={theme} lines={p.previewLines} size={variant === 'featured' ? 'featured' : 'card'} />
      </Link>
      <div className="pc-body">
        <div className="pc-head">
          <AppIcon icon={p.icon} size={variant === 'featured' ? 36 : 28} title={`${p.title} icon`} />
          <span className="pc-kind">{PROPOSAL_KIND_LABELS[p.kind]}</span>
          {p.status === 'built' && <span className="badge badge-ok">Made</span>}
          {p.status === 'applied' && <span className="badge badge-ok">Added</span>}
          {p.status === 'kept' && <span className="badge">Kept</span>}
          {showProvenance && p.generatedBy === 'sample' && (
            <span className="badge badge-sample" title="Designed from the built-in catalog, not by the model" data-testid="pc-sample">Sample</span>
          )}
        </div>
        <h3 className="pc-title">{p.title}</h3>
        <p className="pc-reason">{sentence}</p>
        {variant !== 'thread' && p.kind !== 'keep' && p.previewLines.length > 0 && (
          <ul className="pc-lines" aria-label="What is inside">
            {p.previewLines.slice(0, variant === 'featured' ? 4 : 3).map((l, i) => (
              <li key={`${i}-${l}`}>{l}</li>
            ))}
          </ul>
        )}
        <div className="pc-actions">
          <Link to={action.to} className={`btn ${action.emphasis === 'primary' ? 'btn-primary' : 'btn-secondary'}`} data-testid={testIds.action} data-action={action.label}>
            {action.label}
          </Link>
          <WhyThis reason={p.reason} facts={facts} captures={captures} testId={testIds.why} showReason={hasMore} exampleFactIds={exampleFactIds} />
          {canDismiss && (
            <button type="button" className="btn btn-ghost btn-sm pc-dismiss" onClick={() => onDismiss(p)} disabled={dismissing} data-testid={testIds.dismiss}>
              Not for me
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

/** Skeleton cards that hold the editorial grid shape while proposals load or regenerate. */
export function ProposalSkeletons({ message, testId }: { message: string; testId?: string }) {
  return (
    <div className="pg-grid pg-grid-loading" data-testid={testId} aria-busy="true">
      <p className="pg-loading-note muted" role="status" aria-live="polite">{message}</p>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className={`pc pc-skeleton ${i === 0 ? 'pc-featured' : 'pc-grid'}`} aria-hidden="true">
          <div className="pc-media skeleton" />
          <div className="pc-body">
            <div className="skeleton" style={{ height: 14, width: '30%' }} />
            <div className="skeleton" style={{ height: 24, width: '70%' }} />
            <div className="skeleton" style={{ height: 16, width: '92%' }} />
            <div className="skeleton" style={{ height: 44, width: 140, borderRadius: 12 }} />
          </div>
        </div>
      ))}
    </div>
  );
}
