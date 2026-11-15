/**
 * Example records for previewing an app before it exists. Deterministic, clearly marked (ids start
 * with "example-", image values use the `example:` prefix), never stored. The real renderer shows
 * them with an "Example content" banner so the preview is the actual layout, not a mock.
 *
 * Examples belong to the app's own domain (audit P0-02). The domain is read from the spec itself
 * (name, tagline, labels, placeholders, options, view titles, prompts, icon and pattern), and each
 * domain has a small bank of coherent example entries. A field takes its words from its view role
 * first (a queue's person, a gallery's caption), then from its label, then from its own placeholder;
 * nothing is borrowed from another domain. Only photography has example photos: any other app with a
 * photo field shows its honest empty state instead of somebody else's pictures. Every value fits its
 * field (options, ranges, lengths), dates are relative to today, and practice sessions keep the
 * Velocity rules: the plan is one of the timer's presets, measured seconds are minutes x 60, and a
 * session typed in by hand has neither.
 *
 * Examples differ from one another: a field's own example placeholder fills the first example only
 * (a comma list gives one item per example), and an optional field with nothing else to say stays
 * empty rather than repeating itself. Fewer examples beat the same words three times.
 *
 * Pure and dependency-free (shared/ only): the server writes the example records with it, and the
 * Make page names them and draws its compact example strip with the same reading of the domain.
 */
import type { AppSpec, FieldSpec, ViewSpec } from './appSpec.ts';
import { recordMatchesView, viewRoles } from './appSpec.ts';
import { validateValues, type AppRecord, type RecordValues } from './records.ts';
import { addDays, todayIso } from './time.ts';

/** The public CC0 example photographs (sun and shadow on city streets; docs/ASSET_SOURCES.md). */
export const EXAMPLE_IMAGES = ['example:light-1', 'example:light-2', 'example:light-3', 'example:light-4'] as const;

export const PREVIEW_DOMAINS = [
  'photo', 'sketch', 'music', 'people', 'newsletter', 'poetry', 'reading', 'study', 'cooking', 'fitness', 'climbing', 'plants', 'language', 'travel', 'reflection',
  'film', 'jobs', 'meetings', 'projects', 'home', 'outings', 'habits', 'budget', 'general',
] as const;
export type PreviewDomain = (typeof PREVIEW_DOMAINS)[number];

/** What an example entry can say, by meaning rather than by field id. */
type Slot =
  | 'subject' | 'note' | 'next' | 'place' | 'person' | 'action' | 'context' | 'dueText' | 'draft' | 'linkTitle' | 'linkNote'
  | 'author' | 'change' | 'piece' | 'advice' | 'grateful' | 'hard' | 'poem' | 'spark' | 'company' | 'role' | 'course' | 'grade';

interface Entry extends Partial<Record<Slot, string>> {
  image?: string;
  url?: string;
  tags?: string[];
  /** Words that choose an option in a choice field (matched against option values and labels). */
  pick?: string[];
  /** Days from today for a due date; null keeps only the person's own words (a date to confirm). */
  due?: number | null;
  /** A checkbox (done, keeper). */
  check?: boolean;
}

interface Bank {
  /** Unambiguous words (2 points) and generic ones (1 point), counted in the spec's own text. */
  strong?: RegExp;
  weak?: RegExp;
  /** Placeholder for the Make page's "What should it focus on?". */
  focus: string;
  /** Typical minutes for a minutes field that has no default. */
  minutes: [number, number, number];
  entries: Entry[];
}

