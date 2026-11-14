/**
 * Sample-mode Agent: a deterministic, honest reply to a capture. It says exactly what it could read
 * (the note; a link title when a provider gave one; never an image), then offers a small set of
 * directions: make an app (or update one that already fits), explore without an app, or just keep
 * the source. Nothing here invents links, artists or availability.
 */
import type { ExtractedFact, RecommendationDraft } from '../../../shared/context.ts';
import { RecommendationDraftSchema } from '../../../shared/context.ts';
import type { RespondInput, RespondResult } from '../types.ts';
import { ALL_CONCEPTS, conceptById, type Concept } from './catalog.ts';
import { previewLinesFor, recommend } from './recommend.ts';
import { clip, quote } from './text.ts';

interface Domain {
  id: 'music' | 'photo' | 'people';
  rx: RegExp;
  conceptId: string;
  noun: string;
  exploreTitle: string;
  exploreSteps: (note: string, minutes: number | null) => string[];
  updateRequest: string;
}

const DOMAINS: Domain[] = [
  {
    id: 'music',
    rx: /\b(guitar|riffs?|songs?|chords?|practi[cs]e|practi[cs]ing|strum|fingerstyle|fingerpick|tempo|bpm|metronome|music|album|track|band|solo|bass|piano|drums?|ukulele|sing|melody|cover|sound|playing|play along|lesson)\b/i,
    conceptId: 'riff-practice',
    noun: 'this sound',
    exploreTitle: 'A listening-and-playing session',
    exploreSteps: (note, minutes) => {
      const m = minutes ?? 15;
      return [
        `Listen to the source once all the way through, just noticing what you like about the sound you described${note ? '' : ''}.`,
        'Find the two bars that matter most and hum or tap them before you touch the instrument.',
        `Play them at half tempo for ${Math.max(3, Math.round(m / 3))} minutes; speed up only when it is clean.`,
        `Play along with the source once at full speed, then stop. ${m} minutes is enough.`,
        'Write one line: what got easier, what to try tomorrow.',
      ];
    },
    updateRequest: 'Add a daily prompt with short practice ideas for the sound I just saved',
  },
  {
    id: 'photo',
    rx: /\b(photos?|photograph\w*|camera|lens|light|shadows?|golden hour|street photography|portraits?|exposure|composition|film|shoot|shooting|contact sheet|pictures?|frame|framing)\b/i,
    conceptId: 'light-gallery',
    noun: 'this image',
    exploreTitle: 'A twenty-minute light walk',
    exploreSteps: () => [
      'Go out for twenty minutes with one rule: photograph only where light meets shadow.',
      'Take the same frame twice, from standing height and from low down.',
      'Pick one keeper and write one sentence about what the light was doing.',
      'Compare it with the picture that inspired you: what is the one difference?',
    ],
    updateRequest: 'Add a weekly light exercise prompt based on what I just shared',
  },
  {
    id: 'people',
    rx: /\b(follow[- ]?ups?|intro(?:duction)?s?|investors?|mentors?|networking|contacts?|reply|replies|email back|coffee chats?|promised|owe|reach out|keep in touch|catch up|met (?:someone|a|an|with)|meetup|people i met|get back to)\b/i,
    conceptId: 'people-queue',
    noun: 'this person',
    exploreTitle: 'Clear the three follow-ups you already owe',
    exploreSteps: () => [
      'Write down the three people you most recently promised something to.',
      'For each, write the one-line message you would send, in your own words.',
      'Send the easiest one now; give the other two a date.',
      'Note what they asked for, so the next message starts from their question.',
    ],
    updateRequest: 'Add a message draft field so I can prepare the follow-up before sending it',
  },
];

