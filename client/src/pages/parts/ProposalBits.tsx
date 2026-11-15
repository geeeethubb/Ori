/**
 * Proposal cards in Ori's vocabulary, shared by the Agent conversation and the Playground.
 *
 * Agent: the lead card (icon tile, name, one line, a real preview, "Preview <App>" / "Open <App>" /
 * "Try it" / "Preview change", "Keep inspiration" when the reply offers a plain save, and "Why this?")
 * and compact cards for the other directions. Playground: visually varied cards whose preview follows
 * the proposal's own domain, one relevance sentence, a "Preview" pill and "Why this?"; plus the two
 * special cards ("Something unexpected", "Make something new").
 *
 * Provenance stays behind "Why this?": the things the person shared (with what was actually read) and
 * remembered facts, where facts from the example profile say so (audit P1-04).
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import type { AppIcon as AppIconSpec } from '@shared/appSpec.ts';
import type { Capture, ProfileFact, Recommendation } from '@shared/context.ts';
import { readStatusLabel } from '@shared/context.ts';
import { AppIcon } from '../../components/AppIcon.tsx';
import { Disclosure, Icons } from '../../components/ui.tsx';
import { FactStatusChip } from './badges.tsx';
import {
  defaultLook, draftSummary, exampleQuoteLead, groundedReason, photoWords, previewDomain, proposalAction, proposalMinutes, relevanceLine, truncate,
  type GridSpan, type PreviewDomain,
} from './helpers.ts';
import { MiniPreview } from './MiniPreview.tsx';
import '../agent.css';
import '../playground.css';

// ---------- "Why this?" ----------

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
  className?: string;
  /** Extra controls at the end of the disclosure (e.g. "Not for me"). */
  children?: ReactNode;
}

/**
 * Low-emphasis disclosure: the full reason and what it is grounded in (things you shared, facts you
 * approved). Words quoted from the example profile are introduced as the example's, never as "You shared".
 */
export function WhyThis({ reason, facts, captures, testId, summaryTestId, showReason = true, exampleFactIds, className, children }: WhyThisProps) {
  const lead = exampleQuoteLead(facts, captures, exampleFactIds);
  return (
    <Disclosure summary="Why this?" testId={testId} summaryTestId={summaryTestId} className={`ow${className ? ` ${className}` : ''}`}>
      {showReason && <p className="ow-reason">{groundedReason(reason, lead)}</p>}
      {facts.length === 0 && captures.length === 0 ? (
        <p className="ow-none">Grounded in what you shared; nothing else was read.</p>
      ) : (
        <ul className="ow-list">
          {captures.map((c) => (
            <li key={c.id}>
              <span className="ow-kind">{c.isExample ? 'Example you tried' : photoWords(c.sourceLabel)}</span>
              <span className="ow-text">{c.text ? truncate(c.text, 120) : c.linkMeta?.title ?? c.url ?? 'Photo'}</span>
              <span className="ow-status">{photoWords(readStatusLabel(c))}</span>
            </li>
          ))}
          {facts.map((f) => {
            const example = exampleFactIds?.has(f.id) ?? false;
            return (
              <li key={f.id} data-example={example ? 'true' : undefined}>
                <span className="ow-kind">{example ? 'From the example profile' : 'From your memory'}</span>
                <span className="ow-text">{f.value}</span>
                <FactStatusChip status={f.status} example={example} />
              </li>
            );
          })}
        </ul>
      )}
      {children}
    </Disclosure>
  );
}

export interface ProposalTestIds {
  card: string;
  action: string;
  why?: string;
  dismiss?: string;
  keep?: string;
}

/** Facts and captures a proposal cites, resolved from the page's maps. */
export function citedBy(p: Recommendation, factMap: Map<string, ProfileFact>, captureMap: Map<string, Capture>): { facts: ProfileFact[]; captures: Capture[] } {
  return {
    facts: p.evidenceFactIds.map((id) => factMap.get(id)).filter((f): f is ProfileFact => Boolean(f)),
    captures: p.sourceCaptureIds.map((id) => captureMap.get(id)).filter((c): c is Capture => Boolean(c)),
  };
}

