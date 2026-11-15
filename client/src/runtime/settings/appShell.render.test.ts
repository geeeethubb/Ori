/**
 * The app's own header, rendered without a DOM: icon and name, the headline (its tagline), an
 * accessible "Edit <App> with Ori" control only where the app can change, a "..." menu, and never the
 * parent Agent / Playground / My apps navigation. Plus the one-time launch parameters.
 */
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { AppSpecSchema, designFor, capabilitiesOf, type AppSpec } from '@shared/appSpec.ts';
import type { AppDetailDto } from '@shared/api.ts';
import type { AppRecord } from '@shared/records.ts';
import { FIXTURES } from '../../../../server/fixtures/specs.ts';
import { AppHome, readLaunchParams } from '../AppHome.tsx';
import type { RecordActions } from '../useAppData.ts';

const detailFor = (spec: AppSpec, isSample = false): AppDetailDto => {
  const now = '2026-11-14T10:00:00.000Z';
  return {
    app: {
      id: 'app_00000001', name: spec.name, tagline: spec.tagline, icon: spec.icon, purpose: spec.purpose, pattern: spec.pattern,
      design: designFor(spec), capabilities: capabilitiesOf(spec), currentVersion: 1, pinned: false, archivedAt: null,
      createdAt: now, updatedAt: now, lastOpenedAt: null, recordCount: 0, launchPath: '/apps/app_00000001/', isSample,
    },
    spec,
    version: 1,
    canUndo: false,
  };
};

const actions = {} as unknown as RecordActions;
const onDetail = () => undefined;

function render(key: string, opts: { live?: boolean; preview?: boolean; isSample?: boolean; records?: AppRecord[] } = {}): string {
  const spec = AppSpecSchema.parse(FIXTURES[key]);
  const live = opts.live ?? true;
  return renderToString(
    createElement(
      MemoryRouter,
      null,
      createElement(AppHome, {
        appId: 'app_00000001',
        detail: detailFor(spec, opts.isSample),
        records: opts.records ?? [],
        actions: live ? actions : undefined,
        onDetail: live ? onDetail : undefined,
        preview: opts.preview,
      }),
    ),
  );
}

describe('the app header', () => {
  for (const key of ['light-gallery', 'riff-practice', 'people-queue']) {
    it(`${key}: name, headline, Edit with Ori and a menu, without the parent navigation`, () => {
      const spec = AppSpecSchema.parse(FIXTURES[key]);
      const html = render(key);
      expect(html).toContain(`<h1 class="rt-head-name">${spec.name}</h1>`);
      if (spec.tagline) expect(html).toContain(`<p class="rt-headline">${spec.tagline}</p>`);
      expect(html).toContain(`aria-label="Edit ${spec.name} with Ori"`);
      expect(html).toContain('Edit with Ori');
      expect(html).toContain(`aria-label="More for ${spec.name}"`);
      expect(html).toContain('aria-haspopup="menu"');
      // Standalone apps never carry the parent navigation.
      for (const parent of ['Playground', 'href="/agent"']) expect(html).not.toContain(parent);
    });
  }

  it('offers no Edit with Ori on the read-only offline copy, but keeps the menu', () => {
    const html = render('light-gallery', { live: false });
    expect(html).not.toContain('Edit Light with Ori');
    expect(html).toContain('More for Light');
  });

  it('shows neither control in a preview, and labels an example app', () => {
    const preview = render('light-gallery', { preview: true, live: false });
    expect(preview).not.toContain('Edit Light with Ori');
    expect(preview).not.toContain('More for Light');
    expect(render('light-gallery', { isSample: true })).toContain('data-testid="rt-sample-tag"');
  });

  it('names the app with an h2 inside a preview, where the page owns the only h1 (audit P2-02)', () => {
    const preview = render('light-gallery', { preview: true, live: false });
    expect(preview).toContain('<h2 class="rt-head-name">Light</h2>');
    expect(preview).not.toContain('<h1');
  });
});

describe('the app body', () => {
  it('says a gallery’s weekly prompt once: as the gallery’s own chip, not also as the page’s prompt card', () => {
    const photo: AppRecord = { id: 'rec_00000001', appId: 'app_00000001', values: { date: '2026-11-13', photo: 'media_000001', caption: 'Waited for the light.' }, createdAt: '2026-11-13T18:00:00.000Z', updatedAt: '2026-11-13T18:00:00.000Z' };
    for (const records of [[], [photo]]) {
      const html = render('light-gallery', { records });
      expect(html).toContain('data-testid="rt-gallery-prompt"');
      expect(html).not.toContain('data-testid="rt-prompt-card"');
    }
  });

  it('switches views with a light row of labels, not a second pill', () => {
    const html = render('people-queue');
    expect(html).toContain('class="rt-tabs rt-view-tabs" role="tablist"');
    expect(html).not.toContain('class="tabs rt-tabs"');
    expect(html).toContain('data-testid="rt-view-tab-queue"');
  });

  it('lists the saved sources to practise with under Riff’s timer, and its prompt after them', () => {
    const source: AppRecord = { id: 'rec_00000002', appId: 'app_00000001', values: { kind: 'source', url: 'https://example.com/fingerpicked-riff', title: 'Fingerpicked riff (example)' }, createdAt: '2026-11-13T18:00:00.000Z', updatedAt: '2026-11-13T18:00:00.000Z' };
    const html = render('riff-practice', { records: [source] });
    expect(html).toContain('data-testid="rt-practice-sources"');
    expect(html).toContain('Fingerpicked riff (example)');
    // The timer leads (reference A): the rotating prompt sits inside the practice room, after the sources.
    const timer = html.indexOf('data-testid="rt-practice"');
    const sources = html.indexOf('data-testid="rt-practice-sources"');
    const prompt = html.indexOf('data-testid="rt-prompt-card"');
    expect(timer).toBeGreaterThan(-1);
    expect(prompt).toBeGreaterThan(sources);
    expect(html.match(/data-testid="rt-prompt-card"/g)?.length).toBe(1);
  });
});

describe('launch parameters', () => {
  it('reads ?edit=1 and ?install=1 and nothing else', () => {
    expect(readLaunchParams('?edit=1')).toEqual({ edit: true, install: false });
    expect(readLaunchParams('?install=1&from=rec_1')).toEqual({ edit: false, install: true });
    expect(readLaunchParams('?edit=0&install=yes')).toEqual({ edit: false, install: false });
    expect(readLaunchParams('')).toEqual({ edit: false, install: false });
  });
});
