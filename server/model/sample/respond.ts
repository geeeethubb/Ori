/**
 * Sample-mode Agent: a deterministic, honest reply to a capture. The message is at most two short
 * sentences before the cards: a compact read-status sentence when a link, video or image was not read
 * ("I have not read the page, so I'm using your note."), then the next step ("A place for the shots
 * you notice. Want to make it yours?"). The cards offer a small set of directions: make the reference
 * app for the domain (Riff, Light, People, or a sketching timer), use an app that already fits with one
 * entry to confirm, change an app the person asked to change (previewed first), explore without an app,
 * or just keep the source. A shared photo is an entry even when its note names camera settings; details
 * for every photo are a change. Card reasons say what the app or step does; the capture itself is listed
 * as the card's source, so reasons do not quote it. Nothing here invents links, artists or availability,
 * never claims an app has details its summary cannot confirm, and nothing learned from a note is ever
 * about another person.
 */
import { PATTERNS, PURPOSES, type Capability, type Pattern, type Purpose } from '../../../shared/appSpec.ts';
import { displayIcon } from '../../../shared/brand.ts';
import { RecommendationDraftSchema, type ExtractedFact, type RecordDraft, type RecommendationDraft, type UnsupportedItem } from '../../../shared/context.ts';
import { ambiguousWhen, findWhenWords } from '../../../shared/time.ts';
import type { ExistingAppSummary, RespondInput, RespondResult } from '../types.ts';
import { conceptById, type Concept } from './catalog.ts';
import { detectDomain, DOMAINS, domainById, exploreDraft, fittingApp, minutesIn, type Domain, type DomainId, type ExploreContext, type UpdatePlan } from './domains.ts';
import { minutesCount, minutesFromText, spokenDuration } from './durations.ts';
import { applyChoices } from './generate.ts';
import { CAMERA_DETAILS, cameraDetailsIn, listedCameraDetails, listPhrases } from './heuristics.ts';
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
/** A clause that states a length of time ("15 minutes", "a ten-minute", "half an hour"). */
const hasTime = (s: string) => minutesFromText(s) !== null;
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

/** Videos are never watched here; a link to one says so in those words. */
function isVideoLink(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^(?:www|m)\./, '');
    return /^(?:youtube\.com|youtu\.be|vimeo\.com|tiktok\.com)$/.test(host) || (host === 'instagram.com' && /^\/reels?\//.test(u.pathname));
  } catch {
    return false;
  }
}

/**
 * One compact sentence on what was not read ("I have not read the page, so I'm using your note."), or
 * null when only a note was shared. Never claims more than what actually happened. `using` adds what
 * the reply works from instead (left out for a plain save).
 */
export function readLine(c: Capture, using = true): string | null {
  const note = c.text.trim();
  const link = hasLink(c) && c.readStatus !== 'read';
  const image = hasImage(c);
  if (!link && !image) return null;
  const from = using && note ? (link ? ", so I'm using your note" : ", so I'm using your words") : '';
  const title = c.linkMeta?.title?.trim();
  if (link && c.readStatus === 'metadata_only' && title) {
    return `${image ? 'Sample mode cannot read images, and ' : ''}I read only the title ${quote(clip(title, 60))}, not the ${isVideoLink(c.url) ? 'video' : 'page'} itself.`;
  }
  const linkPart = !link ? null : c.readStatus === 'unavailable' ? 'I could not open the link' : isVideoLink(c.url) ? "I can't watch videos" : 'I have not read the page';
  if (image) return `Sample mode cannot read images${linkPart ? ` and ${linkPart}` : ''}${from}.`;
  return `${linkPart}${from}.`;
}

/**
 * The person's own words for their time, as it reads after "your": "15 minutes to practice", "ten
 * minutes" (they said "a ten-minute session"), "half an hour", "quarter of an hour", "1 minute"; else the minutes.
 */
function minutesPhrase(note: string, minutes: number): string {
  return spokenDuration(note) ?? minutesCount(minutes);
}