const BANKS: Record<PreviewDomain, Bank> = {
  photo: {
    strong: /\b(?:photo\w*|camera|lens(?:es)?|exposure|aperture|shutter|contact sheet|golden hour|keeper shots?|film rolls?)/gi,
    weak: /\b(?:light|shadows?|shots?|shoot\w*|frames?|gallery|pictures?|walks?)\b/gi,
    focus: 'Focus on shadows and reflections',
    minutes: [20, 30, 15],
    // In the order of EXAMPLE_IMAGES, so every caption describes its own photo.
    entries: [
      { image: EXAMPLE_IMAGES[0], subject: 'Tree shadows across the brick street', note: 'Shot into the sun so the shadows lead the eye. Next time, wait for someone to walk through.', place: 'Along the canal', next: 'Go back an hour earlier for longer shadows', pick: ['golden', 'curious'], tags: ['shadows', 'street'], check: true },
      { image: EXAMPLE_IMAGES[1], subject: 'Long shadows over the path by the park', note: 'Underexposed by a stop so the bright grass kept its colour.', place: 'Park edge, late afternoon', next: 'Try the same path on an overcast day', pick: ['golden', 'calm'], tags: ['shadows'], check: false },
      { image: EXAMPLE_IMAGES[2], subject: "A bare tree's shadow on a warm brick wall", note: 'Low autumn sun made the wall glow. The bike gives it scale.', place: 'Old warehouse wall', next: 'Frame tighter on the shadow alone', pick: ['golden', 'inspired'], tags: ['texture'], check: true },
      { image: EXAMPLE_IMAGES[3], subject: 'Branch shadows on blue scaffolding', note: 'Harsh midday light, but the branches drew a pattern on the sheeting.', place: 'A street with scaffolding', next: 'Look for the same pattern on a white wall', pick: ['harsh', 'curious'], tags: ['pattern'], check: false },
    ],
  },
  sketch: {
    strong: /\b(?:sketch\w*|draw\w*|drew|doodl\w*|illustrat\w*|watercolou?r\w*|gouache|gestures?)\b/gi,
    weak: /\b(?:pencils?|ink|paint\w*|brush\w*|art|artists?|canvas|markers?|pens?)\b/gi,
    focus: 'Focus on quick gesture drawings',
    minutes: [10, 15, 20],
    entries: [
      { subject: 'A coffee cup from three angles', note: 'Light lines first, then commit to the edges.', next: 'The same cup tomorrow, in ink', pick: ['pencil'], tags: ['objects'] },
      { subject: 'Hands, five one-minute gestures', note: 'Loosened up after the third one.', next: 'Try two-minute poses', pick: ['ink'], tags: ['figures'] },
      { subject: 'The view from the kitchen window', note: 'Let the first wash dry before the second.', next: 'Fewer colours, more water', pick: ['watercolour', 'watercolor'], tags: ['places'] },
      { subject: 'Shoes by the front door', note: 'Shading only the shadows made them look solid.', next: 'Draw only the shadows', pick: ['pencil'], tags: ['objects'] },
    ],
  },
  music: {
    strong: /\b(?:guitars?|riffs?|chords?|tempo|bpm|metronome|piano|ukulele|violin|drums?|fingerpick\w*|strum\w*|scales|songs?|bass)\b/gi,
    weak: /\b(?:music\w*|practi[cs]\w*|play\w*|sing\w*|melod\w*|band|listen\w*|sound\w*|tunes?)\b/gi,
    focus: 'Focus on clean chord changes',
    minutes: [15, 12, 20],
    entries: [
      { subject: 'The riff at half speed, then full', note: 'Slow it down with the metronome at 60.', piece: 'Blackbird', linkTitle: 'A fingerpicked intro', linkNote: 'That fingerpicked intro', url: 'https://example.com/fingerpicked-intro', pick: ['riff'], tags: ['riff'] },
      { subject: 'Chord changes without looking', note: 'G to C is clean now. D still buzzes.', piece: 'House of the Rising Sun', linkTitle: 'Lesson: switching chords cleanly', linkNote: 'Drill the switch, not the chords', url: 'https://example.com/chord-changes', pick: ['lesson'], tags: ['chords'] },
      { subject: 'Intro of the song, clean strumming', note: 'Record 30 seconds and listen back before judging it.', piece: 'A twelve-bar blues in E', linkTitle: 'A song to learn by ear', linkNote: 'The bridge sounds doable', url: 'https://example.com/learn-by-ear', pick: ['song'], tags: ['songs'] },
      { subject: 'Two bars of something new, by ear', note: 'Hum it first, then find it on the neck.', piece: 'Scarborough Fair', linkTitle: 'An artist to listen to', linkNote: 'Loose, warm strumming', url: 'https://example.com/artist', pick: ['artist'], tags: ['listening'] },
    ],
  },
  people: {
    strong: /\b(?:follow[- ]?ups?|next actions?|introductions?|intros?|investors?|mentors?|networking|reach out|keep in touch|catch up|reconnect|met at|coffee chats?|message drafts?|promised|owe)\b/gi,
    weak: /\b(?:people|person|who|contacts?|conversations?|repl(?:y|ies)|emails?|meetups?|friends?)\b/gi,
    focus: 'Focus on people I meet at events',
    minutes: [15, 10, 20],
    entries: [
      { person: 'Maya, met at the design meetup', action: 'Send the demo link', context: 'She asked about pricing for small teams.', dueText: 'Today, after the demo', due: 0, draft: 'Hi Maya, great to meet you at the meetup. Here is the demo link I promised.', note: 'Wants a short demo, not a deck.', advice: 'Lead with the problem, not the product.', pick: ['email', 'promised'], check: false },
      { person: 'Alex from the founders circle', action: 'Share the article about pricing', context: 'We compared notes on early customers.', dueText: 'Early next week', due: null, draft: 'Hi Alex, here is the pricing article I mentioned. Curious what you think.', note: 'Prefers email to calls.', advice: 'Talk to five customers before building more.', pick: ['linkedin', 'waiting'], check: false },
      { person: 'Jamie, old classmate', action: 'Plan a coffee', context: 'Just moved back to town.', dueText: 'Before the weekend', due: -3, draft: 'Hi Jamie! Coffee soon? I am free most mornings.', note: 'Ask about the new job.', advice: 'Say no to the side quests for a month.', pick: ['text', 'done'], check: true },
      { person: 'Priya, a possible mentor', action: 'Thank her for the pitch notes', context: 'Gave clear notes on the pitch.', dueText: 'Tomorrow', due: 1, draft: 'Hi Priya, thank you for the notes. The new opening works much better.', note: 'Liked the second slide most.', advice: 'Ask for one introduction, not five.', pick: ['call'], check: false },
    ],
  },
  newsletter: {
    strong: /\b(?:newsletters?|subscribers?|snippets?|publish\w*|blog posts?|essays?)\b/gi,
    weak: /\b(?:writ\w*|posts?|articles?|angles?|headlines?|issues?|readers?)\b/gi,
    focus: 'Focus on one idea per issue',
    minutes: [25, 20, 30],
    entries: [
      { subject: 'Why small teams ship faster', note: "Open with the story from Tuesday's call.", next: 'Cut the intro to two lines', linkTitle: 'An essay worth quoting', linkNote: 'The line about shipping on Fridays', url: 'https://example.com/essay', pick: ['newsletter', 'drafting'], tags: ['teams'] },
      { subject: 'Three tools I stopped using', note: 'Keep it under 600 words.', next: 'Ask readers for theirs', linkTitle: 'A thread on tool fatigue', linkNote: 'Good counterpoint', url: 'https://example.com/thread', pick: ['newsletter', 'idea'], tags: ['tools'] },
      { subject: 'Snippet: the best feedback came from the quietest customer', note: 'Could open the next issue.', next: 'Find a second example', linkTitle: 'Notes from a customer call', linkNote: 'Their exact words', url: 'https://example.com/notes', pick: ['post', 'editing'], tags: ['customers'] },
    ],
  },
  poetry: {
    strong: /\b(?:poems?|poetry|poets?|haikus?|sonnets?|verses?|stanzas?)\b/gi,
    weak: /\b(?:lines?|rhym\w*|sparks?|words?)\b/gi,
    focus: 'Focus on short poems from everyday moments',
    minutes: [15, 10, 20],
    entries: [
      { subject: 'Rain on the bus window', poem: 'Rain writes on the window\nin a language only\nthe bus understands.', spark: 'The sound of rain on the roof', note: 'Cut the last line?', pick: ['free', 'haiku'] },
      { subject: 'Morning queue', poem: 'Six of us, half awake,\nholding warm cups\nlike small suns.', spark: 'The coffee line at eight', note: 'Try it as a haiku.', pick: ['haiku', 'free'] },
      { subject: 'What the stairs remember', poem: 'Every step a little lower\nwhere we all\nput our weight.', spark: 'An old staircase at work', note: 'Read it aloud once more.', pick: ['free'] },
    ],
  },
  reading: {
    // "Book" is also a verb (book a train, it books out), so it only counts a little.
    strong: /\b(?:reading|chapters?|authors?|novels?|bookshelf|library|pages read)\b/gi,
    weak: /\b(?:read|books?|articles?|quotes?)\b/gi,
    focus: 'Focus on one idea worth keeping from each book',
    minutes: [20, 30, 15],
    entries: [
      { subject: 'Walden, chapters 1 and 2', author: 'Henry David Thoreau', note: 'Simplify first, then decide what to add back.', pick: ['reading'], tags: ['essays'] },
      { subject: 'Middlemarch, book one', author: 'George Eliot', note: 'Every character wants something small and specific.', pick: ['started'], tags: ['novels'] },
      { subject: 'Meditations, book two', author: 'Marcus Aurelius', note: 'Expect a difficult day, and be kind anyway.', pick: ['finished'], tags: ['philosophy'] },
    ],
  },
  study: {
    strong: /\b(?:stud(?:y|ying|ies)|exams?|courses?|assignments?|lectures?|homework|syllabus|revision|problem sets?|coursework)\b/gi,
    weak: /\b(?:topics?|grades?|class(?:es)?|learn\w*|hand-in)\b/gi,
    focus: 'Focus on the exam topics first',
    minutes: [25, 45, 30],
    entries: [
      { subject: 'Sorting algorithms, chapter 4', course: 'Algorithms', note: 'Redo the two past-paper questions I missed.', place: 'Library, second floor', pick: ['studying', 'in_progress'] },
      { subject: 'Problem set 5', course: 'Databases', note: 'Start with question 3; it is the longest.', place: 'Kitchen table', pick: ['planned', 'not_started'] },
      { subject: 'Lecture notes, week 6', course: 'Statistics', note: 'Turn the notes into five flashcards.', place: 'Study room', pick: ['reviewed', 'submitted'] },
    ],
  },
  cooking: {
    strong: /\b(?:recipes?|cook\w*|dish(?:es)?|bak\w*|meals?|ingredients?|kitchen|cuisines?)\b/gi,
    weak: /\b(?:dinners?|lunch(?:es)?|breakfasts?|food|tast\w*|flavou?rs?)\b/gi,
    focus: 'Focus on quick weeknight dinners',
    minutes: [30, 20, 45],
    entries: [
      { subject: 'Lemon pasta', change: 'Half the butter, more lemon zest', note: 'Bright and quick. Salt the water more.', pick: ['italian'], tags: ['italian'] },
      { subject: 'Weeknight dal', change: 'Spinach stirred in at the end', note: 'Even better the next day.', pick: ['indian'], tags: ['indian'] },
      { subject: 'Banana bread', change: 'Less sugar, a pinch of cardamom', note: 'Take it out five minutes earlier.', pick: ['baking'], tags: ['baking'] },
    ],
  },
  fitness: {
    strong: /\b(?:runs?|running|workouts?|gym|yoga|stretch\w*|lift\w*|reps|planks?|cycl\w*|swim\w*|marathon|5k|10k)\b/gi,
    weak: /\b(?:distance|km|miles?|effort|exercise|pace|sets|fitness|training)\b/gi,
    focus: 'Focus on easy runs before work',
    minutes: [30, 25, 45],
    entries: [
      { subject: 'An easy loop along the river', note: 'Kept it conversational. Legs felt fresh.', place: 'River path', pick: ['easy'] },
      { subject: 'Hill repeats', note: 'Six repeats; the last two were tough.', place: 'The park hill', pick: ['intervals'] },
      { subject: 'A long Sunday run', note: 'Water at the halfway point helped.', place: 'Out and back along the canal', pick: ['long'] },
    ],
  },
  climbing: {
    strong: /\b(?:climb\w*|boulder\w*|crags?|belay\w*|top rope)\b/gi,
    weak: /\b(?:grades?|attempts?|holds?)\b/gi,
    focus: 'Focus on one project at a time',
    minutes: [60, 90, 45],
    entries: [
      { subject: 'The overhang problem in the corner', grade: 'V4', note: 'Fell off the last move twice, then sent it.', place: 'The bouldering gym', pick: ['bouldering'] },
      { subject: 'Slab with tiny footholds', grade: 'V3', note: 'Trust the feet, keep the hips out.', place: 'The bouldering gym', pick: ['top_rope', 'bouldering'] },
      { subject: 'First lead route outdoors', grade: '6b+', note: 'Clipped calmly; rest before the crux next time.', place: 'The local crag', pick: ['outdoor', 'lead'] },
    ],
  },
  plants: {
    strong: /\b(?:plants?|houseplants?|garden\w*|repot\w*|prun\w*|seedlings?|succulents?|monstera)\b/gi,
    weak: /\b(?:water(?:ed|ing)?|soil|leaf|leaves|pots?|grow\w*)\b/gi,
    focus: 'Focus on the plants by the window',
    minutes: [10, 5, 15],
    entries: [
      { subject: 'Monstera by the window', note: 'A new leaf is unfurling.', pick: ['watered'] },
      { subject: 'Basil on the balcony', note: 'Pinched off the flowers.', pick: ['pruned'] },
      { subject: 'Snake plant in the hall', note: 'Soil still damp, so it can wait.', pick: ['checked'] },
    ],
  },
  language: {
    strong: /\b(?:languages?|vocabulary|phrases?|spanish|french|japanese|german|mandarin|korean|portuguese|fluen\w*|grammar)\b/gi,
    weak: /\b(?:words?|speaking|listening)\b/gi,
    focus: 'Focus on everyday phrases',
    minutes: [15, 10, 20],
    entries: [
      { subject: 'Ordering at a café', note: 'A phrase to keep: "Could I get this to go?"', pick: ['speaking'] },
      { subject: 'A podcast episode, slowed down', note: 'Caught about half without subtitles.', pick: ['listening'] },
      { subject: 'Ten words for the kitchen', note: 'Flashcards on the train worked.', pick: ['vocabulary'] },
    ],
  },
  travel: {
    strong: /\b(?:trips?|travel\w*|flights?|hotels?|itinerar\w*|holidays?|vacations?)\b/gi,
    weak: /\b(?:booked|bookings?|destinations?|tickets?)\b/gi,
    focus: 'Focus on what to book first',
    minutes: [15, 10, 20],
    entries: [
      { subject: 'The train to the coast', note: 'The early one is cheaper.', place: 'Coast trip, spring', pick: ['to_book'] },
      { subject: 'A cooking class', note: 'Ask about a vegetarian option.', place: 'Coast trip, spring', pick: ['idea'] },
      { subject: 'Museum tickets', note: 'Free on the first Sunday.', place: 'City weekend', pick: ['booked'] },
    ],
  },
  reflection: {
    strong: /\b(?:gratitude|grateful|intentions?|moods?|sleep|slept|energy|meditat\w*|weekly review)\b/gi,
    weak: /\b(?:feel\w*|felt|calm|moments?|reflect\w*)\b/gi,
    focus: 'Focus on small good moments',
    minutes: [10, 5, 15],
    entries: [
      { subject: 'A long walk with an old friend', grateful: 'Sun on the walk home, a call with an old friend, fresh bread', note: 'Felt lighter afterwards.', hard: 'Too many tabs open all afternoon', next: 'Call home on Sunday', pick: ['good', 'light'] },
      { subject: 'Finished the hard email', grateful: 'A quiet lunch, a kind reply, an early night', note: 'Starting was the hardest part.', hard: 'Put off the hard email until four', next: 'Start with the hardest task', pick: ['okay'] },
      { subject: 'A quiet morning coffee', grateful: 'Coffee on the step, a good book, rain stopping just in time', note: 'The phone stayed in the other room.', hard: 'Back-to-back meetings on Wednesday', next: 'Keep mornings phone-free', pick: ['light', 'good'] },
    ],
  },
  film: {
    // Films as in movies; film photography ("film rolls", "a film camera") stays photography.
    strong: /\b(?:films?(?!\s*(?:photo\w*|cameras?|rolls?|stocks?|scans?|simulations?))|movies?|cinema|directors?|screenings?|watchlist)\b/gi,
    weak: /\b(?:watch(?:ed|ing)?|streaming|festivals?|scenes?|actors?)\b/gi,
    focus: 'Focus on films worth watching again',
    minutes: [120, 90, 105],
    entries: [
      { subject: 'Paris, Texas', author: 'Wim Wenders', note: 'The colours in the last scene. Worth seeing on a big screen.', pick: ['cinema'], tags: ['drama'] },
      { subject: 'Spirited Away', author: 'Hayao Miyazaki', note: 'Even better the second time.', pick: ['home'], tags: ['animation'] },
      { subject: 'In the Mood for Love', author: 'Wong Kar-wai', note: 'The music carries the whole film.', pick: ['streaming'], tags: ['romance'] },
    ],
  },
  jobs: {
    strong: /\b(?:job search|jobs?|applications?|recruiters?|interview\w*|résumés?|resumes?|cover letters?|hiring)\b/gi,
    weak: /\b(?:compan(?:y|ies)|roles?|referr\w*|take-home|offers?|salary|employers?)\b/gi,
    focus: 'Focus on the roles I am most excited about',
    minutes: [30, 20, 45],
    entries: [
      { company: 'Northwind Labs', role: 'Product engineer', action: 'Send a thank-you note', person: 'Dana, the recruiter', note: 'The second round went well. Ask about the team size.', url: 'https://example.com/jobs/product-engineer', pick: ['interviewing'], check: false },
      { company: 'Brightline Health', role: 'Data analyst intern', action: 'Finish the take-home task', person: 'Sam from the alumni group', note: 'Due Friday. Keep it under four hours.', url: 'https://example.com/jobs/data-analyst', pick: ['applied'], check: false },
      { company: 'Studio Parallel', role: 'Frontend developer', action: 'Ask for feedback', person: 'Jo, who referred me', note: 'They chose someone more senior. Worth staying in touch.', url: 'https://example.com/jobs/frontend', pick: ['closed'], check: true },
    ],
  },
  meetings: {
    strong: /\b(?:meetings?|agendas?|1:1s?|one-on-ones?|stand-?ups?|retros?|retrospectives?|decisions?|action items?)\b/gi,
    weak: /\b(?:syncs?|attendees|discuss(?:ed|ion)?|agreed)\b/gi,
    focus: 'Focus on decisions and who does what',
    minutes: [30, 15, 45],
    entries: [
      { subject: 'Weekly team sync', person: 'Priya, Sam and me', note: 'Ship the beta on Friday. Keep the old sign-up for one more week.', action: 'Sam: release notes by Thursday. Me: update the checklist.', next: 'Update the beta checklist', context: 'Beta feedback and the release date.' },
      { subject: '1:1 with Priya', person: 'Priya', note: 'Move the pricing test to next month.', action: 'Me: share the survey results by Monday.', next: 'Share the survey results', context: 'Pricing and what customers said.' },
      { subject: 'Launch planning', person: 'The whole team', note: 'Launch on the 3rd. The support rota starts the week before.', action: 'Alex: book the room. Priya: final copy.', next: 'Draft the launch email', context: 'Dates, owners and the support rota.' },
    ],
  },
  projects: {
    strong: /\b(?:side projects?|milestones?|mvp|prototypes?|roadmap|ship(?:ped|ping)?)\b/gi,
    weak: /\b(?:launch\w*|features?|releases?|build(?:ing)?|beta)\b/gi,
    focus: 'Focus on the next thing to ship',
    minutes: [45, 30, 60],
    entries: [
      { subject: 'Login works end to end', note: 'Done means a new account can sign in on a phone.', pick: ['building', 'medium'], check: false },
      { subject: 'Five people outside my friends try it', note: 'Ask what they expected the first screen to do.', pick: ['idea', 'small'], check: false },
      { subject: 'A landing page with one clear line', note: 'Live, with a sign-up form that works.', pick: ['shipped', 'small'], check: true },
    ],
  },
  home: {
    strong: /\b(?:household|home improvements?|repairs?|diy|shelves|furnish\w*|renovat\w*|chores?)\b/gi,
    weak: /\b(?:fix\w*|rooms?|bedroom|hallway|tools?|walls?)\b/gi,
    focus: 'Focus on what to fix first',
    minutes: [30, 60, 20],
    entries: [
      { subject: 'Hang the shelves in the hall', note: 'Measure twice; the wall is not straight. Buy wall plugs.', pick: ['this_week', 'living'], check: false },
      { subject: 'Fix the dripping kitchen tap', note: 'Needs a new washer. Turn the water off first.', pick: ['in_progress', 'kitchen'], check: false },
      { subject: 'Paint the bedroom door', note: 'Two coats of the light grey.', pick: ['done', 'bedroom'], check: true },
    ],
  },
  outings: {
    strong: /\b(?:weekends?|explor(?:e|er|ers|ing)|outings?|day trips?|neighbou?rhoods?)\b/gi,
    weak: /\b(?:places?|visit(?:ed|ing|s)?|outdoors|culture|markets?|museums?|hikes?|caf[eé]s?)\b/gi,
    focus: 'Focus on places close to home',
    minutes: [120, 60, 180],
    // Only a visit that happened says how it went.
    entries: [
      { subject: 'The Saturday market in Pilsen', place: 'The Saturday market in Pilsen', person: 'Sam', pick: ['food', 'want'], check: false },
      { subject: 'A sunrise walk on the lakefront trail', place: 'A sunrise walk on the lakefront trail', person: 'Just me', pick: ['outdoors', 'planned'], check: false },
      { subject: 'The free Thursday at the art museum', place: 'The free Thursday at the art museum', person: 'Alex and Jamie', note: 'Worth a second visit. The photo room was the best part.', pick: ['culture', 'done'], check: true },
    ],
  },
  habits: {
    strong: /\b(?:habits?|streaks?|routines?|daily wins?)\b/gi,
    weak: /\b(?:daily|every day|done today|check-ins?)\b/gi,
    focus: 'Focus on one small habit at a time',
    minutes: [10, 5, 15],
    entries: [
      { subject: 'Read 10 pages', note: 'Easy with coffee before work.', check: true },
      { subject: 'Stretch for five minutes', note: 'Did it right after the run.', check: true },
      { subject: 'Inbox zero', note: 'Skipped it; Mondays are hard.', check: false },
    ],
  },
  budget: {
    strong: /\b(?:budgets?|spending|spent|expenses?|purchases?|money|savings?)\b/gi,
    weak: /\b(?:amounts?|costs?|prices?|bills?|groceries|paid)\b/gi,
    focus: 'Focus on food and fun spending',
    minutes: [10, 5, 15],
    entries: [
      { subject: 'Groceries on the way home', note: 'Cheaper at the market.', pick: ['food'], check: true },
      { subject: 'Train to the city', pick: ['transport'], check: true },
      { subject: 'Concert tickets', note: 'Worth it.', pick: ['fun'], check: false },
    ],
  },
  // Neutral wording for apps no domain matches; only used where a field must have a value.
  general: {
    focus: 'Focus on what matters most to you',
    minutes: [15, 10, 20],
    entries: [
      { subject: 'A first small step', note: 'Short and specific beats long and vague.', next: 'Do it again next week', person: 'Sam', action: 'Send the notes', context: 'Asked for a short summary.', place: 'Close to home', due: 1, check: false },
      { subject: 'Something worth keeping', note: 'Easier than expected.', next: 'Try a shorter version', person: 'Alex', action: 'Book a time to talk', context: 'Wants to compare plans.', place: 'On the way home', due: 3, check: false },
      { subject: 'One more to try', note: 'Worth another go.', next: 'Ask a friend to join', person: 'Jamie', action: 'Reply with a date', context: 'Suggested next month.', place: 'Weekend', due: -2, check: true },
    ],
  },
};

