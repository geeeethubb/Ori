/**
 * The redesign's reference concepts: Riff (practice room), Light (contact sheet), People (next-action
 * queue). They build structurally different apps from the fixtures. Registered for lookups by id and
 * pattern; the Playground scoring catalog decides separately whether to score them (see catalog.ts).
 */
import type { Concept } from './concept.ts';
import { defineConcept } from './concept.ts';
import { LIGHT_GALLERY, PEOPLE_QUEUE, RIFF_PRACTICE } from '../../fixtures/specs.ts';

export const PLAYGROUND_CONCEPTS: Concept[] = [
  defineConcept({
    id: 'riff-practice',
    title: 'Riff',
    purpose: 'explore',
    pattern: 'practice',
    icon: { symbol: 'guitar', color: 'ink' },
    tagline: 'A little practice tonight',
    description: 'A practice room: start a timer for the minutes you have, keep a tempo with the metronome, save what you worked on and how it felt, and keep the songs and riffs that inspired you next to it.',
    triggers: ['guitar', 'riff', 'riffs', 'song', 'songs', 'chord', 'chords', 'practice', 'practise', 'practicing', 'practising', 'strum', 'strumming', 'fingerpicking', 'fingerstyle', 'tempo', 'bpm', 'metronome', 'music', 'musician', 'bass', 'piano', 'ukulele', 'drums', 'violin', 'instrument', 'instruments', 'scales', 'singing', 'sing', 'solo', 'melody', 'cover', 'covers', 'play along', 'learn songs', 'jam', 'band'],
    firstAction: 'Pick 15 minutes, press start, and play the riff at half speed.',
    lead: 'You shared',
    because: 'A timer sized to the minutes you have, a metronome and a saved result turn a liked sound into a session you actually play.',
    base: () => structuredClone(RIFF_PRACTICE),
  }),
  defineConcept({
    id: 'light-gallery',
    title: 'Light',
    purpose: 'explore',
    pattern: 'gallery',
    icon: { symbol: 'aperture', color: 'charcoal' },
    tagline: 'Find the light',
    description: 'A contact sheet of your own photographs with one small observation each and a weekly light exercise, so you start noticing light instead of just collecting pictures.',
    triggers: ['photo', 'photos', 'photograph', 'photography', 'photographer', 'camera', 'lens', 'light', 'shadows', 'golden hour', 'street photography', 'portrait', 'portraits', 'exposure', 'composition', 'film camera', 'shoot', 'shooting', 'contact sheet', 'gallery', 'pictures', 'walk', 'walks', 'walking', 'zine', 'prints', 'landscape photography'],
    firstAction: 'Add one photo from today and say what the light was doing.',
    lead: 'You shared',
    because: 'Real photos in a contact sheet, with one observation each and a weekly light exercise, make noticing light a habit you can see.',
    base: () => structuredClone(LIGHT_GALLERY),
  }),
  defineConcept({
    id: 'people-queue',
    title: 'People',
    purpose: 'work',
    pattern: 'queue',
    icon: { symbol: 'contact', color: 'mint' },
    tagline: 'Keep the conversation going',
    description: 'A short queue of who, what you promised, and by when, grouped by what needs attention today, with a draft you can copy and nothing ever sent for you.',
    triggers: ['follow up', 'follow-up', 'follow ups', 'follow-ups', 'forget to follow up', 'intro', 'intros', 'introduction', 'introductions', 'investor', 'investors', 'mentor', 'mentors', 'networking', 'networking events', 'contacts', 'reply', 'replies', 'email back', 'coffee chat', 'coffee chats', 'promised', 'owe', 'reach out', 'keep in touch', 'catch up', 'reconnect', 'met someone', 'people i met', 'meetup', 'demo day', 'conference', 'linkedin'],
    firstAction: 'Add the last person you promised something to, with a date.',
    lead: 'You shared',
    because: 'A queue grouped by what is due today, with the person and the promise on one card, keeps good intentions from slipping.',
    base: () => structuredClone(PEOPLE_QUEUE),
  }),
];
