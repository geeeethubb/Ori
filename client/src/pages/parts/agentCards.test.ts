/**
 * The Agent composer helpers and the proposal cards in Ori's vocabulary: "Preview <App>" with
 * "Keep inspiration", "Open <App>" for an app the person has (with ?from= so its entry is confirmed
 * there), "Try it", "Preview change", "Why this?" with provenance that keeps the example profile apart.
 */
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import type { Capture, ProfileFact, Recommendation } from '@shared/context.ts';
import { STARTERS, applyStarter, draftSummary, exampleQuoteLead, groundedReason, photoWords, splitSharedLink } from './helpers.ts';
import { KeepCard, MakeNewCard, PlayCard, ThreadCard, UnexpectedCard, WhyThis } from './ProposalBits.tsx';

function rec(over: Partial<Recommendation>): Recommendation {
  return {
    id: 'rec1', ownerId: 'u1', status: 'fresh', generatedBy: 'sample', inputHash: 'h', createdAt: '2026-11-14T00:00:00Z',
    kind: 'new_app', title: 'Light', purpose: 'explore', pattern: 'gallery', icon: { symbol: 'aperture', color: 'charcoal' }, conceptId: 'light-gallery',
    tagline: 'Find the light', description: 'A contact sheet of your photos, with one note each.',
    reason: 'You said "I want to try street photography on weekends.". Real photos in a contact sheet make noticing light a habit you can see.',
    evidenceFactIds: [], sourceCaptureIds: ['cap1'], firstAction: 'Add one photo from today.', previewLines: ['Contact sheet of your photos'], capabilities: ['gallery'],
    captureId: 'cap1',
    ...over,
  };
}

const capture: Capture = {
  id: 'cap1', ownerId: 'u1', kind: 'image', text: 'I want to try street photography on weekends.', url: null, linkMeta: null, mediaId: 'm1',
  readStatus: 'not_read', sourceLabel: 'Screenshot', isExample: false, createdAt: '2026-11-14T00:00:00Z',
};
const fact = (id: string, value: string): ProfileFact => ({ id, ownerId: 'u1', category: 'interest', value, sourceIds: ['s1'], confidence: 1, status: 'confirmed', createdAt: '', updatedAt: '' });
const keepRec = rec({ id: 'keep1', kind: 'keep', title: 'Just keep it', pattern: 'journal', icon: { symbol: 'bookmark', color: 'paper' }, conceptId: undefined });
const ids = { card: 'proposal-card', action: 'proposal-action', why: 'proposal-why', keep: 'proposal-keep' };

const html = (el: ReactElement) => renderToStaticMarkup(createElement(MemoryRouter, null, el));

/** The rendered link carrying a test id (attribute order does not matter). */
function link(out: string, testId: string): string {
  return new RegExp(`<a[^>]*data-testid="${testId}"[^>]*>[\\s\\S]*?</a>`).exec(out)?.[0] ?? '';
}

describe('splitSharedLink', () => {
  it('saves one pasted link as the share’s link and keeps the words as the note', () => {
    expect(splitSharedLink('Save this for later https://www.instagram.com/reel/abc/', '')).toEqual({ text: 'Save this for later', url: 'https://www.instagram.com/reel/abc/' });
    expect(splitSharedLink('Save this for later: https://example.com/a', '')).toEqual({ text: 'Save this for later', url: 'https://example.com/a' });
    expect(splitSharedLink('I like this https://youtu.be/x.', '')).toEqual({ text: 'I like this.', url: 'https://youtu.be/x' });
    expect(splitSharedLink('https://example.com/only', '')).toEqual({ text: '', url: 'https://example.com/only' });
  });
  it('leaves a separate link, several links, and plain notes alone', () => {
    expect(splitSharedLink('note https://a.example', 'https://b.example')).toEqual({ text: 'note https://a.example', url: 'https://b.example' });
    expect(splitSharedLink('two https://a.example and https://b.example', '')).toEqual({ text: 'two https://a.example and https://b.example', url: '' });
    expect(splitSharedLink('  just words  ', '')).toEqual({ text: 'just words', url: '' });
  });
});

