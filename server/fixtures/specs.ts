/**
 * Fixture specs. Clearly identified sample content used for the first vertical slice,
 * the sample-mode generator, seeds and tests. Real builds come from the model adapter.
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

export const FIXTURES: Record<string, AppSpecInput> = {
  'photo-walk-journal': PHOTO_WALK_JOURNAL,
  'follow-up-board': FOLLOW_UP_BOARD,
  'practice-tracker': PRACTICE_TRACKER,
};

export function fixtureSpec(key: string): AppSpec | null {
  const input = FIXTURES[key];
  return input ? AppSpecSchema.parse(input) : null;
}
