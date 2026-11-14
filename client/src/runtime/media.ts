/**
 * Photos in personal apps. Record values hold media ids served owner-only by /api/media/:id, or
 * `example:<name>` values that point at the public CC0 example photographs used by previews.
 * On the web the session cookie travels with a plain <img src>; in the Android shell (bearer token)
 * the bytes are fetched with the Authorization header and shown through an object URL.
 */
import type { MediaItem } from '@shared/context.ts';
import { EXAMPLE_IMAGE_PREFIX } from '@shared/records.ts';
import { ApiError, apiBase, getToken, usesBearer } from '../api.ts';

export const MEDIA_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,image/*';

export function isExampleImage(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(EXAMPLE_IMAGE_PREFIX);
}

/** Public URL for an example image value (`example:light-1` → `/examples/light-1.jpg`). */
export function exampleImageUrl(value: string): string {
  const name = value.slice(EXAMPLE_IMAGE_PREFIX.length).replace(/[^a-z0-9-]/g, '');
  return `${apiBase()}/examples/${name}.jpg`;
}

/** URL of a stored photo for a plain <img>; only valid where the cookie travels (same origin). */
export function mediaUrl(id: string): string {
  return `${apiBase()}/api/media/${encodeURIComponent(id)}`;
}

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (usesBearer()) {
    headers['X-Client'] = 'native';
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

/** True when a direct <img src> works (cookie session, same origin). */
export function canUseDirectImageSrc(): boolean {
  return !usesBearer();
}

// Object URLs are cached per media id for the session; a small cap keeps memory bounded.
const objectUrls = new Map<string, Promise<string>>();
const MAX_CACHED = 80;

/** Fetch a stored photo with credentials and return an object URL (cached). */
export function fetchMediaObjectUrl(id: string): Promise<string> {
  const cached = objectUrls.get(id);
  if (cached) return cached;
  const p = (async () => {
    const res = await fetch(mediaUrl(id), { headers: authHeaders(), credentials: 'include' });
    if (!res.ok) throw new ApiError(res.status, 'Photo unavailable', res.status === 404 ? 'not_found' : 'error');
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  })();
  p.catch(() => objectUrls.delete(id));
  objectUrls.set(id, p);
  if (objectUrls.size > MAX_CACHED) {
    const oldest = objectUrls.keys().next().value;
    if (oldest !== undefined) {
      const old = objectUrls.get(oldest);
      objectUrls.delete(oldest);
      old?.then((u) => URL.revokeObjectURL(u)).catch(() => undefined);
    }
  }
  return p;
}

/** Upload one image file (multipart field `file`) and return the stored media item. */
export async function uploadMedia(file: File | Blob, filename = 'photo'): Promise<MediaItem> {
  const form = new FormData();
  form.append('file', file, file instanceof File ? file.name : filename);
  let res: Response;
  try {
    res = await fetch(`${apiBase()}/api/media`, { method: 'POST', body: form, headers: authHeaders(), credentials: 'include' });
  } catch {
    throw new ApiError(0, 'You appear to be offline. Try the upload again when you reconnect.', 'network');
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const body = (data ?? {}) as { error?: string; code?: string; details?: unknown };
    throw new ApiError(res.status, body.error ?? `Upload failed (${res.status})`, body.code ?? 'error', body.details);
  }
  const out = data as { media?: MediaItem };
  if (!out?.media?.id) throw new ApiError(500, 'The upload did not return a photo id.', 'server_error');
  return out.media;
}
