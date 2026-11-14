/**
 * Read-only preview of an app that does not exist yet, rendered with the REAL runtime renderers and
 * clearly labelled example records, wearing the app's own theme. Used by the Make-mine page before
 * "Make mine". Nothing can be saved or uploaded; the practice timer may run but cannot save.
 */
import { useMemo, type CSSProperties } from 'react';
import { designFor, capabilitiesOf, type AppSpec } from '@shared/appSpec.ts';
import type { AppDetailDto } from '@shared/api.ts';
import type { AppRecord } from '@shared/records.ts';
import { AppHome } from './AppHome.tsx';
import { resolveTheme } from './theme.ts';
import './runtime.css';

export interface AppPreviewProps {
  spec: AppSpec;
  records: AppRecord[];
  /** Banner text; defaults to "Example content, not saved". */
  label?: string;
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

export function AppPreview({ spec, records, label = 'Example content, not saved' }: AppPreviewProps) {
  const theme = useMemo(() => resolveTheme(spec), [spec]);
  const detail = useMemo(() => previewDetail(spec), [spec]);
  return (
    <div className="rt-root rt-root-preview" {...theme.attrs} style={theme.style as CSSProperties} data-testid="make-preview">
      <div className="rt-preview-banner" data-testid="make-preview-example-banner" role="note">
        <span data-testid="rt-preview-banner">{label}</span>
      </div>
      <AppHome appId="preview" detail={detail} records={records} preview />
    </div>
  );
}
