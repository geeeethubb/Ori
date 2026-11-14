/**
 * The AI boundary. Everything the product asks a model for goes through this interface, so the
 * live Anthropic adapter and the deterministic sample adapter are interchangeable. Imported text
 * is always passed as DATA (inside delimited blocks), never as instructions.
 */
import type { AppIcon, AppSpec, Capability } from '../../shared/appSpec.ts';
import type { AppRecord } from '../../shared/records.ts';
import type {
  AgentReplyDraft, BuildChoices, Capture, ContextSource, ExtractionResult, GeneratedApp, ProfileFact, RecommendationDraft, AppEvent,
} from '../../shared/context.ts';
import type { RevisionProposal } from '../../shared/revision.ts';

export type ModelMode = 'anthropic' | 'sample';

export interface ExtractInput {
  source: Pick<ContextSource, 'id' | 'label' | 'kind' | 'text'>;
  /** Already-known facts (approved) so the extractor can flag contradictions. */
  existingFacts: Pick<ProfileFact, 'id' | 'category' | 'value' | 'status'>[];
}

export interface ExistingAppSummary {
  id: string;
  name: string;
  purpose: string;
  pattern: string;
  tagline?: string;
  capabilities: Capability[];
  /** First timer preset of a practice app (minutes), so a proposal can tell whether a time change is even needed. */
  defaultMinutes?: number;
  /** All timer presets of a practice app (minutes). */
  minutePresets?: number[];
  /** The app's own icon, shown on "use the app you have" cards. */
  icon?: AppIcon;
}

export interface RecommendInput {
  /** Only approved facts (status confirmed or inferred, never removed). */
  facts: Pick<ProfileFact, 'id' | 'category' | 'value' | 'status' | 'confidence'>[];
  /** Apps already in the collection, to avoid duplicates and to propose updates instead. */
  existingApps: ExistingAppSummary[];
  /** Interests the user explicitly chose to explore (also present as facts). */
  chosenInterests: string[];
  /** Recent captures (notes/links) the person shared, for variety. */
  recentCaptures?: Pick<Capture, 'id' | 'kind' | 'text' | 'url' | 'linkMeta' | 'readStatus'>[];
  /** Desired count (3–6). */
  count: number;
}

export interface GenerateSpecInput {
  /** The chosen card (a fact-born recommendation or a capture-born proposal). */
  recommendation: RecommendationDraft;
  /** User's customization instructions (free text, untrusted). */
  instructions: string;
  facts: Pick<ProfileFact, 'id' | 'category' | 'value'>[];
  /** Captures the proposal cites (their text and link titles are the grounding). */
  captures?: Pick<Capture, 'id' | 'kind' | 'text' | 'url' | 'linkMeta' | 'readStatus'>[];
  /** The one or two choices the person made before "Make mine". */
  choices?: BuildChoices;
}

export interface ReviseInput {
  spec: AppSpec;
  request: string; // untrusted free text
  /** A few recent records so the planner understands real usage (values only). */
  sampleRecords: Pick<AppRecord, 'values' | 'createdAt'>[];
  /** Field ids earlier versions used (never reuse one for a different type). */
  reservedFieldIds?: string[];
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

/** What the person shared with the Agent, as the model sees it. */
export interface RespondInput {
  capture: Pick<Capture, 'id' | 'kind' | 'text' | 'url' | 'linkMeta' | 'readStatus' | 'sourceLabel'> & {
    /** The shared photo's media id (owner-checked); an entry for an existing gallery may reference it. */
    mediaId?: string | null;
    /** Present when a screenshot was attached; the live adapter reads it, the sample adapter cannot. */
    image?: { mime: string; base64: string } | null;
  };
  facts: Pick<ProfileFact, 'id' | 'category' | 'value' | 'status'>[];
  existingApps: ExistingAppSummary[];
  recentCaptures: Pick<Capture, 'id' | 'kind' | 'text' | 'url' | 'createdAt'>[];
}

export interface RespondResult extends AgentReplyDraft {
  /** True when the adapter actually read the attached image. */
  imageRead: boolean;
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
  /** The Agent: acknowledge exactly what was received and offer explore / make / update / keep. */
  respondToCapture(input: RespondInput): Promise<AdapterResult<RespondResult>>;
}

/** Thrown by adapters when the model produced something unusable after bounded retries. */
export class ModelOutputError extends Error {
  constructor(message: string, public readonly details?: unknown) {
    super(message);
    this.name = 'ModelOutputError';
  }
}
