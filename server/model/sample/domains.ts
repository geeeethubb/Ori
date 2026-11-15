/**
 * The reference domains the redesign's Agent and Playground understand without a model: music (Riff),
 * photography (Light), people / follow-ups (People), and sketching (a sketching timer the Agent offers
 * when a note is about drawing; the Playground keeps scoring the Sketchbook journal). A domain knows how to spot
 * itself in a note, a link title or a fact; which reference concept builds its app; when an existing
 * app already covers it; what to explore without an app; and which change request the sample
 * revision planner can actually apply to an existing app. Nothing here invents links, artists,
 * events or availability: every step uses what the person shared or general practice.
 */
import type { AppIcon, Capability, Pattern } from '../../../shared/appSpec.ts';
import { PATTERNS } from '../../../shared/appSpec.ts';
import { RecommendationDraftSchema, type RecommendationDraft } from '../../../shared/context.ts';
import type { ExistingAppSummary } from '../types.ts';
import { minutesCount, minutesFromText } from './durations.ts';
import { clip, joinNatural, quote } from './text.ts';

export type DomainId = 'music' | 'photo' | 'people' | 'sketch';

/** An app named for drawing ("Sketch Sprint", "Sketchbook"): its timer is for sketching, not for music. */
const SKETCH_APP_RX = /\b(?:sketch\w*|draw\w*|doodl\w*|illustrat\w*|art|paint\w*|watercolou?r\w*)\b/i;
const appWords = (a: ExistingAppSummary) => `${a.name} ${a.tagline ?? ''}`;

/** What the person shared, reduced to what an exploration or an update can honestly refer to. */
export interface ExploreContext {
  /** A short fragment in the person's own words (already clipped to ~60 chars), quoted inside steps. */
  words?: string | null;
  /** Minutes the person said they have, when they said so. */
  minutes?: number | null;
  /** What came with the words, if anything. */
  source?: 'link' | 'image' | null;
  /** Title of the link when an allowlisted provider gave one (readStatus metadata_only). */
  sourceTitle?: string | null;
  /** The whole note, for telling a request for a change apart from using what is there. */
  note?: string | null;
}

/** A change request for an existing app, phrased so the sample revision planner maps it to real ops. */
export interface UpdatePlan {
  request: string;
  /** Noun phrase for the proposal description: "a 15-minute timer preset". */
  change: string;
  previewLines: string[];
}

export interface Domain {
  id: DomainId;
  /** Unambiguous words (worth 2 points each) and generic words (1 point) found in notes, titles or facts. */
  strong: RegExp;
  weak: RegExp;
  /** Reference concept that builds the domain's app. */
  conceptId: string;
  /** Original catalog concept for the same need; the Playground never shows both. */
  legacyConceptId: string;
  /** Capability that means an existing app already covers the domain in full. */
  coreCapability: Capability;
  /** When the capability alone is not enough (a timer can be for music or for sketching): does this app cover it in full? */
  fullFit?: (app: ExistingAppSummary) => boolean;
  /** Names/taglines of apps that cover the domain in part (the Agent offers an update as well as the reference app). */
  appNameRx: RegExp;
  /** Short word for "another <topic> save". */
  topic: string;
  explore: {
    title: string;
    icon: AppIcon;
    description: string;
    /** Why this exploration fits, for the Playground (follows the quoted facts). */
    because: string;
    steps: (ctx: ExploreContext) => string[];
  };
  /**
   * A design change for an existing app, or null. `full` means the app already does what the domain needs:
   * then a change is only proposed when the person asked for something it lacks; using the app is the answer.
   */
  updateRequest: (app: ExistingAppSummary, ctx: ExploreContext, full: boolean) => UpdatePlan | null;
}

/**
 * Minutes mentioned in a text, in digits or words ("15 minutes", "a ten-minute session", "10 min",
 * "half an hour", "a quarter of an hour"), capped at 180.
 */
export function minutesIn(text: string): number | null {
  return minutesFromText(text);
}

