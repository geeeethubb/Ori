/**
 * Context (what the person shared) → proposals (what they could do with it) → apps.
 * These are the contracts between the UI, the API and the model adapter. Everything the person
 * shares is DATA: it is never treated as instructions.
 */
import { z } from 'zod';
import { AppIconSchema, CAPABILITIES, DesignPatchSchema, PATTERNS, PURPOSES } from './appSpec.ts';
import { APP_ID_PATTERN, SHORT_ID_PATTERN } from './ids.ts';

export const MAX_SOURCE_CHARS = 60_000; // ~15k tokens; the export prompt asks for < 800 words
export const MAX_SOURCES_PER_USER = 40;
export const MAX_UPLOAD_BYTES = 200 * 1024;

export const SOURCE_KINDS = ['paste', 'upload', 'manual', 'sample', 'chosen_interest', 'capture'] as const;
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

// ---------- captures (the Agent's entrance: a thought, a link, a screenshot) ----------

export const CAPTURE_KINDS = ['note', 'link', 'image'] as const;
export type CaptureKind = (typeof CAPTURE_KINDS)[number];

/**
 * Honest read status. A saved URL is not read content:
 * - read: the note text, or the image, was actually read (image reading needs the live model);
 * - metadata_only: only the public title/author/thumbnail of an allowlisted provider were read (oEmbed);
 * - not_read: the link was saved; the page itself was never fetched;
 * - unavailable: a metadata lookup was attempted and failed.
 */
export const READ_STATUSES = ['read', 'metadata_only', 'not_read', 'unavailable'] as const;
export type ReadStatus = (typeof READ_STATUSES)[number];

export const READ_STATUS_LABELS: Record<ReadStatus, string> = {
  read: 'Read',
  metadata_only: 'Title read, content not read',
  not_read: 'Saved link, not read',
  unavailable: 'Could not read',
};

/** Label that matches what was actually read for THIS capture (a screenshot is not a link). */
export function readStatusLabel(c: Pick<Capture, 'kind' | 'readStatus' | 'url' | 'text'>): string {
  if (c.kind === 'image') {
    if (c.readStatus === 'read') return c.url ? 'Note and screenshot read, link not read' : 'Screenshot read';
    return c.text ? 'Note read, screenshot not read' : 'Screenshot saved, not read';
  }
  if (c.kind === 'note') return 'Note read';
  return READ_STATUS_LABELS[c.readStatus];
}

export interface LinkMeta {
  provider: string;
  title?: string;
  author?: string;
  thumbnailUrl?: string;
}

export interface Capture {
  id: string;
  ownerId: string;
  kind: CaptureKind;
  /** The person's own note (may be empty for a bare link or screenshot). */
  text: string;
  url: string | null;
  linkMeta: LinkMeta | null;
  mediaId: string | null;
  readStatus: ReadStatus;
  /** Where it came from, e.g. "Typed note", "Instagram link", "Screenshot". */
  sourceLabel: string;
  /** Clearly labelled example content (demo), never personal. */
  isExample: boolean;
  createdAt: string;
}

export interface MediaItem {
  id: string;
  ownerId: string;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  createdAt: string;
}

export const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
export const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;

// ---------- proposals / recommendations ----------

/**
 * new_app: make something new · explore: try it once, no app · update_app: change an app's design
 * (a revision) · keep: just save it · use_app: open an app the person already has and, optionally,
 * add ONE entry to it (a record action, never a revision).
 */
export const PROPOSAL_KINDS = ['new_app', 'explore', 'update_app', 'keep', 'use_app'] as const;
export type ProposalKind = (typeof PROPOSAL_KINDS)[number];

/**
 * use_app: an entry to add to the existing app, described by ROLE. The app maps roles onto its own
 * fields through its view bindings, so a draft never guesses field ids, and nothing is saved until the
 * person confirms it in the app's own form.
 */
export const RecordDraftSchema = z.object({
  /** source: a link for a saved-sources view · follow_up: a person and an action for a queue · photo: a shared photo for a gallery. */
  kind: z.enum(['source', 'follow_up', 'photo']),
  title: z.string().trim().max(200).optional(),
  note: z.string().trim().max(1000).optional(),
  url: z.string().trim().max(2000).optional(),
  person: z.string().trim().max(120).optional(),
  action: z.string().trim().max(200).optional(),
  /** The person's own words for when (e.g. "Thursday"); a due date is only set once they pick one. */
  dueText: z.string().trim().max(80).optional(),
  /** The capture's own photo; ownership is checked again when the entry is saved. */
  mediaId: z.string().regex(SHORT_ID_PATTERN).optional(),
});
export type RecordDraft = z.infer<typeof RecordDraftSchema>;

/**
 * A proposal card as stored and shown. Fact-grounded recommendations (Playground) and
 * capture-grounded proposals (Agent) share this shape and the same build pipeline.
 */