const ICON_HINTS: Partial<Record<PreviewDomain, RegExp>> = {
  photo: /^(?:camera|aperture|image)$/,
  film: /^(?:film)$/,
  home: /^(?:home)$/,
  budget: /^(?:wallet)$/,
  outings: /^(?:compass|binoculars)$/,
  projects: /^(?:rocket)$/,
  music: /^(?:guitar|music|waveform|levels|headphones|piano|disc|mic)$/,
  people: /^(?:people|contact)$/,
  sketch: /^(?:pen|brush|palette)$/,
  reading: /^(?:book|bookmark)$/,
  study: /^(?:graduation)$/,
  cooking: /^(?:utensils|coffee)$/,
  fitness: /^(?:dumbbell|footprints|bike)$/,
  climbing: /^(?:mountain)$/,
  plants: /^(?:plant|leaf|flower)$/,
  travel: /^(?:plane|map|globe)$/,
};

const PATTERN_HINTS: Partial<Record<AppSpec['pattern'], [PreviewDomain, number]>> = {
  gallery: ['photo', 2],
  practice: ['music', 1],
  queue: ['people', 2],
};

function hits(rx: RegExp | undefined, text: string): number {
  if (!rx || !text) return 0;
  rx.lastIndex = 0;
  return text.match(rx)?.length ?? 0;
}

