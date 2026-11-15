/**
 * Public presentation of an app for its install metadata (web manifest, theme-color, boot data):
 * the theme and accent of its current version's design. Like getAppPublicMeta it needs no owner,
 * because it exposes nothing but presentation. Read-only.
 */
import { getDb } from '../db/index.ts';
import { AppSpecSchema, designFor, type AppTheme } from '../../shared/appSpec.ts';
import type { IconColor } from '../../shared/icons.ts';

export interface AppPublicLook {
  theme: AppTheme;
  accent: IconColor;
}

/** The stored look of an app's current version (design defaults applied), or null if unknown. */
export function getAppPublicLook(appId: string): AppPublicLook | null {
  const r = getDb()
    .prepare('SELECT v.spec_json FROM apps a JOIN app_versions v ON v.app_id = a.id AND v.version = a.current_version WHERE a.id = ?')
    .get(appId) as { spec_json?: unknown } | undefined;
  if (!r?.spec_json) return null;
  try {
    const parsed = AppSpecSchema.safeParse(JSON.parse(String(r.spec_json)));
    if (!parsed.success) return null;
    const { theme, accent } = designFor(parsed.data);
    return { theme, accent };
  } catch {
    return null;
  }
}
