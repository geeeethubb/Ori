/**
 * Links are never fetched by this server. Only allowlisted oEmbed providers are asked for a public
 * title; everything else is saved as "not_read" with a plain-words note. These tests never touch
 * the allowlisted path, so they make no network calls.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { describeLinkSource, lookupLink, parseHttpUrl } from '../../server/services/linkMeta.ts';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('parseHttpUrl', () => {
  it('accepts http and https web addresses, trimming whitespace', () => {
    expect(parseHttpUrl('https://example.org/riffs/1')?.href).toBe('https://example.org/riffs/1');
    expect(parseHttpUrl('http://example.org')?.protocol).toBe('http:');
    expect(parseHttpUrl('  https://www.instagram.com/p/abc/  ')?.hostname).toBe('www.instagram.com');
    expect(parseHttpUrl('HTTPS://Example.org/A')?.hostname).toBe('example.org');
  });

  it('refuses every other scheme and anything that is not a public web host', () => {
    for (const raw of ['javascript:alert(1)', 'ftp://example.org/file.mp3', 'mailto:someone@example.org', 'file:///etc/passwd', 'data:text/html,hi', 'not a link', '', 'example.org/no-scheme', 'https://localhost/private', 'https://intranet']) {
      expect(parseHttpUrl(raw), raw).toBeNull();
    }
  });
});

describe('describeLinkSource', () => {
  it('names known providers and unsupported networks, and falls back to the host', () => {
    const label = (raw: string) => describeLinkSource(parseHttpUrl(raw)!);
    expect(label('https://www.youtube.com/watch?v=abc')).toBe('YouTube link');
    expect(label('https://youtu.be/abc')).toBe('YouTube link');
    expect(label('https://open.spotify.com/track/abc')).toBe('Spotify link');
    expect(label('https://www.instagram.com/p/abc/')).toBe('Instagram link');
    expect(label('https://x.com/someone/status/1')).toBe('X link');
    expect(label('https://www.tiktok.com/@a/video/1')).toBe('TikTok link');
    expect(label('https://www.example.org/articles/light')).toBe('Link to example.org');
    expect(label('https://blog.example.org/post')).toBe('Link to blog.example.org');
    // Look-alike hosts are not providers.
    expect(label('https://notyoutube.com/watch')).toBe('Link to notyoutube.com');
    expect(label('https://youtube.com.example.org/')).toBe('Link to youtube.com.example.org');
  });
});

describe('lookupLink for hosts outside the allowlist', () => {
  it('saves the link as not_read and never calls the network', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const generic = await lookupLink(parseHttpUrl('https://example.org/articles/light')!);
    expect(generic).toEqual({ meta: null, readStatus: 'not_read', note: expect.stringMatching(/without reading the page/i) });
    const insta = await lookupLink(parseHttpUrl('https://www.instagram.com/p/abc/')!);
    expect(insta.meta).toBeNull();
    expect(insta.readStatus).toBe('not_read');
    expect(insta.note).toMatch(/^Instagram /);
    expect(insta.note).toMatch(/saved as a link/i);
    const tiktok = await lookupLink(parseHttpUrl('https://www.tiktok.com/@a/video/1')!);
    expect(tiktok.readStatus).toBe('not_read');
    expect(tiktok.note).toMatch(/^TikTok /);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('never claims to have read anything: no title, author or thumbnail is invented', async () => {
    const result = await lookupLink(parseHttpUrl('https://threads.net/@someone/post/1')!);
    expect(result.meta).toBeNull();
    expect(result.readStatus).not.toBe('read');
    expect(result.readStatus).not.toBe('metadata_only');
    expect(result.note.length).toBeGreaterThan(20);
  });
});
