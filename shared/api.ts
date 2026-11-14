/** DTOs exchanged between client and server. Keep this file dependency-light. */
import type { AppDesign, AppIcon, AppSpec, Capability, Purpose } from './appSpec.ts';
import type { AppRecord } from './records.ts';
import type { AgentReply, AppEvent, Capture, ContextSource, MediaItem, ProfileFact, Recommendation } from './context.ts';
import type { RevisionOp } from './revision.ts';

export interface UserDto {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
  trialStartedAt: string;
  trialEndsAt: string;
  plan: 'trial' | 'intro' | 'personal' | 'paused';
  /** Derived server-side: can the user build/revise right now? */
  premiumActive: boolean;
  aiGenerationsThisMonth: number;
  aiGenerationAllowance: number;
  /** Which model adapter is active for this deployment. */
  modelMode: 'anthropic' | 'sample';
}

export interface AppSummaryDto {
  id: string;
  name: string;
  tagline?: string;
  icon: AppIcon;
  purpose: Purpose;
  pattern: AppSpec['pattern'];
  /** Resolved design (compatibility defaults applied). */
  design: Required<AppDesign>;
  capabilities: Capability[];
  currentVersion: number;
  pinned: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string | null;
  recordCount: number;
  launchPath: string; // "/apps/{id}/"
  /** True when seeded sample content; shown with a label in the UI. */
  isSample: boolean;
}

export interface AppVersionDto {
  version: number;
  spec: AppSpec;
  changeSummary: string;
  origin: 'build' | 'revision' | 'undo' | 'import';
  createdAt: string;
}

export interface AppDetailDto {
  app: AppSummaryDto;
  spec: AppSpec;
  version: number;
  canUndo: boolean;
}

export interface RecordsPageDto {
  records: AppRecord[];
}

export interface RevisionPreviewDto {
  proposalId: string;
  summary: string;
  changes: string[];
  ops: RevisionOp[];
  unsupported: { request: string; reason: string; alternative: string }[];
  previewSpec: AppSpec;
  generatedBy: 'anthropic' | 'sample';
  fallbackReason?: string;
  baseVersion?: number;
}

export interface ImprovementSuggestionDto {
  id: string;
  title: string;
  why: string;
  request: string; // natural-language request that would be sent to the revision planner
}

export interface AppExportDto {
  format: 'ai-app-store/app-export';
  exportVersion: 1;
  exportedAt: string;
  app: { id: string; name: string; icon: AppIcon; purpose: Purpose; createdAt: string };
  versions: AppVersionDto[];
  records: AppRecord[];
  events: AppEvent[];
}

export interface ContextOverviewDto {
  sources: ContextSource[];
  facts: ProfileFact[];
  captures: Capture[];
}

export interface RecommendationsDto {
  recommendations: Recommendation[];
  generatedBy: 'anthropic' | 'sample' | null;
  stale: boolean;
  fallbackReason?: string;
}

export interface BuildResultDto {
  app: AppDetailDto;
}

// ---------- Agent ----------

export interface AgentThreadItemDto {
  capture: Capture;
  media: MediaItem | null;
  reply: AgentReply | null;
}

export interface AgentThreadDto {
  items: AgentThreadItemDto[];
}

/** Result of sharing something: the capture is always saved, even when the agent could not answer. */
export interface CaptureResultDto {
  capture: Capture;
  media: MediaItem | null;
  reply: AgentReply | null;
  /** Set when the agent failed; the capture is kept and can be retried. */
  error?: string;
}

export interface MediaUploadDto {
  media: MediaItem;
}

// ---------- Make mine (preview and build) ----------

export interface ProposalDetailDto {
  recommendation: Recommendation;
  evidence: ProfileFact[];
  captures: Capture[];
  /** Existing app for update_app proposals. */
  targetApp: AppSummaryDto | null;
}

export interface ProposalPreviewDto {
  spec: AppSpec;
  description: string;
  unsupported: { request: string; reason: string; alternative: string }[];
  generatedBy: 'anthropic' | 'sample';
  fallbackReason?: string;
  /** Clearly labelled example records that let the real renderer show the app before it exists. */
  previewRecords: AppRecord[];
}

export interface ApiError {
  error: string;
  code?: string;
  details?: unknown;
}
