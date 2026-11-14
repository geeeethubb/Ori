/**
 * Fixture specs. Clearly identified sample content used by the seed, the sample-mode generator and
 * tests. Real builds come from the model adapter. The first three are the session-1 apps (kept so
 * old exports, tests and demo data keep working); the last three are the redesign's reference
 * apps, each structurally different: Riff (session/control-first), Light (image-first) and
 * People (person/action-first).
 */
import { AppSpecSchema, type AppSpec, type AppSpecInput } from '../../shared/appSpec.ts';

export const PHOTO_WALK_JOURNAL: AppSpecInput = {
  schemaVersion: 1,
  name: 'Photo Walk Journal',
  tagline: 'Notice more on every walk',
  purpose: 'explore',
  pattern: 'journal',
  icon: { symbol: 'camera', color: 'terracotta' },
  fields: [
    { id: 'date', label: 'Date', type: 'date', default: 'today', required: true },
    { id: 'subject', label: 'What caught your eye?', type: 'text', required: true, placeholder: 'Low sun on the brick wall by the station' },
    { id: 'location', label: 'Where', type: 'text', placeholder: 'Neighbourhood, park, street…' },
    { id: 'reflection', label: 'What did you learn?', type: 'long_text', placeholder: 'One thing you would try differently next time' },
    { id: 'mood', label: 'How did it feel?', type: 'select', options: [
      { value: 'calm', label: 'Calm' }, { value: 'curious', label: 'Curious' }, { value: 'rushed', label: 'Rushed' }, { value: 'inspired', label: 'Inspired' },
    ] },
    { id: 'keeper', label: 'Got a keeper shot', type: 'checkbox' },
  ],
  views: [
    { id: 'entries', type: 'journal', title: 'Walks', dateFieldId: 'date', titleFieldId: 'subject', sort: 'newest' },
    { id: 'stats', type: 'summary', title: 'This month', metrics: [
      { id: 'walks_month', label: 'Walks this month', kind: 'count', period: 'month', fieldId: 'date' },
      { id: 'keepers', label: 'Keeper shots', kind: 'count', where: { fieldId: 'keeper', op: 'truthy' } },
      { id: 'streak', label: 'Day streak', kind: 'streak', fieldId: 'date' },
    ] },
  ],
  rules: [
    { id: 'weekly_challenge', type: 'prompt_rotation', cadence: 'weekly', title: "This week's challenge", prompts: [
      'Shoot only shadows and reflections',
      'One subject, five distances',
      'Find three kinds of light before noon',
      'Photograph the same corner at two times of day',
      'Only textures: walls, bark, fabric, water',
      'Frame within a frame: doorways, windows, arches',
      'Colour pairs: find complementary colours in the wild',
      'Motion: let something blur on purpose',
    ] },
  ],
  entryNoun: { singular: 'walk', plural: 'walks' },
  emptyStateHint: 'Your first walk can be ten minutes around the block. Note one thing that caught your eye.',
  permissions: [],
};

export const FOLLOW_UP_BOARD: AppSpecInput = {
  schemaVersion: 1,
  name: 'People to Follow Up With',
  tagline: 'Keep promises to the people who matter',
  purpose: 'work',
  pattern: 'board',
  icon: { symbol: 'people', color: 'teal' },
  fields: [
    { id: 'person', label: 'Person', type: 'text', required: true, placeholder: 'Name and how you met' },
    { id: 'stage', label: 'Stage', type: 'select', required: true, default: 'met', options: [
      { value: 'met', label: 'Just met' }, { value: 'promised', label: 'I owe a follow-up' }, { value: 'waiting', label: 'Waiting on them' }, { value: 'done', label: 'Done' },
    ] },
    { id: 'commitment', label: 'What I promised', type: 'text', placeholder: 'Send the deck, intro to Sam…' },
    { id: 'due', label: 'Follow up by', type: 'date' },
    { id: 'context', label: 'Context', type: 'long_text', placeholder: 'Where we met, what they care about' },
    { id: 'channel', label: 'Best channel', type: 'select', options: [
      { value: 'email', label: 'Email' }, { value: 'linkedin', label: 'LinkedIn' }, { value: 'text', label: 'Text' }, { value: 'in_person', label: 'In person' },
    ] },
  ],
  views: [
    { id: 'board', type: 'board', title: 'Follow-ups', stageFieldId: 'stage', titleFieldId: 'person', dueFieldId: 'due', doneStageValues: ['done'], cardFieldIds: ['commitment', 'due'] },
    { id: 'summary', type: 'summary', title: 'At a glance', metrics: [
      { id: 'open', label: 'Open follow-ups', kind: 'count', where: { fieldId: 'stage', op: 'neq', value: 'done' } },
      { id: 'done_week', label: 'Closed this week', kind: 'count', period: 'week', where: { fieldId: 'stage', op: 'eq', value: 'done' } },
    ] },
  ],
  rules: [
    { id: 'due_soon', type: 'due_soon', dateFieldId: 'due', withinDays: 3, stageFieldId: 'stage', doneStageValues: ['done'], label: 'Needs attention' },
  ],
  entryNoun: { singular: 'follow-up', plural: 'follow-ups' },
  emptyStateHint: 'Add the last person you promised something to. A date turns a good intention into a reminder.',
  permissions: [],
};

