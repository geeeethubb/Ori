/**
 * Link metadata through ALLOWLISTED oEmbed providers only. The user's URL is never fetched by this
 * server; it is passed as a parameter to a known provider endpoint that returns a public title,
 * author and thumbnail. Everything else is "not_read". This is the only outbound fetch the product
 * performs on the user's behalf, and it can be switched off with LINK_METADATA=off.
 */
import { config } from '../config.ts';
import type { LinkMeta, ReadStatus } from '../../shared/context.ts';

interface Provider {
  name: string;
  hosts: RegExp;
  endpoint: (url: string) => string;
}

const PROVIDERS: Provider[] = [
  { name: 'YouTube', hosts: /(^|\.)(youtube\.com|youtu\.be)$/i, endpoint: (u) => `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(u)}` },
  { name: 'Vimeo', hosts: /(^|\.)vimeo\.com$/i, endpoint: (u) => `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(u)}` },
  { name: 'SoundCloud', hosts: /(^|\.)soundcloud\.com$/i, endpoint: (u) => `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(u)}` },
  { name: 'Spotify', hosts: /(^|\.)spotify\.com$/i, endpoint: (u) => `https://open.spotify.com/oembed?url=${encodeURIComponent(u)}` },
];

const KNOWN_UNSUPPORTED: [RegExp, string][] = [
  [/(^|\.)instagram\.com$/i, 'Instagram'],
  [/(^|\.)tiktok\.com$/i, 'TikTok'],
  [/(^|\.)(x\.com|twitter\.com)$/i, 'X'],
  [/(^|\.)facebook\.com$/i, 'Facebook'],
  [/(^|\.)threads\.net$/i, 'Threads'],
  [/(^|\.)pinterest\.com$/i, 'Pinterest'],
];

export function parseHttpUrl(raw: string): URL | null {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (!u.hostname.includes('.')) return null;
    return u;
  } catch {
    return null;
  }
}

/** A short human label for where a link points ("YouTube link", "Instagram link", "Link to example.com"). */
export function describeLinkSource(url: URL): string {
  const host = url.hostname.replace(/^www\./, '');
  const provider = PROVIDERS.find((p) => p.hosts.test(url.hostname))?.name ?? KNOWN_UNSUPPORTED.find(([rx]) => rx.test(url.hostname))?.[1];
  return provider ? `${provider} link` : `Link to ${host}`;
}

export interface LinkLookup {
  meta: LinkMeta | null;
  readStatus: ReadStatus;
  /** Plain-words explanation shown to the user. */
  note: string;
}

export async function lookupLink(url: URL): Promise<LinkLookup> {
  const provider = PROVIDERS.find((p) => p.hosts.test(url.hostname));
  if (!provider) {
    const known = KNOWN_UNSUPPORTED.find(([rx]) => rx.test(url.hostname))?.[1];
    return {
      meta: null,
      readStatus: 'not_read',
      note: known
        ? `${known} does not let us read posts without signing in, so this link is saved as a link. Add a note, an excerpt or a screenshot and the agent will work from that.`
        : 'We save links without reading the page. Add a note or a screenshot so the agent knows what matters in it.',
    };
  }
  if (!config.linkMetadataEnabled) return { meta: null, readStatus: 'not_read', note: 'Link saved. Reading link titles is switched off on this server.' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(provider.endpoint(url.toString()), { signal: controller.signal, redirect: 'error', headers: { Accept: 'application/json' } });
    if (!res.ok) return { meta: null, readStatus: 'unavailable', note: `${provider.name} did not return details for this link (it may be private or removed). The link is saved.` };
    const text = await res.text();
    if (text.length > 100_000) return { meta: null, readStatus: 'unavailable', note: 'The provider sent an unexpected response. The link is saved.' };
    const data = JSON.parse(text) as { title?: unknown; author_name?: unknown; thumbnail_url?: unknown };
    const meta: LinkMeta = {
      provider: provider.name,
      title: typeof data.title === 'string' ? data.title.slice(0, 200) : undefined,
      author: typeof data.author_name === 'string' ? data.author_name.slice(0, 120) : undefined,
      thumbnailUrl: typeof data.thumbnail_url === 'string' && /^https:\/\//.test(data.thumbnail_url) ? data.thumbnail_url.slice(0, 500) : undefined,
    };
    return { meta, readStatus: 'metadata_only', note: `Read the public title from ${provider.name}; the content itself was not watched or listened to.` };
  } catch {
    return { meta: null, readStatus: 'unavailable', note: `${provider.name} could not be reached for details. The link is saved.` };
  } finally {
    clearTimeout(timer);
  }
}
