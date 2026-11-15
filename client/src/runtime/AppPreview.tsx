/**
 * Read-only preview of an app that does not exist yet, rendered with the REAL runtime renderers and
 * clearly labelled example records, wearing the app's own theme. Used by the Make-mine page before
 * "Make mine". Nothing can be saved or uploaded; the practice timer may run but cannot save, and is
 * never kept on the device.
 *
 * Embedded in a page, the app's own headings sit under that page's outline (audit P2-02): the app's
 * top heading is announced at `headingLevel` and the rest keep their relative order beneath it, so
 * the page keeps a single level-1 heading.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, type CSSProperties } from 'react';
import { designFor, capabilitiesOf, type AppSpec } from '@shared/appSpec.ts';
import type { AppDetailDto } from '@shared/api.ts';
import type { AppRecord } from '@shared/records.ts';
import { AppHome } from './AppHome.tsx';
import { forgetPreviewTimers } from './practiceTimer.ts';
import { resolveTheme } from './theme.ts';
import './runtime.css';

export interface AppPreviewProps {
  spec: AppSpec;
  records: AppRecord[];
  /** Banner text; defaults to "Example content, not saved". */
  label?: string;
  /** Outline level of the app's own top heading inside the page (default 3: under the page's h1 and the section's h2). */
  headingLevel?: number;
}

const HEADINGS = 'h1, h2, h3, h4, h5, h6';

/**
 * Announce the preview's headings at `top` and below, keeping their order: the highest heading the app
 * renders becomes `top`, the next one `top + 1`, and so on (capped at 6). Re-applied when the app shows
 * another view.
 */
export function nestHeadings(root: ParentNode, top: number): void {
  const headings = [...root.querySelectorAll<HTMLElement>(HEADINGS)];
  const own = (h: HTMLElement) => Number(h.tagName.slice(1));
  const highest = Math.min(...headings.map(own));
  for (const h of headings) {
    const level = Math.min(6, Math.max(1, top + own(h) - highest));
    if (h.getAttribute('aria-level') !== String(level)) h.setAttribute('aria-level', String(level));
  }
}

export function previewDetail(spec: AppSpec): AppDetailDto {
  const now = new Date().toISOString();
  return {
    app: {
      id: 'preview',
      name: spec.name,
      tagline: spec.tagline,
      icon: spec.icon,
      purpose: spec.purpose,
      pattern: spec.pattern,
      design: designFor(spec),
      capabilities: capabilitiesOf(spec),
      currentVersion: 1,
      pinned: false,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: null,
      recordCount: 0,
      launchPath: '/apps/preview/',
      isSample: false,
    },
    spec,
    version: 1,
    canUndo: false,
  };
}

export function AppPreview({ spec, records, label = 'Example content, not saved', headingLevel = 3 }: AppPreviewProps) {
  const theme = useMemo(() => resolveTheme(spec), [spec]);
  const detail = useMemo(() => previewDetail(spec), [spec]);
  const rootRef = useRef<HTMLDivElement>(null);
  // A timer tried here is forgotten when the preview closes or shows another design.
  useEffect(() => () => forgetPreviewTimers(), [spec]);
  // The app renders its name as its own page heading; inside this page it is a section of it.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || typeof MutationObserver === 'undefined') return;
    const apply = () => nestHeadings(root, headingLevel);
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [headingLevel]);
  return (
    <div ref={rootRef} className="rt-root rt-root-preview" {...theme.attrs} style={theme.style as CSSProperties} data-testid="make-preview">
      <div className="rt-preview-banner" data-testid="make-preview-example-banner" role="note">
        <span data-testid="rt-preview-banner">{label}</span>
      </div>
      <AppHome appId="preview" detail={detail} records={records} preview />
    </div>
  );
}