export const PRACTICE_TRACKER: AppSpecInput = {
  schemaVersion: 1,
  name: 'Practice Companion',
  tagline: 'Small sessions, steady progress',
  purpose: 'explore',
  pattern: 'tracker',
  icon: { symbol: 'music', color: 'plum' },
  fields: [
    { id: 'date', label: 'Date', type: 'date', default: 'today', required: true },
    { id: 'minutes', label: 'Minutes', type: 'number', min: 1, max: 600, unit: 'min', required: true },
    { id: 'focus', label: 'What did you work on?', type: 'text', required: true, placeholder: 'Scales, a tricky bar, a new song' },
    { id: 'quality', label: 'How did it go?', type: 'rating', max: 5 },
    { id: 'notes', label: 'Notes for next time', type: 'long_text' },
  ],
  views: [
    { id: 'progress', type: 'summary', title: 'Progress', metrics: [
      { id: 'week_minutes', label: 'Minutes this week', kind: 'sum', fieldId: 'minutes', period: 'week', unit: 'min' },
      { id: 'streak', label: 'Day streak', kind: 'streak', fieldId: 'date' },
      { id: 'sessions', label: 'Sessions', kind: 'count' },
      { id: 'avg_quality', label: 'Average feel', kind: 'avg', fieldId: 'quality' },
    ] },
    { id: 'log', type: 'list', title: 'Sessions', titleFieldId: 'focus', columnFieldIds: ['date', 'minutes', 'quality'], sortFieldId: 'date', sortDir: 'desc' },
  ],
  rules: [],
  entryNoun: { singular: 'session', plural: 'sessions' },
  emptyStateHint: 'Log a five-minute session. The streak counts days, not hours.',
  permissions: [],
};

// ---------- redesign reference apps ----------