/** The spec's own words, weighted: the name and tagline say the most about what the app is for. */
function corpus(spec: AppSpec): { text: string; weight: number }[] {
  const out: { text: string; weight: number }[] = [
    { text: spec.name, weight: 3 },
    { text: spec.tagline ?? '', weight: 3 },
    { text: `${spec.entryNoun.singular} ${spec.entryNoun.plural}`, weight: 2 },
    { text: spec.emptyStateHint ?? '', weight: 1 },
  ];
  for (const f of spec.fields) {
    if (f.hidden) continue;
    out.push({ text: [f.label, f.placeholder, f.help, f.type === 'select' ? f.options.map((o) => o.label).join(' ') : ''].filter(Boolean).join(' '), weight: 1 });
  }
  for (const v of spec.views) out.push({ text: [v.title, v.addLabel].filter(Boolean).join(' '), weight: 1 });
  for (const r of spec.rules) if (r.type === 'prompt_rotation') out.push({ text: [r.title, ...r.prompts].join(' '), weight: 1 });
  return out;
}

/** The domain an app's examples come from, read from the spec alone. "general" when nothing stands out. */
export function previewDomain(spec: AppSpec): PreviewDomain {
  const parts = corpus(spec);
  let best: PreviewDomain = 'general';
  let bestScore = 0;
  for (const domain of PREVIEW_DOMAINS) {
    if (domain === 'general') continue;
    const bank = BANKS[domain];
    let score = 0;
    for (const p of parts) score += Math.min(6, 2 * hits(bank.strong, p.text) + hits(bank.weak, p.text)) * p.weight;
    if (ICON_HINTS[domain]?.test(spec.icon.symbol)) score += 2;
    const hint = PATTERN_HINTS[spec.pattern];
    if (hint && hint[0] === domain) score += hint[1];
    if (score > bestScore) {
      best = domain;
      bestScore = score;
    }
  }
  return bestScore >= 3 ? best : 'general';
}

