/**
 * Redesign API, end to end over HTTP in sample mode: captures (notes, links, screenshots) and their
 * honest read status, owner-scoped photos, photo records, proposals (detail → draft → Make mine →
 * keep), updating an existing app from the agent, and the owner boundary across all of it.
 * In-memory SQLite, no model calls, no network, no open port.
 *
 * Uploaded photos go to a throwaway directory: MEDIA_DIR is set BEFORE the server is imported
 * (config reads env at import time; makeClient imports lazily), so nothing lands in data/media.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeClient, uniqueEmail, type RequestOptions, type Session, type TestClient } from '../helpers/testServer.ts';
import { AppSpecSchema, recordMatchesView, type AppSpec } from '../../shared/appSpec.ts';
import { EXAMPLE_IMAGE_PREFIX, type AppRecord } from '../../shared/records.ts';
import { SHORT_ID_PATTERN } from '../../shared/ids.ts';
import type {
  AgentThreadDto, AgentThreadItemDto, AppDetailDto, AppSummaryDto, CaptureResultDto, MediaUploadDto, ProposalDetailDto, ProposalPreviewDto, RecommendationsDto, RevisionPreviewDto,
} from '../../shared/api.ts';
import type { MediaItem, Recommendation } from '../../shared/context.ts';

const mediaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aas-media-'));
process.env.MEDIA_DIR = mediaDir;

const client: TestClient = await makeClient();

afterAll(() => {
  try {
    fs.rmSync(mediaDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch {
    // Best effort: the OS temp folder is cleaned eventually.
  }
});

interface ErrorBody {
  error: string;
  code?: string;
  details?: unknown;
}
/** The capture route adds a plain-words note about the link on top of the DTO. */
type CaptureResult = CaptureResultDto & { linkNote?: string };
type ApplyResponse = AppDetailDto & { changes: string[] };

const LIGHT_1 = fs.readFileSync(fileURLToPath(new URL('../../server/fixtures/media/light-1.jpg', import.meta.url)));
const GUITAR_NOTE = 'I like this sound and have 15 minutes to practice';

function photoFile(name = 'light-1.jpg', bytes: Uint8Array<ArrayBuffer> = new Uint8Array(LIGHT_1)): File {
  return new File([bytes], name, { type: 'image/jpeg' });
}

/** Multipart upload through the real route (the JSON helper cannot send a FormData body). */
async function upload(token: string, file: File | null): Promise<{ status: number; json: MediaUploadDto & ErrorBody }> {
  const fd = new FormData();
  if (file) fd.append('file', file);
  const res = await client.app.request(new Request('http://local/api/media', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd }));
  const text = await res.text();
  return { status: res.status, json: (text ? JSON.parse(text) : null) as MediaUploadDto & ErrorBody };
}

async function uploadPhoto(token: string): Promise<MediaItem> {
  const res = await upload(token, photoFile());
  if (res.status !== 201) throw new Error(`upload failed: ${res.status} ${JSON.stringify(res.json)}`);
  return res.json.media;
}