/** True when everything a proposal cites comes from the example profile (nothing the person shared). */
export function onlyExampleGrounded(facts: ProfileFact[], captures: Capture[], exampleFactIds?: ReadonlySet<string>): boolean {
  return facts.length > 0 && captures.every((c) => c.isExample) && facts.every((f) => exampleFactIds?.has(f.id));
}

/** The look a proposal's illustration uses: lilac for explorations, ink for a music timer, else the proposal's own design. */
export function stageTheme(p: Recommendation, domain: PreviewDomain) {
  if (p.kind === 'explore') return 'lilac' as const;
  if (p.pattern === 'practice' && domain === 'music') return 'ink' as const;
  if (domain === 'people') return 'bright' as const;
  return defaultLook(p);
}

function StatusBadge({ p }: { p: Recommendation }) {
  if (p.status === 'built') return <span className="badge badge-ok">Made</span>;
  if (p.status === 'applied') return <span className="badge badge-ok">{p.kind === 'use_app' ? 'Opened' : 'Applied'}</span>;
  if (p.status === 'stale') return <span className="badge badge-warn">Out of date</span>;
  return null;
}

// ---------- the Agent conversation ----------

export interface KeepOption {
  proposal: Recommendation;
  busy: boolean;
  onKeep: () => void;
}

interface ThreadCardProps {
  proposal: Recommendation;
  /** The rich first card of a reply; the others are compact. */
  lead: boolean;
  facts?: ProfileFact[];
  captures?: Capture[];
  exampleFactIds?: ReadonlySet<string>;
  /** The person's app this proposal points at (use_app / update_app). */
  app?: { name: string; icon: AppIconSpec } | null;
  /** The person's own photo from this share (an object URL) for a photo preview. */
  ownPhoto?: string | null;
  /** "Keep inspiration": the reply's plain save, folded into the lead card. */
  keep?: KeepOption | null;
  testIds: ProposalTestIds;
}

