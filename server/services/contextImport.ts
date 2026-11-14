/** Shared import pipeline: create a source, extract facts, merge with existing facts, mark conflicts. */
import { newId } from '../../shared/ids.ts';
import type { ContextSource, ProfileFact } from '../../shared/context.ts';
import * as ctx from '../repos/context.ts';
import { sampleAdapter, withModel } from '../model/index.ts';
import type { AdapterResult } from '../model/types.ts';
import type { ExtractionResult } from '../../shared/context.ts';

export interface ImportOutcome {
  source: ContextSource;
  facts: ProfileFact[];
  note?: string;
  generatedBy: 'anthropic' | 'sample';
  fallbackReason?: string;
}

export async function importSource(
  ownerId: string,
  input: { label: string; kind: 'paste' | 'upload' | 'manual' | 'sample'; text: string },
  opts: { forceSample?: boolean } = {},
): Promise<ImportOutcome> {
  const source = ctx.createSource(ownerId, input);
  const existing = ctx.listFacts(ownerId);
  const result: AdapterResult<ExtractionResult> = opts.forceSample
    ? await sampleAdapter.extractFacts({ source, existingFacts: existing })
    : await withModel(ownerId, 'extract', (a) => a.extractFacts({ source, existingFacts: existing }));

  const byNorm = new Map(existing.map((f) => [ctx.normalizeFact(f.value), f]));
  const created: (ProfileFact | null)[] = [];
  for (const ef of result.data.facts) {
    const norm = ctx.normalizeFact(ef.value);
    const dup = byNorm.get(norm);
    if (dup) {
      const sourceIds = dup.sourceIds.includes(source.id) ? dup.sourceIds : [...dup.sourceIds, source.id];
      const status = dup.status === 'inferred' && ef.status === 'confirmed' ? 'confirmed' : dup.status;
      ctx.updateFact(ownerId, dup.id, { sourceIds, status, confidence: Math.max(dup.confidence, ef.confidence) });
      created.push(null);
      continue;
    }
    const fact = ctx.insertFact(ownerId, { category: ef.category, value: ef.value, status: ef.status, confidence: ef.confidence, sourceIds: [source.id], evidence: ef.evidence ?? null });
    byNorm.set(norm, fact);
    created.push(fact);
  }
  for (const [a, b] of result.data.conflicts) {
    const fa = created[a];
    const fb = created[b];
    if (!fa || !fb) continue;
    const group = fa.conflictGroup ?? fb.conflictGroup ?? newId(10);
    ctx.updateFact(ownerId, fa.id, { status: 'conflict', conflictGroup: group });
    ctx.updateFact(ownerId, fb.id, { status: 'conflict', conflictGroup: group });
  }
  const createdIds = new Set(created.filter((c): c is ProfileFact => Boolean(c)).map((c) => c.id));
  const fresh = ctx.listFacts(ownerId).filter((f) => createdIds.has(f.id));
  return { source: { ...source, text: '' }, facts: fresh, note: result.data.note, generatedBy: result.generatedBy, fallbackReason: result.fallbackReason };
}
