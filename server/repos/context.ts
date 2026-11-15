/** Context sources, profile facts and recommendations. Owner-scoped at every call. */
import { createHash } from 'node:crypto';
import { getDb, nowIso, transaction } from '../db/index.ts';
import { newId } from '../../shared/ids.ts';
import { RecommendationDraftSchema, type ContextSource, type FactCategory, type FactStatus, type ProfileFact, type Recommendation, type RecommendationDraft, type SourceKind } from '../../shared/context.ts';

type R = Record<string, unknown>;

// ---------- sources ----------

function rowToSource(r: R): ContextSource {
  return {
    id: String(r.id),
    ownerId: String(r.owner_id),
    label: String(r.label),
    kind: String(r.kind) as SourceKind,
    text: String(r.text),
    charCount: Number(r.char_count),
    approved: Boolean(r.approved),
    importedAt: String(r.imported_at),
  };
}

export function listSources(ownerId: string, includeText = false): ContextSource[] {
  const rows = getDb().prepare('SELECT * FROM context_sources WHERE owner_id = ? ORDER BY imported_at DESC').all(ownerId) as R[];
  return rows.map((r) => ({ ...rowToSource(r), text: includeText ? String(r.text) : '' }));
}

/** Sources that count toward the import limit: all but the ones made for shares with the agent (a share is not an import). */
export function countSources(ownerId: string): number {
  return Number((getDb().prepare("SELECT COUNT(*) AS n FROM context_sources WHERE owner_id = ? AND kind <> 'capture'").get(ownerId) as { n: number }).n);
}

export function getSource(ownerId: string, id: string): ContextSource | null {
  const r = getDb().prepare('SELECT * FROM context_sources WHERE id = ? AND owner_id = ?').get(id, ownerId) as R | undefined;
  return r ? rowToSource(r) : null;
}

export function createSource(ownerId: string, input: { label: string; kind: SourceKind; text: string; captureId?: string | null }): ContextSource {
  const id = newId();
  const now = nowIso();
  getDb()
    .prepare('INSERT INTO context_sources (id, owner_id, label, kind, text, char_count, approved, imported_at, capture_id) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)')
    .run(id, ownerId, input.label.slice(0, 80), input.kind, input.text, input.text.length, now, input.captureId ?? null);
  return getSource(ownerId, id) as ContextSource;
}

/** The memory source that points back at one shared item (the first, if older builds made several). */
export function captureSource(ownerId: string, captureId: string): ContextSource | null {
  const r = getDb().prepare('SELECT * FROM context_sources WHERE owner_id = ? AND capture_id = ? ORDER BY imported_at ASC, rowid ASC LIMIT 1').get(ownerId, captureId) as R | undefined;
  return r ? rowToSource(r) : null;
}

/**
 * "Just keep it" and "Forget" mean the shared item does not become memory: remove what the agent inferred
 * from it alone. Facts also backed by other sources, and facts the person confirmed or edited in Memory,
 * only lose this reference. Returns removed fact ids.
 */
export function forgetLearnedFrom(ownerId: string, captureId: string): string[] {
  return transaction(() => {
    const rows = getDb().prepare('SELECT id FROM context_sources WHERE owner_id = ? AND capture_id = ?').all(ownerId, captureId) as R[];
    const removed: string[] = [];
    for (const r of rows) removed.push(...deleteSource(ownerId, String(r.id), { keepConfirmed: true }).removedFactIds);
    return removed;
  });
}

/**
 * Delete a source; facts solely backed by it are removed, others lose the reference. With keepConfirmed,
 * a fact the person confirmed stays even when this was its only source. A fact's evidence quotes its first
 * source, so no fact keeps this source's words: one that stays quotes a share that still backs it, or nothing.
 */