/** Riff: a listening and practice room. Session/control-first (timer, tempo), saved sources, dark ink + lime. */
export const RIFF_PRACTICE: AppSpecInput = {
  schemaVersion: 1,
  name: 'Riff',
  tagline: 'A little practice tonight',
  purpose: 'explore',
  pattern: 'practice',
  icon: { symbol: 'guitar', color: 'ink' },
  design: { theme: 'ink', accent: 'lime', typography: 'display', density: 'regular', artwork: 'waves' },
  fields: [
    { id: 'kind', label: 'Kind', type: 'select', default: 'session', options: [{ value: 'session', label: 'Practice session' }, { value: 'source', label: 'Saved source' }] },
    { id: 'date', label: 'Date', type: 'date', default: 'today' },
    { id: 'minutes', label: 'Minutes played', type: 'number', min: 1, max: 180, unit: 'min' },
    { id: 'focus', label: 'What did you work on?', type: 'text', placeholder: 'The riff at half speed, then full' },
    { id: 'tempo', label: 'Tempo', type: 'number', min: 30, max: 240, unit: 'bpm' },
    { id: 'feel', label: 'How did it feel?', type: 'rating', max: 5 },
    { id: 'notes', label: 'Notes for next time', type: 'long_text', placeholder: 'Slow it down with the metronome at 60.' },
    { id: 'url', label: 'Link', type: 'url', placeholder: 'https://' },
    { id: 'title', label: 'What is it?', type: 'text', placeholder: 'Song, lesson or riff' },
    { id: 'source_note', label: 'Why it caught your ear', type: 'text', placeholder: 'That fingerpicked intro' },
    { id: 'source_kind', label: 'Kind of source', type: 'select', default: 'song', options: [
      { value: 'song', label: 'Song' }, { value: 'lesson', label: 'Lesson' }, { value: 'riff', label: 'Riff' }, { value: 'artist', label: 'Artist' },
    ] },
  ],
  views: [
    {
      id: 'practice', type: 'practice', title: 'Practice', filter: { fieldId: 'kind', value: 'session' }, formFieldIds: ['date', 'minutes', 'focus', 'tempo', 'feel', 'notes'], addLabel: 'Save session',
      minutesFieldId: 'minutes', focusFieldId: 'focus', tempoFieldId: 'tempo', feelFieldId: 'feel', notesFieldId: 'notes', dateFieldId: 'date',
      presets: [15, 10, 25], defaultTempo: 72, tempoHelper: true,
    },
    {
      id: 'sources', type: 'links', title: 'Inspiration', filter: { fieldId: 'kind', value: 'source' }, formFieldIds: ['url', 'title', 'source_note', 'source_kind'], addLabel: 'Save a source',
      urlFieldId: 'url', titleFieldId: 'title', noteFieldId: 'source_note', kindFieldId: 'source_kind',
    },
    { id: 'progress', type: 'summary', title: 'Progress', metrics: [
      { id: 'week_minutes', label: 'Minutes this week', kind: 'sum', fieldId: 'minutes', period: 'week', unit: 'min', where: { fieldId: 'kind', op: 'eq', value: 'session' } },
      { id: 'sessions', label: 'Sessions', kind: 'count', where: { fieldId: 'kind', op: 'eq', value: 'session' } },
      { id: 'streak', label: 'Day streak', kind: 'streak', fieldId: 'date', where: { fieldId: 'kind', op: 'eq', value: 'session' } },
      { id: 'avg_feel', label: 'Average feel', kind: 'avg', fieldId: 'feel', where: { fieldId: 'kind', op: 'eq', value: 'session' } },
    ] },
  ],
  rules: [
    { id: 'tonight', type: 'prompt_rotation', cadence: 'daily', title: 'Tonight', prompts: [
      'Play the riff at half tempo three times, then once at full speed',
      'Loop the two chords that trip you up for five minutes',
      'Play along with the source once, no stopping',
      'Record 30 seconds and listen back before you judge it',
      'One minute of only the right hand, then only the left',
      'Learn the first two bars of something new by ear',
      'Play the whole piece slowly enough to make zero mistakes',
    ] },
  ],
  entryNoun: { singular: 'session', plural: 'sessions' },
  emptyStateHint: 'Pick a length, press start, and play. Save the session when the timer ends.',
  permissions: [],
};

/** Light: a contact sheet of real photographs with one small observation each. Image-first, paper + charcoal. */
export const LIGHT_GALLERY: AppSpecInput = {
  schemaVersion: 1,
  name: 'Light',
  tagline: 'Find the light',
  purpose: 'explore',
  pattern: 'gallery',
  icon: { symbol: 'aperture', color: 'charcoal' },
  design: { theme: 'paper', accent: 'orange', typography: 'editorial', density: 'airy', artwork: 'none' },
  fields: [
    { id: 'date', label: 'Date', type: 'date', default: 'today', required: true },
    { id: 'photo', label: 'Photo', type: 'image', required: true },
    { id: 'caption', label: 'What caught your eye?', type: 'text', placeholder: 'Low sun on the brick wall by the station' },
    { id: 'note', label: 'Observation', type: 'long_text', placeholder: 'One thing about the light you would try again' },
    { id: 'light', label: 'Light', type: 'select', options: [
      { value: 'golden', label: 'Golden hour' }, { value: 'overcast', label: 'Soft and overcast' }, { value: 'harsh', label: 'Harsh midday' }, { value: 'night', label: 'Night and neon' }, { value: 'indoor', label: 'Indoor' },
    ] },
    { id: 'location', label: 'Where', type: 'text', placeholder: 'Optional' },
    { id: 'keeper', label: 'Keeper', type: 'checkbox' },
  ],
  views: [
    { id: 'sheet', type: 'gallery', title: 'Contact sheet', imageFieldId: 'photo', captionFieldId: 'caption', noteFieldId: 'note', dateFieldId: 'date', columns: 3, sort: 'newest', addLabel: 'Add photo', formFieldIds: ['photo', 'caption', 'light', 'note', 'location', 'keeper', 'date'] },
    { id: 'stats', type: 'summary', title: 'This month', metrics: [
      { id: 'photos_month', label: 'Photos this month', kind: 'count', period: 'month', fieldId: 'date' },
      { id: 'keepers', label: 'Keepers', kind: 'count', where: { fieldId: 'keeper', op: 'truthy' } },
      { id: 'streak', label: 'Day streak', kind: 'streak', fieldId: 'date' },
    ] },
  ],
  rules: [
    { id: 'exercise', type: 'prompt_rotation', cadence: 'weekly', title: 'Light exercise', prompts: [
      'Shoot only shadows and reflections',
      'Find three kinds of light before noon',
      'Photograph the same corner at two times of day',
      'Backlight: put the sun behind your subject',
      'One colour, five frames',
      'Frame within a frame: doorways, windows, arches',
      'Let something blur on purpose',
      'Wait for a person to walk into the light',
    ] },
  ],
  entryNoun: { singular: 'photo', plural: 'photos' },
  emptyStateHint: 'Add one photo and say what the light was doing. That is the whole habit.',
  permissions: [],
};

