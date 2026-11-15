/**
 * Domain-aware previews (audit P0-02): a proposal's illustration shows its own domain or an honest
 * neutral preview, never another domain's example content.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Recommendation } from '@shared/context.ts';
import { previewDomain, proposalMinutes, relevanceLine, type PreviewDomain } from './helpers.ts';
import { DOMAIN_EXAMPLES, MiniPreview, PEOPLE_ROWS, type MiniPreviewProps } from './MiniPreview.tsx';

function rec(over: Partial<Recommendation>): Recommendation {
  return {
    id: 'rec1', ownerId: 'u1', status: 'fresh', generatedBy: 'sample', inputHash: 'h', createdAt: '2026-11-14T00:00:00Z',
    kind: 'new_app', title: 'Light', purpose: 'explore', pattern: 'gallery', icon: { symbol: 'aperture', color: 'charcoal' },
    tagline: 'Find the light', description: 'A contact sheet of your photos, with one note each.',
    reason: 'You said "I want to try street photography on weekends.". Real photos in a contact sheet make noticing light a habit you can see.',
    evidenceFactIds: [], sourceCaptureIds: [], firstAction: 'Add one photo from today and say what the light was doing.',
    previewLines: ['Contact sheet of your photos, 3 across', 'What caught your eye?'], capabilities: ['gallery'],
    ...over,
  };
}

const sketch = rec({
  id: 'sk', title: 'Ten-Minute Sketch Sprint', pattern: 'practice', icon: { symbol: 'pen', color: 'rose' },
  tagline: 'Ten minutes, one object a day', description: 'A ten-minute timer and one object to draw, with your sketches kept as a log.',
  firstAction: 'Start the 10-minute timer and draw a spoon.', previewLines: ['Timer: 10 min', "Today's object", 'Sketch log'], suggestedMinutes: 10,
});
const riff = rec({
  id: 'rf', conceptId: 'riff-practice', title: 'Riff', pattern: 'practice', icon: { symbol: 'guitar', color: 'ink' }, tagline: 'A little practice tonight',
  description: 'A timer, a metronome and your saved riffs.', firstAction: 'Press start on the 15-minute timer and play the riff at half speed.',
  previewLines: ['Timer: 15 / 10 / 25 min', 'Metronome from 72 bpm'],
});
const people = rec({
  id: 'pp', conceptId: 'people-queue', title: 'People', pattern: 'queue', purpose: 'work', icon: { symbol: 'contact', color: 'mint' },
  tagline: 'Keep the conversation going', description: 'Who you promised what, and when.', firstAction: 'Add the one follow-up you owe this week.',
  previewLines: ['Who', 'What you promised', 'When'],
});
const newsletter = rec({
  id: 'nl', title: 'Newsletter that writes itself', pattern: 'journal', icon: { symbol: 'pen', color: 'rose' }, tagline: 'Collect ideas for your newsletter',
  description: 'Keep ideas, links and drafts for the next issue in one place.', firstAction: 'Write one idea for the next issue.', previewLines: ['Idea', 'Link', 'Draft'],
});
const budget = rec({
  id: 'bg', title: 'Budget Check-in', pattern: 'tracker', purpose: 'work', icon: { symbol: 'wallet', color: 'moss' }, tagline: 'Know where the money went',
  description: 'A weekly check-in on spending.', firstAction: 'Log what you spent today.', previewLines: ['Spent this week', 'Biggest category', 'Days under budget', 'Note'],
});
const review = rec({
  id: 'wr', title: 'Weekly Review', pattern: 'journal', purpose: 'work', icon: { symbol: 'sun', color: 'mustard' }, tagline: 'Ten minutes to reset the week',
  description: 'Three questions every Sunday.', firstAction: 'Answer the three questions for this week.', previewLines: ['What went well', 'What to drop', 'Next week'],
});

function render(props: Partial<MiniPreviewProps> & { r: Recommendation }): string {
  const { r, ...rest } = props;
  return renderToStaticMarkup(
    createElement(MiniPreview, {
      pattern: r.pattern, kind: r.kind, theme: 'bright', domain: previewDomain(r), lines: r.previewLines, prompt: r.firstAction,
      steps: r.explorationSteps, minutes: proposalMinutes(r), ...rest,
    }),
  );
}

/** Every example line of every domain other than `domain`. */
function otherDomainsText(domain: PreviewDomain): string[] {
  const out: string[] = [];
  for (const [d, ex] of Object.entries(DOMAIN_EXAMPLES)) {
    if (d === domain) continue;
    out.push(ex.prompt, ...ex.entries.map(([, what]) => what));
  }
  if (domain !== 'people') out.push(...PEOPLE_ROWS.map((r) => r.text));
  return out;
}