/** Placeholder for "What should it focus on?" in the app's own domain. */
export function focusPlaceholder(spec: AppSpec): string {
  return BANKS[previewDomain(spec)].focus;
}

/** Whether the domain has example photos (only photography does). */
function domainHasPhotos(domain: PreviewDomain): boolean {
  return BANKS[domain].entries.some((e) => typeof e.image === 'string');
}

/** Whether the app's examples include photos: it shows a gallery and its domain has example photos. */
export function hasExamplePhotos(spec: AppSpec): boolean {
  return spec.views.some((v) => v.type === 'gallery') && domainHasPhotos(previewDomain(spec));
}

/** The heading over a preview: what the examples are ("Example photos", "Example sessions"). */
export function exampleLabel(spec: AppSpec): string {
  const primary = spec.views.find((v) => v.type !== 'summary');
  if (primary?.type === 'gallery' && hasExamplePhotos(spec)) return 'Example photos';
  return `Example ${spec.entryNoun.plural}`;
}

// ---------- field → slot ----------

/** Slots by label, most specific first ("What we discussed" is context, "What did you learn?" a note). */
const LABEL_SLOTS: [Slot, RegExp][] = [
  ['dueText', /\bin (?:your|my|their) (?:own )?words\b|\bwhen,? in\b/i],
  ['draft', /\bdrafts?\b|\bmessages?\b/i],
  ['context', /\bdiscussed\b|\bcontext\b|\bbackground\b|\bwhat they (?:said|care)/i],
  ['person', /^(?:who|person|name|contact|mentor)\b|\bperson\b|\bcontact\b|\bwho\b|\bwith whom\b/i],
  // "My next step" after a meeting is mine; "Next step" on an application is the action.
  ['next', /\bmy next\b/i],
  ['action', /\bnext actions?\b|\baction items?\b|\bpromised?\b|\bcommitment\b|\bowe\b|\bnext steps?\b/i],
  ['advice', /\badvice\b|\btips?\b/i],
  ['author', /\bauthors?\b|\bwriters?\b|\bdirectors?\b/i],
  ['change', /\bchanged?\b|\btweaks?\b|\bswapped\b/i],
  ['grateful', /\bgrateful\b|\bgratitude\b|\bthankful\b/i],
  ['hard', /\bstuck\b|\bhard\b|\bdifficult\b|\bstruggl\w*/i],
  ['spark', /\bspark\w*|\binspired by\b/i],
  ['poem', /\bpoems?\b|\bverses?\b|\blyrics\b/i],
  ['piece', /\bsongs?\b|\bpieces?\b|\btracks?\b|\btunes?\b/i],
  ['place', /\bwhere\b|\blocation\b|\bplaces?\b|\bvenue\b|\broute\b|\bspot\b|\btrip\b/i],
  ['note', /\bnotes?\b|\bobservations?\b|\breflect\w*|\blearn\w*|\btakeaways?\b|\bworked\b(?! on)|\bthoughts\b|\bdetails\b|\bidea worth\b|\bwhy\b|\binsights?\b|\bwent well\b|\bwins?\b|\bdecisions\b|\bangle\b|\bstayed with\b|\bhow it went\b/i],
  ['next', /\btry next\b|\bnext time\b|\bnext experiment\b|\bintentions?\b|\bnext week\b/i],
  ['company', /\bcompan(?:y|ies)\b|\bemployers?\b|\borgani[sz]ations?\b/i],
  ['role', /\broles?\b|\bposition\b|\bjob title\b/i],
  ['course', /\bcourses?\b|\bclass(?:es)?\b|\bmodules?\b/i],
  ['grade', /\bgrades?\b|\bhardest\b/i],
  ['subject', /\bwhat\b|\btitle\b|\bsubject\b|\bcaught\b|\bfocus\b|\bdish\b|\bbook\b|\bdr[ae]w\b|\bmade\b|\bideas?\b|\bitem\b|\bheadline\b|\bmoment\b|\bhabit\b|\bplant\b|\btopic\b|\bmilestone\b|\bassignment\b|\bmeeting\b|\bone line\b|\bproblem\b/i],
];

