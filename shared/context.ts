/**
 * Context import → profile facts → recommendations. These are the contracts between the UI,
 * the API and the model adapter. Imported text is DATA: it is never treated as instructions.
 */
import { z } from 'zod';
import { AppIconSchema, PATTERNS, PURPOSES } from './appSpec.ts';

export const MAX_SOURCE_CHARS = 60_000; // ~15k tokens; the export prompt asks for < 800 words
export const MAX_SOURCES_PER_USER = 20;
export const MAX_UPLOAD_BYTES = 200 * 1024;

export const SOURCE_KINDS = ['paste', 'upload', 'manual', 'sample', 'chosen_interest'] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export interface ContextSource {
  id: string;
  ownerId: string;
  label: string;
  kind: SourceKind;
  text: string;
  charCount: number;
  approved: boolean;
  importedAt: string;
}

export const FACT_CATEGORIES = ['goal', 'project', 'interest', 'routine', 'tool', 'change', 'uncertainty'] as const;
export type FactCategory = (typeof FACT_CATEGORIES)[number];

export const FACT_CATEGORY_LABELS: Record<FactCategory, string> = {
  goal: 'Goals',
  project: 'Projects & responsibilities',
  interest: 'Interests & curiosity',
  routine: 'Routines & constraints',
  tool: 'Tools you already use',
  change: 'Recent changes',
  uncertainty: 'Open questions',
};

export const FACT_STATUSES = ['confirmed', 'inferred', 'conflict', 'removed'] as const;
export type FactStatus = (typeof FACT_STATUSES)[number];

export interface ProfileFact {
  id: string;
  ownerId: string;
  category: FactCategory;
  value: string;
  sourceIds: string[];
  confidence: number; // 0..1
  status: FactStatus;
  /** Facts in the same conflict group contradict each other until the user keeps one. */
  conflictGroup?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** What an extractor (model or heuristic) returns for one source. */
export const ExtractedFactSchema = z.object({
  category: z.enum(FACT_CATEGORIES),
  value: z.string().trim().min(3).max(240),
  status: z.enum(['confirmed', 'inferred']),
  confidence: z.number().min(0).max(1),
  /** Short quote or paraphrase from the source that supports the fact (for the UI). */
  evidence: z.string().trim().max(240).optional(),
});
export type ExtractedFact = z.infer<typeof ExtractedFactSchema>;
export const ExtractionResultSchema = z.object({
  facts: z.array(ExtractedFactSchema).max(60),
  /** Pairs of fact indexes that contradict each other. */
  conflicts: z.array(z.tuple([z.number().int().min(0), z.number().int().min(0)])).max(20).default([]),
  /** Honest note when the source says little (e.g. "I know little about you"). */
  note: z.string().trim().max(300).optional(),
});
export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;

/** A recommendation card as stored and shown. */
export const RecommendationDraftSchema = z.object({
  /** Stable concept key from the catalog, when the recommendation is catalog-based. */
  conceptId: z.string().trim().max(60).optional(),
  title: z.string().trim().min(2).max(50),
  purpose: z.enum(PURPOSES),
  pattern: z.enum(PATTERNS),
  icon: AppIconSchema,
  tagline: z.string().trim().min(2).max(120),
  /** What the app would do, in plain words. */
  description: z.string().trim().min(10).max(500),
  /** "Why this fits you" — must be grounded in the cited facts only. */
  reason: z.string().trim().min(10).max(400),
  /** IDs of approved profile facts this recommendation is grounded in (at least one). */
  evidenceFactIds: z.array(z.string()).min(1).max(8),
  /** A concrete thing to do in the first minute. */
  firstAction: z.string().trim().min(5).max(200),
  /** Short preview lines (e.g. example fields or columns) for the card. */
  previewLines: z.array(z.string().trim().max(60)).min(1).max(5),
});
export type RecommendationDraft = z.infer<typeof RecommendationDraftSchema>;
export const RecommendationBatchSchema = z.object({ recommendations: z.array(RecommendationDraftSchema).min(1).max(8) });

export const RECOMMENDATION_STATUSES = ['fresh', 'built', 'dismissed', 'stale'] as const;
export type RecommendationStatus = (typeof RECOMMENDATION_STATUSES)[number];

export interface Recommendation extends RecommendationDraft {
  id: string;
  ownerId: string;
  status: RecommendationStatus;
  /** Which adapter produced it: live model or sample mode. */
  generatedBy: 'anthropic' | 'sample';
  /** Hash of the approved facts used; recommendations go stale when facts change. */
  inputHash: string;
  builtAppId?: string | null;
  createdAt: string;
}

export const EVENT_TYPES = [
  'app_built', 'first_item_saved', 'item_saved', 'task_completed', 'app_opened',
  'revision_accepted', 'revision_declined', 'revision_undone', 'feedback_given', 'install_guide_viewed',
  'shortcut_requested',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export interface AppEvent {
  id: number;
  appId: string;
  type: EventType;
  at: string;
  meta?: Record<string, unknown> | null;
}

/** Spec generation output from the adapter (validated separately against AppSpecSchema). */
export const GeneratedAppSchema = z.object({
  spec: z.unknown(),
  /** 1–3 sentence description shown before the user confirms the build. */
  description: z.string().trim().min(10).max(600),
  /** Requests that could not be honored within the supported runtime. */
  unsupported: z.array(z.object({ request: z.string().max(400), reason: z.string().max(400), alternative: z.string().max(400) })).max(10).default([]),
});
export type GeneratedApp = z.infer<typeof GeneratedAppSchema>;
