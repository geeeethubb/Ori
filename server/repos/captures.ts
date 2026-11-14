/** Captures (what the person shared with the Agent) and the agent's replies. Owner-scoped. */
import { getDb, nowIso, transaction } from '../db/index.ts';
import { newId } from '../../shared/ids.ts';
import type { AgentReply, Capture, CaptureKind, LinkMeta, ReadStatus, Recommendation } from '../../shared/context.ts';
import { listRecommendations } from './context.ts';

type R = Record<string, unknown>;

function rowToCapture(r: R): Capture {
  return {
    id: String(r.id),
    ownerId: String(r.owner_id),
    kind: String(r.kind) as CaptureKind,
    text: String(r.text ?? ''),
    url: (r.url as string | null) ?? null,
    linkMeta: r.link_meta_json ? (JSON.parse(String(r.link_meta_json)) as LinkMeta) : null,
    mediaId: (r.media_id as string | null) ?? null,
    readStatus: String(r.read_status) as ReadStatus,
    sourceLabel: String(r.source_label),
    isExample: Boolean(r.is_example),
    createdAt: String(r.created_at),
  };
}

export interface NewCapture {
  kind: CaptureKind;
  text: string;
  url?: string | null;
  linkMeta?: LinkMeta | null;
  mediaId?: string | null;
  readStatus: ReadStatus;
  sourceLabel: string;
  isExample?: boolean;
}

export function createCapture(ownerId: string, input: NewCapture): Capture {
  const id = newId();
  getDb()
    .prepare('INSERT INTO captures (id, owner_id, kind, text, url, link_meta_json, media_id, read_status, source_label, is_example, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, ownerId, input.kind, input.text.slice(0, 4000), input.url ?? null, input.linkMeta ? JSON.stringify(input.linkMeta) : null, input.mediaId ?? null, input.readStatus, input.sourceLabel.slice(0, 80), input.isExample ? 1 : 0, nowIso());
  return getCapture(ownerId, id) as Capture;
}

export function getCapture(ownerId: string, id: string): Capture | null {
  const r = getDb().prepare('SELECT * FROM captures WHERE id = ? AND owner_id = ?').get(id, ownerId) as R | undefined;
  return r ? rowToCapture(r) : null;
}

export function listCaptures(ownerId: string, limit = 50): Capture[] {
  const rows = getDb().prepare('SELECT * FROM captures WHERE owner_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?').all(ownerId, limit) as R[];
  return rows.map(rowToCapture);
}

export function updateCaptureReadStatus(ownerId: string, id: string, readStatus: ReadStatus): void {
  getDb().prepare('UPDATE captures SET read_status = ? WHERE id = ? AND owner_id = ?').run(readStatus, id, ownerId);
}

/** Forget a capture: its reply and proposals go with it (cascade); media stays until deleted explicitly. */
export function deleteCapture(ownerId: string, id: string): boolean {
  return transaction(() => {
    if (!getCapture(ownerId, id)) return false;
    getDb().prepare('DELETE FROM recommendations WHERE owner_id = ? AND capture_id = ?').run(ownerId, id);
    getDb().prepare('DELETE FROM captures WHERE id = ? AND owner_id = ?').run(id, ownerId);
    return true;
  });
}

// ---------- replies ----------

export function saveReply(ownerId: string, input: { captureId: string; message: string; question?: string | null; generatedBy: 'anthropic' | 'sample'; fallbackReason?: string | null }): void {
  getDb()
    .prepare('INSERT OR REPLACE INTO agent_replies (capture_id, owner_id, message, question, generated_by, fallback_reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(input.captureId, ownerId, input.message.slice(0, 700), input.question?.slice(0, 200) ?? null, input.generatedBy, input.fallbackReason ?? null, nowIso());
}

export function getReply(ownerId: string, captureId: string, proposals?: Recommendation[]): AgentReply | null {
  const r = getDb().prepare('SELECT * FROM agent_replies WHERE capture_id = ? AND owner_id = ?').get(captureId, ownerId) as R | undefined;
  if (!r) return null;
  const list = proposals ?? listRecommendations(ownerId, ['fresh', 'built', 'kept', 'applied', 'dismissed']).filter((p) => p.captureId === captureId);
  return {
    captureId,
    message: String(r.message),
    question: (r.question as string | null) ?? null,
    proposals: list,
    generatedBy: String(r.generated_by) as AgentReply['generatedBy'],
    fallbackReason: (r.fallback_reason as string | null) ?? null,
    createdAt: String(r.created_at),
  };
}