function slotByLabel(f: FieldSpec): Slot | undefined {
  return LABEL_SLOTS.find(([, rx]) => rx.test(f.label))?.[0];
}

/** Slots a field gets from what the views use it for. Titles of journals, lists and boards are read from their labels. */
function roleSlots(spec: AppSpec): Map<string, Slot> {
  const out = new Map<string, Slot>();
  for (const v of spec.views) {
    for (const r of viewRoles(v)) {
      let slot: Slot | undefined;
      switch (r.role) {
        case 'caption':
        case 'focus':
          slot = 'subject';
          break;
        case 'note':
        case 'notes':
          slot = v.type === 'links' ? 'linkNote' : 'note';
          break;
        case 'title':
          slot = v.type === 'links' ? 'linkTitle' : undefined;
          break;
        case 'person':
        case 'action':
        case 'context':
        case 'draft':
          slot = r.role as Slot;
          break;
        case 'due_text':
          slot = 'dueText';
          break;
      }
      if (slot && !out.has(r.fieldId)) out.set(r.fieldId, slot);
    }
  }
  return out;
}

/** Date fields that hold a deadline (a queue's or board's due date, a due-soon rule's date). */
function dueFields(spec: AppSpec): Set<string> {
  const out = new Set<string>();
  for (const v of spec.views) for (const r of viewRoles(v)) if (r.role === 'due') out.add(r.fieldId);
  for (const r of spec.rules) if (r.type === 'due_soon') out.add(r.dateFieldId);
  return out;
}

/** Choice fields whose values mean done (a board's or queue's stage), with those values. */
function doneStages(spec: AppSpec): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const v of spec.views) {
    if (v.type === 'board' && v.doneStageValues.length) out.set(v.stageFieldId, v.doneStageValues);
    if (v.type === 'queue' && v.stageFieldId && v.doneStageValues.length) out.set(v.stageFieldId, v.doneStageValues);
  }
  return out;
}

/**
 * A placeholder that is itself an example ("Send the deck, intro to Sam"), not an instruction
 * ("What did we agree?", "Name and how you met", "Gym or crag") or a format hint ("https://").
 */
function examplePlaceholder(f: FieldSpec): string | undefined {
  const p = f.placeholder?.trim();
  if (!p || p.length < 3) return undefined;
  if (/\?$|…$|\.\.\.$/.test(p)) return undefined;
  if (/^(?:optional|e\.g\.?|https?:\/\/|name\b|what\b|why\b|where\b|how\b|which\b|who\b|when\b|one thing\b|the single\b|in their words\b|their words\b|working title\b)/i.test(p)) return undefined;
  if (/\bor\b/i.test(p)) return undefined;
  return p;
}

/**
 * The examples a placeholder lists ("Groceries, train, concert"; "Weekly sync, 1:1 with Priya"): three
 * or more items, or two of at least two words each. "Japan, spring" or "Maya, met at the meetup" is one
 * example with a detail, not a list.
 */
export function placeholderItems(p: string): string[] {
  const items = p.split(/\s*,\s*/).map((s) => s.trim()).filter(Boolean);
  const list = items.length >= 3 || (items.length === 2 && items.every((s) => s.split(/\s+/).length >= 2));
  return list ? items.map((s) => s.charAt(0).toUpperCase() + s.slice(1)) : [p];
}

/** The field's own example for the i-th record: a list gives one item each, a single example only the first record. */
function placeholderFor(f: FieldSpec, i: number): string | undefined {
  const p = examplePlaceholder(f);
  if (!p) return undefined;
  const items = placeholderItems(p);
  return items.length > 1 ? items[i] : i === 0 ? p : undefined;
}

/** Recent history, strictly older for each entry: today, yesterday, three days ago… */
const RECENT_DAYS = [0, -1, -3, -6, -9, -13];
/** Deadlines around now: tomorrow, in three days, two days late. */
const DUE_DAYS = [1, 3, -2];