export const DOMAINS: Domain[] = [
  {
    id: 'music',
    strong: /\b(?:guitars?|riffs?|songs?|chords?|strum(?:ming)?|fingerstyle|fingerpick(?:ing|ed)?|tempo|bpm|metronome|music|musician|albums?|band|bass|piano|drums?|ukulele|violin|melody|melodies|spotify|soundcloud|bandcamp|play(?:ing)? along|jam(?:ming)?)\b/i,
    weak: /\b(?:practi[cs]e|practi[cs]ing|sound|sing(?:ing)?|covers?|track|solo|lessons?|listen(?:ing)?|tune)\b/i,
    conceptId: 'riff-practice',
    legacyConceptId: 'music-practice-companion',
    coreCapability: 'practice_timer',
    // A sketching timer is not a practice room for music.
    fullFit: (app) => app.capabilities.includes('practice_timer') && !SKETCH_APP_RX.test(appWords(app)),
    appNameRx: /\b(?:music|practi[cs]e|guitar|riff|songs?|piano|ukulele|bass|drums?|instrument)\b/i,
    topic: 'music',
    explore: {
      title: 'A listening-and-playing session',
      icon: { symbol: 'headphones', color: 'lilac' },
      description: 'Listen once, find the two bars that matter, play them slowly, then play along once. A short session with the instrument you already have.',
      because: 'A listening-and-playing session needs no app: the instrument, the source and the minutes you have.',
      steps: ({ words, minutes, source, sourceTitle }) => {
        const m = minutes ?? 15;
        const src = sourceTitle ? quote(clip(sourceTitle, 50)) : source === 'link' ? 'the clip you saved' : source === 'image' ? 'the piece in your screenshot' : 'the piece';
        return [
          words
            ? `Listen to ${src} once all the way through, with your own note in mind: ${quote(clip(words, 60))}.`
            : `Listen to ${src} once all the way through and notice exactly what you like about the sound.`,
          'Find the two bars that matter most and hum or tap them before you touch the instrument.',
          `Play them at half tempo for ${Math.max(3, Math.round(m / 3))} minutes; speed up only when it is clean.`,
          `Play along with ${src} once at full speed, then stop. ${minutes ? `${minutesCount(minutes)} is enough.` : 'Even ten minutes is enough.'}`,
          'Write one line: what got easier, what to try tomorrow.',
        ];
      },
    },
    updateRequest: (app, ctx) => {
      const caps = new Set(app.capabilities);
      if (caps.has('practice_timer') || app.pattern === 'practice') {
        // A timer app already does the job. Only a session length it does not offer is a real change;
        // a length it already has, a link to save or a sound to practise is simply using the app.
        const presets = app.minutePresets ?? (app.defaultMinutes ? [app.defaultMinutes] : []);
        if (!ctx.minutes || presets.includes(ctx.minutes)) return null;
        return {
          request: `Add a ${ctx.minutes}-minute preset to the practice timer as the default`,
          change: joinNatural([`a ${ctx.minutes}-minute timer preset`]),
          previewLines: [`Timer starts at ${minutesCount(ctx.minutes)}`, 'Your sessions and sources stay as they are'],
        };
      }
      return {
        request: 'Add a link field called Inspiration, for the song or riff behind each session',
        change: 'a link to the song or riff behind each session',
        previewLines: ['Link to the song or riff per session', 'Your sessions stay as they are'],
      };
    },
  },
  {
    id: 'photo',
    strong: /\b(?:photos?|photograph\w*|camera|lens|shadows?|golden hour|blue hour|street photography|portraits?|exposure|composition|contact sheet|film camera|(?:natural|harsh|soft|midday|morning|evening|window|golden|side|back|raking|low|hard|flat|late) light|lighting|backlit|silhouettes?|shoot(?:ing)? (?:more|photos|street|portraits|film))\b/i,
    weak: /\b(?:shoot|shooting|pictures?|frames?|framing|film|light|prints?|zine|gallery)\b/i,
    conceptId: 'light-gallery',
    legacyConceptId: 'photo-walk-journal',
    coreCapability: 'gallery',
    appNameRx: /\b(?:photos?|photograph\w*|light|camera|walks?|street|shoot)\b/i,
    topic: 'photography',
    explore: {
      title: 'A twenty-minute light walk',
      icon: { symbol: 'sun', color: 'lilac' },
      description: 'A short walk with one rule, two frames of the same thing, one keeper and one sentence about what the light was doing.',
      because: 'A short walk with one rule is the fastest way to practice seeing light, and it needs no app.',
      steps: ({ words, minutes, source }) => {
        const ref = source ? 'the picture that inspired you' : 'the last photo you liked';
        return [
          `Go out for ${minutes ? minutesCount(minutes) : 'twenty minutes'} with one rule: photograph only where light meets shadow.`,
          'Take the same frame twice, from standing height and from low down.',
          'Pick one keeper and write one sentence about what the light was doing.',
          `Compare it with ${ref}${words ? `, keeping your note in mind: ${quote(clip(words, 60))}` : ''}. What is the one difference?`,
        ];
      },
    },
    updateRequest: (_app, ctx, full) => (full && !/\b(?:add|with|use|want|need)\s+(?:some\s+)?tags\b|\btags? (?:for|to group)\b|\bgroup(?:ed|ing)? (?:them |my photos )?by\b|\bsort(?:ed)? (?:them |my photos )?by\b|\btag(?:ging)? (?:my |the |these |each )?(?:photos?|pictures?|shots?|images?)\b|\blabel (?:my |the |each )?(?:photos?|pictures?|shots?)\b/i.test(ctx.note ?? '')
      ? null
      : {
        request: 'Add tags so I can group photos by the kind of light I was chasing',
        change: 'tags for the kind of light',
        previewLines: ['Tags on each photo', 'Everything you saved stays as it is'],
      }),
  },
  {
    id: 'people',
    strong: /\b(?:follow[- ]?ups?|intro(?:duction)?s?|investors?|mentors?|networking|coffee chats?|promised|owe|reach out|keep in touch|catch(?:ing)? up|reconnect(?:ing)?|meetups?|people i met|get back to|reply to|met \w+ at|send (?:him|her|them))\b/i,
    weak: /\b(?:met|promise|contacts?|email back|replies|reply|deck|linkedin|conference|demo day|thank(?:ing)? (?:him|her|them))\b/i,
    conceptId: 'people-queue',
    legacyConceptId: 'people-to-follow-up-with',
    coreCapability: 'next_actions',
    appNameRx: /\b(?:follow[- ]?ups?|people|contacts?|network\w*|mentors?|investors?|coffee)\b/i,
    topic: 'follow-up',
    explore: {
      title: 'Clear the three follow-ups you already owe',
      icon: { symbol: 'people', color: 'lilac' },
      description: 'Three people, three one-line messages, one sent today. No tool needed, just a few minutes.',
      because: 'Three short messages sent today beat any tracker, and they need no app.',
      steps: ({ words }) => [
        'Write down the three people you most recently promised something to.',
        `For each, write the one-line message you would send, in your own words${words ? `, starting from what you wrote: ${quote(clip(words, 60))}` : ''}.`,
        'Send the easiest one now; give the other two a date.',
        'Note what they asked for, so the next message starts from their question.',
      ],
    },
    updateRequest: (app, ctx, full) => {
      const caps = new Set(app.capabilities);
      if (caps.has('next_actions') || app.pattern === 'queue') {
        // Adding a follow-up is an entry, not a design change; priority only when it is asked for.
        if (full && !/\bpriorit(?:y|ies|ise|ize)\b/i.test(ctx.note ?? '')) return null;
        return {
          request: 'Add a priority choice so the most important follow-ups float up',
          change: 'a priority choice',
          previewLines: ['Priority on each follow-up', 'Everything you saved stays as it is'],
        };
      }
      return {
        request: 'Add a message draft field so I can prepare the follow-up before sending it',
        change: 'a message draft you can copy (nothing is sent for you)',
        previewLines: ['Message draft per person', 'Nothing is ever sent for you', 'Everything you saved stays as it is'],
      };
    },
  },
  {
    // Sketching and drawing as a practice ("I want to sketch for 10 minutes every day"): a sketching timer
    // that starts at the length the person said. Last, so it never wins a tie against the reference domains.
    id: 'sketch',
    strong: /\b(?:sketch(?:es|ed|ing|book|books)?|drawings?|doodl(?:e|es|ed|ing)|illustrat\w*|watercolou?rs?|gouache|figure drawing|life drawing|urban sketch\w*|draw(?!\s+(?:up|on|attention|conclusions?|the line|a line|near|closer|back|lots|straws))(?:s|ing)?)\b/i,
    weak: /\b(?:pencils?|pens?|ink|paint(?:s|ing)?|art|artist|procreate|easel|canvas)\b/i,
    conceptId: 'sketch-practice',
    legacyConceptId: 'sketchbook',
    coreCapability: 'practice_timer',
    fullFit: (app) => app.capabilities.includes('practice_timer') && SKETCH_APP_RX.test(appWords(app)),
    appNameRx: SKETCH_APP_RX,
    topic: 'sketching',
    explore: {
      title: 'One object, drawn twice',
      icon: { symbol: 'pen', color: 'lilac' },
      description: 'A timer, a pencil and the nearest object: draw it once slowly and once fast, then write what got easier. No app needed.',
      because: 'Drawing one object twice is the quickest way to practice seeing, and it needs no app.',
      steps: ({ words, minutes }) => [
        `Set a timer for ${minutesCount(minutes ?? 10)} and draw the nearest object without erasing.`,
        'Draw it again from another side, in half the time.',
        'Keep the one you like better; nobody needs to see it.',
        `Write one line: what got easier${words ? `, with your note in mind: ${quote(clip(words, 60))}` : ''}?`,
      ],
    },
    updateRequest: (app, ctx, full) => {
      // A sketching timer already does the job: only a length it does not offer is a real change.
      if (!full) return null;
      const presets = app.minutePresets ?? (app.defaultMinutes ? [app.defaultMinutes] : []);
      if (!ctx.minutes || presets.includes(ctx.minutes)) return null;
      return {
        request: `Add a ${ctx.minutes}-minute preset to the practice timer as the default`,
        change: `a ${ctx.minutes}-minute timer preset`,
        previewLines: [`Timer starts at ${minutesCount(ctx.minutes)}`, 'Your sketches stay as they are'],
      };
    },
  },
];

