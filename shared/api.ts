/** DTOs exchanged between client and server. Keep this file dependency-light. */
import type { AppIcon, AppSpec, Purpose } from './appSpec.ts';
import type { AppRecord } from './records.ts';
import type { AppEvent, ContextSource, ProfileFact, Recommendation } from './context.ts';
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
}

export interface RecommendationsDto {
  recommendations: Recommendation[];
  generatedBy: 'anthropic' | 'sample' | null;
  stale: boolean;
}

export interface BuildResultDto {
  app: AppDetailDto;
}

export interface ApiError {
  error: string;
  code?: string;
  details?: unknown;
}
