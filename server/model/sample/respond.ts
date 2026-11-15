/**
 * Sample-mode Agent: a deterministic, honest reply to a capture. It says exactly what it could read
 * (the note; a link title when a provider gave one; never a page, never an image), then offers a
 * small set of directions: make the reference app for the domain (or add to an app that already
 * fits, with a change request the revision planner can apply), explore without an app, or just keep
 * the source. Nothing here invents links, artists or availability, and nothing learned from a note is
 * ever about another person.
 */
import { PATTERNS, PURPOSES, type Capability, type Pattern, type Purpose } from '../../../shared/appSpec.ts';
import { RecommendationDraftSchema, type ExtractedFact, type RecordDraft, type RecommendationDraft, type UnsupportedItem } from '../../../shared/context.ts';
import { ambiguousWhen, findWhenWords } from '../../../shared/time.ts';
import type { ExistingAppSummary, RespondInput, RespondResult } from '../types.ts';
import { conceptById, type Concept } from './catalog.ts';
import { detectDomain, domainById, exploreDraft, fittingApp, minutesIn, type Domain, type DomainId, type ExploreContext, type UpdatePlan } from './domains.ts';
import { applyChoices } from './generate.ts';
import { capabilitiesForPattern, FILL_REASON, previewLinesFor, recommend, SPARSE_REASON } from './recommend.ts';
import { clip, escapeRegExp, joinNatural, quote, uniq } from './text.ts';
import { findUnsupported, isSyncItem } from './unsupported.ts';

type Capture = RespondInput['capture'];

