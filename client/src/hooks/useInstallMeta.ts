import { useEffect } from 'react';
import type { AppIconSpec } from '@shared/icons.ts';
import { ICON_GRADIENTS } from '@shared/icons.ts';

/**
 * Keep document title, manifest link, apple-touch-icon and theme color in sync for SPA
 * navigations. The server injects the same tags on a fresh request to /apps/{id}/, which is
 * what iOS reads at install time; this hook covers the dev server and in-app navigation.
 */
export function useInstallMeta(target: { appId: string | null; name: string; icon: AppIconSpec } | null, opts: { title?: boolean } = {}): void {
  const setTitle = opts.title ?? true;
  useEffect(() => {
    if (!target) return;
    const base = target.appId ? `/apps/${target.appId}/` : '/';
    if (setTitle) document.title = target.name;
    setLink('manifest', target.appId ? `${base}manifest.webmanifest` : '/manifest.webmanifest');
    setLink('apple-touch-icon', target.appId ? `${base}icon-180.png` : '/icons/store-180.png');
    setLink('icon', target.appId ? `${base}icon.svg` : '/icons/store.svg');
    setMeta('apple-mobile-web-app-title', target.name);
    setMeta('theme-color', ICON_GRADIENTS[target.icon.color]?.[1] ?? '#5E2E78');
  }, [target?.appId, target?.name, target?.icon.color, target?.icon.symbol, setTitle]);
}

function setLink(rel: string, href: string): void {
  let el = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement('link');
    el.rel = rel;
    document.head.appendChild(el);
  }
  if (el.getAttribute('href') !== href) el.setAttribute('href', href);
}

function setMeta(name: string, content: string): void {
  let el = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.name = name;
    document.head.appendChild(el);
  }
  if (el.content !== content) el.content = content;
}
