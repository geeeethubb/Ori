/**
 * Read-only preview of an app that does not exist yet, rendered with the REAL runtime renderer and
 * clearly labelled example records. Used by the Make-mine page before "Make mine".
 * Foundation version: wraps AppHome; the runtime pass gives it the per-app theme and renderers.
 */
import { designFor, capabilitiesOf, type AppSpec } from '@shared/appSpec.ts';
import type { AppDetailDto } from '@shared/api.ts';
import type { AppRecord } from '@shared/records.ts';
import { AppHome } from './AppHome.tsx';
import './runtime.css';

export interface AppPreviewProps {
  spec: AppSpec;
  records: AppRecord[];
  /** Banner text; defaults to "Example content". */
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
  const design = designFor(spec);
  return (
    <div className="rt-root rt-root-preview" data-theme={design.theme} data-typography={design.typography} data-density={design.density} data-testid="make-preview">
      <div className="rt-preview-banner" data-testid="make-preview-example-banner" role="note">
        {label}
      </div>
      <AppHome appId="preview" detail={previewDetail(spec)} records={records} />
    </div>
  );
}
