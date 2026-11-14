/**
 * Owner-scoped photo storage. Upload is multipart (field "file"); the real type is sniffed from the
 * bytes and the size is bounded. Serving requires the owner's session: media URLs are never public.
 */
import fs from 'node:fs';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import { requireAuth, type AuthEnv } from '../auth.ts';
import { config } from '../config.ts';
import { SHORT_ID_PATTERN } from '../../shared/ids.ts';
import * as media from '../repos/media.ts';

export const mediaRoutes = new Hono<AuthEnv>();
mediaRoutes.use('*', requireAuth);

const idParam = z.string().regex(SHORT_ID_PATTERN);
const MAX_MEDIA_PER_USER = 2000;

mediaRoutes.post(
  '/',
  bodyLimit({ maxSize: config.maxImageBytes + 256 * 1024, onError: (c) => c.json({ error: `That image is too large (max ${Math.round(config.maxImageBytes / 1024 / 1024)} MB).`, code: 'too_large' }, 413) }),
  async (c) => {
    const user = c.get('user');
    if (media.countMedia(user.id) >= MAX_MEDIA_PER_USER) return c.json({ error: 'Your photo library is full for this prototype. Delete some photos first.', code: 'invalid' }, 409);
    let body: Record<string, unknown>;
    try {
      body = await c.req.parseBody();
    } catch {
      return c.json({ error: 'Send the photo as multipart form data in a field called "file".', code: 'invalid' }, 400);
    }
    const file = body['file'];
    if (!(file instanceof File)) return c.json({ error: 'Choose a photo first.', code: 'invalid' }, 400);
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.byteLength === 0) return c.json({ error: 'That file is empty.', code: 'invalid' }, 400);
    const result = media.createMedia(user.id, bytes, file.type);
    if ('error' in result) return c.json({ error: result.error, code: 'unsupported_media' }, 415);
    return c.json({ media: result }, 201);
  },
);

mediaRoutes.get('/:id', (c) => {
  const id = idParam.safeParse(c.req.param('id'));
  if (!id.success) return c.json({ error: 'Photo not found.', code: 'not_found' }, 404);
  const found = media.readMediaFile(c.get('user').id, id.data);
  if (!found) return c.json({ error: 'Photo not found.', code: 'not_found' }, 404);
  const bytes = fs.readFileSync(found.path);
  return c.body(new Uint8Array(bytes), 200, {
    'Content-Type': found.media.mime,
    'Content-Length': String(bytes.byteLength),
    'Cache-Control': 'private, max-age=86400',
    'Content-Security-Policy': "default-src 'none'; img-src 'self'",
    'X-Content-Type-Options': 'nosniff',
  });
});

mediaRoutes.get('/:id/meta', (c) => {
  const id = idParam.safeParse(c.req.param('id'));
  if (!id.success) return c.json({ error: 'Photo not found.', code: 'not_found' }, 404);
  const item = media.getMedia(c.get('user').id, id.data);
  if (!item) return c.json({ error: 'Photo not found.', code: 'not_found' }, 404);
  return c.json({ media: item });
});

mediaRoutes.delete('/:id', (c) => {
  const id = idParam.safeParse(c.req.param('id'));
  if (!id.success) return c.json({ error: 'Photo not found.', code: 'not_found' }, 404);
  if (!media.deleteMedia(c.get('user').id, id.data)) return c.json({ error: 'Photo not found.', code: 'not_found' }, 404);
  return c.json({ ok: true });
});
