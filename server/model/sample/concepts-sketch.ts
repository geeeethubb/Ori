/**
 * Sketching as a practice (audit P0-02 / P1-01 in Sample mode): a timer for the minutes the person has,
 * one object to draw each day, and a record of what they drew. The Agent offers it when a note is about
 * sketching or drawing ("I want to sketch for 10 minutes every day"), starting at the length they said
 * (suggestedMinutes). Like Riff, the timer keeps the minutes actually drawn apart from the planned length,
 * and a sketch typed in by hand has no timed seconds. The daily object is a real prompt rule, so "today's
 * object" is never an empty promise; nothing reminds, notifies or posts anything.
 *
 * Built and looked up like any concept, but not scored for the Playground (the Sketchbook journal is),
 * so Playground results are unchanged.
 */
import type { Concept } from './concept.ts';
import { defineConcept } from './concept.ts';

export const SKETCH_PRACTICE: Concept = defineConcept({
  id: 'sketch-practice',
  title: 'Sketch Sprint',
  purpose: 'explore',
  pattern: 'practice',
  icon: { symbol: 'pen', color: 'rose' },
  tagline: 'One thing to draw, on the clock.',
  description: 'A sketching timer: pick the minutes you have, draw today’s object until the timer ends, then save what you drew, how it went and what to try next. The minutes you drew are kept apart from the minutes you planned.',
  triggers: ['sketch', 'sketches', 'sketching', 'drawing', 'draw', 'doodle', 'doodling', 'figure drawing', 'life drawing', 'gesture drawing', 'urban sketching'],
  firstAction: 'Pick your minutes, press start, and draw the nearest object.',
  because: 'A timer and one object to draw turn a free moment into a sketch you actually finish.',
  base: () => ({
    schemaVersion: 1,
    name: 'Sketch Sprint',
    tagline: 'One thing to draw, on the clock.',
    purpose: 'explore',
    pattern: 'practice',
    icon: { symbol: 'pen', color: 'rose' },
    design: { theme: 'paper', accent: 'rose', typography: 'display', density: 'regular', artwork: 'none' },
    fields: [
      { id: 'date', label: 'Date', type: 'date', default: 'today' },
      { id: 'minutes', label: 'Minutes drawn', type: 'number', min: 1, max: 180, unit: 'min' },
      { id: 'subject', label: 'What did you draw?', type: 'text', placeholder: 'The mug on the desk' },
      { id: 'medium', label: 'Medium', type: 'select', default: 'pencil', options: [
        { value: 'pencil', label: 'Pencil' }, { value: 'ink', label: 'Ink' }, { value: 'watercolour', label: 'Watercolour' }, { value: 'digital', label: 'Digital' }, { value: 'other', label: 'Other' },
      ] },
      { id: 'feel', label: 'How did it go?', type: 'rating', max: 5 },
      { id: 'notes', label: 'Try next time', type: 'long_text', placeholder: 'Slower lines on the curves' },
      { id: 'target_minutes', label: 'Planned minutes', type: 'number', min: 1, max: 180, unit: 'min', help: 'The length you picked on the timer: the plan, not the time drawn.' },
      { id: 'timed_seconds', label: 'Timed', type: 'number', min: 0, max: 86400, unit: 's', help: 'Measured by the timer; empty when a sketch was typed in by hand.' },
    ],
    views: [
      {
        id: 'sprint', type: 'practice', title: 'Sketch', addLabel: 'Save sketch',
        formFieldIds: ['date', 'minutes', 'target_minutes', 'subject', 'medium', 'feel', 'notes'],
        minutesFieldId: 'minutes', focusFieldId: 'subject', feelFieldId: 'feel', notesFieldId: 'notes', dateFieldId: 'date',
        targetMinutesFieldId: 'target_minutes', timedSecondsFieldId: 'timed_seconds',
        presets: [10, 15, 20], tempoHelper: false,
      },
      { id: 'progress', type: 'summary', title: 'Progress', metrics: [
        { id: 'week_minutes', label: 'Minutes this week', kind: 'sum', fieldId: 'minutes', period: 'week', unit: 'min' },
        { id: 'sketches', label: 'Sketches', kind: 'count' },
        { id: 'streak', label: 'Day streak', kind: 'streak', fieldId: 'date' },
      ] },
    ],
    rules: [
      { id: 'todays_object', type: 'prompt_rotation', cadence: 'daily', title: 'Today’s object', prompts: [
        'A mug, from above and from the side',
        'Your left shoe, laces and all',
        'The view from the nearest window',
        'A set of keys, in one continuous line',
        'A plant, only its shadows',
        'Your hand holding the pencil',
        'Whatever is on the chair next to you',
        'A piece of fruit, three times, each faster',
      ] },
    ],
    entryNoun: { singular: 'sketch', plural: 'sketches' },
    emptyStateHint: 'Press start and draw today’s object until the timer ends, then save the sketch.',
    permissions: [],
  }),
});