export function domainById(id: DomainId): Domain {
  return DOMAINS.find((d) => d.id === id) as Domain;
}

/** The domain a catalog concept belongs to (reference or legacy sibling), if any. */
export function domainForConcept(conceptId: string | undefined): Domain | null {
  if (!conceptId) return null;
  return DOMAINS.find((d) => d.conceptId === conceptId || d.legacyConceptId === conceptId) ?? null;
}

function count(rx: RegExp, text: string): number {
  return (text.match(new RegExp(rx.source, 'gi')) ?? []).length;
}

/**
 * Which domain a text is about, if any. Unambiguous words count double; a domain needs one of them
 * or two generic ones ("I like this sound and have 15 minutes to practice" is music; "a light
 * workout" is nothing). Ties go to the domain with more unambiguous words, then catalog order.
 */
export function detectDomain(text: string): Domain | null {
  let best: { d: Domain; score: number; strong: number } | null = null;
  for (const d of DOMAINS) {
    const strong = count(d.strong, text);
    const weak = count(d.weak, text);
    if (strong === 0 && weak < 2) continue;
    const score = strong * 2 + weak;
    if (!best || score > best.score || (score === best.score && strong > best.strong)) best = { d, score, strong };
  }
  return best?.d ?? null;
}

/** Does an existing app already cover a domain? `full` means the core capability is there. */
export function fittingApp(domain: Domain, apps: ExistingAppSummary[]): { app: ExistingAppSummary; full: boolean } | null {
  const covers = domain.fullFit ?? ((a: ExistingAppSummary) => a.capabilities.includes(domain.coreCapability));
  const full = apps.find(covers);
  if (full) return { app: full, full: true };
  const partial = apps.find((a) => domain.appNameRx.test(appWords(a)) && a.pattern !== 'queue' && a.pattern !== 'gallery' && a.pattern !== 'practice');
  return partial ? { app: partial, full: false } : null;
}