interface SampleContext {
  domain: PreviewDomain;
  entry: Entry;
  general: Entry;
  /** Index of the record within its view's examples. */
  i: number;
  /** Whether this example is finished (a done checkbox, a done stage, a keeper). */
  done: boolean;
  today: string;
  slots: Map<string, Slot>;
  /** Fields that title a journal, list or board entry: they read as the entry's subject. */
  titles: Set<string>;
  due: Set<string>;
  stages: Map<string, string[]>;
}

function clip(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max);
}

/** "Example film" from "Film?", "Example poem" from "The poem"; later examples are numbered ("Example film 2"). */
function plainExample(label: string, i = 0): string {
  const noun = label.replace(/[?:.!]+$/, '').replace(/^(?:the|a|an|your|my)\s+/i, '').trim().toLowerCase();
  return `Example ${noun || 'entry'}${i > 0 ? ` ${i + 1}` : ''}`;
}

/**
 * Words for a text field: the domain's own example for the field's meaning (a field that titles an
 * entry reads as its subject), else the field's own example placeholder, used once (or one list item
 * per example). With neither, an optional field stays empty (an honest gap, not filler) and a
 * required one gets neutral words for its meaning or a plainly labelled, numbered value. No two
 * examples repeat the same words unless a domain's bank says so.
 */
function textValue(f: Extract<FieldSpec, { type: 'text' | 'long_text' }>, ctx: SampleContext): string | undefined {
  const slot = ctx.slots.get(f.id) ?? slotByLabel(f);
  const bankSlot = slot ?? (ctx.titles.has(f.id) ? 'subject' : undefined);
  const own = bankSlot && ctx.domain !== 'general' ? ctx.entry[bankSlot] : undefined;
  const value = own ?? placeholderFor(f, ctx.i) ?? (f.required ? ((slot ? ctx.general[slot] : undefined) ?? plainExample(f.label, ctx.i)) : undefined);
  const max = f.type === 'text' ? (f.maxLength ?? 500) : 5000;
  return value ? clip(value, max) : undefined;
}

type NumberField = Extract<FieldSpec, { type: 'number' }>;

/** A typical value for the field's unit; seconds only by the unit "s" or a plural label, never the ordinal "Second". */
function typicalNumber(f: NumberField, ctx: SampleContext): number | undefined {
  const i = ctx.i % 3;
  if (f.default !== undefined) return [f.default, Math.round(f.default * 1.2), Math.round(f.default * 0.8)][i];
  if (/minute|min\b|duration/i.test(f.label) || f.unit === 'min') return BANKS[ctx.domain].minutes[i];
  if (/tempo|bpm/i.test(f.label) || f.unit === 'bpm') return [72, 80, 66][i];
  // Seconds are minutes-sized (a timed session) unless the field's own range says otherwise.
  if (/\b(?:seconds|secs)\b/i.test(f.label) || f.unit === 's') return [900, 1200, 720][i];
  if (/\bpages?\b/i.test(f.label)) return [24, 40, 12][i];
  if (/\bdistance\b|\bkm\b|\bmiles?\b/i.test(f.label) || f.unit === 'km' || f.unit === 'mi') return [5, 3.5, 8][i];
  if (/\bsleep|\bslept\b/i.test(f.label)) return [7.5, 6.5, 8][i];
  if (f.unit === 'h' || /\bhours?\b/i.test(f.label)) return [2, 1.5, 3][i];
  if (f.unit === '$' || /\bamount\b|\bcost\b|\bprice\b|\bspent\b/i.test(f.label)) return [12.5, 4.2, 38][i];
  if (/\battempts?\b|\btries\b/i.test(f.label)) return [4, 6, 3][i];
  if (/\bwords?\b/i.test(f.label)) return [12, 8, 20][i];
  if (/\bdrinks?\b|\bcups?\b|\bcoffees?\b|\bcaffein/i.test(f.label)) return [2, 1, 3][i];
  if (/\breps\b/i.test(f.label)) return [10, 8, 12][i];
  if (/\bsets\b/i.test(f.label)) return [3, 4, 3][i];
  return undefined;
}

function numberValue(f: NumberField, ctx: SampleContext): number {
  const lo = f.min ?? 1;
  const hi = f.max ?? lo + 20;
  const spread = Math.round(lo + ((hi - lo) * ((ctx.i % 3) + 1)) / 4);
  const typical = typicalNumber(f, ctx);
  const v = typical !== undefined && typical >= (f.min ?? -Infinity) && typical <= (f.max ?? Infinity) ? typical : spread;
  // Always inside the field's own [min, max], so the example would validate as a real value.
  return Math.min(f.max ?? v, Math.max(f.min ?? v, v));
}

function selectValue(f: Extract<FieldSpec, { type: 'select' }>, ctx: SampleContext): string {
  const doneValues = ctx.stages.get(f.id);
  const options = doneValues ? f.options.filter((o) => ctx.done === doneValues.includes(o.value)) : f.options;
  const pool = options.length ? options : f.options;
  // The entry's words in order of preference: the first one any option matches wins.
  for (const w of ctx.entry.pick ?? []) {
    const picked = pool.find((o) => o.value.toLowerCase() === w || o.label.toLowerCase().includes(w));
    if (picked) return picked.value;
  }
  return pool[ctx.i % pool.length]?.value ?? f.default ?? '';
}

function sampleValue(f: FieldSpec, ctx: SampleContext): unknown {
  switch (f.type) {
    case 'text':
    case 'long_text':
      return textValue(f, ctx);
    case 'date': {
      if (ctx.due.has(f.id)) {
        const days = ctx.entry.due !== undefined ? ctx.entry.due : DUE_DAYS[ctx.i % DUE_DAYS.length];
        return days === null ? undefined : addDays(ctx.today, days ?? 0);
      }
      return addDays(ctx.today, RECENT_DAYS[ctx.i] ?? -2 * ctx.i);
    }
    case 'number':
      return numberValue(f, ctx);
    case 'select':
      return selectValue(f, ctx);
    case 'checkbox':
      return ctx.done;
    case 'rating':
      return Math.min(f.max, [4, 3, 5][ctx.i % 3] ?? 3);
    case 'url':
      return ctx.entry.url ?? `https://example.com/inspiration${ctx.i > 0 ? `-${ctx.i + 1}` : ''}`;
    case 'tags':
      if (f.suggestions?.length) {
        const start = ctx.i % f.suggestions.length;
        return [...f.suggestions.slice(start), ...f.suggestions.slice(0, start)].slice(0, 2);
      }
      return ctx.entry.tags ?? [];
    case 'image':
      // Only photography has example photos; anything else keeps its own empty state.
      return domainHasPhotos(ctx.domain) ? (ctx.entry.image ?? EXAMPLE_IMAGES[ctx.i % EXAMPLE_IMAGES.length]) : undefined;
  }
}

