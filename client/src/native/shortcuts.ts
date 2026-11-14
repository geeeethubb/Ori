/**
 * Android shell bridge. In the browser every function is a harmless no-op so the same bundle
 * runs on the web, in the installed iOS web app and inside the Capacitor APK.
 *
 * Native side: android/app/src/main/java/com/aiappstore/runtime/AppShortcutsPlugin.java
 */
import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { APP_ID_PATTERN } from '@shared/ids.ts';
import { apiBase } from '../api.ts';

export interface PinShortcutOptions {
  appId: string;
  label: string;
  /** Absolute URL of a square PNG (192px or larger). */
  iconUrl: string;
}

export interface PinShortcutResult {
  /** True when the launcher accepted the request. The user still confirms in the launcher UI. */
  requested: boolean;
  supported: boolean;
  message?: string;
}

interface AppShortcutsPlugin {
  isSupported(): Promise<{ supported: boolean }>;
  pin(options: PinShortcutOptions & { iconBase64?: string }): Promise<PinShortcutResult>;
  /** The app ID the shell was launched with (cold start), if any. Cleared after reading. */
  getLaunchAppId(): Promise<{ appId: string | null }>;
  addListener(eventName: 'appLaunch', listener: (event: { appId: string }) => void): Promise<PluginListenerHandle>;
}

const plugin = registerPlugin<AppShortcutsPlugin>('AppShortcuts');

export function isNativeShell(): boolean {
  return Capacitor.isNativePlatform();
}

export async function shortcutsSupported(): Promise<boolean> {
  if (!isNativeShell()) return false;
  try {
    return (await plugin.isSupported()).supported;
  } catch {
    return false;
  }
}

/** Ask the launcher to pin a shortcut that opens this personal app directly. */
export async function pinAppShortcut(opts: PinShortcutOptions): Promise<PinShortcutResult> {
  if (!isNativeShell()) return { requested: false, supported: false, message: 'Shortcuts are available in the Android app.' };
  if (!APP_ID_PATTERN.test(opts.appId)) return { requested: false, supported: true, message: 'Invalid app id.' };
  let iconBase64: string | undefined;
  // Inside the shell the page origin is the local bundle; icons live on the API server. Android's
  // adaptive mask wants the full-bleed (maskable) variant.
  const iconPath = new URL(opts.iconUrl, window.location.origin).pathname.replace(/icon-(\d+)\.png$/, 'icon-$1-maskable.png');
  const absoluteIconUrl = `${apiBase() || window.location.origin}${iconPath}`;
  try {
    const res = await fetch(absoluteIconUrl);
    if (res.ok) {
      const buf = new Uint8Array(await res.arrayBuffer());
      let bin = '';
      for (const b of buf) bin += String.fromCharCode(b);
      iconBase64 = btoa(bin);
    }
  } catch {
    // Icon is optional; the native side falls back to the launcher icon.
  }
  // The native side downloads iconUrl itself when no base64 arrived (no WebView/CORS dependency).
  return plugin.pin({ ...opts, iconUrl: absoluteIconUrl, label: opts.label.slice(0, 25), iconBase64 });
}

/**
 * Resolve the app ID a shortcut launched us with (cold start) and subscribe to warm launches.
 * `navigate` receives a validated internal route only.
 */
export async function wireShortcutLaunches(navigate: (path: string) => void): Promise<() => void> {
  if (!isNativeShell()) return () => undefined;
  const go = (appId: string | null | undefined) => {
    if (appId && APP_ID_PATTERN.test(appId)) navigate(`/apps/${appId}/`);
  };
  try {
    go((await plugin.getLaunchAppId()).appId);
  } catch {
    // Plugin missing (older build): ignore.
  }
  let handle: PluginListenerHandle | null = null;
  try {
    handle = await plugin.addListener('appLaunch', (e) => go(e.appId));
  } catch {
    handle = null;
  }
  return () => {
    void handle?.remove();
  };
}

// Legacy global used by the runtime settings page's optional bridge call.
declare global {
  interface Window {
    AppShortcuts?: { pin: (opts: PinShortcutOptions) => Promise<PinShortcutResult> };
  }
}
if (typeof window !== 'undefined') {
  window.AppShortcuts = { pin: pinAppShortcut };
}
