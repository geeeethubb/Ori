/**
 * Sample-mode Agent: a deterministic, honest reply to a capture. It says exactly what it could read
 * (the note; a link title when a provider gave one; never a page, never an image), then offers a
 * small set of directions: make the reference app for the domain (or add to an app that already
 * fits, with a change request the revision planner can apply), explore without an app, or just keep
 * the source. Nothing here invents links, artists or availability, and nothing learned from a note is
 * ever about another person.
 */
import { PATTERNS, PURPOSES, type Pattern, type Purpose } from '../../../shared/appSpec.ts';
import { RecommendationDraftSchema, type ExtractedFact, type RecommendationDraft } from '../../../shared/context.ts';
import type { ExistingAppSummary, RespondInput, RespondResult } from '../types.ts';
import { conceptById, type Concept } from './catalog.ts';
import { detectDomain, exploreDraft, fittingApp, minutesIn, type Domain, type ExploreContext, type UpdatePlan } from './domains.ts';
import { capabilitiesForPattern, previewLinesFor, recommend } from './recommend.ts';
import { clip, quote, uniq } from './text.ts';

type Capture = RespondInput['capture'];

const WANT_RX = /\b(?:i(?:'d| would)? (?:really )?(?:want|love|like|hope) to|i want|i'd like to|my goal is to|i(?:'m| am) trying to)\s+([^.!?\n]{4,80})/i;
const LIKE_RX = /\bi (?:really )?(?:like|love|enjoy)\s+(?!to\b)([^.!?\n]{3,60})/i;
const LEARNING_RX = /\bi(?:'m| am|'ve been| have been) (?:learning|practi[cs]ing|getting into|picking up|teaching myself)\s+([^.!?\n]{3,60})/i;
/** Clauses that mention someone else never become facts about the person. */
const OTHERS_RX = /\b(?:he|she|they|him|her|them|his|hers|their|theirs|my (?:friend|friends|brother|sister|mom|mum|dad|father|mother|parents|partner|wife|husband|boyfriend|girlfriend|roommate|coworker|colleague|boss|mentor|team|kid|kids|son|daughter))\b/i;
const TIME_RX = /\b\d{1,3}\s*(?:-\s*)?(?:min(?:ute)?s?|hours?|hrs?)\b|\bhalf an hour\b/i;
/** "I like this sound" says nothing durable about the person. */
const DEMONSTRATIVE_RX = /^(?:this|that|these|those|it|them|him|her|the (?:sound|song|track|clip|video|reel|post|photo|picture|one|look|vibe))\b/i;
const PROPER_NOUN_RX = /\b[A-Z][a-z]+\b/;
const INSTRUMENT_RX = /\b(guitar|piano|bass|ukulele|drums|violin|cello|saxophone|trumpet|flute)\b/i;

/** The first clause of a phrase: "this sound and have 15 minutes" → "this sound". */
function firstClause(s: string): string {
  const [head] = s.split(/\s*(?:,|;|\band\b|\bbut\b|\bso\b|\bbecause\b|\bthen\b)\s*/i);
  return (head ?? '').trim().replace(/[.\s]+$/, '');
}

function hasLink(c: Capture): boolean {
  return c.kind === 'link' || Boolean(c.url);
}

function hasImage(c: Capture): boolean {
  return c.kind === 'image' || Boolean(c.image);
}

/** Exactly what was received and what was actually read; never more. */
export function readLine(c: Capture): string {
  const note = c.text.trim();
  const parts: string[] = [];
  if (note) parts.push(`Got your note: ${quote(clip(note, 90))}.`);
  if (hasLink(c)) {
    const title = c.linkMeta?.title?.trim();
    if (c.readStatus === 'metadata_only' && title) {
      parts.push(`I read the title ${quote(clip(title, 70))}${c.linkMeta?.author ? ` by ${clip(c.linkMeta.author, 40)}` : ''} on ${c.linkMeta?.provider ?? 'the provider'}, but not the content itself.`);
    } else if (c.readStatus === 'unavailable') {
      parts.push(`I saved the link but could not read the page or its title${note ? ', so I am working from your note' : ''}.`);
    } else {
      parts.push(`I saved the link but have not read the page${note ? ', so I am working from your note' : ''}.`);
    }
  }
  if (hasImage(c)) parts.push(`Your screenshot is saved. In Sample mode I cannot read images${note ? ', so I am working from your words' : ''}.`);
  if (!note && (hasLink(c) || hasImage(c))) parts.push(hasImage(c) ? 'Tell me in a line what it shows and I can do more with it.' : 'Tell me in a line what it is about and I can do more with it.');
  if (!parts.length) parts.push('Saved.');
  return parts.join(' ');
}

function asPattern(p: string, fallback: Pattern): Pattern {
  return (PATTERNS as readonly string[]).includes(p) ? (p as Pattern) : fallback;
}

function asPurpose(p: string, fallback: Purpose): Purpose {
  return (PURPOSES as readonly string[]).includes(p) ? (p as Purpose) : fallback;
}

/** "Make mine": the domain's reference app, grounded in the capture. */
function newAppDraft(concept: Concept, domain: Domain, captureId: string, said: string, minutes: number | null): RecommendationDraft {
  const spec = concept.buildSpec({ instructions: '' });
  const reason = domain.id === 'music' && minutes
    ? `${said} A timer sized to ${minutes} minutes and a metronome turn a liked sound into a session you actually play tonight.`
    : `${said} ${concept.reasonTemplate([]).trim()}`;
  const firstAction = domain.id === 'music' && minutes ? `Pick ${minutes} minutes, press start, and play the riff at half speed.` : concept.firstAction;
  return RecommendationDraftSchema.parse({
    conceptId: concept.id,
    kind: 'new_app',
    title: clip(concept.title, 50),
    purpose: concept.purpose,
    pattern: concept.pattern,
    icon: concept.icon,
    tagline: clip(concept.tagline, 120),
    description: clip(concept.description, 500),
    reason: clip(reason, 400),
    evidenceFactIds: [],
    sourceCaptureIds: [captureId],
    firstAction: clip(firstAction, 200),
    previewLines: previewLinesFor(spec),
    capabilities: capabilitiesForPattern(concept.pattern),
    ...(spec.design ? { design: spec.design } : {}),
  });
}

/** "Add to an app": a change request for an existing app that the revision planner can apply. */
function updateDraft(app: ExistingAppSummary, plan: UpdatePlan, concept: Concept, captureId: string, said: string): RecommendationDraft {
  return RecommendationDraftSchema.parse({
    conceptId: concept.id,
    kind: 'update_app',
    title: clip(`Add this to ${app.name}`, 50),
    purpose: asPurpose(app.purpose, concept.purpose),
    pattern: asPattern(app.pattern, concept.pattern),
    icon: concept.icon,
    tagline: clip(`${app.name} gets ${plan.change}`, 120),
    description: clip(`${app.name} gets ${plan.change}. Everything you already saved stays as it is, and you see the change before it applies.`, 500),
    reason: clip(`${said} You already have ${app.name}; adding to it keeps everything in one place instead of starting another app.`, 400),
    evidenceFactIds: [],
    sourceCaptureIds: [captureId],
    firstAction: clip(`Preview the change to ${app.name}; nothing you saved is touched.`, 200),
    previewLines: plan.previewLines.map((l) => clip(l, 60)).slice(0, 5),
    capabilities: app.capabilities.slice(0, 8),
    targetAppId: app.id,
    updateRequest: clip(plan.request, 400),
  });
}

/** "Just keep it": a save stays a save. */
function keepDraft(captureId: string): RecommendationDraft {
  return RecommendationDraftSchema.parse({
    kind: 'keep',
    title: 'Just keep it',
    purpose: 'explore',
    pattern: 'journal',
    icon: { symbol: 'bookmark', color: 'paper' },
    tagline: 'A save stays a save',
    description: 'Keep this as a source in your memory without turning it into an interest or an app. You can come back to it from Settings.',
    reason: 'Not every save needs a plan. It stays findable, and nothing else changes.',
    evidenceFactIds: [],
    sourceCaptureIds: [captureId],
    firstAction: 'Nothing. It is saved.',
    previewLines: ['Saved as a source', 'No new interest recorded', 'No app created'],
    capabilities: [],
  });
}

/** No clear domain: the catalog, with the capture itself as grounding (and the facts as a tie-break). */
function fallbackAppDraft(input: RespondInput, said: string): RecommendationDraft | null {
  const c = input.capture;
  const recs = recommend({
    facts: input.facts.map((f) => ({ ...f, confidence: 0.7 })),
    existingApps: input.existingApps,
    chosenInterests: [],
    recentCaptures: [{ id: c.id, kind: c.kind, text: c.text, url: c.url, linkMeta: c.linkMeta, readStatus: c.readStatus }],
    count: 3,
  });
  const appRecs = recs.filter((r) => r.kind === 'new_app');
  const pick = appRecs.find((r) => r.sourceCaptureIds.includes(c.id)) ?? appRecs[0];
  if (!pick) return null;
  const grounded = pick.sourceCaptureIds.includes(c.id);
  return RecommendationDraftSchema.parse({
    ...pick,
    sourceCaptureIds: uniq([c.id, ...pick.sourceCaptureIds]).slice(0, 4),
    reason: grounded ? pick.reason : clip(`${said} ${pick.reason}`, 400),
  });
}

function genericExploreDraft(captureId: string, said: string, words: string | null): RecommendationDraft {
  const steps = [
    `Block twenty minutes this week for ${words ? quote(words) : 'it'}.`,
    'Do the smallest version of the thing you saved.',
    'Afterwards, write one line: worth more time, or not?',
  ].map((s) => clip(s, 200));
  return RecommendationDraftSchema.parse({
    kind: 'explore',
    title: 'Try it once this week',
    purpose: 'explore',
    pattern: 'journal',
    icon: { symbol: 'compass', color: 'lilac' },
    tagline: 'No app needed',
    description: 'Turn the save into one small action before deciding whether it deserves a tool.',
    reason: clip(`${said} The quickest way to learn whether this matters is to act on it once.`, 400),
    evidenceFactIds: [],
    sourceCaptureIds: [captureId],
    firstAction: steps[0],
    previewLines: steps.map((s) => clip(s, 60)),
    explorationSteps: steps,
    capabilities: [],
  });
}

/**
 * Small, clean things learned from the note, kept as editable memory. Clauses are split at
 * "and" / "but" / commas, time budgets become a routine fact rather than part of an interest,
 * demonstratives ("this sound") are skipped, and nothing about other people is ever recorded.
 */
export function learnFromNote(note: string, domain: Domain | null, minutes: number | null, repeats = 0): ExtractedFact[] {
  const out: ExtractedFact[] = [];
  if (!note.trim()) return out;
  const evidence = clip(note, 120);
  const push = (category: ExtractedFact['category'], value: string) => {
    const v = clip(value.trim().replace(/[.\s]+$/, ''), 160);
    if (v.length < 3 || out.some((f) => f.value.toLowerCase() === v.toLowerCase())) return;
    out.push({ category, value: v, status: 'inferred', confidence: 0.6, evidence });
  };
  const aboutSelf = (clause: string) => clause.length >= 3 && !OTHERS_RX.test(clause) && !TIME_RX.test(clause) && !(domain?.id === 'people' && PROPER_NOUN_RX.test(clause));

  if (minutes && domain && domain.id !== 'people') {
    const instrument = INSTRUMENT_RX.exec(note)?.[1]?.toLowerCase();
    const activity = domain.id === 'music' ? `${instrument ?? 'music'} practice` : 'photography';
    push('routine', `Has about ${minutes} minutes at a time for ${activity}`);
  }
  const want = WANT_RX.exec(note);
  if (want?.[1]) {
    const clause = firstClause(want[1]);
    if (aboutSelf(clause)) push('goal', `Wants to ${clause}`);
  }
  // A note about other people (a follow-up) describes them, not the person; only explicit wants count.
  if (domain?.id !== 'people') {
    const learning = LEARNING_RX.exec(note);
    if (learning?.[1]) {
      const clause = firstClause(learning[1]);
      if (aboutSelf(clause)) push('interest', `Learning ${clause}`);
    }
    const like = LIKE_RX.exec(note);
    if (like?.[1]) {
      const clause = firstClause(like[1]);
      if (aboutSelf(clause) && !DEMONSTRATIVE_RX.test(clause)) push('interest', `Likes ${clause}`);
    }
  }
  if (domain && repeats >= 2) push(domain.id === 'people' ? 'project' : 'interest', `Keeps coming back to ${domain.topic} (${repeats + 1} saves)`);
  return out.slice(0, 3);
}

export function respondToCapture(input: RespondInput): RespondResult {
  const c = input.capture;
  const note = c.text.trim();
  const host = (() => { try { return c.url ? new URL(c.url).hostname : ''; } catch { return ''; } })();
  const haystack = [note, c.linkMeta?.title ?? '', c.linkMeta?.author ?? '', c.sourceLabel, host].join(' ');
  const domain = detectDomain(haystack);
  const minutes = minutesIn(note);
  const repeats = domain ? input.recentCaptures.filter((rc) => rc.id !== c.id && detectDomain(`${rc.text} ${rc.url ?? ''}`)?.id === domain.id).length : 0;
  const said = note
    ? `You said ${quote(clip(note, 80))}.`
    : c.readStatus === 'metadata_only' && c.linkMeta?.title
      ? `You saved ${quote(clip(c.linkMeta.title, 60))}.`
      : hasImage(c) ? 'You shared a screenshot.' : 'You shared this with the agent.';
  const ctx: ExploreContext = {
    words: note ? clip(note, 60) : null,
    minutes,
    source: hasImage(c) ? 'image' : hasLink(c) ? 'link' : null,
    sourceTitle: c.readStatus === 'metadata_only' ? c.linkMeta?.title ?? null : null,
  };

  const message: string[] = [readLine(c)];
  const proposals: RecommendationDraft[] = [];

  if (domain) {
    const concept = conceptById(domain.conceptId) as Concept;
    const fit = fittingApp(domain, input.existingApps);
    const plan = fit ? domain.updateRequest(fit.app, ctx) : null;
    if (repeats >= 2) message.push(`That makes ${repeats + 1} ${domain.topic} saves, so this looks like more than a passing interest.`);
    if (!fit || !fit.full) proposals.push(newAppDraft(concept, domain, c.id, said, minutes));
    if (fit && plan) proposals.push(updateDraft(fit.app, plan, concept, c.id, said));
    else if (fit?.full) message.push(`You already have ${fit.app.name}; this belongs there.`);
    proposals.push(exploreDraft(domain, ctx, {
      evidenceFactIds: [],
      sourceCaptureIds: [c.id],
      reason: `${said} Sometimes the useful next step is to do the thing once, not to set anything up.`,
    }));
  } else {
    message.push('Nothing in it points at one of my ready-made directions, so these Sample-mode suggestions start from your words.');
    const app = fallbackAppDraft(input, said);
    if (app) proposals.push(app);
    proposals.push(genericExploreDraft(c.id, said, ctx.words ?? null));
  }
  proposals.push(keepDraft(c.id));

  let question: string | undefined;
  if (!note && hasImage(c)) question = 'What does the screenshot show, in a line?';
  else if (!note && hasLink(c)) question = 'What is the link about, in a line?';
  else if (domain?.id === 'music' && !minutes) question = 'How many minutes do you usually have to practise?';

  return {
    message: clip(message.join(' '), 700),
    ...(question ? { question } : {}),
    proposals: proposals.slice(0, 4),
    learned: learnFromNote(note, domain, minutes, repeats),
    imageRead: false,
  };
}
