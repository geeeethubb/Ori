/** Revision proposals: what a planner suggested, awaiting the user's decision. */
import { getDb, nowIso } from '../db/index.ts';
import { newId } from '../../shared/ids.ts';
import { RevisionProposalSchema, type RevisionProposal } from '../../shared/revision.ts';

export interface StoredProposal {
  id: string;
  appId: string;
  ownerId: string;
  baseVersion: number;
  request: string;
  proposal: RevisionProposal;
  generatedBy: 'anthropic' | 'sample';
  status: string;
  createdAt: string;
}

export function saveProposal(input: Omit<StoredProposal, 'id' | 'status' | 'createdAt'>): StoredProposal {
  const id = newId();
  const createdAt = nowIso();
  getDb()
    .prepare('INSERT INTO revision_proposals (id, app_id, owner_id, base_version, request, proposal_json, generated_by, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, input.appId, input.ownerId, input.baseVersion, input.request.slice(0, 2000), JSON.stringify(input.proposal), input.generatedBy, 'proposed', createdAt);
  return { ...input, id, status: 'proposed', createdAt };
}

export function getProposal(ownerId: string, proposalId: string): StoredProposal | null {
  const r = getDb().prepare('SELECT * FROM revision_proposals WHERE id = ? AND owner_id = ?').get(proposalId, ownerId) as Record<string, unknown> | undefined;
  if (!r) return null;
  return {
    id: String(r.id),
    appId: String(r.app_id),
    ownerId: String(r.owner_id),
    baseVersion: Number(r.base_version),
    request: String(r.request),
    proposal: RevisionProposalSchema.parse(JSON.parse(String(r.proposal_json))),
    generatedBy: String(r.generated_by) as 'anthropic' | 'sample',
    status: String(r.status),
    createdAt: String(r.created_at),
  };
}

/** Owner- and app-scoped: a proposal id from someone else (or another app) changes nothing. */
export function setProposalStatus(ownerId: string, appId: string, proposalId: string, status: string): boolean {
  const r = getDb().prepare('UPDATE revision_proposals SET status = ? WHERE id = ? AND owner_id = ? AND app_id = ?').run(status, proposalId, ownerId, appId);
  return Number(r.changes) > 0;
}
