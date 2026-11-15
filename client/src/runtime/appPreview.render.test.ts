/**
 * AppPreview must render every pattern with the real renderers, read-only, wearing the app's own
 * identity. Rendered to a string (no DOM needed) so a broken renderer fails here, not on the Make page.
 */
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { AppSpecSchema } from '@shared/appSpec.ts';
import { FIXTURES } from '../../../server/fixtures/specs.ts';
import { previewRecords } from '../../../server/services/previewContent.ts';
import { AppPreview } from './AppPreview.tsx';
import { resolveTheme } from './theme.ts';

const RENDERER_IDS: Record<string, string> = {
  journal: 'rt-journal', board: 'rt-board', list: 'rt-list', summary: 'rt-summary',
  gallery: 'rt-gallery', practice: 'rt-practice', links: 'rt-links', queue: 'rt-queue',
};

describe('AppPreview', () => {
  for (const [key, input] of Object.entries(FIXTURES)) {
    it(`renders ${key} read-only with example records and its own theme`, () => {
      const spec = AppSpecSchema.parse(input);
      const records = previewRecords(spec);
      expect(records.length).toBeGreaterThan(0);
      const html = renderToString(createElement(AppPreview, { spec, records }));
      // The look the app shows (a reference app that still stores its legacy look shows its Ori one).
      const attrs = resolveTheme(spec).attrs;
      expect(html).toContain('data-testid="make-preview"');
      expect(html).toContain('data-testid="make-preview-example-banner"');
      expect(html).toContain('Example content');
      expect(html).toContain(`data-theme="${attrs['data-theme']}"`);
      expect(html).toContain(`data-typography="${attrs['data-typography']}"`);
      expect(html).toContain(`data-density="${attrs['data-density']}"`);
      // People wears its Ori identity, clean white with orange (spec section 6), whatever look it stores.
      if (spec.name === 'People') expect(html).toContain('data-theme="bright"');
      expect(html).toContain(`data-testid="${RENDERER_IDS[spec.views[0]!.type]}"`);
      expect(html).toContain(spec.name);
      // Read-only: no record actions, no settings link, no way to add.
      expect(html).not.toContain('rt-new-entry');
      expect(html).not.toContain('rt-add-photo');
      expect(html).not.toContain('rt-settings-link');
      expect(html).not.toContain('rt-record-form');
    });
  }

  it('shows example photographs through their public URLs and keeps the practice timer visible', () => {
    const light = AppSpecSchema.parse(FIXTURES['light-gallery']!);
    const lightHtml = renderToString(createElement(AppPreview, { spec: light, records: previewRecords(light) }));
    expect(lightHtml).toContain('/examples/light-1.jpg');
    expect(lightHtml).toContain('data-testid="rt-gallery-tile"');

    const riff = AppSpecSchema.parse(FIXTURES['riff-practice']!);
    const riffHtml = renderToString(createElement(AppPreview, { spec: riff, records: previewRecords(riff) }));
    expect(riffHtml).toContain('data-testid="rt-practice-time"');
    expect(riffHtml).toContain('15:00');
    expect(riffHtml).toContain('data-testid="rt-practice-preset-15"');
    expect(riffHtml).toContain('data-testid="rt-tempo-toggle"');
    expect(riffHtml).toContain('data-testid="rt-practice-save"');
    expect(riffHtml).toContain('disabled');
  });
});
