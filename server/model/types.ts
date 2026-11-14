/**
 * The AI boundary. Everything the product asks a model for goes through this interface, so the
 * live Anthropic adapter and the deterministic sample adapter are interchangeable. Imported text
 * is always passed as DATA (inside delimited blocks), never as instructions.
 */
import type { AppSpec } from '../../shared/appSpec.ts';
import type { AppRecord } from '../../shared/records.ts';
import type { ContextSource, ExtractionResult, ProfileFact, RecommendationDraft, GeneratedApp, AppEvent } from '../../shared/context.ts';
import type { RevisionProposal } from '../../shared/revision.ts';

export type ModelMode = 'anthropic' | 'sample';

export interface ExtractInput {
  source: Pick<ContextSource, 'id' | 'label' | 'kind' | 'text'>;
  /** Already-known facts (approved) so the extractor can flag contradictions. */
  existingFacts: Pick<ProfileFact, 'id' | 'category' | 'value' | 'status'>[];
}

export interface RecommendInput {
  /** Only approved facts (status confirmed or inferred, never removed). */
  facts: Pick<ProfileFact, 'id' | 'category' | 'value' | 'status' | 'confidence'>[];
  /** Names/purposes of apps already in the collection, to avoid duplicates. */
  existingApps: { name: string; purpose: string; pattern: string }[];
  /** Interests the user explicitly chose to explore (also present as facts). */
  chosenInterests: string[];
  /** Desired count (3–6). */
  count: number;
}

export interface GenerateSpecInput {
  recommendation: RecommendationDraft;
  /** User's customization instructions (free text, untrusted). */
  instructions: string;
  facts: Pick<ProfileFact, 'id' | 'category' | 'value'>[];
}

export interface ReviseInput {
  spec: AppSpec;
  request: string; // untrusted free text
  /** A few recent records so the planner understands real usage (values only). */
  sampleRecords: Pick<AppRecord, 'values' | 'createdAt'>[];
}

export interface SuggestInput {
  spec: AppSpec;
  events: Pick<AppEvent, 'type' | 'at'>[];
  records: Pick<AppRecord, 'values' | 'createdAt'>[];
  /** Explicit user feedback text, when given. */
  feedback?: string;
}

export interface ImprovementSuggestion {
  title: string;
  why: string;
  /** Natural-language request to feed the revision planner when accepted. */
  request: string;
}

export interface AdapterResult<T> {
  data: T;
  /** Which adapter actually produced the result (a live adapter may fall back to sample). */
  generatedBy: ModelMode;
  /** Set when the live adapter failed and the sample adapter answered instead. */
  fallbackReason?: string;
}

export interface ModelAdapter {
  readonly mode: ModelMode;
  extractFacts(input: ExtractInput): Promise<AdapterResult<ExtractionResult>>;
  recommend(input: RecommendInput): Promise<AdapterResult<RecommendationDraft[]>>;
  generateSpec(input: GenerateSpecInput): Promise<AdapterResult<GeneratedApp & { spec: AppSpec }>>;
  proposeRevision(input: ReviseInput): Promise<AdapterResult<RevisionProposal>>;
  suggestImprovement(input: SuggestInput): Promise<AdapterResult<ImprovementSuggestion | null>>;
}

/** Thrown by adapters when the model produced something unusable after bounded retries. */
export class ModelOutputError extends Error {
  constructor(message: string, public readonly details?: unknown) {
    super(message);
    this.name = 'ModelOutputError';
  }
}