/** People: a compact next-action queue. Person/action-first, white + mint, drafts never sent. */
export const PEOPLE_QUEUE: AppSpecInput = {
  schemaVersion: 1,
  name: 'People',
  tagline: 'Keep the conversation going',
  purpose: 'work',
  pattern: 'queue',
  icon: { symbol: 'contact', color: 'mint' },
  design: { theme: 'mint', accent: 'blue', typography: 'compact', density: 'compact', artwork: 'none' },
  fields: [
    { id: 'person', label: 'Who', type: 'text', required: true, placeholder: 'Maya, met at the design meetup' },
    { id: 'action', label: 'Next action', type: 'text', required: true, placeholder: 'Send the demo link' },
    { id: 'due', label: 'By when', type: 'date' },
    { id: 'done', label: 'Done', type: 'checkbox' },
    { id: 'context', label: 'What we discussed', type: 'long_text', placeholder: 'She asked about pricing for small teams' },
    { id: 'channel', label: 'Channel', type: 'select', options: [
      { value: 'email', label: 'Email' }, { value: 'text', label: 'Text' }, { value: 'linkedin', label: 'LinkedIn' }, { value: 'call', label: 'Call' }, { value: 'in_person', label: 'In person' },
    ] },
    { id: 'draft', label: 'Message draft', type: 'long_text', help: 'A draft you can copy. Nothing is ever sent for you.' },
  ],
  views: [
    { id: 'queue', type: 'queue', title: 'Next actions', personFieldId: 'person', actionFieldId: 'action', dueFieldId: 'due', doneFieldId: 'done', contextFieldId: 'context', channelFieldId: 'channel', groupBy: 'due', addLabel: 'Add a follow-up' },
    { id: 'summary', type: 'summary', title: 'At a glance', metrics: [
      { id: 'open', label: 'Open actions', kind: 'count', where: { fieldId: 'done', op: 'falsy' } },
      { id: 'done_week', label: 'Done this week', kind: 'count', period: 'week', where: { fieldId: 'done', op: 'truthy' } },
    ] },
  ],
  rules: [
    { id: 'due_soon', type: 'due_soon', dateFieldId: 'due', withinDays: 3, doneFieldId: 'done', label: 'Needs attention' },
  ],
  entryNoun: { singular: 'follow-up', plural: 'follow-ups' },
  emptyStateHint: 'Add the last person you promised something to. A date turns a good intention into a reminder.',
  permissions: [],
};

export const FIXTURES: Record<string, AppSpecInput> = {
  'photo-walk-journal': PHOTO_WALK_JOURNAL,
  'follow-up-board': FOLLOW_UP_BOARD,
  'practice-tracker': PRACTICE_TRACKER,
  'riff-practice': RIFF_PRACTICE,
  'light-gallery': LIGHT_GALLERY,
  'people-queue': PEOPLE_QUEUE,
};

export function fixtureSpec(key: string): AppSpec | null {
  const input = FIXTURES[key];
  return input ? AppSpecSchema.parse(input) : null;
}