export const RecommendationDraftSchema = z.object({
  /** Stable concept key from the catalog, when the recommendation is catalog-based. */
  conceptId: z.string().trim().max(60).optional(),
  /** What kind of outcome: a new app, an exploration (no app needed), an update to an existing app, or just keeping the source. */
  kind: z.enum(PROPOSAL_KINDS).default('new_app'),
  /** Outcome-led title (what the person gets), 2-50 chars. */
  title: z.string().trim().min(2).max(50),
  purpose: z.enum(PURPOSES),
  pattern: z.enum(PATTERNS),
  icon: AppIconSchema,
  tagline: z.string().trim().min(2).max(120),
  /** What the person would see or do, in plain words. */
  description: z.string().trim().min(10).max(500),
  /** "Why this fits you" — grounded in the cited facts and captures only. One or two sentences. */
  reason: z.string().trim().min(10).max(400),
  /** IDs of approved profile facts this is grounded in. */
  evidenceFactIds: z.array(z.string()).max(8).default([]),
  /** IDs of captures (notes, links, screenshots) this is grounded in. */
  sourceCaptureIds: z.array(z.string()).max(4).default([]),
  /** A concrete thing to do in the first minute. */
  firstAction: z.string().trim().min(5).max(200),
  /** Short preview lines (e.g. example fields or columns) for the card. */
  previewLines: z.array(z.string().trim().max(60)).min(1).max(5),
  /** Real runtime capabilities the app would use (new_app / update_app). */
  capabilities: z.array(z.enum(CAPABILITIES)).max(8).default([]),
  /** Suggested identity (new_app): a partial look; unspecified parts are chosen by the app designer. */
  design: DesignPatchSchema.optional(),
  /** explore: 3-6 concrete steps the person can do today, using only what they shared or general practice. No invented links. */
  explorationSteps: z.array(z.string().trim().min(3).max(200)).max(6).optional(),
  /** update_app / use_app: which of the person's apps. update_app also says what to change (a request the revision planner can apply). */
  targetAppId: z.string().regex(APP_ID_PATTERN).optional(),
  updateRequest: z.string().trim().max(400).optional(),
  /** use_app: an optional entry to add, confirmed by the person in the app's own form. */
  recordDraft: RecordDraftSchema.optional(),
  /** new_app: a session length the person asked for (minutes); the Make page starts there instead of a template default. */
  suggestedMinutes: z.number().int().min(1).max(180).optional(),
});
export type RecommendationDraft = z.infer<typeof RecommendationDraftSchema>;
export const RecommendationBatchSchema = z.object({ recommendations: z.array(RecommendationDraftSchema).min(1).max(8) });

export const RECOMMENDATION_STATUSES = ['fresh', 'built', 'dismissed', 'stale', 'kept', 'applied'] as const;
export type RecommendationStatus = (typeof RECOMMENDATION_STATUSES)[number];

export interface Recommendation extends RecommendationDraft {
  id: string;
  ownerId: string;
  status: RecommendationStatus;
  /** Which adapter produced it: live model or sample mode. */
  generatedBy: 'anthropic' | 'sample';
  /** Hash of the approved facts used; fact-born recommendations go stale when facts change. */
  inputHash: string;
  builtAppId?: string | null;
  /** Set when the proposal came from an Agent capture rather than the Playground refresh. */
  captureId?: string | null;
  createdAt: string;
}

/** What the agent says back after a capture. */
export const AgentReplyDraftSchema = z.object({
  /** Concise acknowledgement of exactly what was received and read (≤ 80 words). */
  message: z.string().trim().min(1).max(700),
  /** At most one clarifying question, only when the answer materially changes the proposals. */
  question: z.string().trim().max(200).optional(),
  proposals: z.array(RecommendationDraftSchema).min(1).max(4),
  /** New things learned about the person from their note (stored as editable context). */
  learned: z.array(ExtractedFactSchema).max(6).default([]),
  /** Things asked for that do not exist here (e.g. Spotify sync), named plainly with what works instead. */
  unsupported: z.array(z.lazy(() => UnsupportedItemSchema)).max(4).default([]),
});
export type AgentReplyDraft = z.infer<typeof AgentReplyDraftSchema>;

export const UnsupportedItemSchema = z.object({
  request: z.string().trim().min(1).max(120),
  reason: z.string().trim().min(1).max(300),
  alternative: z.string().trim().max(300).optional(),
});
export type UnsupportedItem = z.infer<typeof UnsupportedItemSchema>;

export interface AgentReply {
  captureId: string;
  message: string;
  question: string | null;
  proposals: Recommendation[];
  /** Requests that cannot be done here (integrations that do not exist), stated plainly. */
  unsupported: UnsupportedItem[];
  generatedBy: 'anthropic' | 'sample';
  fallbackReason?: string | null;
  createdAt: string;
}

export const EVENT_TYPES = [
  'app_built', 'first_item_saved', 'item_saved', 'task_completed', 'app_opened',
  'revision_accepted', 'revision_declined', 'revision_undone', 'feedback_given', 'install_guide_viewed',
  'shortcut_requested', 'first_action_completed', 'useful_action',
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

/** The few choices a person makes before "Make mine"; everything else is designed for them. */
export const BuildChoicesSchema = z.object({
  /** Minutes available for a session (practice apps); becomes the first timer preset. */
  timeBudgetMinutes: z.number().int().min(1).max(180).optional(),
  /** The outcome in the person's words. */
  goal: z.string().trim().max(200).optional(),
  /** Presentation preference. */
  look: z.enum(['bright', 'paper', 'charcoal', 'ink', 'mint', 'lilac', 'sunset']).optional(),
});
export type BuildChoices = z.infer<typeof BuildChoicesSchema>;