describe('draftSummary', () => {
  it('shows the entry in the person’s own terms; a date stays their words to confirm', () => {
    expect(draftSummary({ kind: 'follow_up', person: 'Maya', action: 'Follow up about the proposal', dueText: 'Thursday' })).toEqual(['Maya', 'Follow up about the proposal', 'When: “Thursday”, you confirm the date']);
    expect(draftSummary({ kind: 'follow_up', person: 'Sam' })).toEqual(['Sam', 'Follow up', 'When: you choose']);
    expect(draftSummary({ kind: 'source', title: 'Instagram link', url: 'https://www.instagram.com/reel/example/' })).toEqual(['Instagram link', 'instagram.com/reel/example']);
    expect(draftSummary({ kind: 'photo', mediaId: 'abcdefgh' })[0]).toBe('Your photo');
  });
});

describe('starters', () => {
  it('fill the composer: they replace an empty note or another starter and keep anything typed', () => {
    expect(STARTERS.map((s) => s.label)).toEqual(['Something to try', 'A task to simplify', 'Just save this']);
    expect(applyStarter('', 'I want to try ')).toBe('I want to try ');
    expect(applyStarter('I want to try ', 'Help me keep track of ')).toBe('Help me keep track of ');
    expect(applyStarter('street photography', 'I want to try ')).toBe('I want to try street photography');
    expect(applyStarter('I want to try pottery', 'I want to try ')).toBe('I want to try pottery');
  });
  it('switching starters swaps the opening words and keeps what was typed after them', () => {
    expect(applyStarter('I want to try pottery', 'Help me keep track of ')).toBe('Help me keep track of pottery');
    expect(applyStarter('help me keep track of my plants', 'Save this for later ')).toBe('Save this for later my plants');
    // A word that merely starts like a starter is the person's own text.
    expect(applyStarter('I want to trying', 'Save this for later ')).toBe('Save this for later I want to trying');
  });
});

describe('photo wording', () => {
  it('says photo where stored labels say screenshot, keeping the read status itself', () => {
    expect(photoWords('Note read, screenshot not read')).toBe('Note read, photo not read');
    expect(photoWords('Screenshot saved, not read')).toBe('Photo saved, not read');
    expect(photoWords('Note and screenshot read, link not read')).toBe('Note and photo read, link not read');
    expect(photoWords('Screenshot')).toBe('Photo');
    expect(photoWords('Instagram link')).toBe('Instagram link');
  });
});

describe('quoted words keep their owner (audit P1-04)', () => {
  const reason = 'You shared "Street photography on weekend walks" and "Golden hour". Real photos make light a habit you can see.';
  it('names the example profile when it is the only source', () => {
    const lead = exampleQuoteLead([fact('f1', 'x'), fact('f2', 'y')], [], new Set(['f1', 'f2']));
    expect(lead).toBe('The example profile says');
    expect(groundedReason(reason, lead)).toBe('The example profile says "Street photography on weekend walks" and "Golden hour". Real photos make light a habit you can see.');
  });
  it('says both when the person and the example profile are cited, and leaves the person’s own words alone', () => {
    expect(exampleQuoteLead([fact('f1', 'x'), fact('f2', 'y')], [], new Set(['f1']))).toBe('From you and the example profile:');
    expect(exampleQuoteLead([fact('f1', 'x')], [capture], new Set())).toBeNull();
    expect(exampleQuoteLead([], [{ ...capture, isExample: true }])).toBe('The example you tried says');
    expect(groundedReason(reason, null)).toBe(reason);
    // Only a quote lead is rewritten.
    expect(groundedReason('You shared a screenshot. Light fits.', 'The example profile says')).toBe('You shared a screenshot. Light fits.');
    expect(groundedReason('Light fits. You mentioned “guitar”.', 'The example profile says')).toBe('Light fits. The example profile says “guitar”.');
  });
  it('"Why this?" never presents example-profile words as "You shared"', () => {
    const out = html(createElement(WhyThis, { reason, facts: [fact('f1', 'Street photography on weekend walks')], captures: [], exampleFactIds: new Set(['f1']) }));
    expect(out).toContain('The example profile says');
    expect(out).not.toContain('You shared');
  });
});

