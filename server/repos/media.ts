/**
 * Owner-scoped media (photos). Files live under config.mediaDir as `<id>.<ext>`; the database row
 * is the index and the ownership check. Nothing here is ever served without an owner id.
 */
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.ts';
import { getDb, nowIso } from '../db/index.ts';
import { newId } from '../../shared/ids.ts';
import { IMAGE_MIMES, type MediaItem } from '../../shared/context.ts';

type R = Record<string, unknown>;

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

function rowToMedia(r: R): MediaItem {
  return {
    id: String(r.id),
    ownerId: String(r.owner_id),
    mime: String(r.mime),
    size: Number(r.size),
    width: r.width === null || r.width === undefined ? null : Number(r.width),
    height: r.height === null || r.height === undefined ? null : Number(r.height),
    createdAt: String(r.created_at),
  };
}

function mediaDir(): string {
  const dir = path.resolve(config.mediaDir);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Detect the real image type from magic bytes (the client's declared type is not trusted). */
export function sniffImageMime(bytes: Uint8Array): (typeof IMAGE_MIMES)[number] | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return 'image/gif';
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp';
  return null;
}

/** Pixel size for PNG and baseline/progressive JPEG; null for other formats (layout then uses a default ratio). */
export function imageDimensions(bytes: Uint8Array, mime: string): { width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  try {
    if (mime === 'image/png' && bytes.length >= 24) return { width: view.getUint32(16), height: view.getUint32(20) };
    if (mime === 'image/gif' && bytes.length >= 10) return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
    if (mime === 'image/jpeg') {
      let i = 2;
      while (i + 9 < bytes.length) {
        if (bytes[i] !== 0xff) { i++; continue; }
        const marker = bytes[i + 1] as number;
        if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
        const len = view.getUint16(i + 2);
        if ((marker >= 0xc0 && marker <= 0xcf) && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return { height: view.getUint16(i + 5), width: view.getUint16(i + 7) };
        }
        i += 2 + len;
      }
    }
  } catch {
    return null;
  }
  return null;
}

export function createMedia(ownerId: string, bytes: Uint8Array, declaredMime?: string): MediaItem | { error: string } {
  const mime = sniffImageMime(bytes);
  if (!mime) return { error: 'That file is not a JPEG, PNG, WebP or GIF image.' };
  if (declaredMime && declaredMime !== mime && (IMAGE_MIMES as readonly string[]).includes(declaredMime)) {
    // Declared type disagrees with the bytes; trust the bytes.
  }
  if (bytes.byteLength > config.maxImageBytes) return { error: `That image is too large (max ${Math.round(config.maxImageBytes / 1024 / 1024)} MB).` };
  const id = newId();
  const fileName = `${id}.${EXT[mime] ?? 'bin'}`;
  const dims = imageDimensions(bytes, mime);
  fs.writeFileSync(path.join(mediaDir(), fileName), bytes);
  getDb()
    .prepare('INSERT INTO media (id, owner_id, mime, size, width, height, file_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, ownerId, mime, bytes.byteLength, dims?.width ?? null, dims?.height ?? null, fileName, nowIso());
  return getMedia(ownerId, id) as MediaItem;
}

export function getMedia(ownerId: string, id: string): MediaItem | null {
  const r = getDb().prepare('SELECT * FROM media WHERE id = ? AND owner_id = ?').get(id, ownerId) as R | undefined;
  return r ? rowToMedia(r) : null;
}

/** Bytes of an owned media item, or null when it is not theirs / missing. */
export function readMediaFile(ownerId: string, id: string): { media: MediaItem; path: string } | null {
  const r = getDb().prepare('SELECT * FROM media WHERE id = ? AND owner_id = ?').get(id, ownerId) as R | undefined;
  if (!r) return null;
  const p = path.join(mediaDir(), path.basename(String(r.file_name)));
  if (!fs.existsSync(p)) return null;
  return { media: rowToMedia(r), path: p };
}

export function deleteMedia(ownerId: string, id: string): boolean {
  const r = getDb().prepare('SELECT file_name FROM media WHERE id = ? AND owner_id = ?').get(id, ownerId) as R | undefined;
  if (!r) return false;
  getDb().prepare('DELETE FROM media WHERE id = ? AND owner_id = ?').run(id, ownerId);
  try {
    fs.unlinkSync(path.join(mediaDir(), path.basename(String(r.file_name))));
  } catch {
    /* already gone */
  }
  return true;
}

/** Every media id in a list that belongs to the owner (used before saving image field values). */
export function ownedMediaIds(ownerId: string, ids: string[]): Set<string> {
  const out = new Set<string>();
  for (const id of ids) if (getMedia(ownerId, id)) out.add(id);
  return out;
}

export function countMedia(ownerId: string): number {
  return Number((getDb().prepare('SELECT COUNT(*) AS n FROM media WHERE owner_id = ?').get(ownerId) as { n: number }).n);
}