/** One proposal in the Agent conversation. */
export function ThreadCard({ proposal: p, lead, facts = [], captures = [], exampleFactIds, app, ownPhoto, keep, testIds }: ThreadCardProps) {
  const appName = p.kind === 'use_app' || p.kind === 'update_app' ? app?.name ?? null : p.title;
  const action = proposalAction(p, appName);
  const iconName = p.kind === 'use_app' || p.kind === 'update_app' ? app?.name ?? p.title : p.title;
  const icon = (p.kind === 'use_app' || p.kind === 'update_app') && app ? app.icon : p.icon;
  const keepAction = keep ? proposalAction(keep.proposal) : null;
  const domain = previewDomain(p);
  // "Try it" and "Preview change" also name their proposal, for people who move between links.
  const actionLink = (
    <Link
      to={action.to}
      className={`btn ${lead ? 'btn-primary oc-primary' : 'btn-secondary btn-sm'}`}
      data-testid={testIds.action}
      data-action={action.label}
      aria-label={action.label === action.short ? `${action.label}: ${p.title}` : undefined}
    >
      {action.label}
    </Link>
  );

  if (!lead) {
    return (
      <article className="oc oc-compact" data-testid={testIds.card} data-kind={p.kind} data-rec-id={p.id} data-status={p.status}>
        {p.kind === 'explore' ? (
          <span className="oc-tile oc-tile-explore" aria-hidden="true">{Icons.compass}</span>
        ) : (
          <AppIcon icon={icon} name={iconName} size={40} title="" />
        )}
        <div className="oc-compact-text">
          <h3 className="oc-compact-title">{p.title}</h3>
          <p className="oc-compact-line">{p.kind === 'explore' ? 'No app needed: a few steps to try once.' : p.tagline}</p>
        </div>
        <StatusBadge p={p} />
        {actionLink}
      </article>
    );
  }

  // An entry for an app the person has is shown as what it would hold; a new app or an idea shows a preview.
  const draftLines = p.kind === 'use_app' && p.recordDraft ? draftSummary(p.recordDraft) : null;
  const showMedia = p.kind === 'new_app' || p.kind === 'explore';
  return (
    <article className="oc oc-lead" data-testid={testIds.card} data-kind={p.kind} data-rec-id={p.id} data-status={p.status}>
      <div className="oc-head">
        {p.kind === 'explore' ? (
          <span className="oc-tile oc-tile-explore oc-tile-lg" aria-hidden="true">{Icons.compass}</span>
        ) : (
          <AppIcon icon={icon} name={iconName} size={48} title="" />
        )}
        <div className="oc-head-text">
          <h3 className="oc-title">{p.title}</h3>
          <p className="oc-line">{p.kind === 'explore' ? 'No app needed: a few steps to try once.' : p.tagline}</p>
        </div>
        <StatusBadge p={p} />
      </div>
      {showMedia && (
        <MiniPreview
          variant="strip"
          pattern={p.pattern}
          kind={p.kind}
          theme={stageTheme(p, domain)}
          domain={domain}
          lines={p.previewLines}
          prompt={p.firstAction}
          steps={p.explorationSteps}
          minutes={proposalMinutes(p)}
          ownPhoto={ownPhoto}
          className="oc-media"
        />
      )}
      {draftLines && (
        <div className="oc-entry" data-testid="proposal-entry">
          <span className="oc-entry-kicker">To check and save in {app?.name ?? 'your app'}</span>
          <ul>
            {draftLines.map((l, i) => <li key={`${i}-${l}`}>{l}</li>)}
          </ul>
        </div>
      )}
      <div className="oc-actions">
        {actionLink}
        {keep && keepAction && (
          keep.proposal.status === 'kept' ? (
            <span className="oc-kept" data-testid={testIds.keep} data-state="kept">{Icons.check} Kept</span>
          ) : (
            <button type="button" className="btn btn-secondary oc-keep" onClick={keep.onKeep} disabled={keep.busy} data-testid={testIds.keep}>
              {keep.busy ? 'Keeping…' : keepAction.label}
            </button>
          )
        )}
      </div>
      <WhyThis reason={p.reason} facts={facts} captures={captures} testId={testIds.why} exampleFactIds={exampleFactIds} className="oc-why" />
    </article>
  );
}

/** A reply that is only "keep it": the save itself, with the one action. */
export function KeepCard({ keep, testIds }: { keep: KeepOption; testIds: ProposalTestIds }) {
  const p = keep.proposal;
  const kept = p.status === 'kept';
  return (
    <article className="oc oc-compact oc-keepcard" data-testid={testIds.card} data-kind="keep" data-rec-id={p.id} data-status={p.status}>
      <span className="oc-tile oc-tile-keep" aria-hidden="true">{Icons.bookmark}</span>
      <div className="oc-compact-text">
        <h3 className="oc-compact-title">{kept ? 'Kept as inspiration' : 'Keep it as inspiration'}</h3>
        <p className="oc-compact-line">No app and nothing added to your memory. <Link to="/settings/memory">See what you've shared</Link>.</p>
      </div>
      {kept ? (
        <span className="oc-kept" data-testid={testIds.keep} data-state="kept">{Icons.check} Kept</span>
      ) : (
        <button type="button" className="btn btn-secondary btn-sm" onClick={keep.onKeep} disabled={keep.busy} data-testid={testIds.keep}>
          {keep.busy ? 'Keeping…' : 'Keep inspiration'}
        </button>
      )}
    </article>
  );
}

// ---------- the Playground ----------

interface PlayCardProps {
  proposal: Recommendation;
  feature: boolean;
  span: GridSpan;
  facts?: ProfileFact[];
  captures?: Capture[];
  exampleFactIds?: ReadonlySet<string>;
  app?: { name: string; icon: AppIconSpec } | null;
  onDismiss?: (proposal: Recommendation) => void;
  dismissing?: boolean;
  /** Show which adapter made this card (when the list mixes live and sample proposals). */
  showProvenance?: boolean;
  /** Mark an idea grounded only in the example profile (default: decided from its citations). */
  markExample?: boolean;
  /**
   * "Update app ideas" is replacing this idea (the server swaps the whole open set when it finishes):
   * it stays readable, but its Preview waits, so nobody opens an idea that is about to go.
   */
  replacing?: boolean;
  testIds: ProposalTestIds;
}

