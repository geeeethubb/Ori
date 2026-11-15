/** Captures (what the person shared with the Agent) and the agent's replies. Owner-scoped. */
import { getDb, nowIso, transaction } from '../db/index.ts';
import { newId } from '../../shared/ids.ts';
import type { AgentReply, Capture, CaptureKind, LinkMeta, ReadStatus, Recommendation, UnsupportedItem } from '../../shared/context.ts';
import { approvedFacts, forgetLearnedFrom, listRecommendations, setRecommendationStatus } from './context.ts';

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
  /** Client-minted id: a retried share with the same id is the same capture. */
  id?: string;
}

/**
 * Whether a capture id exists at all (any owner) or belonged to a share that was forgotten; used to keep
 * client-minted ids from colliding and a forgotten share from coming back.
 */
export function captureIdTaken(id: string): boolean {
  return Boolean(getDb().prepare('SELECT 1 FROM captures WHERE id = ? UNION ALL SELECT 1 FROM forgotten_captures WHERE id = ?').get(id, id));
}

/** Whether this person forgot a share with this id. */
export function captureForgotten(ownerId: string, id: string): boolean {
  return Boolean(getDb().prepare('SELECT 1 FROM forgotten_captures WHERE id = ? AND owner_id = ?').get(id, ownerId));
}

export function createCapture(ownerId: string, input: NewCapture): Capture {
  const id = input.id ?? newId();
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

/**
 * Forget a capture: its reply and proposals go with it (cascade), and so does what was learned from it
 * alone. Playground cards that cited it lose that grounding: removed when nothing else grounds them,
 * otherwise marked stale. Media stays until deleted explicitly; apps built from it keep their data.
 * Its id is kept as forgotten, so a retried send of the same share is refused instead of saved again.
 */
export function deleteCapture(ownerId: string, id: string): boolean {
  return transaction(() => {
    if (!getCapture(ownerId, id)) return false;
    getDb().prepare('DELETE FROM recommendations WHERE owner_id = ? AND capture_id = ?').run(ownerId, id);
    getDb().prepare('DELETE FROM captures WHERE id = ? AND owner_id = ?').run(id, ownerId);
    getDb().prepare('INSERT OR IGNORE INTO forgotten_captures (id, owner_id, forgotten_at) VALUES (?, ?, ?)').run(id, ownerId, nowIso());
    forgetLearnedFrom(ownerId, id);
    const facts = new Set(approvedFacts(ownerId).map((f) => f.id));
    for (const rec of listRecommendations(ownerId, ['fresh', 'stale'])) {
      if (rec.captureId || !rec.sourceCaptureIds.includes(id)) continue;
      const otherCaptures = rec.sourceCaptureIds.filter((c) => c !== id && getCapture(ownerId, c));
      const grounded = otherCaptures.length > 0 || rec.evidenceFactIds.some((f) => facts.has(f));
      if (grounded) setRecommendationStatus(ownerId, rec.id, 'stale');
      else getDb().prepare('DELETE FROM recommendations WHERE id = ? AND owner_id = ?').run(rec.id, ownerId);
    }
    return true;
  });
}

// ---------- replies ----------

export function saveReply(ownerId: string, input: { captureId: string; message: string; question?: string | null; unsupported?: UnsupportedItem[]; generatedBy: 'anthropic' | 'sample'; fallbackReason?: string | null }): void {
  const unsupported = input.unsupported?.length ? JSON.stringify(input.unsupported.slice(0, 4)) : null;
  getDb()
    .prepare('INSERT OR REPLACE INTO agent_replies (capture_id, owner_id, message, question, generated_by, fallback_reason, created_at, unsupported_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(input.captureId, ownerId, input.message.slice(0, 700), input.question?.slice(0, 200) ?? null, input.generatedBy, input.fallbackReason ?? null, nowIso(), unsupported);
}

function parseUnsupported(raw: unknown): UnsupportedItem[] {
  if (!raw) return [];
  try {
    const list = JSON.parse(String(raw)) as unknown;
    return Array.isArray(list) ? (list as UnsupportedItem[]) : [];
  } catch {
    return [];
  }
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
    unsupported: parseUnsupported(r.unsupported_json),
    generatedBy: String(r.generated_by) as AgentReply['generatedBy'],
    fallbackReason: (r.fallback_reason as string | null) ?? null,
    createdAt: String(r.created_at),
  };
}