/** The offer in the person's terms: a statement and an ask, or the same as one question after a read-status sentence. */
interface Pitch { statement: string; ask: string; single: string }

function domainPitch(domain: Domain, note: string, minutes: number | null): Pitch {
  const ask = 'Want to make it yours?';
  if (domain.id === 'photo') return { statement: 'A place for the shots you notice.', ask, single: 'Want a place for the shots you notice?' };
  if (domain.id === 'people') return { statement: 'One place for who you owe a follow-up.', ask, single: 'Want one place for who you owe a follow-up?' };
  const room = domain.id === 'sketch'
    ? minutes ? `a sketching timer for your ${minutesPhrase(note, minutes)}` : 'a sketching timer for the minutes you have'
    : minutes ? `a practice room for your ${minutesPhrase(note, minutes)}` : 'a practice room for the music you want to play';
  return { statement: `${room.charAt(0).toUpperCase()}${room.slice(1)}.`, ask, single: `Want ${room}?` };
}

function asPattern(p: string, fallback: Pattern): Pattern {
  return (PATTERNS as readonly string[]).includes(p) ? (p as Pattern) : fallback;
}

function asPurpose(p: string, fallback: Purpose): Purpose {
  return (PURPOSES as readonly string[]).includes(p) ? (p as Purpose) : fallback;
}

/**
 * "Make mine": the domain's reference app, grounded in the capture, starting at the minutes the person
 * asked for. The reason says what the app does; the person's own words are listed under it as the card's
 * source ("Why this?"), so the reason does not repeat them.
 */