const MINUTES_RX = /\b(\d{1,3})\s*(?:min(?:ute)?s?)\b/i;
const WANT_RX = /\b(?:i(?:'d| would)? (?:really )?(?:want|love|like|hope) to|i want|i'd like to|my goal is to)\s+([^.!?\n]{4,80})/i;
const LIKE_RX = /\bi (?:really )?(?:like|love|enjoy)\s+([^.!?\n]{3,60})/i;

function detectDomain(text: string): Domain | null {
  let best: { d: Domain; hits: number } | null = null;
  for (const d of DOMAINS) {
    const hits = (text.match(new RegExp(d.rx.source, 'gi')) ?? []).length;
    if (hits > 0 && (!best || hits > best.hits)) best = { d, hits };
  }
  return best?.d ?? null;
}

function readLine(input: RespondInput): string {
  const c = input.capture;
  const note = c.text.trim();
  const parts: string[] = [];
  if (note) parts.push(`Got your note: ${quote(clip(note, 90))}.`);
  if (c.kind === 'link' || c.url) {
    if (c.readStatus === 'metadata_only' && c.linkMeta?.title) {
      parts.push(`I read the title ${quote(clip(c.linkMeta.title, 70))}${c.linkMeta.author ? ` by ${clip(c.linkMeta.author, 40)}` : ''} on ${c.linkMeta.provider}, but not the content itself.`);
    } else {
      parts.push('I saved the link but have not read the page, so I am working from your note.');
    }
  }
  if (c.kind === 'image' || c.image) parts.push('Your screenshot is saved. In Sample mode I cannot read images, so I am working from your words.');
  if (!parts.length) parts.push('Saved.');
  return parts.join(' ');
}

function conceptDraft(concept: Concept, captureId: string, kind: 'new_app' | 'update_app', reason: string, extra: Partial<RecommendationDraft> = {}): RecommendationDraft {
  const spec = concept.buildSpec({ instructions: '' });
  const baseTitle = extra.title ?? concept.title;
  const { title: _ignored, ...rest } = extra;
  return RecommendationDraftSchema.parse({
    conceptId: concept.id,
    kind,
    purpose: concept.purpose,
    pattern: concept.pattern,
    icon: concept.icon,
    tagline: concept.tagline,
    description: concept.description,
    reason,
    evidenceFactIds: [],
    sourceCaptureIds: [captureId],
    firstAction: concept.firstAction,
    previewLines: previewLinesFor(spec),
    capabilities: capabilitiesFor(concept.pattern),
    design: spec.design,
    ...rest,
    title: kind === 'update_app' ? clip(`Add this to ${baseTitle}`, 50) : clip(baseTitle, 50),
  });
}

function capabilitiesFor(pattern: string): RecommendationDraft['capabilities'] {
  switch (pattern) {
    case 'practice': return ['practice_timer', 'tempo', 'source_links', 'summary', 'prompts'];
    case 'gallery': return ['gallery', 'photo_upload', 'summary', 'prompts'];
    case 'queue': return ['next_actions', 'due_soon', 'summary'];
    case 'board': return ['board', 'due_soon', 'summary'];
    case 'tracker': return ['list', 'summary'];
    default: return ['journal', 'summary'];
  }
}

export function respondToCapture(input: RespondInput): RespondResult {
  const c = input.capture;
  const note = c.text.trim();
  const haystack = [note, c.linkMeta?.title ?? '', c.linkMeta?.author ?? '', c.sourceLabel].join(' ');
  const domain = detectDomain(haystack);
  const minutesMatch = MINUTES_RX.exec(note);
  const minutes = minutesMatch ? Math.min(180, Math.max(1, Number(minutesMatch[1]))) : null;
  const said = note ? `You said ${quote(clip(note, 80))}.` : c.linkMeta?.title ? `You saved ${quote(clip(c.linkMeta.title, 60))}.` : 'You shared this with the agent.';
  const proposals: RecommendationDraft[] = [];

  if (domain) {
    const concept = conceptById(domain.conceptId);
    const existing = input.existingApps.find((a) => a.pattern === concept?.pattern || (domain.id === 'people' && a.pattern === 'board'));
    if (concept) {
      if (existing) {
        proposals.push(conceptDraft(concept, c.id, 'update_app', `${said} You already have ${existing.name}; this keeps everything in one place instead of starting another app.`, {
          title: existing.name,
          targetAppId: existing.id,
          updateRequest: domain.updateRequest,
          firstAction: `Open ${existing.name} and use what you just saved.`,
        }));
      } else {
        const why = domain.id === 'music' && minutes
          ? `${said} A timer sized to ${minutes} minutes and a metronome turn a liked sound into a session you actually play tonight.`
          : `${said} ${concept.reasonTemplate([]).trim()}`;
        proposals.push(conceptDraft(concept, c.id, 'new_app', clip(why, 400)));
      }
    }
    proposals.push(RecommendationDraftSchema.parse({
      kind: 'explore',
      title: domain.exploreTitle,
      purpose: 'explore',
      pattern: concept?.pattern ?? 'journal',
      icon: { symbol: domain.id === 'music' ? 'headphones' : domain.id === 'photo' ? 'sun' : 'people', color: 'lilac' },
      tagline: 'No app needed',
      description: 'A short exploration you can do today with what you already have.',
      reason: `${said} Sometimes the useful next step is to do the thing once, not to set anything up.`,
      evidenceFactIds: [],
      sourceCaptureIds: [c.id],
      firstAction: domain.exploreSteps(note, minutes)[0] ?? 'Start with the first step.',
      previewLines: domain.exploreSteps(note, minutes).slice(0, 3).map((s) => clip(s, 60)),
      explorationSteps: domain.exploreSteps(note, minutes),
      capabilities: [],
    }));
  } else {
    // No clear domain: lean on the catalog with the note as a fact, so the suggestion still quotes the person.
    const pseudoFacts = note ? [{ id: `capture:${c.id}`, category: 'interest' as const, value: note, status: 'confirmed' as const, confidence: 0.8 }] : [];
    const recs = recommend({ facts: [...input.facts.map((f) => ({ ...f, confidence: 0.7 })), ...pseudoFacts], existingApps: input.existingApps, chosenInterests: [], count: 2 });
    for (const r of recs.slice(0, 1)) {
      proposals.push(RecommendationDraftSchema.parse({ ...r, kind: 'new_app', evidenceFactIds: r.evidenceFactIds.filter((id) => !id.startsWith('capture:')), sourceCaptureIds: [c.id], capabilities: capabilitiesFor(r.pattern) }));
    }
    proposals.push(RecommendationDraftSchema.parse({
      kind: 'explore',
      title: 'Try it once this week',
      purpose: 'explore',
      pattern: 'journal',
      icon: { symbol: 'compass', color: 'lilac' },
      tagline: 'No app needed',
      description: 'Turn the save into one small action before deciding whether it deserves a tool.',
      reason: `${said} The quickest way to learn whether this matters is to act on it once.`,
      evidenceFactIds: [],
      sourceCaptureIds: [c.id],
      firstAction: 'Block twenty minutes this week and do the smallest version of it.',
      previewLines: ['Block 20 minutes', 'Do the smallest version', 'Note what you felt afterwards'],
      explorationSteps: ['Block twenty minutes this week for it.', 'Do the smallest version of the thing you saved.', 'Afterwards, write one line: worth more time, or not?'],
      capabilities: [],
    }));
  }

  proposals.push(RecommendationDraftSchema.parse({
    kind: 'keep',
    title: 'Just keep it',
    purpose: 'explore',
    pattern: 'journal',
    icon: { symbol: 'bookmark', color: 'paper' },
    tagline: 'A save stays a save',
    description: 'Keep this as a source in your memory without turning it into an interest or an app. You can come back to it from Settings.',
    reason: 'Not every save needs a plan. It stays findable, and nothing else changes.',
    evidenceFactIds: [],
    sourceCaptureIds: [c.id],
    firstAction: 'Nothing. It is saved.',
    previewLines: ['Saved as a source', 'No new interest recorded', 'No app created'],
    capabilities: [],
  }));

  // Something small learned from the note, kept editable in memory.
  const learned: ExtractedFact[] = [];
  if (minutes && domain?.id === 'music') learned.push({ category: 'routine', value: `Has about ${minutes} minutes for guitar practice at a time`, status: 'inferred', confidence: 0.6, evidence: clip(note, 120) });
  const want = WANT_RX.exec(note);
  if (want?.[1]) learned.push({ category: 'goal', value: clip(`Wants to ${want[1].trim()}`, 160), status: 'inferred', confidence: 0.6, evidence: clip(note, 120) });
  const like = LIKE_RX.exec(note);
  if (like?.[1] && !want) learned.push({ category: 'interest', value: clip(`Likes ${like[1].trim()}`, 160), status: 'inferred', confidence: 0.6, evidence: clip(note, 120) });

  const question = domain?.id === 'music' && !minutes ? 'How many minutes do you usually have to practice?' : undefined;
  return { message: clip(readLine(input), 700), question, proposals: proposals.slice(0, 4), learned: learned.slice(0, 3), imageRead: false };
}

export const SAMPLE_CONCEPT_COUNT = ALL_CONCEPTS.length;