/** A Preview pill that is waiting for the new set of ideas (not a link while it would lead nowhere). */
function WaitingPill({ label, name, testId, action }: { label: string; name: string; testId?: string; action: string }) {
  return (
    <span
      className="opc-pill is-waiting"
      role="link"
      aria-disabled="true"
      aria-label={`${name}, back when the new ideas are ready`}
      data-testid={testId}
      data-action={action}
      data-state="replacing"
    >
      {label}
      <span aria-hidden="true">{Icons.chevronRight}</span>
    </span>
  );
}

export function PlayCard({ proposal: p, feature, span, facts = [], captures = [], exampleFactIds, app, onDismiss, dismissing, showProvenance, markExample, replacing = false, testIds }: PlayCardProps) {
  const domain = previewDomain(p);
  const appName = p.kind === 'use_app' || p.kind === 'update_app' ? app?.name ?? null : p.title;
  const action = proposalAction(p, appName);
  const icon = (p.kind === 'use_app' || p.kind === 'update_app') && app ? app.icon : p.icon;
  const iconName = (p.kind === 'use_app' || p.kind === 'update_app') && app ? app.name : p.title;
  const theme = stageTheme(p, domain);
  const photoStage = domain === 'photo' && p.kind !== 'explore' && (p.pattern === 'gallery' || p.pattern === 'journal' || p.pattern === 'tracker');
  const canDismiss = onDismiss && p.status === 'fresh';
  const fromExample = markExample ?? onlyExampleGrounded(facts, captures, exampleFactIds);
  // The pill names the app when it fits ("Open Riff", "Preview Light"); otherwise its accessible name does.
  const pill = action.label.length <= 13 ? action.label : action.short;
  const pillName = pill === action.label ? (action.label === action.short ? `${action.label}: ${p.title}` : undefined) : action.label;
  return (
    <article
      className={`opc${feature ? ' opc-feature' : ''}`}
      data-testid={testIds.card}
      data-kind={p.kind}
      data-rec-id={p.id}
      data-status={p.status}
      data-domain={domain}
      data-lg={span.lg}
      data-md={span.md}
      data-sm={span.sm}
      {...(feature ? { 'data-featured': 'true' } : {})}
    >
      <div className={`opc-stage themed${photoStage ? ' is-photo' : ''}`} data-theme={theme} data-domain={domain} data-kind={p.kind}>
        <MiniPreview
          variant="stage"
          size={feature ? 'featured' : 'card'}
          pattern={p.pattern}
          kind={p.kind}
          theme={theme}
          domain={domain}
          lines={p.previewLines}
          prompt={p.firstAction}
          steps={p.explorationSteps}
          minutes={proposalMinutes(p)}
          className="opc-mv"
        />
        <div className="opc-name">
          {p.kind === 'explore' ? (
            <span className="oc-tile oc-tile-explore" aria-hidden="true">{Icons.compass}</span>
          ) : (
            <AppIcon icon={icon} name={iconName} size={feature ? 36 : 30} title="" />
          )}
          <h3 className="opc-title">{p.title}</h3>
        </div>
        {/* The whole picture opens the preview; the pill below is the keyboard and screen-reader path. */}
        {!replacing && <Link to={action.to} className="opc-stage-link" tabIndex={-1} aria-hidden="true" />}
      </div>
      <div className="opc-body">
        <p className="opc-line">
          {fromExample && <span className="opc-src">Example profile</span>}
          {relevanceLine(p, feature ? 170 : 120)}
        </p>
        <div className="opc-foot">
          {replacing ? (
            <WaitingPill label={pill} name={pillName ?? pill} testId={testIds.action} action={action.label} />
          ) : (
            <Link to={action.to} className="opc-pill" data-testid={testIds.action} data-action={action.label} aria-label={pillName}>
              {pill}
              <span aria-hidden="true">{Icons.chevronRight}</span>
            </Link>
          )}
          <StatusBadge p={p} />
          {showProvenance && p.generatedBy === 'sample' && (
            <span className="badge badge-sample" title="Designed from the built-in catalog, not by the model" data-testid="pc-sample">Sample</span>
          )}
        </div>
        <WhyThis reason={p.reason} facts={facts} captures={captures} testId={testIds.why} exampleFactIds={exampleFactIds} className="opc-why">
          {canDismiss && (
            <button type="button" className="btn btn-ghost btn-sm ow-dismiss" onClick={() => onDismiss(p)} disabled={dismissing || replacing} data-testid={testIds.dismiss}>
              Not for me
            </button>
          )}
        </WhyThis>
      </div>
    </article>
  );
}