describe('previewDomain', () => {
  it('reads the domain from the proposal itself, title first', () => {
    expect(previewDomain(sketch)).toBe('sketch');
    expect(previewDomain(riff)).toBe('music');
    expect(previewDomain(people)).toBe('people');
    expect(previewDomain(rec({}))).toBe('photo');
    expect(previewDomain(newsletter)).toBe('newsletter');
    expect(previewDomain(rec({ kind: 'explore', title: 'A listening-and-playing session', icon: { symbol: 'headphones', color: 'lilac' }, description: 'No app needed.', tagline: 'No app needed', previewLines: ['Listen once'], firstAction: 'Listen once.' }))).toBe('music');
    expect(previewDomain(rec({ kind: 'explore', title: 'Clear the three follow-ups you already owe', icon: { symbol: 'people', color: 'lilac' }, description: 'No app needed.', tagline: 'No app needed', previewLines: ['Write them down'], firstAction: 'Write them down.' }))).toBe('people');
  });
  it('says neutral rather than guess from a passing mention', () => {
    expect(previewDomain(budget)).toBe('neutral');
    expect(previewDomain(review)).toBe('neutral');
    // One photo word deep in a description is not enough to borrow street photos.
    expect(previewDomain(rec({ title: 'Side Project Milestones', pattern: 'board', icon: { symbol: 'lightbulb', color: 'mustard' }, tagline: 'Ship the next small piece', description: 'Milestones with dates; attach a photo if you like.', previewLines: ['Stages: Idea > Building > Shipped'], firstAction: 'Add the next milestone.' }))).toBe('neutral');
  });
  it('does not read a domain into ordinary words: a title alone, or a word with another sense, is not enough', () => {
    const plain = (title: string) => previewDomain(rec({ title, tagline: '', description: '', previewLines: [], firstAction: '', icon: { symbol: 'star', color: 'slate' } }));
    for (const title of ['Travel Light', 'Light Reading', 'Keep Spending Light', 'Morning Light Yoga', 'Espresso Shots', 'Plant Friends', 'Bass Fishing Log', 'Errand Runs', 'Painting the House']) {
      expect(plain(title), title).toBe('neutral');
    }
    // As a live model would describe them: still not another domain's example content.
    const live = (over: Partial<Recommendation>) => previewDomain(rec({ pattern: 'journal', icon: { symbol: 'star', color: 'slate' }, previewLines: [], ...over }));
    expect(live({ title: 'Travel Light', tagline: 'Pack only what you need', description: 'A packing list for each trip, with what you actually used.', previewLines: ['Item', 'Packed', 'Used it?'], firstAction: 'List what you packed last time.' })).toBe('neutral');
    expect(live({ title: 'Espresso Shots', tagline: 'Dial in your morning coffee', description: 'Log each shot: grind, dose, time and taste.', previewLines: ['Grind', 'Dose', 'Taste'], firstAction: 'Log this morning’s shot.' })).toBe('neutral');
    expect(live({ title: 'Plant Friends', tagline: 'Water on time', description: 'Light, water and photosynthesis notes for each plant.', firstAction: 'Add your first plant.' })).toBe('neutral');
    expect(live({ title: 'Bass Fishing Log', tagline: 'Where they were biting', description: 'Spots, lures and the weather.', firstAction: 'Log your last trip.' })).toBe('neutral');
    expect(live({ title: 'Errand Runs', tagline: 'One run a week for everything', description: 'Batch errands into one run.', firstAction: 'Add this week’s errands.' })).toBe('neutral');
    expect(live({ title: 'Painting the House', pattern: 'board', tagline: 'Room by room', description: 'Rooms, colours and who is painting what.', firstAction: 'Add the first room.' })).toBe('neutral');
    expect(live({ title: 'French Press Diary', tagline: 'Better coffee at home', description: 'Brew notes for your French press.', firstAction: 'Log one brew.' })).toBe('neutral');
    expect(live({ title: 'Morning Light Yoga', tagline: 'Ten minutes of yoga before work', description: 'A short yoga flow each morning.', firstAction: 'Roll out the mat.' })).toBe('neutral');
  });
  it('needs two signals that agree, and calls a tie neutral', () => {
    // A strong word in the title and the icon agree.
    expect(previewDomain(rec({ title: 'Guitar Practice', tagline: '', description: '', previewLines: [], firstAction: '', icon: { symbol: 'guitar', color: 'ink' } }))).toBe('music');
    // A strong word in two of the proposal's own fields.
    expect(previewDomain(rec({ title: 'Street Photography', tagline: 'Your photos from weekend walks', description: '', previewLines: [], firstAction: '', icon: { symbol: 'star', color: 'slate' } }))).toBe('photo');
    // Photography and sketching, equally: neither one's examples.
    expect(previewDomain(rec({ title: 'Photos and sketches', tagline: 'Photos and sketches from the week', description: '', previewLines: [], firstAction: '', icon: { symbol: 'star', color: 'slate' } }))).toBe('neutral');
    // A catalog concept without examples of its own stays neutral whatever its words say.
    expect(previewDomain(rec({ conceptId: 'film-log', title: 'Film Log', icon: { symbol: 'film', color: 'slate' }, description: 'Films you watched, with photos of the tickets.', tagline: 'Photos of every ticket' }))).toBe('neutral');
  });
  it('keeps every domain example inside its own domain', () => {
    for (const [domain, ex] of Object.entries(DOMAIN_EXAMPLES) as [Exclude<PreviewDomain, 'neutral'>, (typeof DOMAIN_EXAMPLES)['photo']][]) {
      for (const line of [ex.prompt, ...ex.entries.map(([, what]) => what)]) {
        const seen = previewDomain(rec({ title: line, tagline: '', description: '', previewLines: [], firstAction: '', icon: { symbol: 'star', color: 'slate' } }));
        expect([domain, 'neutral'], `${domain}: "${line}" reads as ${seen}`).toContain(seen);
      }
    }
  });
});