describe('Agent proposal cards', () => {
  it('a new app: icon, name, a real preview, "Preview Light", "Keep inspiration" and "Why this?"', () => {
    const out = html(createElement(ThreadCard, { proposal: rec({}), lead: true, captures: [capture], ownPhoto: 'blob:mine', keep: { proposal: keepRec, busy: false, onKeep: () => undefined }, testIds: ids }));
    expect(out).toContain('data-kind="new_app"');
    expect(link(out, 'proposal-action')).toContain('href="/make/rec1"');
    expect(link(out, 'proposal-action')).toContain('>Preview Light</a>');
    expect(out).toContain('Keep inspiration');
    expect(out).toContain('Why this?');
    expect(out).toContain('Your photo');
    expect(out).toContain('Note read, photo not read');
  });
  it('a kept inspiration says so instead of offering the button again', () => {
    const out = html(createElement(ThreadCard, { proposal: rec({}), lead: true, keep: { proposal: { ...keepRec, status: 'kept' }, busy: false, onKeep: () => undefined }, testIds: ids }));
    expect(out).toContain('data-state="kept"');
    expect(out).not.toContain('Keep inspiration');
  });
  it('an app the person has opens with the entry to confirm there (?from=)', () => {
    const use = rec({ id: 'use1', kind: 'use_app', title: 'Add Maya to People', pattern: 'queue', conceptId: 'people-queue', targetAppId: 'peopleApp1', previewLines: ['Maya', 'Follow up about the proposal', 'When: “Thursday”, you confirm the date'], recordDraft: { kind: 'follow_up', person: 'Maya', action: 'Follow up about the proposal', dueText: 'Thursday' } });
    const out = html(createElement(ThreadCard, { proposal: use, lead: true, app: { name: 'People', icon: { symbol: 'people', color: 'white' } }, testIds: ids }));
    expect(out).toMatch(/href="\/apps\/peopleApp1\/\?from=use1"[^>]*>Open People<\/a>/);
    expect(out).toContain('To check and save in People');
    expect(out).toContain('When: “Thursday”, you confirm the date');
  });
  it('compact cards: "Try it" and "Preview change" name their proposal for assistive tech', () => {
    const explore = html(createElement(ThreadCard, { proposal: rec({ id: 'ex1', kind: 'explore', title: 'A twenty-minute light walk' }), lead: false, testIds: ids }));
    expect(explore).toContain('aria-label="Try it: A twenty-minute light walk"');
    expect(explore).toContain('>Try it<');
    const update = html(createElement(ThreadCard, { proposal: rec({ id: 'up1', kind: 'update_app', title: 'Give Light camera settings', targetAppId: 'lightApp1' }), lead: false, app: { name: 'Light', icon: { symbol: 'camera', color: 'charcoal' } }, testIds: ids }));
    expect(update).toContain('href="/make/up1"');
    expect(update).toContain('>Preview change<');
  });
  it('a reply that is only a save offers "Keep inspiration"', () => {
    const out = html(createElement(KeepCard, { keep: { proposal: keepRec, busy: false, onKeep: () => undefined }, testIds: ids }));
    expect(out).toContain('data-kind="keep"');
    expect(out).toContain('Keep inspiration');
    expect(out).toContain('nothing added to your memory');
  });
});