export function deleteSource(ownerId: string, id: string, opts: { keepConfirmed?: boolean } = {}): { ok: boolean; removedFactIds: string[] } {
  return transaction(() => {
    if (!getSource(ownerId, id)) return { ok: false, removedFactIds: [] };
    const removed: string[] = [];
    for (const f of listFacts(ownerId, { includeRemoved: true })) {
      if (!f.sourceIds.includes(id)) continue;
      const rest = f.sourceIds.filter((s) => s !== id);
      if (rest.length === 0 && !(opts.keepConfirmed && f.status === 'confirmed')) {
        getDb().prepare("UPDATE profile_facts SET status = 'removed', source_ids_json = '[]', evidence = NULL, updated_at = ? WHERE id = ?").run(nowIso(), f.id);
        if (f.status !== 'removed') removed.push(f.id);
      } else {
        const next = f.evidence && f.sourceIds[0] === id ? quoteFrom(ownerId, rest, f.value) : { sourceIds: rest, evidence: f.evidence ?? null };
        getDb().prepare('UPDATE profile_facts SET source_ids_json = ?, evidence = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(next.sourceIds), next.evidence, nowIso(), f.id);
      }
    }
    getDb().prepare('DELETE FROM context_sources WHERE id = ? AND owner_id = ?').run(id, ownerId);
    invalidateRecommendationsCiting(ownerId, removed);
    return { ok: true, removedFactIds: removed };
  });
}

/** Lower-case words of any script, for comparing a fact with a sentence. */
function wordsOf(text: string): Set<string> {
  return new Set(text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);
}

/**
 * A fact's evidence once its first source is gone: the sentence of a share that still backs it which shares
 * the most words with the fact (that share then comes first). Never the start of an unrelated note: when no
 * sentence shares a meaningful word with the fact, there is no quote. An import keeps no quote per fact.
 */
function quoteFrom(ownerId: string, sourceIds: string[], factValue: string): { sourceIds: string[]; evidence: string | null } {
  const factWords = [...wordsOf(factValue)].filter((w) => w.length > 2);
  let best: { sid: string; sentence: string; score: number } | null = null;
  for (const sid of sourceIds) {
    const source = getSource(ownerId, sid);
    const words = source?.kind === 'capture' ? source.text.replace(/\s+/g, ' ').trim() : '';
    if (!words) continue;
    for (const sentence of words.split(/(?<=[.!?。！？])\s+/)) {
      const own = wordsOf(sentence);
      const score = factWords.filter((w) => own.has(w) || [...own].some((o) => o.length > 3 && (o.startsWith(w) || w.startsWith(o)))).length;
      if (score > 0 && (!best || score > best.score)) best = { sid, sentence, score };
    }
  }
  if (!best) return { sourceIds, evidence: null };
  const chars = Array.from(best.sentence);
  const quote = chars.length > 240 ? `${chars.slice(0, 239).join('')}…` : best.sentence;
  return { sourceIds: [best.sid, ...sourceIds.filter((s) => s !== best!.sid)], evidence: quote };
}

// ---------- facts ----------

function rowToFact(r: R): ProfileFact & { evidence?: string | null } {
  return {
    id: String(r.id),
    ownerId: String(r.owner_id),
    category: String(r.category) as FactCategory,
    value: String(r.value),
    sourceIds: JSON.parse(String(r.source_ids_json)) as string[],
    confidence: Number(r.confidence),
    status: String(r.status) as FactStatus,
    conflictGroup: (r.conflict_group as string | null) ?? null,
    evidence: (r.evidence as string | null) ?? null,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

export function listFacts(ownerId: string, opts: { includeRemoved?: boolean } = {}): (ProfileFact & { evidence?: string | null })[] {
  const rows = getDb().prepare('SELECT * FROM profile_facts WHERE owner_id = ? ORDER BY created_at ASC').all(ownerId) as R[];
  return rows.map(rowToFact).filter((f) => opts.includeRemoved || f.status !== 'removed');
}

/** Facts usable for generation: confirmed or inferred, never removed or unresolved conflicts. */
export function approvedFacts(ownerId: string): ProfileFact[] {
  return listFacts(ownerId).filter((f) => f.status === 'confirmed' || f.status === 'inferred');
}

export function getFact(ownerId: string, id: string): (ProfileFact & { evidence?: string | null }) | null {
  const r = getDb().prepare('SELECT * FROM profile_facts WHERE id = ? AND owner_id = ?').get(id, ownerId) as R | undefined;
  return r ? rowToFact(r) : null;
}

/**
 * Two facts that say the same thing share this key: letters, marks, digits and symbols of any script (and #,
 * so C# is not C), case-folded, with punctuation read as a space and spaces collapsed. A value with fewer than
 * three of those is too short to compare loosely, so only the same wording matches it. A blank value has no
 * key (''): never merge on it.
 */
export function normalizeFact(value: string): string {
  const folded = value.normalize('NFKC').toLowerCase();
  const loose = folded.replace(/[^\p{L}\p{M}\p{N}\p{S}#]+/gu, ' ').trim();
  if (Array.from(loose.replace(/[\s\p{M}]/gu, '')).length >= 3) return loose;
  const exact = folded.replace(/\s+/g, ' ').trim();
  return exact ? `exact:${exact}` : '';
}

export interface NewFact {
  category: FactCategory;
  value: string;
  status: 'confirmed' | 'inferred' | 'conflict';
  confidence: number;
  sourceIds: string[];
  evidence?: string | null;
  conflictGroup?: string | null;
}

export function insertFact(ownerId: string, f: NewFact): ProfileFact {
  const id = newId();
  const now = nowIso();
  getDb()
    .prepare('INSERT INTO profile_facts (id, owner_id, category, value, source_ids_json, confidence, status, conflict_group, evidence, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, ownerId, f.category, f.value.slice(0, 240), JSON.stringify(f.sourceIds), f.confidence, f.status, f.conflictGroup ?? null, f.evidence?.slice(0, 240) ?? null, now, now);
  return getFact(ownerId, id) as ProfileFact;
}

export function updateFact(ownerId: string, id: string, patch: { value?: string; category?: FactCategory; status?: FactStatus; confidence?: number; sourceIds?: string[]; conflictGroup?: string | null }): ProfileFact | null {
  const f = getFact(ownerId, id);
  if (!f) return null;
  const next = { ...f, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) } as ProfileFact;
  getDb()
    .prepare('UPDATE profile_facts SET category = ?, value = ?, status = ?, confidence = ?, source_ids_json = ?, conflict_group = ?, updated_at = ? WHERE id = ? AND owner_id = ?')
    .run(next.category, next.value.slice(0, 240), next.status, next.confidence, JSON.stringify(next.sourceIds), next.conflictGroup ?? null, nowIso(), id, ownerId);
  if (patch.status === 'removed') invalidateRecommendationsCiting(ownerId, [id]);
  return getFact(ownerId, id);
}

/** Keep one fact of a conflict group; the others are removed. */
export function keepFact(ownerId: string, id: string): ProfileFact[] {
  return transaction(() => {
    const f = getFact(ownerId, id);
    if (!f) return [];
    const group = f.conflictGroup;
    updateFact(ownerId, id, { status: 'confirmed', conflictGroup: null, confidence: Math.max(f.confidence, 0.9) });
    if (group) {
      for (const other of listFacts(ownerId)) {
        if (other.id !== id && other.conflictGroup === group) updateFact(ownerId, other.id, { status: 'removed', conflictGroup: null });
      }
    }
    return listFacts(ownerId);
  });
}

// ---------- recommendations ----------

export function factsHash(facts: Pick<ProfileFact, 'id' | 'value' | 'status'>[]): string {
  const h = createHash('sha256');
  for (const f of [...facts].sort((a, b) => a.id.localeCompare(b.id))) h.update(`${f.id}|${f.status}|${f.value}\n`);
  return h.digest('hex').slice(0, 24);
}

/** Ids of the person's apps that exist now. */
function liveAppIds(ownerId: string): Set<string> {
  return new Set((getDb().prepare('SELECT id FROM apps WHERE owner_id = ?').all(ownerId) as R[]).map((r) => String(r.id)));
}

function rowToRecommendation(r: R, appIds: Set<string>): Recommendation {
  // Rows written by older builds may lack newer fields (kind, citations): the schema fills its defaults.
  // A row that no longer validates is still shown, with safe defaults, rather than crashing a page.
  const raw = JSON.parse(String(r.data_json)) as Record<string, unknown>;
  const parsed = RecommendationDraftSchema.safeParse(raw);
  const data: RecommendationDraft = parsed.success
    ? parsed.data
    : ({ kind: 'new_app', evidenceFactIds: [], sourceCaptureIds: [], capabilities: [], previewLines: [], ...raw } as unknown as RecommendationDraft);
  // A proposal counts as made only while its app exists, and never points at an app that was deleted.
  // Deleting an app resets its proposal; rows from before that are read the same way.
  const builtAppId = typeof r.built_app_id === 'string' && appIds.has(r.built_app_id) ? r.built_app_id : null;
  const status = String(r.status) === 'built' && !builtAppId ? 'fresh' : String(r.status);
  const { targetAppId, ...rest } = data;
  return {
    ...rest,
    ...(targetAppId && appIds.has(targetAppId) ? { targetAppId } : {}),
    id: String(r.id),
    ownerId: String(r.owner_id),
    status: status as Recommendation['status'],
    generatedBy: String(r.generated_by) as Recommendation['generatedBy'],
    inputHash: String(r.input_hash),
    builtAppId,
    captureId: (r.capture_id as string | null) ?? null,
    createdAt: String(r.created_at),
  };
}

export function listRecommendations(ownerId: string, statuses: Recommendation['status'][] = ['fresh', 'built']): Recommendation[] {
  const rows = getDb().prepare('SELECT * FROM recommendations WHERE owner_id = ? ORDER BY created_at DESC').all(ownerId) as R[];
  const appIds = liveAppIds(ownerId);
  return rows.map((r) => rowToRecommendation(r, appIds)).filter((r) => statuses.includes(r.status));
}

export function getRecommendation(ownerId: string, id: string): Recommendation | null {
  const r = getDb().prepare('SELECT * FROM recommendations WHERE id = ? AND owner_id = ?').get(id, ownerId) as R | undefined;
  return r ? rowToRecommendation(r, liveAppIds(ownerId)) : null;
}

/**
 * Stored proposals that read as fresh or stale, so newer ones replace them: this includes a 'built' row whose
 * app no longer exists (it reads as fresh; older builds left such rows when an app was deleted).
 */
const OPEN_PROPOSAL = "(status IN ('fresh', 'stale') OR (status = 'built' AND NOT EXISTS (SELECT 1 FROM apps a WHERE a.id = recommendations.built_app_id AND a.owner_id = recommendations.owner_id)))";

/** Replace the current fresh Playground set (built/dismissed history and capture-born proposals are kept). */
export function replaceFreshRecommendations(ownerId: string, drafts: RecommendationDraft[], generatedBy: Recommendation['generatedBy'], inputHash: string): Recommendation[] {
  return transaction(() => {
    getDb().prepare(`DELETE FROM recommendations WHERE owner_id = ? AND capture_id IS NULL AND ${OPEN_PROPOSAL}`).run(ownerId);
    const now = nowIso();
    for (const d of drafts) {
      getDb()
        .prepare('INSERT INTO recommendations (id, owner_id, data_json, status, generated_by, input_hash, built_app_id, created_at, capture_id) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, NULL)')
        .run(newId(), ownerId, JSON.stringify(d), 'fresh', generatedBy, inputHash, now);
    }
    return listRecommendations(ownerId);
  });
}

/** Store the proposals the Agent made for one capture (they stay until the capture is forgotten). */
export function insertCaptureProposals(ownerId: string, captureId: string, drafts: RecommendationDraft[], generatedBy: Recommendation['generatedBy']): Recommendation[] {
  return transaction(() => {
    getDb().prepare(`DELETE FROM recommendations WHERE owner_id = ? AND capture_id = ? AND ${OPEN_PROPOSAL}`).run(ownerId, captureId);
    const now = nowIso();
    const ids: string[] = [];
    for (const d of drafts) {
      const id = newId();
      ids.push(id);
      getDb()
        .prepare('INSERT INTO recommendations (id, owner_id, data_json, status, generated_by, input_hash, built_app_id, created_at, capture_id) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)')
        .run(id, ownerId, JSON.stringify(d), 'fresh', generatedBy, `capture:${captureId}`, now, captureId);
    }
    return listRecommendations(ownerId, ['fresh']).filter((r) => ids.includes(r.id));
  });
}

export function setRecommendationStatus(ownerId: string, id: string, status: Recommendation['status'], builtAppId?: string): Recommendation | null {
  getDb().prepare('UPDATE recommendations SET status = ?, built_app_id = COALESCE(?, built_app_id) WHERE id = ? AND owner_id = ?').run(status, builtAppId ?? null, id, ownerId);
  return getRecommendation(ownerId, id);
}

/** Fresh recommendations that cite removed facts are no longer grounded → stale. */
export function invalidateRecommendationsCiting(ownerId: string, factIds: string[]): number {
  if (!factIds.length) return 0;
  let n = 0;
  for (const rec of listRecommendations(ownerId, ['fresh'])) {
    if (rec.evidenceFactIds.some((id) => factIds.includes(id))) {
      setRecommendationStatus(ownerId, rec.id, 'stale');
      n++;
    }
  }
  return n;
}