const WANT_RX = /\b(?:i(?:'d| would)? (?:really )?(?:want|love|like|hope) to|i want|i'd like to|my goal is to|i(?:'m| am) trying to)\s+([^.!?\n]{4,80})/i;
const LIKE_RX = /\bi (?:really )?(?:like|love|enjoy)\s+(?!to\b)([^.!?\n]{3,60})/i;
const LEARNING_RX = /\bi(?:'m| am|'ve been| have been) (?:learning|practi[cs]ing|getting into|picking up|teaching myself)\s+([^.!?\n]{3,60})/i;
/** Clauses that mention someone else never become facts about the person. */
const OTHERS_RX = /\b(?:he|she|they|him|her|them|his|hers|their|theirs|our\s+\w+|(?:my\s+)?(?:friends?|brother|sister|mom|mum|dad|father|mother|parents|partner|wife|husband|boyfriend|girlfriend|roommate|coworker|colleague|boss|mentor|team|kids?|son|daughter|children))\b/i;
/** Something the person says about themselves (a time budget is only theirs when they say so). */
const FIRST_PERSON_RX = /\b(?:I|I'm|I’m|I've|I’ve|I'll|I’ll|I'd|I’d)\b|\b(?:me|my|myself)\b/;
/** Reported speech: "Maya said I want to learn bass" is Maya's want. */
const REPORTED_RX = /\b(?:said|says|told me|asked me|asks)\b/i;
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
  if (hasImage(c)) parts.push(`Your image is saved. In Sample mode I cannot read images${note ? ', so I am working from your words' : ''}.`);
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

/** "Make mine": the domain's reference app, grounded in the capture, starting at the minutes the person asked for. */
function newAppDraft(concept: Concept, domain: Domain, captureId: string, said: string, minutes: number | null, unsupported: UnsupportedItem[] = []): RecommendationDraft {
  const spec = concept.buildSpec({ instructions: '' });
  const timed = spec.views.some((v) => v.type === 'practice');
  if (minutes && timed) applyChoices(spec, { timeBudgetMinutes: minutes });
  const caveat = unsupported.length ? ` Not possible here: ${joinNatural(unsupported.map((u) => u.request))}; you save what you like by hand.` : '';
  const reason = domain.id === 'music' && minutes
    ? `${said} A timer that starts at ${minutes} minutes and a metronome make it a session you actually play tonight.${caveat}`
    : `${said} ${concept.reasonTemplate([]).trim()}${caveat}`;
  const firstAction = domain.id === 'music' && minutes ? `Press start on the ${minutes}-minute timer and play the riff at half speed.` : concept.firstAction;
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
    ...(minutes && timed ? { suggestedMinutes: minutes } : {}),
  });
}

/** A design change the person asked for, on an app they already have (a revision, previewed first). */
function updateDraft(app: ExistingAppSummary, plan: UpdatePlan, concept: Concept, captureId: string, said: string): RecommendationDraft {
  return RecommendationDraftSchema.parse({
    conceptId: concept.id,
    kind: 'update_app',
    title: clip(`Give ${app.name} ${plan.change}`, 50),
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

/** The capability an app needs before an entry of a domain's kind can be added to it. */
const ENTRY_CAPABILITY: Record<DomainId, Capability> = { music: 'source_links', photo: 'gallery', people: 'next_actions' };

/** "Use the app you have": open it and, when something worth keeping was shared, ONE entry the person confirms. Never a design change. */
function useDraft(app: ExistingAppSummary, domain: Domain, concept: Concept, captureId: string, said: string, draft: RecordDraft | undefined, minutes: number | null, manualOnly = false): RecommendationDraft {
  const name = app.name;
  if (manualOnly) {
    return RecommendationDraftSchema.parse({
      conceptId: concept.id,
      kind: 'use_app',
      title: clip(`Save links by hand in ${name}`, 50),
      purpose: asPurpose(app.purpose, concept.purpose),
      pattern: asPattern(app.pattern, concept.pattern),
      icon: app.icon ?? concept.icon,
      tagline: 'Nothing syncs; you keep what you choose',
      description: clip(`${name} keeps the links you save yourself, one by one. Nothing is synced or read from other services, and nothing about the app changes.`, 500),
      reason: clip(`${said} That sync does not exist here, but ${name} already keeps the links you save by hand.`, 400),
      evidenceFactIds: [],
      sourceCaptureIds: [captureId],
      firstAction: clip(`Open ${name} and save the next link you like.`, 200),
      previewLines: ['Links you save yourself', 'Nothing syncs', 'Nothing about the app changes'],
      capabilities: app.capabilities.slice(0, 8),
      targetAppId: app.id,
    });
  }
  let title: string;
  let tagline: string;
  let firstAction: string;
  let description: string;
  const lines: string[] = [];
  if (draft?.kind === 'follow_up') {
    title = `Add ${draft.person ?? 'this follow-up'} to ${name}`;
    tagline = `${draft.person ? `${draft.person}: ` : ''}${draft.action ?? 'follow up'}`;
    firstAction = draft.dueText ? `Check who and what, confirm the date for “${draft.dueText}”, and save.` : 'Check who and what, add a date if there is one, and save.';
    description = `${name} already keeps your follow-ups. This adds one entry, which you check and save there; nothing about the app changes and nothing is sent.`;
    lines.push(clip(draft.person ?? 'Who', 60), clip(draft.action ?? 'What', 60), draft.dueText ? `When: “${draft.dueText}”, you confirm the date` : 'When: you choose');
  } else if (draft?.kind === 'photo') {
    title = `Add this photo to ${name}`;
    tagline = 'Your photo, with what you noticed';
    firstAction = 'Write what you noticed and save.';
    description = `${name} already keeps your photos. This adds the one you shared, with what you write about it; nothing about the app changes.`;
    lines.push('Your photo', 'What you noticed', `Kept in ${name}`);
  } else {
    title = domain.id === 'music' ? `Practise in ${name} tonight` : `Open ${name}`;
    tagline = minutes ? `${minutes} minutes on the timer you already have` : 'It already does this';
    firstAction = domain.id === 'music' ? `Open ${name}, pick ${minutes ? `${minutes} minutes` : 'your minutes'} and press Start.` : `Open ${name}.`;
    description = draft?.kind === 'source'
      ? `${name} already does this. Open it and start; your link can be saved in its list in one step. Nothing about the app changes.`
      : `${name} already does this. Open it and start; nothing about the app changes.`;
    if (domain.id === 'music') lines.push(minutes ? `Timer: ${minutes} min` : 'Timer ready', 'Start, pause, save the session');
    if (draft?.kind === 'source') lines.push('Your link, ready to save');
  }
  return RecommendationDraftSchema.parse({
    conceptId: concept.id,
    kind: 'use_app',
    title: clip(title, 50),
    purpose: asPurpose(app.purpose, concept.purpose),
    pattern: asPattern(app.pattern, concept.pattern),
    icon: app.icon ?? concept.icon,
    tagline: clip(tagline, 120),
    description: clip(description, 500),
    reason: clip(`${said} You already have ${name}, and it already does this, so there is nothing new to make.`, 400),
    evidenceFactIds: [],
    sourceCaptureIds: [captureId],
    firstAction: clip(firstAction, 200),
    previewLines: (lines.length ? lines : [`Open ${name}`]).map((l) => clip(l, 60)).slice(0, 5),
    capabilities: app.capabilities.slice(0, 8),
    targetAppId: app.id,
    ...(draft ? { recordDraft: draft } : {}),
  });
}

/** One line for the reply when an app the person has already does the job (claimed only for a use intent). */
function useLine(app: ExistingAppSummary, domain: Domain, draft: RecordDraft | undefined, minutes: number | null, useIntent = true): string {
  if (!useIntent) return `You have ${app.name} for this; open it when you want.`;
  if (draft?.kind === 'follow_up') {
    return `${app.name} already does this. I drafted the entry; you check it and save it there.${draft.dueText ? ` I kept your words ${quote(draft.dueText)}, and you confirm the date.` : ''}`;
  }
  if (draft?.kind === 'photo') return `${app.name} already does this: add the photo there and write what you noticed.`;
  if (domain.id === 'music') return `${app.name} already does this: open it, pick ${minutes ? `${minutes} minutes` : 'your minutes'} and press Start.${draft?.kind === 'source' ? ' Your link can be saved in its list.' : ''}`;
  return `${app.name} already does this.`;
}

/** A change request the person typed about an app they have: sent to that app's revision planner as written. */
function changeDraft(app: ExistingAppSummary, request: string, captureId: string, said: string): RecommendationDraft {
  return RecommendationDraftSchema.parse({
    kind: 'update_app',
    title: clip(`Change ${app.name}`, 50),
    purpose: asPurpose(app.purpose, 'explore'),
    pattern: asPattern(app.pattern, 'journal'),
    icon: app.icon ?? { symbol: 'compass', color: 'lilac' },
    tagline: clip(`A change to ${app.name}, previewed first`, 120),
    description: clip(`You see exactly what would change in ${app.name}, and nothing changes until you accept. Your entries stay as they are.`, 500),
    reason: clip(`${said} That is a change to ${app.name} itself, not a new app.`, 400),
    evidenceFactIds: [],
    sourceCaptureIds: [captureId],
    firstAction: 'Preview the change; nothing changes until you accept.',
    previewLines: [clip(request, 60), 'Preview before anything changes', 'Your entries stay as they are'],
    capabilities: app.capabilities.slice(0, 8),
    targetAppId: app.id,
    updateRequest: clip(request, 400),
  });
}

const CHANGE_VERB_RX = /\b(?:change|make|switch|turn|redesign|rename|restyle|rearrange|reorder|set|give|add|remove|hide|show)\b/i;
/** Words about an app's design (not about practising: "set the tempo to 80" is using the metronome). */
const DESIGN_RX = /\b(?:layout|look|theme|colou?rs?|style|design|font|typography|darker|lighter|brighter|calmer|bolder|default|presets?|icon|fields?|columns?|tabs?|spacing|density|artwork|order|sort(?:ed)?)\b/i;
/** How people name an app they have without its name: "my guitar app", "my photo gallery", "the metronome default". */
const APP_NOUN_RX: Record<DomainId, RegExp> = {
  music: /\bmy (?:practi[cs]e|guitar|music|riff) (?:app|timer|tracker)\b|\bthe (?:metronome|timer)(?:'s|’s)? default\b/i,
  photo: /\bmy (?:photo|photos|camera|light) (?:app|gallery|journal)\b|\bmy gallery\b/i,
  people: /\bmy (?:follow[- ]?ups?|people|contacts?) (?:app|list|queue)\b/i,
};

/** The app is addressed as an app: its name as written ("Riff", not "the riff") and not just opening a sentence, or "my Riff", "Riff app", "in Riff", "Riff's". */
function addressesApp(note: string, name: string): boolean {
  const n = escapeRegExp(name.trim());
  if (n.length < 2) return false;
  if (new RegExp(`(?:\\bmy\\s+|\\bin\\s+)${n}\\b|\\b${n}(?:'s|’s|\\s+app)\\b`).test(note)) return true;
  const rx = new RegExp(`\\b${n}\\b`, 'g');
  let m: RegExpExecArray | null;
  while ((m = rx.exec(note))) {
    const before = note.slice(0, m.index);
    if (before.trim() && !/[.!?:;]\s*$/.test(before)) return true;
  }
  return false;
}

/** The owned app a typed change request is about ("Change my Riff layout …", "Make my photo gallery darker"), if any. */
function changeTarget(note: string, apps: ExistingAppSummary[], domain: Domain | null, fit: ExistingAppSummary | null): ExistingAppSummary | null {
  if (!note || !CHANGE_VERB_RX.test(note) || !(DESIGN_RX.test(note) || /\brename\b/i.test(note))) return null;
  const named = apps.find((a) => addressesApp(note, a.name));
  if (named) return named;
  return domain && fit && APP_NOUN_RX[domain.id].test(note) ? fit : null;
}

/** The note is about doing the thing (practise, shoot, follow up), not about the app or a question. */
const USE_INTENT_RX: Record<DomainId, RegExp> = {
  music: /\b(?:practi[cs]e|practi[cs]ing|play|playing|learn|learning|rehearse|jam|work on|minutes?)\b/i,
  photo: /\b(?:photos?|shoot|shot|shooting|walk|picture|frame|light)\b/i,
  people: /\b(?:follow[- ]?up|send|reply|intro|call|email|reach out|get back|promised|owe|catch up)\b/i,
};

/** "Save this for later", "keep it", "maybe later": a passing save. */
const SAVE_ONLY_RX = /^(?:(?:please|just|ok|okay|hmm|so)[,\s]+)*(?:(?:save|keep|bookmark|stash|park)(?:\s+(?:this|it|that|these))?(?:\s+for\s+(?:later|now|me|another day))?|(?:for|maybe)\s+later|interesting[,\s\u2013\u2014-]+maybe\s+later|later)[.!\s]*$/i;

function isSaveOnly(note: string): boolean {
  return note.length > 0 && SAVE_ONLY_RX.test(note);
}

const NAME_WORD = "\\p{Lu}[\\p{L}'’-]*";
const NAME_AFTER_RX = new RegExp(`\\b(?:with|to|from|ping|email|text|call|message|thank|remind|meet|see|ask)\\s+(${NAME_WORD}(?:\\s+${NAME_WORD})?)(?![\\p{L}])`, 'u');
const NAME_ONLY_RX = new RegExp(`^${NAME_WORD}$`, 'u');
/** Capitalised words that are not people. */
const NOT_A_PERSON_RX = /^(?:LinkedIn|Instagram|YouTube|WhatsApp|Slack|Zoom|Google|Gmail|Spotify|TikTok|Notion|Figma|Teams|iMessage|Demo|Day|Really|Also|Then|Thanks|Maybe|Today|Tonight|Tomorrow)$|^I(?:['’](?:ll|m|d|ve))?$/;
const NOT_A_NAME_RX = /^(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|tomorrow|tonight|january|february|march|april|may|june|july|august|september|october|november|december|the|a|an|i|my|our|their|his|her|about|re)$/i;

/** "Follow up with Maya about the proposal Thursday" → person Maya, action "Follow up about the proposal", words "Thursday". */
export function parseFollowUp(note: string): RecordDraft | undefined {
  // A question is not an entry ("Can my follow-up list show who I owe first?").
  if (/\?\s*$/.test(note)) return undefined;
  let m = NAME_AFTER_RX.exec(note);
  if (m && (m[1] ?? '').split(/\s+/).every((w) => NOT_A_PERSON_RX.test(w))) {
    // "Reply to LinkedIn message from Sam": skip the product and look again after it.
    const rest = note.slice((m.index ?? 0) + m[0].length);
    const again = NAME_AFTER_RX.exec(rest);
    m = again ? Object.assign(again, { index: (m.index ?? 0) + m[0].length + (again.index ?? 0) }) : null;
  }
  const nameWords: string[] = [];
  for (const w of (m?.[1] ?? '').split(/\s+/).filter(Boolean)) {
    if (NOT_A_NAME_RX.test(w) || NOT_A_PERSON_RX.test(w)) break;
    nameWords.push(w);
  }
  const fromTrigger = nameWords.length > 0;
  // Otherwise the first capitalised word that is not just starting a sentence, not after "at/in/on"
  // (places and events), and not a product or "I'll" ("Met Maya at the meetup").
  if (!fromTrigger) {
    const words = note.split(/\s+/);
    for (let i = 1; i < words.length; i++) {
      const prev = words[i - 1] ?? '';
      const w = (words[i] ?? '').replace(/[,.;:!]+$/, '');
      if (/[.!?;:]$/.test(prev) || /^(?:at|in|on|of|the|a|an)$/i.test(prev)) continue;
      if (!NAME_ONLY_RX.test(w) || NOT_A_NAME_RX.test(w) || NOT_A_PERSON_RX.test(w)) continue;
      nameWords.push(w);
      break;
    }
  }
  const person = nameWords.join(' ') || undefined;
  // Keep the words for when only when they are unambiguous (a single deadline); otherwise no date is suggested.
  const when = ambiguousWhen(note) ? null : findWhenWords(note);
  // "promised to send her the demo link" is the action itself.
  const promised = /\bpromised\s+to\s+([^,.;]{4,120})/i.exec(note)?.[1];
  let action = promised ? promised.charAt(0).toUpperCase() + promised.slice(1) : note;
  if (person && fromTrigger && !promised) action = action.replace(new RegExp(`\\s+(?:with|to|from)\\s+${escapeRegExp(person)}(?![\\p{L}])`, 'u'), '');
  if (when) action = action.replace(when, '');
  action = action.replace(/\s{2,}/g, ' ').replace(/^[\s,.;:\u2013\u2014-]+|[\s,.;:\u2013\u2014-]+$/g, '').trim();
  if (!person && !action) return undefined;
  return { kind: 'follow_up', ...(person ? { person } : {}), action: clip(action || 'Follow up', 120), ...(when ? { dueText: when } : {}) };
}

/** The one entry worth adding to an existing app for this capture: the link, the photo or the follow-up. */
function recordDraftFor(domain: Domain, c: Capture, note: string): RecordDraft | undefined {
  if (domain.id === 'music') {
    if (!c.url) return undefined;
    return {
      kind: 'source',
      url: c.url,
      title: clip(c.readStatus === 'metadata_only' && c.linkMeta?.title ? c.linkMeta.title : c.sourceLabel, 120),
      ...(note ? { note: clip(note, 300) } : {}),
    };
  }
  if (domain.id === 'photo') return c.mediaId ? { kind: 'photo', mediaId: c.mediaId } : undefined;
  const followUp = note && USE_INTENT_RX.people.test(note) ? parseFollowUp(note) : undefined;
  return followUp ? { ...followUp, note: clip(note, 300) } : undefined;
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
    count: 6,
  });
  // Only an app that actually matched the capture: a "popular starting point" is not grounded in it.
  const pick = recs.find((r) => r.kind === 'new_app' && r.sourceCaptureIds.includes(c.id) && r.reason !== SPARSE_REASON && r.reason !== FILL_REASON);
  if (!pick) return null;
  return RecommendationDraftSchema.parse({
    ...pick,
    sourceCaptureIds: uniq([c.id, ...pick.sourceCaptureIds]).slice(0, 4),
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

  // A time budget is only about the person when the note is (not "my brother has 15 minutes").
  if (minutes && domain && domain.id !== 'people' && FIRST_PERSON_RX.test(note) && !OTHERS_RX.test(note)) {
    const instrument = INSTRUMENT_RX.exec(note)?.[1]?.toLowerCase();
    const activity = domain.id === 'music' ? `${instrument ?? 'music'} practice` : 'photography';
    push('routine', `Has about ${minutes} minutes at a time for ${activity}`);
  }
  const want = WANT_RX.exec(note);
  if (want?.[1] && !REPORTED_RX.test(note.slice(0, want.index))) {
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
  // Repeated saves are mentioned in the reply, never stored as an interest: saving is not a commitment.
  void repeats;
  return out.slice(0, 3);
}

export function respondToCapture(input: RespondInput): RespondResult {
  const c = input.capture;
  const note = c.text.trim();
  const host = (() => { try { return c.url ? new URL(c.url).hostname : ''; } catch { return ''; } })();
  const haystack = [note, c.linkMeta?.title ?? '', c.linkMeta?.author ?? '', c.sourceLabel, host].join(' ');
  // Sample mode cannot see an image, but an image with no other cue is still a photo.
  const domain = detectDomain(haystack) ?? (hasImage(c) && c.mediaId ? domainById('photo') : null);
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

  // 1. A passing save stays a save: nothing to make, nothing learned.
  if (isSaveOnly(note)) {
    message.push('Kept as a source: nothing is added to your memory and no app is made.');
    return {
      message: clip(message.join(' '), 700),
      ...(hasLink(c) || hasImage(c) ? { question: 'If you want more than a save, what is it about, in a line?' } : {}),
      proposals: [keepDraft(c.id)],
      learned: [],
      unsupported: [],
      imageRead: false,
    };
  }

  // 2. A change to an app the person already has is a design revision: previewed, accepted, undoable.
  const unsupported = findUnsupported(note);
  const domainFit = domain ? fittingApp(domain, input.existingApps) : null;
  const target = unsupported.length ? null : changeTarget(note, input.existingApps, domain, domainFit?.full ? domainFit.app : null);
  if (target) {
    message.push(`That is a change to ${target.name} itself, so you will see a preview before anything changes.`);
    const change = [changeDraft(target, note, c.id, said)];
    // "Make Riff darker and play the riff tonight": using the app comes along with the change.
    if (domain && domainFit?.full && domainFit.app.id === target.id && USE_INTENT_RX[domain.id].test(note.replace(DESIGN_RX, ''))) {
      change.push(useDraft(target, domain, conceptById(domain.conceptId) as Concept, c.id, said, undefined, minutes));
    }
    return { message: clip(message.join(' '), 700), proposals: change, learned: [], unsupported: [], imageRead: false };
  }
  // 3. What does not exist here is named plainly (and never implied by a card).
  if (unsupported.length) {
    message.push(`Not possible here: ${joinNatural(unsupported.map((u) => u.request))}. Nothing is synced, read or sent for you.`);
  }
  ctx.note = note;

  let fullFit = false;
  if (domain) {
    const concept = conceptById(domain.conceptId) as Concept;
    const fit = fittingApp(domain, input.existingApps);
    if (repeats >= 2) message.push(`That makes ${repeats + 1} ${domain.topic} saves, so this looks like more than a passing interest.`);
    if (fit?.full) {
      // 4. An app the person has already does the job: use it (and add one entry they confirm). No duplicate, no revision.
      fullFit = true;
      // Only a sync request has a stand-in (links saved by hand), and only in an app that keeps links.
      const manualOnly = unsupported.length > 0 && unsupported.every(isSyncItem) && fit.app.capabilities.includes('source_links');
      // "Already does this" is claimed only for doing the thing, never for a question about the app.
      const useIntent = !/\?\s*$/.test(note) && (USE_INTENT_RX[domain.id].test(note) || (domain.id === 'photo' && hasImage(c)));
      const draft = !manualOnly && fit.app.capabilities.includes(ENTRY_CAPABILITY[domain.id]) ? recordDraftFor(domain, c, note) : undefined;
      proposals.push(useDraft(fit.app, domain, concept, c.id, said, draft, minutes, manualOnly));
      // A note about someone else's routine ("Our son practises 20 minutes") never redesigns the person's app.
      const aboutOthers = OTHERS_RX.test(note) && !FIRST_PERSON_RX.test(note);
      const plan = unsupported.length || aboutOthers ? null : domain.updateRequest(fit.app, ctx, true);
      if (plan) proposals.push(updateDraft(fit.app, plan, concept, c.id, said));
      message.push(manualOnly
        ? `${fit.app.name} keeps the links you save by hand.`
        : unsupported.length
          ? `${fit.app.name} can still help with the rest; open it when you are ready.`
          : useLine(fit.app, domain, draft, minutes, useIntent));
    } else {
      // 5. Nothing fits yet: the domain's app, starting at the minutes the person asked for.
      proposals.push(newAppDraft(concept, domain, c.id, said, minutes, unsupported));
      const plan = fit && !unsupported.length ? domain.updateRequest(fit.app, ctx, false) : null;
      if (fit && plan) proposals.push(updateDraft(fit.app, plan, concept, c.id, said));
    }
    proposals.push(exploreDraft(domain, ctx, {
      evidenceFactIds: [],
      sourceCaptureIds: [c.id],
      reason: `${said} Sometimes the useful next step is to do the thing once, not to set anything up.`,
    }));
  } else {
    message.push('Nothing in it points at one of my ready-made directions, so these Sample-mode suggestions start from your words.');
    const app = unsupported.length ? null : fallbackAppDraft(input, said);
    if (app) proposals.push(app);
    proposals.push(genericExploreDraft(c.id, said, ctx.words ?? null));
  }
  proposals.push(keepDraft(c.id));

  let question: string | undefined;
  if (!note && hasImage(c)) question = 'What does the screenshot show, in a line?';
  else if (!note && hasLink(c)) question = 'What is the link about, in a line?';
  else if (domain?.id === 'music' && !minutes && !fullFit) question = 'How many minutes do you usually have to practise?';

  return {
    message: clip(message.join(' '), 700),
    ...(question ? { question } : {}),
    proposals: proposals.slice(0, 4),
    learned: learnFromNote(note, domain, minutes, repeats),
    unsupported,
    imageRead: false,
  };
}
