/**
 * The sample-mode concept catalog: the original 28 app concepts, split evenly enough between
 * "Get things done" and "Explore life", plus the redesign's three reference concepts (Riff, Light,
 * People). Order matters: it is the deterministic tie-break for recommendations.
 */
import { normalize } from './text.ts';
import { EXPLORE_CONCEPTS } from './concepts-explore.ts';
import { WORK_CONCEPTS } from './concepts-work.ts';
import { PLAYGROUND_CONCEPTS } from './concepts-playground.ts';
import { SKETCH_PRACTICE } from './concepts-sketch.ts';

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

/** Concepts scored for Playground recommendations (the original catalog). */
export const CONCEPTS: Concept[] = interleave(WORK_CONCEPTS, EXPLORE_CONCEPTS);

/** The redesign's reference concepts, used by the Agent and by builds that name them. */
export { PLAYGROUND_CONCEPTS };

/** Concepts only the Agent proposes (a domain's app that the Playground does not score): sketching practice. */
export const AGENT_CONCEPTS: Concept[] = [SKETCH_PRACTICE];

/** Every concept that can be looked up or built. */
export const ALL_CONCEPTS: Concept[] = [...CONCEPTS, ...PLAYGROUND_CONCEPTS, ...AGENT_CONCEPTS];

/** Shown when the context says too little to match anything: the three reference experiences. */
export const DEFAULT_CONCEPT_IDS = ['people-queue', 'light-gallery', 'riff-practice'] as const;

const byId = new Map(ALL_CONCEPTS.map((c) => [c.id, c]));

export function conceptById(id: string | undefined): Concept | undefined {
  return id ? byId.get(id) : undefined;
}

/** Find a concept by its title (case/punctuation-insensitive), e.g. from an existing app's name. */
export function conceptByTitle(title: string | undefined): Concept | undefined {
  if (!title) return undefined;
  const n = normalize(title);
  return ALL_CONCEPTS.find((c) => normalize(c.title) === n);
}

/** Best-effort concept for a spec: by name, else the first concept with the same pattern and purpose. */
export function conceptForSpec(spec: { name: string; pattern: Concept['pattern']; purpose: Concept['purpose'] }): Concept | undefined {
  return conceptByTitle(spec.name) ?? ALL_CONCEPTS.find((c) => c.pattern === spec.pattern && c.purpose === spec.purpose) ?? ALL_CONCEPTS.find((c) => c.pattern === spec.pattern);
}