describe('proposalMinutes', () => {
  it('starts from what the person asked for, else a length the proposal names', () => {
    expect(proposalMinutes(sketch)).toBe(10);
    expect(proposalMinutes({ ...sketch, suggestedMinutes: undefined })).toBe(10);
    expect(proposalMinutes({ ...sketch, suggestedMinutes: undefined, previewLines: [], title: 'Ten-Minute Sketch Sprint', firstAction: 'Draw.' })).toBe(10);
    expect(proposalMinutes(riff)).toBe(15);
    expect(proposalMinutes(rec({ title: 'Twenty-minute warm-up', previewLines: [], firstAction: 'Go.', description: '', tagline: '' }))).toBe(20);
    expect(proposalMinutes(budget)).toBeNull();
  });
});

describe('MiniPreview content follows the domain (audit P0-02)', () => {
  it('sketching shows sketching at 10:00, with no music, photo or people filler', () => {
    const html = render({ r: sketch });
    expect(html).toContain('10:00');
    expect(html).toContain('draw a spoon');
    for (const line of otherDomainsText('sketch')) expect(html).not.toContain(line);
    expect(html).not.toMatch(/riff|tempo|guitar|brick|tram|food cart/i);
  });
  it('music shows a music timer at its own length', () => {
    const html = render({ r: riff, theme: 'ink' });
    expect(html).toContain('data-composition="ring"');
    expect(html).toContain('15:00');
    for (const line of otherDomainsText('music')) expect(html).not.toContain(line);
  });
  it('People shows people and promises', () => {
    const html = render({ r: people, size: 'featured' });
    expect(html).toContain('Follow up with Maya');
    expect(html).toContain('Reply to Sam');
    expect(html).not.toMatch(/photo|riff|stop kept the highlights|Underexpos/i);
  });
  it('photography shows photos (example photos labelled, the person’s own photo labelled as theirs)', () => {
    const stage = render({ r: rec({}) });
    expect(stage).toContain('/examples/light-');
    expect(stage).toContain('>Example<');
    const strip = render({ r: rec({}), variant: 'strip', ownPhoto: 'blob:mine' });
    expect(strip).toContain('src="blob:mine"');
    expect(strip).toContain('Your photo');
    expect(strip).toContain('Example');
  });
  it('a newsletter shows newsletter snippets', () => {
    const html = render({ r: newsletter, size: 'featured' });
    expect(html).toContain('Issue 12');
    for (const line of otherDomainsText('newsletter')) expect(html).not.toContain(line);
  });
  it('an unknown domain shows an honest neutral preview: its own labels, no borrowed examples', () => {
    const tracker = render({ r: budget });
    expect(tracker).toContain('Spent this week');
    expect(tracker).toContain('$84');
    expect(tracker).not.toMatch(/Reading|Guitar|Walks|Sketching/);
    const journal = render({ r: review, size: 'featured' });
    for (const line of otherDomainsText('neutral' as PreviewDomain)) expect(journal).not.toContain(line);
    expect(journal).toContain('Example');
  });
  it('an exploration shows its own steps, never another domain’s', () => {
    const html = render({ r: rec({ kind: 'explore', title: 'A twenty-minute light walk', explorationSteps: ['Go out for twenty minutes with one rule.', 'Take the same frame twice.'] }) });
    expect(html).toContain('Go out for twenty minutes with one rule.');
    expect(html).not.toContain('/examples/light-');
    expect(html).not.toMatch(/Listen once|half tempo/);
  });
  it('an exploration’s own steps are the person’s plan: numbered, none ticked as done, not labelled Example', () => {
    for (const variant of ['stage', 'strip'] as const) {
      const html = render({ r: rec({ kind: 'explore', title: 'Try it once this week', explorationSteps: ['Block twenty minutes this week.', 'Do the first step.', 'Note what you noticed.'] }), variant });
      expect(html, variant).not.toContain('is-done');
      expect(html, variant).toMatch(/mv-step-n[^>]*>1</);
      expect(html, variant).toMatch(/mv-step-n[^>]*>2</);
      expect(html, variant).not.toContain('>Example<');
      expect(html, variant).toContain('aria-label="Preview: the first steps of this idea"');
    }
  });
  it('a featured newsletter preview shows every example entry, a repeated label included', () => {
    const html = render({ r: newsletter, size: 'featured' });
    expect(html.match(/>Idea</g)?.length).toBe(2);
  });
});

describe('relevanceLine', () => {
  it('skips the sentence that only quotes the person back', () => {
    expect(relevanceLine(rec({}))).toBe('Real photos in a contact sheet make noticing light a habit you can see.');
    expect(relevanceLine({ reason: 'You mentioned "a" and "b". Riff already does this, so there is nothing new to make.', tagline: 'x' })).toBe('Riff already does this, so there is nothing new to make.');
  });
  it('never returns the inside of a quote, and falls back to the tagline', () => {
    expect(relevanceLine({ reason: 'You said "I like this. It is great". The timer makes it a session.', tagline: 't' })).toBe('The timer makes it a session.');
    expect(relevanceLine({ reason: 'You said "I want to try pottery".', tagline: 'Hands in clay' })).toBe('Hands in clay');
  });
});
