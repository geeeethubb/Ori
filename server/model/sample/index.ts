/**
 * Sample-mode adapter: deterministic heuristics plus a concept catalog. No randomness, no network.
 * It keeps the product fully usable (and honest, via the Sample mode badge) when no AI key is
 * configured or the live model's output fails validation, and it is what browser tests run against.
 */
import type { AppSpec } from '../../../shared/appSpec.ts';
import type { ExtractionResult, GeneratedApp, RecommendationDraft } from '../../../shared/context.ts';
import type { RevisionProposal } from '../../../shared/revision.ts';
import type {
  AdapterResult, ExtractInput, GenerateSpecInput, ImprovementSuggestion, ModelAdapter, RecommendInput, RespondInput, RespondResult, ReviseInput, SuggestInput,
} from '../types.ts';
import { extractFacts } from './extract.ts';
import { generateSpec } from './generate.ts';
import { recommend } from './recommend.ts';
import { respondToCapture } from './respond.ts';
import { proposeRevision } from './revise.ts';
import { suggestImprovement } from './suggest.ts';

const sample = <T>(data: T): AdapterResult<T> => ({ data, generatedBy: 'sample' });

export class SampleAdapter implements ModelAdapter {
  readonly mode = 'sample' as const;

  async extractFacts(input: ExtractInput): Promise<AdapterResult<ExtractionResult>> {
    return sample(extractFacts(input));
  }

  async recommend(input: RecommendInput): Promise<AdapterResult<RecommendationDraft[]>> {
    return sample(recommend(input));
  }

  async generateSpec(input: GenerateSpecInput): Promise<AdapterResult<GeneratedApp & { spec: AppSpec }>> {
    return sample(generateSpec(input));
  }

  async proposeRevision(input: ReviseInput): Promise<AdapterResult<RevisionProposal>> {
    return sample(proposeRevision(input));
  }

  async suggestImprovement(input: SuggestInput): Promise<AdapterResult<ImprovementSuggestion | null>> {
    return sample(suggestImprovement(input));
  }

  async respondToCapture(input: RespondInput): Promise<AdapterResult<RespondResult>> {
    return sample(respondToCapture(input));
  }
}

export const sampleAdapter = new SampleAdapter();

export { ALL_CONCEPTS, CONCEPTS, PLAYGROUND_CONCEPTS, conceptById, conceptByTitle } from './catalog.ts';
export type { Concept } from './catalog.ts';
export { extractFacts } from './extract.ts';
export { recommend } from './recommend.ts';
export { generateSpec } from './generate.ts';
export { proposeRevision } from './revise.ts';
export { suggestImprovement } from './suggest.ts';
export { respondToCapture } from './respond.ts';
export { DOMAINS, detectDomain } from './domains.ts';
export { applyInstructionHeuristics, planInstructions } from './heuristics.ts';