/** Raw bytes of a media item as the given user sees them. */
async function fetchMedia(token: string | null, id: string): Promise<{ status: number; type: string | null; bytes: Uint8Array }> {
  const res = await client.app.request(new Request(`http://local/api/media/${id}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} }));
  return { status: res.status, type: res.headers.get('content-type'), bytes: new Uint8Array(await res.arrayBuffer()) };
}

function share(token: string, body: Record<string, unknown>) {
  return client.request<CaptureResult & ErrorBody>('/api/agent/captures', { body, token });
}

async function shareOk(token: string, body: Record<string, unknown>): Promise<CaptureResult> {
  const res = await share(token, body);
  if (res.status !== 201) throw new Error(`capture failed: ${res.status} ${res.text}`);
  return res.json;
}

async function fixtureApp(token: string, fixture: string, name?: string): Promise<AppDetailDto> {
  const res = await client.request<AppDetailDto>('/api/apps/from-fixture', { body: { fixture, ...(name ? { name } : {}) }, token });
  if (res.status !== 201) throw new Error(`from-fixture failed: ${res.status} ${res.text}`);
  return res.json;
}

async function overview(token: string): Promise<Recommendation[]> {
  const res = await client.request<RecommendationsDto>('/api/recommendations', { token });
  if (res.status !== 200) throw new Error(`recommendations failed: ${res.status} ${res.text}`);
  return res.json.recommendations;
}

function proposalOfKind(result: CaptureResult, kind: Recommendation['kind']): Recommendation {
  const found = result.reply?.proposals.find((p) => p.kind === kind);
  if (!found) throw new Error(`no ${kind} proposal in reply: ${JSON.stringify(result.reply?.proposals.map((p) => [p.kind, p.title]))}`);
  return found;
}

const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 5));

describe('sharing a note with the agent', () => {
  let me: Session;
  let result: CaptureResult;

  beforeAll(async () => {
    me = await client.signup(uniqueEmail('note'));
    result = await shareOk(me.token, { text: GUITAR_NOTE });
  });

  it('saves the note as read and answers with one to four proposals that all cite it', () => {
    expect(result.capture).toMatchObject({ kind: 'note', text: GUITAR_NOTE, url: null, mediaId: null, readStatus: 'read', sourceLabel: 'Typed note', isExample: false });
    expect(result.capture.id).toMatch(SHORT_ID_PATTERN);
    expect(result.media).toBeNull();
    expect(result.error).toBeUndefined();
    expect(result.linkNote).toBeUndefined();
    const reply = result.reply;
    expect(reply).not.toBeNull();
    expect(reply?.generatedBy).toBe('sample');
    expect(reply?.message).toContain('15 minutes to practice'); // acknowledges exactly what was received
    expect(reply?.proposals.length).toBeGreaterThanOrEqual(1);
    expect(reply?.proposals.length).toBeLessThanOrEqual(4);
    for (const p of reply?.proposals ?? []) {
      expect(p.sourceCaptureIds).toContain(result.capture.id);
      expect(p.captureId).toBe(result.capture.id);
      expect(p.status).toBe('fresh');
      expect(p.reason.length).toBeGreaterThan(10);
      expect(p.firstAction.length).toBeGreaterThan(5);
    }
    const kinds = new Set(reply?.proposals.map((p) => p.kind));
    expect(kinds.has('new_app')).toBe(true);
    expect(kinds.has('keep')).toBe(true); // a save can stay a save
  });

  it('the new-app proposal names real capabilities and the exploration lists concrete steps', () => {
    const app = proposalOfKind(result, 'new_app');
    expect(app.capabilities).toContain('practice_timer');
    expect(app.design?.theme).toBeTruthy();
    expect(app.targetAppId).toBeUndefined();
    const explore = proposalOfKind(result, 'explore');
    expect(explore.explorationSteps?.length).toBeGreaterThanOrEqual(3);
    expect(explore.capabilities).toEqual([]);
  });

  it('the thread lists the capture newest first, with its reply, and a single capture can be fetched', async () => {
    await pause();
    const second = await shareOk(me.token, { text: 'Also: the bridge section has a chord change I keep missing' });
    const thread = await client.request<AgentThreadDto>('/api/agent/thread', { token: me.token });
    expect(thread.status).toBe(200);
    expect(thread.json.items.map((i) => i.capture.id)).toEqual([second.capture.id, result.capture.id]);
    const first = thread.json.items[1];
    expect(first?.reply?.proposals.map((p) => p.id).sort()).toEqual(result.reply?.proposals.map((p) => p.id).sort());
    const one = await client.request<AgentThreadItemDto>(`/api/agent/captures/${result.capture.id}`, { token: me.token });
    expect(one.status).toBe(200);
    expect(one.json.capture).toEqual(result.capture);
    expect(one.json.reply?.message).toBe(result.reply?.message);
  });

  it('what the agent learned from the note is stored as editable, sourced memory', async () => {
    const context = await client.request<{ facts: { value: string; status: string; sourceIds: string[] }[]; sources: { kind: string }[] }>('/api/context', { token: me.token });
    expect(context.status).toBe(200);
    const learned = context.json.facts.find((f) => /15 minutes/.test(f.value));
    expect(learned).toBeDefined();
    expect(learned?.status).toBe('inferred');
    expect(context.json.sources.some((s) => s.kind === 'capture')).toBe(true);
  });
});

describe('links are saved, never read', () => {
  let me: Session;
  beforeAll(async () => {
    me = await client.signup(uniqueEmail('links'));
  });

  it('a bare Instagram link is not_read, labelled by host, and the note explains why', async () => {
    const res = await share(me.token, { url: 'https://www.instagram.com/p/C1a2b3c4d5e/' });
    expect(res.status).toBe(201);
    expect(res.json.capture).toMatchObject({ kind: 'link', text: '', url: 'https://www.instagram.com/p/C1a2b3c4d5e/', linkMeta: null, readStatus: 'not_read', sourceLabel: 'Instagram link' });
    expect(res.json.linkNote).toMatch(/Instagram/);
    expect(res.json.linkNote).toMatch(/saved as a link/i);
    // The reply never pretends to have read the page.
    expect(res.json.reply?.message).toMatch(/have not read the page/i);
    expect(res.json.reply?.proposals.length).toBeGreaterThanOrEqual(1);
    for (const p of res.json.reply?.proposals ?? []) expect(p.sourceCaptureIds).toContain(res.json.capture.id);
  });

  it("an unknown host is saved the same way, keeping the person's note", async () => {
    const res = await share(me.token, { url: 'https://example.org/articles/light', text: 'An article about morning light I want to come back to' });
    expect(res.status).toBe(201);
    expect(res.json.capture.readStatus).toBe('not_read');
    expect(res.json.capture.sourceLabel).toBe('Link to example.org');
    expect(res.json.capture.text).toContain('morning light');
    expect(res.json.linkNote).toMatch(/without reading the page/i);
  });

  it('refuses non-web links, empty shares and photos that are not in the library with a readable 400', async () => {
    for (const url of ['javascript:alert(1)', 'ftp://example.org/riff.mp3', 'not a link at all', 'https://localhost/private']) {
      const res = await share(me.token, { url });
      expect(res.status, url).toBe(400);
      expect(res.json.code, url).toBe('invalid');
    }
    expect((await share(me.token, {})).status).toBe(400);
    expect((await share(me.token, { text: '   \n ' })).status).toBe(400);
    const ghost = await share(me.token, { mediaId: 'doesnotexist12345' });
    expect(ghost.status).toBe(400);
    expect(ghost.json.error).toMatch(/not in your library/i);
    const garbage = await client.request<ErrorBody>('/api/agent/captures', { body: '{not json', token: me.token });
    expect(garbage.status).toBe(400);
    // Nothing was saved for any of these.
    const thread = await client.request<AgentThreadDto>('/api/agent/thread', { token: me.token });
    expect(thread.json.items).toHaveLength(2);
  });
});

describe('photos are owner-scoped', () => {
  let me: Session;
  let other: Session;
  let photo: MediaItem;

  beforeAll(async () => {
    me = await client.signup(uniqueEmail('photo'));
    other = await client.signup(uniqueEmail('photo-other'));
  });

  it('a JPEG upload is stored with its real type and pixel size', async () => {
    const res = await upload(me.token, photoFile());
    expect(res.status).toBe(201);
    photo = res.json.media;
    expect(photo).toMatchObject({ mime: 'image/jpeg', width: 960, height: 720, size: LIGHT_1.byteLength, ownerId: me.user.id });
    expect(photo.id).toMatch(SHORT_ID_PATTERN);
  });

  it('the declared type is not trusted: a text file called .jpg is refused with 415', async () => {
    const fake = new File([new TextEncoder().encode('This is a note pretending to be a photograph, not an image at all.')], 'notes.jpg', { type: 'image/jpeg' });
    const res = await upload(me.token, fake);
    expect(res.status).toBe(415);
    expect(res.json.code).toBe('unsupported_media');
    expect(res.json.error).toMatch(/JPEG, PNG, WebP or GIF/);
    const empty = await upload(me.token, new File([], 'empty.jpg', { type: 'image/jpeg' }));
    expect(empty.status).toBe(400);
    const noFile = await upload(me.token, null);
    expect(noFile.status).toBe(400);
    const json = await client.request<ErrorBody>('/api/media', { body: { file: 'x' }, token: me.token });
    expect(json.status).toBe(400);
  });

  it('the owner gets the exact bytes back with the right content type; nobody else gets anything', async () => {
    const mine = await fetchMedia(me.token, photo.id);
    expect(mine.status).toBe(200);
    expect(mine.type).toBe('image/jpeg');
    expect(mine.bytes.byteLength).toBe(LIGHT_1.byteLength);
    expect(Buffer.from(mine.bytes).equals(LIGHT_1)).toBe(true);
    const meta = await client.request<{ media: MediaItem }>(`/api/media/${photo.id}/meta`, { token: me.token });
    expect(meta.status).toBe(200);
    expect(meta.json.media).toEqual(photo);

    expect((await fetchMedia(other.token, photo.id)).status).toBe(404);
    expect((await client.request<ErrorBody>(`/api/media/${photo.id}/meta`, { token: other.token })).status).toBe(404);
    expect((await client.request<ErrorBody>(`/api/media/${photo.id}`, { method: 'DELETE', token: other.token })).status).toBe(404);
    expect((await fetchMedia(null, photo.id)).status).toBe(401);
    expect((await fetchMedia(me.token, photo.id)).status).toBe(200); // the failed attempts changed nothing
  });

  it('delete removes it: 200, then 404 for bytes, meta and a second delete', async () => {
    const del = await client.request<{ ok: boolean }>(`/api/media/${photo.id}`, { method: 'DELETE', token: me.token });
    expect(del.status).toBe(200);
    expect(del.json.ok).toBe(true);
    expect((await fetchMedia(me.token, photo.id)).status).toBe(404);
    expect((await client.request<ErrorBody>(`/api/media/${photo.id}/meta`, { token: me.token })).status).toBe(404);
    expect((await client.request<ErrorBody>(`/api/media/${photo.id}`, { method: 'DELETE', token: me.token })).status).toBe(404);
    expect((await client.request<ErrorBody>('/api/media/x', { token: me.token })).status).toBe(404);
  });
});

describe('a screenshot shared with the agent', () => {
  let me: Session;
  let other: Session;
  let photo: MediaItem;
  let result: CaptureResult;

  beforeAll(async () => {
    me = await client.signup(uniqueEmail('shot'));
    other = await client.signup(uniqueEmail('shot-other'));
    photo = await uploadPhoto(me.token);
    result = await shareOk(me.token, { mediaId: photo.id });
  });

  it('is an image capture that Sample mode honestly reports as not read', () => {
    expect(result.capture).toMatchObject({ kind: 'image', mediaId: photo.id, readStatus: 'not_read', sourceLabel: 'Screenshot', text: '' });
    expect(result.media?.id).toBe(photo.id);
    expect(result.reply?.message).toMatch(/cannot read images/i);
    expect(result.reply?.message).toMatch(/Sample mode/);
    expect(result.reply?.proposals.length).toBeGreaterThanOrEqual(1);
  });

  it("cannot be attached to somebody else's photo", async () => {
    const res = await share(other.token, { mediaId: photo.id });
    expect(res.status).toBe(400);
    expect(res.json.error).toMatch(/not in your library/i);
  });

  it('forgetting the capture removes its proposals but keeps the photo', async () => {
    const proposalIds = result.reply?.proposals.map((p) => p.id) ?? [];
    expect(proposalIds.length).toBeGreaterThan(0);
    expect((await overview(me.token)).filter((r) => r.captureId === result.capture.id)).toHaveLength(proposalIds.length);

    const del = await client.request<{ ok: boolean }>(`/api/agent/captures/${result.capture.id}`, { method: 'DELETE', token: me.token });
    expect(del.status).toBe(200);
    expect((await client.request<ErrorBody>(`/api/agent/captures/${result.capture.id}`, { token: me.token })).status).toBe(404);
    const left = await overview(me.token);
    expect(left.filter((r) => r.captureId === result.capture.id)).toEqual([]);
    for (const id of proposalIds) expect((await client.request<ErrorBody>(`/api/recommendations/${id}`, { token: me.token })).status).toBe(404);
    const thread = await client.request<AgentThreadDto>('/api/agent/thread', { token: me.token });
    expect(thread.json.items.some((i) => i.capture.id === result.capture.id)).toBe(false);
    // The photo is the person's; forgetting a share never deletes it.
    expect((await client.request<{ media: MediaItem }>(`/api/media/${photo.id}/meta`, { token: me.token })).status).toBe(200);
    expect((await fetchMedia(me.token, photo.id)).status).toBe(200);
    expect((await client.request<ErrorBody>(`/api/agent/captures/${result.capture.id}`, { method: 'DELETE', token: me.token })).status).toBe(404);
  });
});

describe("photo records reference the owner's own library", () => {
  let me: Session;
  let other: Session;
  let light: AppDetailDto;
  let mine: MediaItem;
  let theirs: MediaItem;
  const today = '2026-11-14';

  beforeAll(async () => {
    me = await client.signup(uniqueEmail('gallery'));
    other = await client.signup(uniqueEmail('gallery-other'));
    light = await fixtureApp(me.token, 'light-gallery');
    mine = await uploadPhoto(me.token);
    theirs = await uploadPhoto(other.token);
  });

  it("a record pointing at another user's photo is refused with a field error, the owner's photo is accepted", async () => {
    const foreign = await client.request<ErrorBody>(`/api/apps/${light.app.id}/records`, { body: { values: { date: today, photo: theirs.id, caption: 'Not mine' } }, token: me.token });
    expect(foreign.status).toBe(422);
    expect(foreign.json.code).toBe('validation');
    expect(foreign.json.details).toEqual({ photo: 'That photo is not in your library' });

    const example = await client.request<ErrorBody>(`/api/apps/${light.app.id}/records`, { body: { values: { date: today, photo: `${EXAMPLE_IMAGE_PREFIX}light-1` } }, token: me.token });
    expect(example.status).toBe(422);
    expect((example.json.details as Record<string, string>).photo).toBeTruthy();

    const ok = await client.request<{ record: AppRecord }>(`/api/apps/${light.app.id}/records`, { body: { values: { date: today, photo: mine.id, caption: 'Low sun on the brick wall', light: 'golden', keeper: true } }, token: me.token });
    expect(ok.status).toBe(201);
    expect(ok.json.record.values).toMatchObject({ photo: mine.id, caption: 'Low sun on the brick wall', light: 'golden', keeper: true });

    const swap = await client.request<ErrorBody>(`/api/apps/${light.app.id}/records/${ok.json.record.id}`, { method: 'PATCH', body: { values: { photo: theirs.id } }, token: me.token });
    expect(swap.status).toBe(422);
    expect(swap.json.details).toEqual({ photo: 'That photo is not in your library' });

    const list = await client.request<{ records: AppRecord[] }>(`/api/apps/${light.app.id}/records`, { token: me.token });
    expect(list.json.records).toHaveLength(1);
    expect(list.json.records[0]?.values.photo).toBe(mine.id);
  });

  it('the gallery app summary carries its resolved design and capabilities', () => {
    expect(light.app.design).toMatchObject({ theme: 'paper', accent: 'orange', typography: 'editorial', density: 'airy' });
    expect(light.app.capabilities).toEqual(expect.arrayContaining(['gallery', 'photo_upload', 'summary', 'prompts']));
    expect(light.app.pattern).toBe('gallery');
  });
});

describe('proposals: detail, draft (real preview), Make mine, keep', () => {
  let me: Session;
  let shared: CaptureResult;
  let newApp: Recommendation;
  let explore: Recommendation;
  let keep: Recommendation;
  let draft: ProposalPreviewDto;
  let built: AppDetailDto;

  beforeAll(async () => {
    me = await client.signup(uniqueEmail('maker'));
    shared = await shareOk(me.token, { text: GUITAR_NOTE });
    newApp = proposalOfKind(shared, 'new_app');
    explore = proposalOfKind(shared, 'explore');
    keep = proposalOfKind(shared, 'keep');
  });

  it('GET detail returns the proposal with the capture it cites', async () => {
    const res = await client.request<ProposalDetailDto>(`/api/recommendations/${newApp.id}`, { token: me.token });
    expect(res.status).toBe(200);
    expect(res.json.recommendation.id).toBe(newApp.id);
    expect(res.json.recommendation.captureId).toBe(shared.capture.id);
    expect(res.json.captures.map((c) => c.id)).toEqual([shared.capture.id]);
    expect(res.json.captures[0]?.text).toBe(GUITAR_NOTE);
    expect(res.json.targetApp).toBeNull();
    expect(Array.isArray(res.json.evidence)).toBe(true);
  });

  it('draft with a time budget returns a valid spec whose timer starts at that budget, plus example records that fit the views', async () => {
    const res = await client.request<ProposalPreviewDto>(`/api/recommendations/${newApp.id}/draft`, { body: { choices: { timeBudgetMinutes: 15 } }, token: me.token });
    expect(res.status).toBe(200);
    draft = res.json;
    const parsed = AppSpecSchema.safeParse(draft.spec);
    expect(parsed.success).toBe(true);
    const spec = parsed.data as AppSpec;
    const practice = spec.views.find((v) => v.type === 'practice');
    expect(practice?.type).toBe('practice');
    if (practice?.type === 'practice') expect(practice.presets[0]).toBe(15);
    expect(draft.generatedBy).toBe('sample');
    expect(draft.description).toMatch(/15 minutes/);
    expect(draft.unsupported).toEqual([]);

    expect(draft.previewRecords.length).toBeGreaterThan(0);
    const dataViews = spec.views.filter((v) => v.type !== 'summary');
    for (const r of draft.previewRecords) {
      expect(r.id).toMatch(/^example-/);
      expect(r.appId).toBe('example');
      expect(dataViews.some((v) => recordMatchesView(v, r.values))).toBe(true);
      for (const f of spec.fields) {
        if (f.type !== 'image') continue;
        expect(String(r.values[f.id])).toMatch(new RegExp(`^${EXAMPLE_IMAGE_PREFIX}`));
      }
    }
    // Every data view gets example content, including filtered ones.
    for (const v of dataViews) expect(draft.previewRecords.some((r) => recordMatchesView(v, r.values))).toBe(true);
  });

  it('a different time budget moves the matching preset to the front without losing the others', async () => {
    const res = await client.request<ProposalPreviewDto>(`/api/recommendations/${newApp.id}/draft`, { body: { choices: { timeBudgetMinutes: 20 } }, token: me.token });
    expect(res.status).toBe(200);
    const practice = AppSpecSchema.parse(res.json.spec).views.find((v) => v.type === 'practice');
    if (practice?.type !== 'practice') throw new Error('practice view missing');
    expect(practice.presets[0]).toBe(20);
    expect(practice.presets).toEqual(expect.arrayContaining([15, 10, 25]));
    expect(res.json.description).toMatch(/20 minutes/);
  });

  it('a gallery proposal previews with example photos only, never a stored media id', async () => {
    const photoNote = await shareOk(me.token, { text: 'Loved the low light on the brick wall this morning; I want to take more photos like this' });
    const gallery = proposalOfKind(photoNote, 'new_app');
    expect(gallery.capabilities).toContain('gallery');
    const res = await client.request<ProposalPreviewDto>(`/api/recommendations/${gallery.id}/draft`, { body: {}, token: me.token });
    expect(res.status).toBe(200);
    const spec = AppSpecSchema.parse(res.json.spec);
    const imageFields = spec.fields.filter((f) => f.type === 'image');
    expect(imageFields.length).toBeGreaterThan(0);
    expect(res.json.previewRecords.length).toBeGreaterThan(0);
    for (const r of res.json.previewRecords) {
      for (const f of imageFields) {
        const v = String(r.values[f.id]);
        expect(v.startsWith(EXAMPLE_IMAGE_PREFIX)).toBe(true);
        expect(SHORT_ID_PATTERN.test(v)).toBe(false);
      }
    }
  });

  it('an exploration or a keep is not an app: draft is a 400', async () => {
    for (const rec of [explore, keep]) {
      const res = await client.request<ErrorBody>(`/api/recommendations/${rec.id}/draft`, { body: {}, token: me.token });
      expect(res.status, rec.kind).toBe(400);
      expect(res.json.code).toBe('invalid');
      expect(res.json.error).toMatch(/not an app/i);
    }
  });

  it('Make mine builds the drafted spec into a real app with design and capabilities, and marks the proposal built', async () => {
    const res = await client.request<AppDetailDto>(`/api/recommendations/${newApp.id}/build`, { body: { spec: draft.spec, description: draft.description }, token: me.token });
    expect(res.status).toBe(201);
    built = res.json;
    expect(built.version).toBe(1);
    expect(built.canUndo).toBe(false);
    expect(built.spec).toEqual(AppSpecSchema.parse(draft.spec));
    expect(built.app).toMatchObject({ isSample: false, pattern: 'practice', launchPath: `/apps/${built.app.id}/`, currentVersion: 1 });
    expect(built.app.design.theme).toBe(AppSpecSchema.parse(draft.spec).design?.theme);
    expect(built.app.design).toMatchObject({ theme: expect.any(String), accent: expect.any(String), typography: expect.any(String), density: expect.any(String), artwork: expect.any(String) });
    expect(built.app.capabilities).toEqual(expect.arrayContaining(['practice_timer', 'tempo']));

    const list = await client.request<{ apps: AppSummaryDto[] }>('/api/apps', { token: me.token });
    const listed = list.json.apps.find((a) => a.id === built.app.id);
    expect(listed).toBeDefined();
    expect(listed?.design).toEqual(built.app.design);
    expect(listed?.capabilities).toEqual(built.app.capabilities);

    const after = await overview(me.token);
    const rec = after.find((r) => r.id === newApp.id);
    expect(rec?.status).toBe('built');
    expect(rec?.builtAppId).toBe(built.app.id);
    const detail = await client.request<ProposalDetailDto>(`/api/recommendations/${newApp.id}`, { token: me.token });
    expect(detail.json.recommendation.status).toBe('built');
    // The thread still shows the proposal, now built, so the agent can say "open it".
    const item = await client.request<AgentThreadItemDto>(`/api/agent/captures/${shared.capture.id}`, { token: me.token });
    expect(item.json.reply?.proposals.find((p) => p.id === newApp.id)?.status).toBe('built');
  });

  it("the built app is usable right away: a session saved through the practice view's own fields", async () => {
    const practice = built.spec.views.find((v) => v.type === 'practice');
    if (practice?.type !== 'practice') throw new Error('practice view missing');
    const values: Record<string, unknown> = { [practice.minutesFieldId]: 15 };
    if (practice.focusFieldId) values[practice.focusFieldId] = 'The riff at half speed';
    if (practice.filter) values[practice.filter.fieldId] = practice.filter.value;
    const saved = await client.request<{ record: AppRecord }>(`/api/apps/${built.app.id}/records`, { body: { values }, token: me.token });
    expect(saved.status).toBe(201);
    expect(recordMatchesView(practice, saved.json.record.values)).toBe(true);
  });

  it('refuses to build an invalid spec', async () => {
    const res = await client.request<ErrorBody>(`/api/recommendations/${newApp.id}/build`, { body: { spec: { ...draft.spec, fields: [] } }, token: me.token });
    expect(res.status).toBe(400);
    expect(res.json.code).toBe('invalid_spec');
  });

  it('keep makes the save stay a save: status kept, out of the Playground, still visible in the thread', async () => {
    const res = await client.request<{ ok: boolean }>(`/api/recommendations/${keep.id}/keep`, { method: 'POST', token: me.token });
    expect(res.status).toBe(200);
    const detail = await client.request<ProposalDetailDto>(`/api/recommendations/${keep.id}`, { token: me.token });
    expect(detail.json.recommendation.status).toBe('kept');
    expect((await overview(me.token)).some((r) => r.id === keep.id)).toBe(false);
    const item = await client.request<AgentThreadItemDto>(`/api/agent/captures/${shared.capture.id}`, { token: me.token });
    expect(item.json.reply?.proposals.find((p) => p.id === keep.id)?.status).toBe('kept');
    // No app and no new interest came out of it.
    const apps = await client.request<{ apps: AppSummaryDto[] }>('/api/apps', { token: me.token });
    expect(apps.json.apps.map((a) => a.id)).toEqual([built.app.id]);
  });

  it('refreshing the Playground keeps capture-born proposals', async () => {
    const before = (await overview(me.token)).filter((r) => r.captureId);
    expect(before.length).toBeGreaterThan(0);
    const gen = await client.request<RecommendationsDto & ErrorBody>('/api/recommendations/generate', { body: {}, token: me.token });
    expect(gen.status, gen.text).toBe(200);
    const after = gen.json.recommendations;
    for (const rec of before) expect(after.find((r) => r.id === rec.id)?.status).toBe(rec.status);
    expect(after.some((r) => !r.captureId && r.status === 'fresh')).toBe(true); // fact-born cards arrived
    expect(gen.json.generatedBy).toBe('sample');
  });
});

describe('updating an existing app from the agent', () => {
  let me: Session;
  let riff: AppDetailDto;
  let session: AppRecord;
  let shared: CaptureResult;
  let update: Recommendation;
  let preview: RevisionPreviewDto & { appId: string };

  beforeAll(async () => {
    me = await client.signup(uniqueEmail('updater'));
    riff = await fixtureApp(me.token, 'riff-practice');
    const saved = await client.request<{ record: AppRecord }>(`/api/apps/${riff.app.id}/records`, { body: { values: { kind: 'session', date: '2026-11-13', minutes: 12, focus: 'Fingerpicked intro at half speed', feel: 4 } }, token: me.token });
    if (saved.status !== 201) throw new Error(`session failed: ${saved.text}`);
    session = saved.json.record;
    // A guitar save with a time budget and a (never read) link: something the existing app can take in.
    shared = await shareOk(me.token, { text: 'Found this riff on a reel and have 20 minutes tonight to practise it', url: 'https://www.instagram.com/reel/abc123/' });
  });

  it('the agent proposes updating the practice app the person already has, not a second one', async () => {
    expect(shared.capture.readStatus).toBe('not_read'); // the reel was saved, never read
    update = proposalOfKind(shared, 'update_app');
    expect(update.targetAppId).toBe(riff.app.id);
    expect(update.updateRequest).toBeTruthy();
    expect(update.sourceCaptureIds).toContain(shared.capture.id);
    expect(shared.reply?.proposals.some((p) => p.kind === 'new_app')).toBe(false);
    const detail = await client.request<ProposalDetailDto>(`/api/recommendations/${update.id}`, { token: me.token });
    expect(detail.json.targetApp?.id).toBe(riff.app.id);
    expect(detail.json.targetApp?.capabilities).toContain('practice_timer');
    expect(detail.json.captures.map((c) => c.id)).toEqual([shared.capture.id]);
  });

  it("update-preview turns the proposal's own request into a readable, applicable change on the target app", async () => {
    const res = await client.request<RevisionPreviewDto & { appId: string }>(`/api/recommendations/${update.id}/update-preview`, { body: {}, token: me.token });
    expect(res.status).toBe(200);
    preview = res.json;
    expect(preview.appId).toBe(riff.app.id);
    expect(preview.baseVersion).toBe(1);
    expect(preview.proposalId).toMatch(SHORT_ID_PATTERN);
    expect(preview.ops.length).toBeGreaterThanOrEqual(1);
    expect(preview.changes.length).toBeGreaterThanOrEqual(1);
    for (const line of preview.changes) expect(line).toMatch(/^[A-Z].*\.$/);
    expect(AppSpecSchema.safeParse(preview.previewSpec).success).toBe(true);
    expect(preview.previewSpec).not.toEqual(riff.spec);
    expect(preview.generatedBy).toBe('sample');
    // Nothing changed yet: previews are safe.
    expect((await client.request<AppDetailDto>(`/api/apps/${riff.app.id}`, { token: me.token })).json.version).toBe(1);
  });

  it("the person's extra words are honoured in the preview", async () => {
    const res = await client.request<RevisionPreviewDto & { appId: string }>(`/api/recommendations/${update.id}/update-preview`, { body: { extra: 'Add a field for which song I practised' }, token: me.token });
    expect(res.status).toBe(200);
    expect(res.json.ops.some((op) => op.op === 'add_field')).toBe(true);
    expect(res.json.changes.join(' ')).toMatch(/song/i);
    expect(res.json.previewSpec.fields.length).toBe(riff.spec.fields.length + 1);
  });

  it('accepting applies the ops to the app, keeps its sessions, and /applied marks the proposal', async () => {
    const apply = await client.request<ApplyResponse>(`/api/apps/${riff.app.id}/revisions/apply`, { body: { ops: preview.ops, summary: preview.summary, baseVersion: preview.baseVersion, proposalId: preview.proposalId }, token: me.token });
    expect(apply.status).toBe(200);
    expect(apply.json.version).toBe(2);
    expect(apply.json.spec).toEqual(preview.previewSpec);
    expect(apply.json.changes).toEqual(preview.changes);
    const records = await client.request<{ records: AppRecord[] }>(`/api/apps/${riff.app.id}/records`, { token: me.token });
    expect(records.json.records).toEqual([session]);

    const applied = await client.request<{ ok: boolean }>(`/api/recommendations/${update.id}/applied`, { method: 'POST', token: me.token });
    expect(applied.status).toBe(200);
    const detail = await client.request<ProposalDetailDto>(`/api/recommendations/${update.id}`, { token: me.token });
    expect(detail.json.recommendation.status).toBe('applied');
    expect(detail.json.recommendation.builtAppId).toBe(riff.app.id);
    expect((await overview(me.token)).find((r) => r.id === update.id)?.status).toBe('applied');
  });

  // The demo note on an existing practice app asks for a 15-minute preset AND daily prompts sized to
  // 15 minutes (server/model/sample/domains.ts). The sample reviser maps presets to replace_view and
  // sized prompts to replace_rule, so even an app that already starts at 15 gets a real change.
  it("the demo note's own update request previews as at least one applicable change", async () => {
    const hero = await shareOk(me.token, { text: GUITAR_NOTE });
    const proposal = proposalOfKind(hero, 'update_app');
    expect(proposal.targetAppId).toBe(riff.app.id);
    expect(proposal.updateRequest).toMatch(/15-minute/);
    const res = await client.request<RevisionPreviewDto & { appId: string }>(`/api/recommendations/${proposal.id}/update-preview`, { body: {}, token: me.token });
    expect(res.status).toBe(200);
    expect(res.json.ops.length).toBeGreaterThanOrEqual(1);
    expect(res.json.changes.length).toBeGreaterThanOrEqual(1);
    expect(res.json.previewSpec).not.toEqual(riff.spec);
    expect(AppSpecSchema.safeParse(res.json.previewSpec).success).toBe(true);
  });

  it('a guitar note without anything to add gets no update proposal, but still an exploration and a keep', async () => {
    const plain = await shareOk(me.token, { text: 'Picked up the guitar again tonight and want to learn that riff properly' });
    const kinds = plain.reply?.proposals.map((p) => p.kind) ?? [];
    expect(kinds).not.toContain('new_app'); // never a second practice app
    expect(kinds).toContain('explore');
    expect(kinds).toContain('keep');
    expect(plain.reply?.message).toMatch(/already have/i);
  });

  it('update-preview is only for update proposals', async () => {
    const explore = proposalOfKind(shared, 'explore');
    const res = await client.request<ErrorBody>(`/api/recommendations/${explore.id}/update-preview`, { body: {}, token: me.token });
    expect(res.status).toBe(404);
  });
});

describe('the Playground refresh for someone who only shared captures', () => {
  it('produces proposals grounded in the capture itself (facts + recent captures)', async () => {
    const me = await client.signup(uniqueEmail('captures-only'));
    const shared = await shareOk(me.token, { text: 'Street photography walk around the harbour on Saturday morning' });
    expect(shared.capture.readStatus).toBe('read');
    const context = await client.request<{ facts: unknown[] }>('/api/context', { token: me.token });
    expect(context.json.facts).toEqual([]); // nothing was learned, the capture is the only context
    const gen = await client.request<RecommendationsDto & ErrorBody>('/api/recommendations/generate', { body: {}, token: me.token });
    expect(gen.status, gen.text).toBe(200);
    const factBorn = gen.json.recommendations.filter((r) => !r.captureId);
    expect(factBorn.length).toBeGreaterThan(0);
    // With no facts, the only honest grounding is the capture: every card must cite it, none may cite a fact.
    for (const r of factBorn) {
      expect(r.sourceCaptureIds).toContain(shared.capture.id);
      expect(r.evidenceFactIds).toEqual([]);
    }
    expect(gen.json.generatedBy).toBe('sample');
    // An account with nothing at all is told to share something first.
    const empty = await client.signup(uniqueEmail('nothing-yet'));
    const refused = await client.request<ErrorBody>('/api/recommendations/generate', { body: {}, token: empty.token });
    expect(refused.status).toBe(409);
    expect(refused.json.code).toBe('no_context');
  });
});

describe('ownership: another user never sees my captures, photos or proposals', () => {
  let owner: Session;
  let other: Session;
  let photo: MediaItem;
  let shared: CaptureResult;
  let newApp: Recommendation;
  let riff: AppDetailDto;
  let update: Recommendation;

  beforeAll(async () => {
    owner = await client.signup(uniqueEmail('cap-owner'));
    other = await client.signup(uniqueEmail('cap-other'));
    photo = await uploadPhoto(owner.token);
    shared = await shareOk(owner.token, { text: GUITAR_NOTE, mediaId: photo.id });
    newApp = proposalOfKind(shared, 'new_app');
    riff = await fixtureApp(owner.token, 'riff-practice');
    update = proposalOfKind(await shareOk(owner.token, { text: 'Back on the guitar with 20 minutes tonight: that chord change again' }), 'update_app');
  });

  it('every capture, media and proposal route answers 404 for a foreign id (never 403, never 200)', async () => {
    const draftSpec = riff.spec;
    const attempts: Array<[string, RequestOptions]> = [
      [`/api/agent/captures/${shared.capture.id}`, {}],
      [`/api/agent/captures/${shared.capture.id}`, { method: 'DELETE' }],
      [`/api/agent/captures/${shared.capture.id}/respond`, { method: 'POST' }],
      [`/api/media/${photo.id}`, {}],
      [`/api/media/${photo.id}/meta`, {}],
      [`/api/media/${photo.id}`, { method: 'DELETE' }],
      [`/api/recommendations/${newApp.id}`, {}],
      [`/api/recommendations/${newApp.id}/draft`, { body: {} }],
      [`/api/recommendations/${newApp.id}/build`, { body: { spec: draftSpec } }],
      [`/api/recommendations/${newApp.id}/keep`, { method: 'POST' }],
      [`/api/recommendations/${newApp.id}/dismiss`, { method: 'POST' }],
      [`/api/recommendations/${update.id}/update-preview`, { body: {} }],
      [`/api/recommendations/${update.id}/applied`, { method: 'POST' }],
    ];
    for (const [p, opts] of attempts) {
      const res = await client.request<ErrorBody>(p, { ...opts, token: other.token });
      const label = `${opts.method ?? (opts.body ? 'POST' : 'GET')} ${p}`;
      expect(res.status, label).toBe(404);
      expect(res.json?.code, label).toBe('not_found');
    }
  });

  it("the other user's thread and Playground are empty, and the owner's data is unchanged", async () => {
    const thread = await client.request<AgentThreadDto>('/api/agent/thread', { token: other.token });
    expect(thread.json.items).toEqual([]);
    expect(await overview(other.token)).toEqual([]);
    expect((await client.request<AgentThreadItemDto>(`/api/agent/captures/${shared.capture.id}`, { token: owner.token })).status).toBe(200);
    expect((await fetchMedia(owner.token, photo.id)).status).toBe(200);
    expect((await client.request<ProposalDetailDto>(`/api/recommendations/${newApp.id}`, { token: owner.token })).json.recommendation.status).toBe('fresh');
    expect((await client.request<AppDetailDto>(`/api/apps/${riff.app.id}`, { token: owner.token })).json.version).toBe(1);
    const apps = await client.request<{ apps: AppSummaryDto[] }>('/api/apps', { token: other.token });
    expect(apps.json.apps).toEqual([]);
  });

  it('all of it needs a session', async () => {
    for (const p of ['/api/agent/thread', '/api/recommendations', `/api/media/${photo.id}`, `/api/recommendations/${newApp.id}`]) {
      const res = await client.request<ErrorBody>(p);
      expect(res.status, p).toBe(401);
    }
    expect((await client.request<ErrorBody>('/api/agent/captures', { body: { text: 'anonymous' } })).status).toBe(401);
  });
});