type PracticeView = Extract<ViewSpec, { type: 'practice' }>;

/**
 * Minutes an example session lasted, from the timer's own presets: a full session at the default
 * length, one that ran a little past it on a longer plan, and a shorter one typed in by hand.
 */
function sessionMinutes(view: PracticeView, i: number): number {
  const first = view.presets[0] ?? 15;
  const longer = [...view.presets].sort((a, b) => a - b).find((p) => p > first);
  switch (i % 3) {
    case 0:
      return first;
    case 1:
      return longer ? Math.round((first + longer) / 2) : Math.max(1, first - Math.max(1, Math.round(first / 5)));
    default:
      return Math.max(1, Math.round(first * 0.8));
  }
}

/**
 * Example sessions read like the timer's own records: the plan is one of the view's presets, a timed
 * session never runs past it and its measured seconds match its minutes, and every third one is
 * typed in by hand (no plan, nothing measured). Values the app would refuse (a field's own range or
 * a required field) are not used, so every example still validates as a real record.
 */
function alignPractice(spec: AppSpec, view: PracticeView, values: RecordValues, i: number): void {
  const target = view.targetMinutesFieldId && view.targetMinutesFieldId in values ? view.targetMinutesFieldId : undefined;
  const timed = view.timedSecondsFieldId && view.timedSecondsFieldId in values ? view.timedSecondsFieldId : undefined;
  const played = sessionMinutes(view, i);
  if (!target && !timed) {
    // No plan or clock to keep apart: the minutes still read like this timer's sessions, when they fit the field.
    if (view.minutesFieldId in values) {
      const { errors } = validateValues(spec, { ...values, [view.minutesFieldId]: played });
      if (!(view.minutesFieldId in errors)) values[view.minutesFieldId] = played;
    }
    return;
  }
  const presets = [...view.presets].sort((a, b) => a - b);
  const plan = presets.find((p) => p >= played) ?? presets[presets.length - 1] ?? played;
  const minutes = Math.min(played, plan);
  const typedIn: RecordValues = {};
  const measured: RecordValues = {};
  if (view.minutesFieldId in values) {
    typedIn[view.minutesFieldId] = played;
    measured[view.minutesFieldId] = minutes;
  }
  if (target) {
    typedIn[target] = null;
    measured[target] = plan;
  }
  if (timed) {
    typedIn[timed] = null;
    measured[timed] = minutes * 60;
  }
  for (const patch of i % 3 === 2 ? [typedIn, measured] : [measured]) {
    const { errors } = validateValues(spec, { ...values, ...patch });
    if (Object.keys(patch).some((k) => k in errors)) continue;
    Object.assign(values, patch);
    return;
  }
}

const groupKey = (v: ViewSpec): string => (v.filter ? `${v.filter.fieldId}=${v.filter.value}` : '*');

/**
 * The fields an example of one kind of record fills: what its views' forms ask for and what the views
 * show, so a saved link never carries a practice time. Everything visible when a view has no own form;
 * an unfiltered kind also keeps every required field.
 */
function fieldsForGroup(spec: AppSpec, key: string): Set<string> {
  const visible = spec.fields.filter((f) => !f.hidden);
  const views = spec.views.filter((v) => v.type !== 'summary' && groupKey(v) === key);
  if (!views.length || views.some((v) => !v.formFieldIds)) return new Set(visible.map((f) => f.id));
  const out = new Set<string>();
  for (const v of views) {
    for (const id of v.formFieldIds ?? []) out.add(id);
    for (const r of viewRoles(v)) out.add(r.fieldId);
    if (v.filter) out.add(v.filter.fieldId);
  }
  if (key === '*') for (const f of visible) if (f.required) out.add(f.id);
  return out;
}

/**
 * Example records that cover every view (a filtered view gets records that match its filter), in the
 * app's own domain. A photo gallery outside photography gets none: its empty state is the honest preview.
 */
export function previewRecords(spec: AppSpec, perView = 3, now: Date = new Date()): AppRecord[] {
  const today = todayIso(now);
  const domain = previewDomain(spec);
  const bank = BANKS[domain];
  const slots = roleSlots(spec);
  const titles = new Set(spec.views.flatMap((v) => (v.type === 'links' ? [] : viewRoles(v).filter((r) => r.role === 'title').map((r) => r.fieldId))));
  const due = dueFields(spec);
  const stages = doneStages(spec);
  const out: AppRecord[] = [];
  const seen = new Set<string>();
  const views = spec.views.filter((v) => v.type !== 'summary');
  const groups: { view: ViewSpec | null; filter?: { fieldId: string; value: string }; fields: Set<string> }[] = [];
  for (const v of views) {
    const key = groupKey(v);
    if (seen.has(key)) continue;
    seen.add(key);
    groups.push({ view: v, filter: v.filter, fields: fieldsForGroup(spec, key) });
  }
  if (!groups.length) groups.push({ view: null, fields: new Set(spec.fields.map((f) => f.id)) });
  let n = 0;
  for (const g of groups) {
    if (g.view?.type === 'gallery' && !domainHasPhotos(domain)) continue;
    for (let i = 0; i < perView; i++) {
      const entry = bank.entries[i % bank.entries.length] as Entry;
      const ctx: SampleContext = {
        domain,
        entry,
        general: BANKS.general.entries[i % BANKS.general.entries.length] as Entry,
        i,
        done: entry.check ?? i % 3 === 2,
        today,
        slots,
        titles,
        due,
        stages,
      };
      const values: RecordValues = {};
      for (const f of spec.fields) {
        if (f.hidden || !g.fields.has(f.id)) continue;
        const v = sampleValue(f, ctx);
        if (v !== undefined) values[f.id] = v;
      }
      if (g.filter) values[g.filter.fieldId] = g.filter.value;
      for (const v of spec.views) if (v.type === 'practice' && recordMatchesView(v, values)) alignPractice(spec, v, values, i);
      // Example records must belong to their view.
      if (g.view && !recordMatchesView(g.view, values)) continue;
      const created = new Date(now.getTime() - n * 86_400_000 - 3_600_000).toISOString();
      out.push({ id: `example-${++n}`, appId: 'example', values, createdAt: created, updatedAt: created });
    }
  }
  return out;
}