function newAppDraft(concept: Concept, domain: Domain, captureId: string, minutes: number | null, unsupported: UnsupportedItem[] = [], note = ''): RecommendationDraft {
  const spec = concept.buildSpec({ instructions: '' });
  const timed = spec.views.some((v) => v.type === 'practice');
  if (minutes && timed) applyChoices(spec, { timeBudgetMinutes: minutes });
  const caveat = unsupported.length ? ` Not possible here: ${joinNatural(unsupported.map((u) => u.request))}; you save what you like by hand.` : '';
  const music = domain.id === 'music' && minutes && timed;
  const sketch = domain.id === 'sketch' && minutes && timed;
  const reason = music
    ? `A timer that starts at ${minutesCount(minutes)} and a metronome make it a session you actually play.${caveat}`
    : sketch
      ? `A timer that starts at ${minutesCount(minutes)} and one thing to draw make it a sketch you actually finish.${caveat}`
      : `${concept.reasonTemplate([]).trim()}${caveat}`;
  const firstAction = music
    ? `Press start on the ${minutes}-minute timer and play the riff at half speed.`
    : sketch ? `Press start on the ${minutes}-minute timer and draw the nearest object.` : concept.firstAction;
  const instrument = INSTRUMENT_RX.exec(note)?.[1]?.toLowerCase();
  const tagline = music ? `Make room for ${minutesCount(minutes)} of ${instrument ?? 'practice'}.` : sketch ? `Make room for ${minutesCount(minutes)} of sketching.` : concept.tagline;
  return RecommendationDraftSchema.parse({
    conceptId: concept.id,
    kind: 'new_app',
    title: clip(concept.title, 50),
    purpose: concept.purpose,
    pattern: concept.pattern,
    icon: concept.icon,
    tagline: clip(tagline, 120),
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
function updateDraft(app: ExistingAppSummary, plan: UpdatePlan, concept: Concept, captureId: string): RecommendationDraft {
  return RecommendationDraftSchema.parse({
    conceptId: concept.id,
    kind: 'update_app',
    title: clip(`Give ${app.name} ${plan.change}`, 50),
    purpose: asPurpose(app.purpose, concept.purpose),
    pattern: asPattern(app.pattern, concept.pattern),
    icon: displayIcon(app.name, app.icon ?? concept.icon),
    tagline: clip(`${app.name} gets ${plan.change}`, 120),
    description: clip(`${app.name} gets ${plan.change}. Everything you already saved stays as it is, and you see the change before it applies.`, 500),
    reason: clip(`You already have ${app.name}; adding to it keeps everything in one place instead of starting another app.`, 400),
    evidenceFactIds: [],
    sourceCaptureIds: [captureId],
    firstAction: clip(`Preview the change to ${app.name}; nothing you saved is touched.`, 200),
    previewLines: plan.previewLines.map((l) => clip(l, 60)).slice(0, 5),
    capabilities: app.capabilities.slice(0, 8),
    targetAppId: app.id,
    updateRequest: clip(plan.request, 400),
  });
}

/** The capability an app needs before an entry of a domain's kind can be added to it (none for sketching). */
const ENTRY_CAPABILITY: Partial<Record<DomainId, Capability>> = { music: 'source_links', photo: 'gallery', people: 'next_actions' };

/**
 * An app summary may list its visible field labels; with them the Agent can tell whether details asked
 * for ("Camera", "ISO") are there already. Without them it never claims they are.
 */
type AppWithFields = ExistingAppSummary & { fieldLabels?: string[] };

/** The camera details a note names ("ISO 400", "f/8 and shutter at 1/500"), by label. */
function namedDetails(note: string): string[] {
  const loose = /\bf\/\d/i.test(note) ? ['aperture' as const] : [];
  return [...new Set([...cameraDetailsIn(note), ...loose])].map((d) => CAMERA_DETAILS[d].label);
}

/** Every named detail is a visible field of the app, as far as its summary says (never assumed). */
function hasAll(app: AppWithFields, labels: string[]): boolean {
  if (!labels.length) return true;
  const have = new Set((app.fieldLabels ?? []).map((l) => l.toLowerCase()));
  return labels.every((l) => have.has(l.toLowerCase()));
}

/** "Use the app you have": open it and, when something worth keeping was shared, ONE entry the person confirms. Never a design change. */
function useDraft(app: ExistingAppSummary, domain: Domain, concept: Concept, captureId: string, draft: RecordDraft | undefined, minutes: number | null, manualOnly = false, confirmed = true): RecommendationDraft {
  const name = app.name;
  if (manualOnly) {
    return RecommendationDraftSchema.parse({
      conceptId: concept.id,
      kind: 'use_app',
      title: clip(`Save links by hand in ${name}`, 50),
      purpose: asPurpose(app.purpose, concept.purpose),
      pattern: asPattern(app.pattern, concept.pattern),
      icon: displayIcon(app.name, app.icon ?? concept.icon),
      tagline: 'Nothing syncs; you keep what you choose',
      description: clip(`${name} keeps the links you save yourself, one by one. Nothing is synced or read from other services, and nothing about the app changes.`, 500),
      reason: clip(`That sync does not exist here, but ${name} already keeps the links you save by hand.`, 400),
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
    const timed = domain.id === 'music' || domain.id === 'sketch';
    title = domain.id === 'music' ? `Practice in ${name} tonight` : domain.id === 'sketch' ? `Sketch in ${name} today` : `Open ${name}`;
    // Only a timer app offers "minutes on the timer"; "already does this" only when nothing asked for is in doubt.
    tagline = minutes && timed ? `${minutesCount(minutes)} on the timer you already have` : confirmed ? 'It already does this' : 'Open it when you are ready';
    firstAction = timed ? `Open ${name}, pick ${minutes ? minutesCount(minutes) : 'your minutes'} and press Start.` : `Open ${name}.`;
    description = !confirmed
      ? `${name} keeps your ${domain.id === 'photo' ? 'photos' : 'entries'}. Open it and add what you want; nothing about the app changes.`
      : draft?.kind === 'source'
        ? `${name} already does this. Open it and start; your link can be saved in its list in one step. Nothing about the app changes.`
        : `${name} already does this. Open it and start; nothing about the app changes.`;
    if (timed) lines.push(minutes ? `Timer: ${minutes} min` : 'Timer ready', domain.id === 'sketch' ? 'Start, pause, save the sketch' : 'Start, pause, save the session');
    if (draft?.kind === 'source') lines.push('Your link, ready to save');
  }
  const keeps = draft?.kind === 'follow_up' ? 'it already keeps your follow-ups' : draft?.kind === 'photo' ? 'it already keeps your photos' : confirmed ? 'it already does this' : null;
  return RecommendationDraftSchema.parse({
    conceptId: concept.id,
    kind: 'use_app',
    title: clip(title, 50),
    purpose: asPurpose(app.purpose, concept.purpose),
    pattern: asPattern(app.pattern, concept.pattern),
    icon: displayIcon(app.name, app.icon ?? concept.icon),
    tagline: clip(tagline, 120),
    description: clip(description, 500),
    reason: clip(keeps ? `You already have ${name}, and ${keeps}, so there is nothing new to make.` : `You already have ${name} for this, so there is nothing new to make.`, 400),
    evidenceFactIds: [],
    sourceCaptureIds: [captureId],
    firstAction: clip(firstAction, 200),
    previewLines: (lines.length ? lines : [`Open ${name}`]).map((l) => clip(l, 60)).slice(0, 5),
    capabilities: app.capabilities.slice(0, 8),
    targetAppId: app.id,
    ...(draft ? { recordDraft: draft } : {}),
  });
}

/**
 * One sentence for the reply when an app the person has already does the job (claimed only for a use
 * intent, and never for details the app's summary cannot confirm, such as "ISO 400" on a photo).
 */
function useLine(app: ExistingAppSummary, domain: Domain, draft: RecordDraft | undefined, minutes: number | null, useIntent = true, confirmed = true): string {
  if (!useIntent) return `You have ${app.name} for this; open it when you want.`;
  if (draft?.kind === 'follow_up') {
    return `${app.name} already does this: check the entry I drafted${draft.dueText ? `, confirm a date for ${quote(draft.dueText)}` : ''} and save it there.`;
  }
  if (draft?.kind === 'photo') return confirmed ? `${app.name} already does this: add the photo there and write what you noticed.` : `Add the photo to ${app.name} and write what you noticed there.`;
  if (domain.id === 'music' || domain.id === 'sketch') return `${app.name} already does this: open it, pick ${minutes ? minutesCount(minutes) : 'your minutes'} and press Start${draft?.kind === 'source' ? '; your link can be saved in its list' : ''}.`;
  return confirmed ? `${app.name} already does this.` : `Open ${app.name} when you are ready; it keeps your ${domain.id === 'photo' ? 'photos' : 'entries'}.`;
}

/** A change request the person typed about an app they have: sent to that app's revision planner as written. */
function changeDraft(app: ExistingAppSummary, request: string, captureId: string): RecommendationDraft {
  return RecommendationDraftSchema.parse({
    kind: 'update_app',
    title: clip(`Change ${app.name}`, 50),
    purpose: asPurpose(app.purpose, 'explore'),
    pattern: asPattern(app.pattern, 'journal'),
    icon: displayIcon(app.name, app.icon ?? { symbol: 'compass', color: 'lilac' }),
    tagline: clip(`A change to ${app.name}, previewed first`, 120),
    description: clip(`You see exactly what would change in ${app.name}, and nothing changes until you accept. Your entries stay as they are.`, 500),
    reason: clip(`That is a change to ${app.name} itself, not a new app.`, 400),
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
  sketch: /\bmy (?:sketch(?:ing|book)?|drawing|art) (?:app|timer|journal|book)\b|\bmy sketchbook\b/i,
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

/**
 * The owned app a typed change request is about ("Change my Riff layout …", "Make my photo gallery
 * darker", "Add camera settings to my photo notes" or "I want to note shutter speed and aperture for each
 * photo" when a gallery app fits), if any. Camera details are a change only when they are what is being
 * added to the entries; a shared photo with its settings ("Shot at ISO 400, add it to Light") is an entry.
 */
function changeTarget(note: string, apps: ExistingAppSummary[], domain: Domain | null, fit: ExistingAppSummary | null, image: boolean): { app: ExistingAppSummary; details: string[] } | null {
  if (!note) return null;
  const details = image ? [] : listedCameraDetails(note).map((d) => CAMERA_DETAILS[d].label);
  const photoDetail = details.length > 0;
  // "note", "record", "track", "log" and "include" ask for a change too when what they add is a detail.
  if (!CHANGE_VERB_RX.test(note) && !photoDetail) return null;
  if (!(DESIGN_RX.test(note) || photoDetail || /\brename\b/i.test(note))) return null;
  const named = apps.find((a) => addressesApp(note, a.name));
  if (named) return { app: named, details };
  if (!domain || !fit) return null;
  return APP_NOUN_RX[domain.id].test(note) || (photoDetail && domain.id === 'photo') ? { app: fit, details } : null;
}

/** The note is about doing the thing (practise, shoot, follow up), not about the app or a question. */
const USE_INTENT_RX: Record<DomainId, RegExp> = {
  music: /\b(?:practi[cs]e|practi[cs]ing|play|playing|learn|learning|rehearse|jam|work on|minutes?)\b/i,
  photo: /\b(?:photos?|shoot|shot|shooting|walk|picture|frame|light)\b/i,
  people: /\b(?:follow[- ]?up|send|reply|intro|call|email|reach out|get back|promised|owe|catch up)\b/i,
  sketch: /\b(?:sketch(?:es|ing)?|draw|drawing|doodl(?:e|es|ing)|paint(?:ing)?|minutes?)\b/i,
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
  if (domain.id !== 'people') return undefined;
  const followUp = note && USE_INTENT_RX.people.test(note) ? parseFollowUp(note) : undefined;
  return followUp ? { ...followUp, note: clip(note, 300) } : undefined;
}

/** "Just keep it": a save stays a save. Also added by the Agent route to any reply that lacks it. */
export function keepDraft(captureId: string): RecommendationDraft {
  return RecommendationDraftSchema.parse({
    kind: 'keep',
    title: 'Just keep it',
    purpose: 'explore',
    pattern: 'journal',
    icon: { symbol: 'bookmark', color: 'paper' },
    tagline: 'A save stays a save',
    description: 'Keep it as a saved source in What you’ve shared, without turning it into an interest, a memory or an app.',
    reason: 'Not every save needs a plan. It stays findable, and nothing else changes.',
    evidenceFactIds: [],
    sourceCaptureIds: [captureId],
    firstAction: 'Nothing. It is saved.',
    previewLines: ['Saved as a source', 'No new interest recorded', 'No app created'],
    capabilities: [],
  });
}

/** No clear domain: the catalog, with the capture itself as grounding (and the facts as a tie-break). */
function fallbackAppDraft(input: RespondInput): RecommendationDraft | null {
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

function genericExploreDraft(captureId: string, words: string | null): RecommendationDraft {
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
    reason: clip('The quickest way to learn whether this matters is to act on it once.', 400),
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
  const aboutSelf = (clause: string) => clause.length >= 3 && !OTHERS_RX.test(clause) && !hasTime(clause) && !(domain?.id === 'people' && PROPER_NOUN_RX.test(clause));

  // A time budget is only about the person when the note is (not "my brother has 15 minutes").
  if (minutes && domain && domain.id !== 'people' && FIRST_PERSON_RX.test(note) && !OTHERS_RX.test(note)) {
    const instrument = INSTRUMENT_RX.exec(note)?.[1]?.toLowerCase();
    const activity = domain.id === 'music' ? `${instrument ?? 'music'} practice` : domain.id === 'sketch' ? 'sketching' : 'photography';
    push('routine', `Has about ${minutesCount(minutes)} at a time for ${activity}`);
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
  // An app the note names ("add it to Light") says what it is about when the words alone do not. Sample mode
  // cannot see an image, but an image with no other cue is still a photo.
  const namedApp = input.existingApps.find((a) => addressesApp(note, a.name));
  const domain = detectDomain(haystack)
    ?? (namedApp ? DOMAINS.find((d) => fittingApp(d, [namedApp])?.full) ?? null : null)
    ?? (hasImage(c) && c.mediaId ? domainById('photo') : null);
  const minutes = minutesIn(note);
  const repeats = domain ? input.recentCaptures.filter((rc) => rc.id !== c.id && detectDomain(`${rc.text} ${rc.url ?? ''}`)?.id === domain.id).length : 0;
  // The capture is every card's source, listed under "Why this?" with what was read; reasons do not repeat it.
  const ctx: ExploreContext = {
    words: note ? clip(note, 60) : null,
    minutes,
    source: hasImage(c) ? 'image' : hasLink(c) ? 'link' : null,
    sourceTitle: c.readStatus === 'metadata_only' ? c.linkMeta?.title ?? null : null,
  };

  // At most two short sentences before the cards: a compact read-status sentence when something was
  // not read (or something asked for is not possible here), then the next step. The cards carry the rest.
  const say = (...sentences: (string | null | undefined)[]) => clip(sentences.filter((s): s is string => Boolean(s)).join(' '), 700);
  const read = readLine(c);
  let message = '';
  const proposals: RecommendationDraft[] = [];

  // 1. A passing save stays a save: nothing to make, nothing learned.
  if (isSaveOnly(note)) {
    return {
      message: say(readLine(c, false), 'Kept as a source: nothing is added to your memory and no app is made.'),
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
  const target = unsupported.length ? null : changeTarget(note, input.existingApps, domain, domainFit?.full ? domainFit.app : null, hasImage(c));
  if (target) {
    const app: AppWithFields = target.app;
    // Details its summary shows it already has ("Add camera settings" after that change was made): nothing to change.
    if (target.details.length && app.fieldLabels && hasAll(app, target.details)) {
      const photo = domainById('photo'); // the details are a photo's camera details
      return {
        message: say(read, `${app.name} already has ${joinNatural(target.details)}; open it and fill them in.`),
        proposals: [useDraft(app, photo, conceptById(photo.conceptId) as Concept, c.id, undefined, minutes)],
        learned: [],
        unsupported: [],
        imageRead: false,
      };
    }
    const change = [changeDraft(app, note, c.id)];
    // "Make Riff darker and play the riff tonight": using the app comes along with the change. The details
    // being added ("add lens and ISO to my photos") are the change itself, never a use of the app.
    let rest = note;
    for (const p of listPhrases(note)) rest = rest.replace(p.whole, ' ');
    rest = rest.replace(DESIGN_RX, '').replace(/\b(?:my|the|each|every)\s+(?:photo|photos)\s+notes?\b/gi, '');
    if (domain && domainFit?.full && domainFit.app.id === app.id && USE_INTENT_RX[domain.id].test(rest)) {
      change.push(useDraft(app, domain, conceptById(domain.conceptId) as Concept, c.id, undefined, minutes));
    }
    return { message: say(read, `That is a change to ${app.name} itself; you will see it before anything changes.`), proposals: change, learned: [], unsupported: [], imageRead: false };
  }
  // 3. What does not exist here is named plainly (and never implied by a card); the list below says why.
  const notHere = unsupported.length ? `not possible here: ${joinNatural(unsupported.map((u) => u.request))}` : null;
  const lead = read && notHere ? `${read.replace(/\.$/, '')}; ${notHere}.` : read ?? (notHere ? `${notHere.charAt(0).toUpperCase()}${notHere.slice(1)}.` : null);
  ctx.note = note;

  let fullFit = false;
  if (domain) {
    const concept = conceptById(domain.conceptId) as Concept;
    const fit = fittingApp(domain, input.existingApps);
    if (fit?.full) {
      // 4. An app the person has already does the job: use it (and add one entry they confirm). No duplicate, no revision.
      fullFit = true;
      // Only a sync request has a stand-in (links saved by hand), and only in an app that keeps links.
      const manualOnly = unsupported.length > 0 && unsupported.every(isSyncItem) && fit.app.capabilities.includes('source_links');
      // "Already does this" is claimed only for doing the thing, never for a question about the app, and
      // never for details its summary cannot confirm ("Shot at ISO 400": Light may have no ISO yet).
      const useIntent = !/\?\s*$/.test(note) && (USE_INTENT_RX[domain.id].test(note) || (domain.id === 'photo' && hasImage(c)));
      const confirmed = domain.id !== 'photo' || hasAll(fit.app, namedDetails(note));
      const entryCapability = ENTRY_CAPABILITY[domain.id];
      const draft = !manualOnly && entryCapability && fit.app.capabilities.includes(entryCapability) ? recordDraftFor(domain, c, note) : undefined;
      proposals.push(useDraft(fit.app, domain, concept, c.id, draft, minutes, manualOnly, confirmed));
      // A note about someone else's routine ("Our son practises 20 minutes") never redesigns the person's app.
      const aboutOthers = OTHERS_RX.test(note) && !FIRST_PERSON_RX.test(note);
      const plan = unsupported.length || aboutOthers ? null : domain.updateRequest(fit.app, ctx, true);
      if (plan) proposals.push(updateDraft(fit.app, plan, concept, c.id));
      // A shared photo with "add camera settings to my photo notes": the photo stays an entry, and the change
      // to every photo is offered as its own card (previewed first), never folded into the entry.
      else if (!unsupported.length && domain.id === 'photo' && hasImage(c) && listedCameraDetails(note).length && !hasAll(fit.app, namedDetails(note))) {
        proposals.push(changeDraft(fit.app, note, c.id));
      }
      message = say(lead, manualOnly
        ? `${fit.app.name} keeps the links you save by hand.`
        : unsupported.length
          ? `${fit.app.name} can still help with the rest; open it when you are ready.`
          : useLine(fit.app, domain, draft, minutes, useIntent, confirmed));
    } else {
      // 5. Nothing fits yet: the domain's app, starting at the minutes the person asked for.
      proposals.push(newAppDraft(concept, domain, c.id, minutes, unsupported, note));
      const plan = fit && !unsupported.length ? domain.updateRequest(fit.app, ctx, false) : null;
      if (fit && plan) proposals.push(updateDraft(fit.app, plan, concept, c.id));
      const pitch = domainPitch(domain, note, minutes);
      // Repeated saves are worth one honest observation, when there is room for it.
      const ask = repeats >= 2 ? `That makes ${repeats + 1} ${domain.topic} saves; want to make it yours?` : pitch.ask;
      message = lead ? say(lead, pitch.single) : say(pitch.statement, ask);
    }
    proposals.push(exploreDraft(domain, ctx, {
      evidenceFactIds: [],
      sourceCaptureIds: [c.id],
      reason: 'Sometimes the useful next step is to do the thing once, not to set anything up.',
    }));
  } else {
    const app = unsupported.length ? null : fallbackAppDraft(input);
    if (app) proposals.push(app);
    proposals.push(genericExploreDraft(c.id, ctx.words ?? null));
    message = say(lead, app ? 'Here are a few ways to start, from your own words.' : 'One small way to try it, or keep it for later.');
  }
  proposals.push(keepDraft(c.id));

  let question: string | undefined;
  if (!note && hasImage(c)) question = 'What does the screenshot show, in a line?';
  else if (!note && hasLink(c)) question = 'What is the link about, in a line?';
  else if (domain?.id === 'music' && !minutes && !fullFit) question = 'How many minutes do you usually have to practice?';
  else if (domain?.id === 'sketch' && !minutes && !fullFit) question = 'How many minutes do you usually have to sketch?';

  return {
    message,
    ...(question ? { question } : {}),
    proposals: proposals.slice(0, 4),
    learned: learnFromNote(note, domain, minutes, repeats),
    unsupported,
    imageRead: false,
  };
}
