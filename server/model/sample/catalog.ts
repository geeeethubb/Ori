/**
 * The sample-mode concept catalog: 28 app concepts, split evenly enough between "Get things done"
 * and "Explore life". Order matters: it is the deterministic tie-break for recommendations.
 */
import { normalize } from './text.ts';
import { EXPLORE_CONCEPTS } from './concepts-explore.ts';
import { WORK_CONCEPTS } from './concepts-work.ts';

export type { Concept, MatchedFact } from './concept.ts';
import type { Concept } from './concept.ts';

/** Interleave work and explore so catalog-order tie-breaks keep both purposes near the top. */
function interleave(a: Concept[], b: Concept[]): Concept[] {
  const out: Concept[] = [];
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i];
    const y = b[i];
    if (x) out.push(x);
    if (y) out.push(y);
  }
  return out;
}

export const CONCEPTS: Concept[] = interleave(WORK_CONCEPTS, EXPLORE_CONCEPTS);

/** Shown when the context says too little to match anything. */
export const DEFAULT_CONCEPT_IDS = ['people-to-follow-up-with', 'photo-walk-journal', 'habit-streaks'] as const;

const byId = new Map(CONCEPTS.map((c) => [c.id, c]));

export function conceptById(id: string | undefined): Concept | undefined {
  return id ? byId.get(id) : undefined;
}

/** Find a concept by its title (case/punctuation-insensitive), e.g. from an existing app's name. */
export function conceptByTitle(title: string | undefined): Concept | undefined {
  if (!title) return undefined;
  const n = normalize(title);
  return CONCEPTS.find((c) => normalize(c.title) === n);
}

/** Best-effort concept for a spec: by name, else the first concept with the same pattern and purpose. */
export function conceptForSpec(spec: { name: string; pattern: Concept['pattern']; purpose: Concept['purpose'] }): Concept | undefined {
  return conceptByTitle(spec.name) ?? CONCEPTS.find((c) => c.pattern === spec.pattern && c.purpose === spec.purpose);
}
