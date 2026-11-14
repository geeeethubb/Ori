/**
 * Small helpers for the personal-app runtime: storage keys, the offline cache, usage events,
 * platform detection, time formatting and two tiny hooks. No components live here.
 */
import { useEffect, useState, type KeyboardEvent, type MouseEvent } from 'react';
import type { AppDetailDto } from '@shared/api.ts';
import type { Purpose } from '@shared/appSpec.ts';
import type { AppRecord } from '@shared/records.ts';
import { isIconColor, isIconSymbol, type AppIconSpec } from '@shared/icons.ts';
import { api } from '../api.ts';

/** Event types the client is allowed to post; the rest are derived on the server. */
export type ClientEventType = 'app_opened' | 'install_guide_viewed' | 'shortcut_requested' | 'feedback_given' | 'revision_declined' | 'first_action_completed';

export interface CachedApp {
  detail: AppDetailDto;
  records: AppRecord[];
  savedAt: string;
  /** Owner at the time of caching, so a different signed-in account never sees it. */
  userId?: string;
}

// ---------- storage ----------

export const cacheKey = (appId: string): string => `aas_cache_${appId}`;
/** Drafts of new records are kept per view when the app has several kinds of record. */
export const draftKey = (appId: string, recordId?: string, viewId?: string): string => `aas_draft_${appId}_${recordId ?? 'new'}${!recordId && viewId ? `_${viewId}` : ''}`;
export const viewKey = (appId: string): string => `aas_view_${appId}`;
export const firstActionKey = (appId: string): string => `aas_first_action_${appId}`;

export function readJson<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage may be full or blocked; the server copy is the source of truth */
  }
}

export function removeKey(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function readCache(appId: string): CachedApp | null {
  const c = readJson<Partial<CachedApp>>(cacheKey(appId));
  if (!c || !c.detail || !c.detail.spec || !Array.isArray(c.records) || typeof c.savedAt !== 'string') return null;
  return c as CachedApp;
}

export function writeCache(appId: string, cache: CachedApp): void {
  writeJson(cacheKey(appId), cache);
}

export function clearCache(appId: string): void {
  removeKey(cacheKey(appId));
}

// ---------- events & paths ----------

/** Fire-and-forget usage event. Failures are ignored on purpose. */
export function postEvent(appId: string, type: ClientEventType, meta?: Record<string, unknown>): void {
  void api<{ ok: boolean }>(`/api/apps/${appId}/events`, { method: 'POST', body: meta ? { type, meta } : { type } }).catch(() => undefined);
}

/**
 * The first real action in an app (a saved session, an added photo, a completed next action) is
 * reported once per device; later actions are derived on the server from the records themselves.
 */
export function markFirstAction(appId: string, meta?: Record<string, unknown>): void {
  if (!appId || appId === 'preview') return;
  if (readJson<boolean>(firstActionKey(appId))) return;
  writeJson(firstActionKey(appId), true);
  postEvent(appId, 'first_action_completed', meta);
}

/** Copy text to the clipboard; resolves false when neither the async API nor execCommand worked. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/** The understated way back to the collection, without the full parent navigation. */
export const COLLECTION_LABEL = 'Your apps';

export const appHomePath = (appId: string): string => `/apps/${appId}/`;
export const appSettingsPath = (appId: string): string => `/apps/${appId}/settings`;
export const appAbsoluteUrl = (appId: string): string => `${window.location.origin}${appHomePath(appId)}`;

/** Install metadata the server injected for this URL, when it is for this very app. */
export function bootTarget(appId: string | null): { appId: string; name: string; icon: AppIconSpec } | null {
  const boot = window.__AAS_BOOT__;
  if (!appId || !boot || boot.appId !== appId) return null;
  return {
    appId,
    name: boot.name,
    icon: {
      symbol: isIconSymbol(boot.icon?.symbol) ? boot.icon.symbol : 'compass',
      color: isIconColor(boot.icon?.color) ? boot.icon.color : 'blue',
    },
  };
}

// ---------- copy helpers ----------

export function purposeLabel(purpose: Purpose): string {
  return purpose === 'work' ? 'Get things done' : 'Explore life';
}

export function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

// ---------- platform ----------

export function isStandalone(): boolean {
  try {
    if (window.matchMedia('(display-mode: standalone)').matches) return true;
    return (navigator as Navigator & { standalone?: boolean }).standalone === true;
  } catch {
    return false;
  }
}

/** True inside an installed (home-screen) web app; updates if the display mode changes. */
export function useStandalone(): boolean {
  return useMediaQuery('(display-mode: standalone)', isStandalone);
}

export function useMediaQuery(query: string, initial?: () => boolean): boolean {
  const [matches, setMatches] = useState<boolean>(() => {
    try {
      return initial ? initial() : window.matchMedia(query).matches;
    } catch {
      return false;
    }
  });
  useEffect(() => {
    let mq: MediaQueryList;
    try {
      mq = window.matchMedia(query);
    } catch {
      return;
    }
    const update = () => setMatches(initial ? initial() : mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
    // `initial` is a stable module-level function when given.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);
  return matches;
}

export type Platform = 'ios' | 'android' | 'desktop';

export function detectPlatform(ua: string = navigator.userAgent): Platform {
  const w = window as Window & { MSStream?: unknown };
  const iosUa = /iPhone|iPad|iPod/i.test(ua);
  // iPadOS reports a Mac user agent but has a touch screen.
  const iPadDesktopUa = /Macintosh/i.test(ua) && (navigator.maxTouchPoints ?? 0) > 1;
  if ((iosUa || iPadDesktopUa) && !w.MSStream) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
}

// ---------- time ----------

/** "just now", "4 min ago", "yesterday", "Nov 3". */
export function timeAgo(iso: string, now: Date = new Date()): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const sec = Math.max(0, Math.round((now.getTime() - t) / 1000));
  if (sec < 45) return 'just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return hr === 1 ? '1 hour ago' : `${hr} hours ago`;
  const day = Math.round(hr / 24);
  if (day === 1) return 'yesterday';
  if (day < 7) return `${day} days ago`;
  const d = new Date(t);
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}

/** "today at 2:32 PM" or "Nov 12 at 9:10 AM" for the offline banner. */
export function formatSavedAt(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'earlier';
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return `today at ${time}`;
  return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} at ${time}`;
}

// ---------- misc ----------

/** Props that let a card behave like a button (tap, Enter, Space) without being one. */
export function pressable(onActivate: (() => void) | undefined): Record<string, unknown> {
  if (!onActivate) return {};
  return {
    role: 'button',
    tabIndex: 0,
    onClick: (e: MouseEvent) => {
      e.stopPropagation();
      onActivate();
    },
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onActivate();
      }
    },
  };
}

/** JSON with sorted object keys, so two value maps compare regardless of key order. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function sameValues(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  return stableStringify(a) === stableStringify(b);
}