describe('Why this? keeps the example profile apart (audit P1-04)', () => {
  it('labels example-profile facts as such and the person’s own facts as theirs', () => {
    const out = html(createElement(WhyThis, { reason: 'r', facts: [fact('f1', 'Street photography on weekend walks'), fact('f2', 'Learning guitar')], captures: [], exampleFactIds: new Set(['f1']) }));
    expect(out).toContain('From the example profile');
    expect(out).toContain('From your memory');
    expect(out.indexOf('From the example profile')).toBeLessThan(out.indexOf('Street photography'));
  });
});

describe('Playground cards', () => {
  const span = { lg: 4, md: 2, sm: 2 };
  it('one relevance sentence, a "Preview" pill named for the app, and "Why this?"', () => {
    const out = html(createElement(PlayCard, { proposal: rec({ captureId: null, sourceCaptureIds: [] }), feature: true, span, testIds: { card: 'pg-card', action: 'pg-action', why: 'pg-why', dismiss: 'pg-dismiss' } }));
    expect(out).toContain('data-testid="pg-card"');
    expect(out).toContain('data-lg="4"');
    expect(out).toContain('Real photos in a contact sheet make noticing light a habit you can see.');
    // The person's own words stay behind "Why this?", not in the card's sentence.
    expect(/<p class="opc-line">[^<]*<\/p>/.exec(out)?.[0] ?? '').not.toContain('You said');
    expect(link(out, 'pg-action')).toContain('>Preview Light<');
    expect(out).toContain('data-testid="pg-why"');
    // A long name stays out of the pill and in its accessible name.
    const long = html(createElement(PlayCard, { proposal: rec({ captureId: null, sourceCaptureIds: [], title: 'Side Project Milestones' }), feature: false, span, testIds: { card: 'pg-card', action: 'pg-action' } }));
    expect(link(long, 'pg-action')).toContain('aria-label="Preview: Side Project Milestones"');
    expect(link(long, 'pg-action')).toContain('>Preview<');
  });
  it('an idea grounded only in the example profile says so on the card', () => {
    const out = html(createElement(PlayCard, { proposal: rec({ captureId: null, sourceCaptureIds: [], evidenceFactIds: ['f1'] }), feature: false, span, facts: [fact('f1', 'Street photography')], exampleFactIds: new Set(['f1']), testIds: { card: 'pg-card', action: 'pg-action' } }));
    expect(out).toContain('Example profile');
  });
  it('"Something unexpected" opens a real exploration, else a starter; "Make something new" opens the composer', () => {
    expect(html(createElement(UnexpectedCard, { proposal: rec({ id: 'ex9', kind: 'explore', title: 'A twenty-minute light walk' }), span }))).toContain('href="/make/ex9"');
    expect(html(createElement(UnexpectedCard, { proposal: null, span }))).toContain('href="/agent?start=try"');
    expect(html(createElement(MakeNewCard, { span }))).toContain('href="/agent?start=new"');
  });
  it('while "Update app ideas" replaces an idea, it stays readable but opens nothing that is about to go', () => {
    const out = html(createElement(PlayCard, { proposal: rec({ captureId: null, sourceCaptureIds: [] }), feature: false, span, replacing: true, onDismiss: () => undefined, testIds: { card: 'pg-card', action: 'pg-action', dismiss: 'pg-dismiss' } }));
    expect(out).not.toContain('href="/make/rec1"');
    const action = /<span[^>]*data-testid="pg-action"[^>]*>/.exec(out)?.[0] ?? '';
    expect(action).toContain('aria-disabled="true"');
    expect(action).toContain('aria-label="Preview Light, back when the new ideas are ready"');
    expect(out).toMatch(/<button[^>]*disabled=""[^>]*data-testid="pg-dismiss"/);
    expect(out).toContain('Real photos in a contact sheet');
    const surprise = html(createElement(UnexpectedCard, { proposal: rec({ id: 'ex9', kind: 'explore', title: 'A twenty-minute light walk' }), span, replacing: true }));
    expect(surprise).not.toContain('href="/make/ex9"');
    expect(surprise).toContain('aria-disabled="true"');
  });
});