export interface ExploreGrounding {
  evidenceFactIds: string[];
  sourceCaptureIds: string[];
  reason: string;
  pattern?: Pattern;
}

/** An "explore" proposal for a domain: steps the person can do today, no app, no invented links. */
export function exploreDraft(domain: Domain, ctx: ExploreContext, grounding: ExploreGrounding): RecommendationDraft {
  const steps = domain.explore.steps(ctx).map((s) => clip(s, 200));
  const pattern: Pattern = grounding.pattern ?? (domain.id === 'music' || domain.id === 'sketch' ? 'practice' : domain.id === 'photo' ? 'gallery' : 'queue');
  return RecommendationDraftSchema.parse({
    kind: 'explore',
    title: clip(domain.explore.title, 50),
    purpose: 'explore',
    pattern: (PATTERNS as readonly string[]).includes(pattern) ? pattern : 'journal',
    icon: domain.explore.icon,
    tagline: 'No app needed',
    description: domain.explore.description,
    reason: clip(grounding.reason, 400),
    evidenceFactIds: grounding.evidenceFactIds.slice(0, 8),
    sourceCaptureIds: grounding.sourceCaptureIds.slice(0, 4),
    firstAction: clip(steps[0] ?? 'Start with the first step.', 200),
    previewLines: steps.slice(0, 3).map((s) => clip(s, 60)),
    explorationSteps: steps.slice(0, 6),
    capabilities: [],
  });
}