/**
 * "Something unexpected": an exploration the Playground actually has, else a starter in the Agent.
 * The sun and hills are painted inside the card (backgrounds), so nothing reaches past its edges.
 */
export function UnexpectedCard({ proposal, span, replacing = false }: { proposal: Recommendation | null; span: GridSpan; replacing?: boolean }) {
  const to = proposal ? `/make/${proposal.id}` : '/agent?start=try';
  return (
    <article className="opc-special opc-unexpected" data-testid="pg-unexpected" data-lg={span.lg} data-md={span.md} data-sm={span.sm} data-rec-id={proposal?.id}>
      <span className="opc-art opc-art-unexpected" aria-hidden="true" />
      <div className="opc-special-text">
        <h3>Something unexpected</h3>
        <p>{proposal ? proposal.title : 'Tell Ori one thing you would like to try.'}</p>
        {proposal && replacing ? (
          <WaitingPill label="Try it" name={`Try it: ${proposal.title}`} testId="pg-unexpected-action" action="Try it" />
        ) : (
          <Link to={to} className="opc-pill" data-testid="pg-unexpected-action" aria-label={proposal ? `Try it: ${proposal.title}` : 'Explore: tell Ori something to try'}>
            {proposal ? 'Try it' : 'Explore'}
            <span aria-hidden="true">{Icons.chevronRight}</span>
          </Link>
        )}
      </div>
    </article>
  );
}

/** "Make something new": the Agent composer. */
export function MakeNewCard({ span }: { span: GridSpan }) {
  return (
    <Link to="/agent?start=new" className="opc-special opc-make" data-testid="pg-make-new" data-lg={span.lg} data-md={span.md} data-sm={span.sm}>
      <span className="opc-art opc-art-make" aria-hidden="true">
        <i className="opc-card-a" />
        <i className="opc-card-b" />
      </span>
      <span className="opc-make-title">Make something new</span>
      <span className="opc-plus" aria-hidden="true">{Icons.plus}</span>
    </Link>
  );
}

/** Skeleton cards that hold the grid shape while ideas load for the first time. */
export function ProposalSkeletons({ message, testId }: { message: string; testId?: string }) {
  return (
    <div className="opc-grid opc-grid-loading" data-testid={testId} aria-busy="true">
      <p className="opc-loading-note" role="status" aria-live="polite">{message}</p>
      {[0, 1, 2].map((i) => (
        <div key={i} className={`opc opc-skeleton${i === 0 ? ' opc-feature' : ''}`} data-lg={i === 0 ? 4 : 2} data-md={i === 0 ? 2 : 1} data-sm={i === 0 ? 2 : 1} aria-hidden="true">
          <div className="opc-stage skeleton" />
          <div className="opc-body">
            <div className="skeleton" style={{ height: 16, width: '85%' }} />
            <div className="skeleton" style={{ height: 16, width: '60%' }} />
            <div className="skeleton" style={{ height: 40, width: 120, borderRadius: 999 }} />
          </div>
        </div>
      ))}
    </div>
  );
}
