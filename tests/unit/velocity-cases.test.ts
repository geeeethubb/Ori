/**
 * Velocity's 12 adversarial cases (docs/velocity/03_adversarial_review.md §4) and the accepted
 * decisions they test (docs/velocity/ACCEPTED_DECISIONS.md, 04_final_corrections.md), run end to end
 * over HTTP in Sample mode: in-memory SQLite, no model calls, no network, no open port. Each `describe`
 * names the case it checks; the integration report maps each to these tests.
 *
 * Uploaded photos go to a throwaway directory set BEFORE the server is imported.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeClient, uniqueEmail, type Session, type TestClient } from '../helpers/testServer.ts';
import { AppSpecSchema, type AppSpec } from '../../shared/appSpec.ts';
import type { AppDetailDto, BuildResponseDto, CaptureResultDto, MediaUploadDto, ProposalDetailDto, ProposalPreviewDto, RecommendationsDto, RevisionPreviewDto, UndoPreviewDto } from '../../shared/api.ts';
import type { Recommendation } from '../../shared/context.ts';
import type { AppRecord } from '../../shared/records.ts';
import { draftEntry } from '../../shared/drafts.ts';
import { PEOPLE_QUEUE, RIFF_PRACTICE } from '../../server/fixtures/specs.ts';

const mediaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aas-velocity-media-'));
process.env.MEDIA_DIR = mediaDir;
const client: TestClient = await makeClient();

afterAll(() => {
  try {
    fs.rmSync(mediaDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch {
    /* the OS temp folder is cleaned eventually */
  }
});

interface ErrorBody { error: string; code?: string; details?: unknown }
type CaptureResult = CaptureResultDto & { duplicate?: boolean };

const LIGHT_1 = fs.readFileSync(fileURLToPath(new URL('../../server/fixtures/media/light-1.jpg', import.meta.url)));
const REEL = 'https://www.instagram.com/reel/abc123/';
const GUITAR_NOTE = 'I like this sound and have 15 minutes to practice';

async function share(token: string, body: Record<string, unknown>): Promise<CaptureResult> {
  const res = await client.request<CaptureResult & ErrorBody>('/api/agent/captures', { body, token });
  if (res.status !== 201 && res.status !== 200) throw new Error(`capture failed: ${res.status} ${res.text}`);
  return res.json;
}

async function fixtureApp(token: string, fixture: string): Promise<AppDetailDto> {
  const res = await client.request<AppDetailDto>('/api/apps/from-fixture', { body: { fixture }, token });
  if (res.status !== 201) throw new Error(`from-fixture failed: ${res.status} ${res.text}`);
  return res.json;
}

async function versionsOf(token: string, appId: string): Promise<number> {
  return (await client.request<{ versions: unknown[] }>(`/api/apps/${appId}/versions`, { token })).json.versions.length;
}

async function recordsOf(token: string, appId: string): Promise<AppRecord[]> {
  return (await client.request<{ records: AppRecord[] }>(`/api/apps/${appId}/records`, { token })).json.records;
}

async function appsOf(token: string): Promise<{ id: string; name: string }[]> {
  return (await client.request<{ apps: { id: string; name: string }[] }>('/api/apps', { token })).json.apps;
}

function kindsOf(r: CaptureResult): string[] {
  return r.reply?.proposals.map((p) => p.kind) ?? [];
}

function ofKind(r: CaptureResult, kind: Recommendation['kind']): Recommendation {
  const p = r.reply?.proposals.find((x) => x.kind === kind);
  if (!p) throw new Error(`no ${kind} in ${JSON.stringify(kindsOf(r))}`);
  return p;
}

async function uploadPhoto(token: string): Promise<string> {
  const fd = new FormData();
  fd.append('file', new File([new Uint8Array(LIGHT_1)], 'light-1.jpg', { type: 'image/jpeg' }));
  const res = await client.app.request(new Request('http://local/api/media', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd }));
  const json = (await res.json()) as MediaUploadDto;
  return json.media.id;
}

async function factsOf(token: string): Promise<{ id: string; value: string; status: string }[]> {
  return (await client.request<{ facts: { id: string; value: string; status: string }[] }>('/api/context', { token })).json.facts;
}

describe('Case 1: a save-only unreadable reel stays a save', () => {
  it('keep is the only outcome; nothing is claimed, learned or built', async () => {
    const me = await client.signup(uniqueEmail('v1'));
    const r = await share(me.token, { text: 'Save this for later', url: REEL });
    expect(r.capture.readStatus).toBe('not_read');
    expect(kindsOf(r)).toEqual(['keep']);
    expect(r.reply?.message).not.toMatch(/I (?:watched|listened to|read the (?:reel|video|post))/i);
    expect(await factsOf(me.token)).toEqual([]);
    const keep = ofKind(r, 'keep');
    const kept = await client.request<{ ok: boolean }>(`/api/recommendations/${keep.id}/keep`, { method: 'POST', token: me.token });
    expect(kept.status).toBe(200);
    expect(await appsOf(me.token)).toEqual([]);
  });

  it('"just keep it" also takes back anything noted from that share, so a save never becomes an interest', async () => {
    const me = await client.signup(uniqueEmail('v1b'));
    const r = await share(me.token, { text: 'I love fingerstyle blues, especially slow ones', url: REEL });
    expect((await factsOf(me.token)).map((f) => f.value)).toContain('Likes fingerstyle blues');
    const keep = ofKind(r, 'keep');
    const res = await client.request<{ ok: boolean; forgotten: number }>(`/api/recommendations/${keep.id}/keep`, { method: 'POST', token: me.token });
    expect(res.json.forgotten).toBeGreaterThanOrEqual(1);
    expect((await factsOf(me.token)).filter((f) => f.status !== 'removed').map((f) => f.value)).not.toContain('Likes fingerstyle blues');
    // Keeping twice is the same keep.
    expect((await client.request(`/api/recommendations/${keep.id}/keep`, { method: 'POST', token: me.token })).status).toBe(200);
  });
});

describe('Case 2: an explicit 15-minute practice with no app', () => {
  it('previews a session-first app at the asked length and writes no app before Make mine', async () => {
    const me = await client.signup(uniqueEmail('v2'));
    const r = await share(me.token, { text: 'I want a 20-minute guitar practice every day' });
    const proposal = ofKind(r, 'new_app');
    expect(proposal.suggestedMinutes).toBe(20);
    const draft = await client.request<ProposalPreviewDto>(`/api/recommendations/${proposal.id}/draft`, { body: { choices: { timeBudgetMinutes: proposal.suggestedMinutes } }, token: me.token });
    expect(draft.status).toBe(200);
    const practice = draft.json.spec.views.find((v) => v.type === 'practice');
    expect(practice?.type === 'practice' ? practice.presets[0] : null).toBe(20);
    expect(await appsOf(me.token)).toEqual([]); // nothing exists until Make mine
    for (const rec of draft.json.previewRecords) expect(rec.id).toMatch(/^example-/);
  });
});

describe('Case 3: the same need with Riff already made', () => {
  let me: Session;
  let riff: AppDetailDto;
  let use: Recommendation;
  beforeAll(async () => {
    me = await client.signup(uniqueEmail('v3'));
    riff = await fixtureApp(me.token, 'riff-practice');
  });

  it('routes to Riff: no duplicate, no design revision, no entry until one is saved', async () => {
    const r = await share(me.token, { text: GUITAR_NOTE, url: REEL });
    expect(kindsOf(r)).not.toContain('new_app');
    expect(kindsOf(r)).not.toContain('update_app');
    use = ofKind(r, 'use_app');
    expect(use.targetAppId).toBe(riff.app.id);
    expect(use.recordDraft).toMatchObject({ kind: 'source', url: REEL });
    expect(await versionsOf(me.token, riff.app.id)).toBe(1);
    expect(await recordsOf(me.token, riff.app.id)).toEqual([]);
    // The proposal cannot be drafted or built as a new app.
    expect((await client.request(`/api/recommendations/${use.id}/draft`, { body: {}, token: me.token })).status).toBe(400);
  });

  it('the suggested entry is saved once, through the app, and marks the suggestion used', async () => {
    const entry = draftEntry(AppSpecSchema.parse(riff.spec), use.recordDraft!);
    expect(entry?.view.type).toBe('links');
    const body = { values: entry!.values, id: `use_${use.id}`, recommendationId: use.id };
    const first = await client.request<{ record: AppRecord }>(`/api/apps/${riff.app.id}/records`, { body, token: me.token });
    expect(first.status).toBe(201);
    const again = await client.request<{ record: AppRecord; duplicate: boolean }>(`/api/apps/${riff.app.id}/records`, { body, token: me.token });
    expect(again.status).toBe(200);
    expect(again.json.duplicate).toBe(true);
    expect(again.json.record.id).toBe(first.json.record.id);
    expect(await recordsOf(me.token, riff.app.id)).toHaveLength(1);
    expect(await versionsOf(me.token, riff.app.id)).toBe(1);
    const detail = await client.request<ProposalDetailDto>(`/api/recommendations/${use.id}`, { token: me.token });
    expect(detail.json.recommendation.status).toBe('applied');
  });
});

describe('Case 4: changing Riff\'s design is a revision, previewed first', () => {
  it('routes to a preview; "not now" writes nothing; accept changes only the design', async () => {
    const me = await client.signup(uniqueEmail('v4'));
    const riff = await fixtureApp(me.token, 'riff-practice');
    const r = await share(me.token, { text: 'Change Riff to the charcoal look' });
    expect(kindsOf(r)).toEqual(['update_app']);
    const up = ofKind(r, 'update_app');
    expect(up.updateRequest).toBe('Change Riff to the charcoal look');
    const preview = await client.request<RevisionPreviewDto>(`/api/recommendations/${up.id}/update-preview`, { body: {}, token: me.token });
    expect(preview.status).toBe(200);
    expect(await versionsOf(me.token, riff.app.id)).toBe(1); // previewing (or walking away) writes no version
    const accept = await client.request<AppDetailDto>(`/api/apps/${riff.app.id}/revisions/apply`, { body: { ops: preview.json.ops, summary: preview.json.summary, proposalId: preview.json.proposalId, baseVersion: preview.json.baseVersion, recommendationId: up.id }, token: me.token });
    expect(accept.status).toBe(200);
    expect(accept.json.spec.design?.theme).toBe('charcoal');
    expect(accept.json.spec.fields.map((f) => f.id)).toEqual(riff.spec.fields.map((f) => f.id));
  });
});

describe('Case 5: a photo with no vision analysis', () => {
  it('claims nothing about the image, and Light adds the person\'s own photo (another person\'s is refused)', async () => {
    const me = await client.signup(uniqueEmail('v5'));
    const light = await fixtureApp(me.token, 'light-gallery');
    const mediaId = await uploadPhoto(me.token);
    const r = await share(me.token, { text: 'Low sun on the brick wall', mediaId });
    expect(r.capture.readStatus).toBe('not_read');
    expect(r.reply?.message).toMatch(/cannot read images/);
    const use = ofKind(r, 'use_app');
    expect(use.recordDraft).toEqual({ kind: 'photo', mediaId });
    const entry = draftEntry(AppSpecSchema.parse(light.spec), use.recordDraft!);
    const saved = await client.request<{ record: AppRecord }>(`/api/apps/${light.app.id}/records`, { body: { values: { ...entry!.values, date: '2026-11-14' }, id: `use_${use.id}`, recommendationId: use.id }, token: me.token });
    expect(saved.status).toBe(201);

    const other = await client.signup(uniqueEmail('v5-other'));
    const theirLight = await fixtureApp(other.token, 'light-gallery');
    const stolen = await client.request<ErrorBody>(`/api/apps/${theirLight.app.id}/records`, { body: { values: { photo: mediaId, date: '2026-11-14' } }, token: other.token });
    expect(stolen.status).toBe(422);
  });
});

describe('Cases 6 and 7: a follow-up with People already made', () => {
  let me: Session;
  let people: AppDetailDto;
  beforeAll(async () => {
    me = await client.signup(uniqueEmail('v6'));
    people = await fixtureApp(me.token, 'people-queue');
  });

  it('case 6: one confirmed entry, no design revision, nothing sent', async () => {
    const r = await share(me.token, { text: 'Follow up with Maya about the proposal' });
    expect(kindsOf(r)).not.toContain('update_app');
    const use = ofKind(r, 'use_app');
    expect(use.recordDraft).toMatchObject({ kind: 'follow_up', person: 'Maya', action: 'Follow up about the proposal' });
    const entry = draftEntry(AppSpecSchema.parse(people.spec), use.recordDraft!);
    const body = { values: entry!.values, id: `use_${use.id}`, recommendationId: use.id };
    expect((await client.request(`/api/apps/${people.app.id}/records`, { body, token: me.token })).status).toBe(201);
    expect((await client.request(`/api/apps/${people.app.id}/records`, { body, token: me.token })).status).toBe(200);
    const records = await recordsOf(me.token, people.app.id);
    expect(records).toHaveLength(1);
    expect(records[0]?.values).toMatchObject({ person: 'Maya', action: 'Follow up about the proposal' });
    expect(await versionsOf(me.token, people.app.id)).toBe(1);
  });

  it('case 7: "Thursday" is kept as said; a date is only a suggestion until the person saves it', async () => {
    const r = await share(me.token, { text: 'Follow up with Maya Thursday' });
    const use = ofKind(r, 'use_app');
    expect(use.recordDraft).toMatchObject({ kind: 'follow_up', person: 'Maya', dueText: 'Thursday' });
    expect(JSON.stringify(use.recordDraft)).not.toMatch(/\d{4}-\d{2}-\d{2}/); // no date anywhere in what was proposed
    expect(await recordsOf(me.token, people.app.id)).toHaveLength(1); // nothing written by proposing
    // In the app, the person's words stay with the entry and the suggested date is the next Thursday
    // in their own calendar (Saturday 14 Nov 2026 → Thursday 19 Nov), which they confirm by saving.
    const entry = draftEntry(AppSpecSchema.parse(PEOPLE_QUEUE), use.recordDraft!, new Date(2026, 10, 14, 19, 30));
    expect(entry?.values).toMatchObject({ person: 'Maya', due_words: 'Thursday', due: '2026-11-19' });
    expect(entry?.note).toMatch(/You said “Thursday”/);
    // An older People app without the words field keeps the original note in its context instead.
    const legacy = AppSpecSchema.parse({ ...PEOPLE_QUEUE, fields: PEOPLE_QUEUE.fields.filter((f) => f.id !== 'due_words'), views: PEOPLE_QUEUE.views.map((v) => (v.type === 'queue' ? { ...v, dueTextFieldId: undefined } : v)) });
    expect(draftEntry(legacy, use.recordDraft!)?.values.context).toBe('From your note: “Follow up with Maya Thursday”');
  });
});

describe('Case 8: duplicate accept and retry', () => {
  let me: Session;
  beforeAll(async () => {
    me = await client.signup(uniqueEmail('v8'));
  });

  it('Make mine twice makes one app', async () => {
    const r = await share(me.token, { text: 'I want a 15-minute guitar practice every day' });
    const proposal = ofKind(r, 'new_app');
    const draft = await client.request<ProposalPreviewDto>(`/api/recommendations/${proposal.id}/draft`, { body: {}, token: me.token });
    const body = { spec: draft.json.spec, description: draft.json.description };
    const first = await client.request<BuildResponseDto>(`/api/recommendations/${proposal.id}/build`, { body, token: me.token });
    expect(first.status).toBe(201);
    const second = await client.request<BuildResponseDto>(`/api/recommendations/${proposal.id}/build`, { body, token: me.token });
    expect(second.status).toBe(200);
    expect(second.json.alreadyBuilt).toBe(true);
    expect(second.json.app.id).toBe(first.json.app.id);
    expect((await appsOf(me.token)).filter((a) => a.name === first.json.app.name)).toHaveLength(1);
  });

  it('an accepted change sent twice applies once; an undo retried after a lost response does not redo', async () => {
    const riff = await fixtureApp(me.token, 'riff-practice');
    const preview = await client.request<RevisionPreviewDto>(`/api/apps/${riff.app.id}/revisions/preview`, { body: { request: 'Add a field for which song I practised' }, token: me.token });
    const body = { ops: preview.json.ops, summary: preview.json.summary, proposalId: preview.json.proposalId, baseVersion: 1 };
    expect((await client.request(`/api/apps/${riff.app.id}/revisions/apply`, { body, token: me.token })).status).toBe(200);
    const again = await client.request<AppDetailDto & { alreadyApplied?: boolean }>(`/api/apps/${riff.app.id}/revisions/apply`, { body, token: me.token });
    expect(again.status).toBe(200);
    expect(again.json.alreadyApplied).toBe(true);
    expect(await versionsOf(me.token, riff.app.id)).toBe(2);
    const undo = await client.request(`/api/apps/${riff.app.id}/revisions/undo`, { body: { expectedVersion: 2 }, token: me.token });
    expect(undo.status).toBe(200);
    const retried = await client.request<ErrorBody>(`/api/apps/${riff.app.id}/revisions/undo`, { body: { expectedVersion: 2 }, token: me.token });
    expect(retried.status).toBe(409);
    expect(retried.json.code).toBe('stale_preview');
    expect(await versionsOf(me.token, riff.app.id)).toBe(3);
  });

  it('a saved session or a share retried with the same id is kept once; after sign-out the retry is refused', async () => {
    const riff = await fixtureApp(me.token, 'riff-practice');
    const body = { values: { kind: 'session', date: '2026-11-14', minutes: 3, timed_seconds: 184, target_minutes: 15 }, id: 'session-retry-0001' };
    expect((await client.request(`/api/apps/${riff.app.id}/records`, { body, token: me.token })).status).toBe(201);
    expect((await client.request(`/api/apps/${riff.app.id}/records`, { body, token: me.token })).status).toBe(200);
    expect(await recordsOf(me.token, riff.app.id)).toHaveLength(1);

    const shareBody = { id: 'share-retry-00001', text: 'Trying a new chord shape tonight' };
    const a = await client.request<CaptureResult>('/api/agent/captures', { body: shareBody, token: me.token });
    const b = await client.request<CaptureResult>('/api/agent/captures', { body: shareBody, token: me.token });
    expect(a.status).toBe(201);
    expect(b.status).toBe(200);
    expect(b.json.capture.id).toBe(a.json.capture.id);
    const thread = await client.request<{ items: unknown[] }>('/api/agent/thread', { token: me.token });
    expect(thread.json.items.filter((i) => (i as { capture: { id: string } }).capture.id === 'share-retry-00001')).toHaveLength(1);

    await client.request('/api/auth/logout', { method: 'POST', token: me.token });
    expect((await client.request(`/api/apps/${riff.app.id}/records`, { body: { ...body, id: 'session-retry-0002' }, token: me.token })).status).toBe(401);
  });
});

describe('Case 9: deleted context', () => {
  it('a proposal whose memory was removed cannot be drafted or built; forgetting a share removes its proposals', async () => {
    const me = await client.signup(uniqueEmail('v9'));
    await client.request('/api/context/interests', { body: { interest: 'Street photography at golden hour' }, token: me.token });
    const gen = await client.request<RecommendationsDto>('/api/recommendations/generate', { body: {}, token: me.token });
    const rec = gen.json.recommendations.find((r) => r.kind === 'new_app' && r.evidenceFactIds.length > 0);
    expect(rec).toBeDefined();
    const draft = await client.request<ProposalPreviewDto>(`/api/recommendations/${rec!.id}/draft`, { body: {}, token: me.token });
    expect(draft.status).toBe(200);
    for (const factId of rec!.evidenceFactIds) {
      const removed = await client.request(`/api/context/facts/${factId}`, { method: 'PATCH', body: { status: 'removed' }, token: me.token });
      expect(removed.status).toBe(200);
    }
    const build = await client.request<ErrorBody>(`/api/recommendations/${rec!.id}/build`, { body: { spec: draft.json.spec }, token: me.token });
    expect(build.status).toBe(409);
    expect(build.json.code).toBe('stale_proposal');
    expect((await client.request<ErrorBody>(`/api/recommendations/${rec!.id}/draft`, { body: {}, token: me.token })).status).toBe(409);
    expect(await appsOf(me.token)).toEqual([]);

    const r = await share(me.token, { text: 'I want a 15-minute guitar practice every day' });
    const proposal = ofKind(r, 'new_app');
    await client.request(`/api/agent/captures/${r.capture.id}`, { method: 'DELETE', token: me.token });
    expect((await client.request(`/api/recommendations/${proposal.id}`, { token: me.token })).status).toBe(404);
  });
});

describe('Case 10: another person\'s app, media, records and ids', () => {
  it('reveals nothing and writes nothing', async () => {
    const a = await client.signup(uniqueEmail('v10a'));
    const b = await client.signup(uniqueEmail('v10b'));
    const aRiff = await fixtureApp(a.token, 'riff-practice');
    const bRiff = await fixtureApp(b.token, 'riff-practice');
    // Another person's app and records are not found, whatever is asked.
    expect((await client.request(`/api/apps/${aRiff.app.id}`, { token: b.token })).status).toBe(404);
    expect((await client.request(`/api/apps/${aRiff.app.id}/records`, { body: { values: { kind: 'session' } }, token: b.token })).status).toBe(404);
    // A record id that exists for someone else cannot be claimed as a client id (generic refusal).
    const saved = await client.request<{ record: AppRecord }>(`/api/apps/${aRiff.app.id}/records`, { body: { values: { kind: 'session', minutes: 5 }, id: 'owned-by-a-0001' }, token: a.token });
    expect(saved.status).toBe(201);
    const claim = await client.request<ErrorBody>(`/api/apps/${bRiff.app.id}/records`, { body: { values: { kind: 'session', minutes: 5 }, id: 'owned-by-a-0001' }, token: b.token });
    expect(claim.status).toBe(400);
    expect(JSON.stringify(claim.json)).not.toMatch(/owned-by-a|session|minutes/);
    // The same for a share id.
    await client.request('/api/agent/captures', { body: { id: 'share-of-a-00001', text: 'a note' }, token: a.token });
    expect((await client.request('/api/agent/captures', { body: { id: 'share-of-a-00001', text: 'a note' }, token: b.token })).status).toBe(400);
    // Someone else's suggestion id never marks anything.
    const r = await share(a.token, { text: GUITAR_NOTE });
    const use = ofKind(r, 'use_app');
    await client.request(`/api/apps/${bRiff.app.id}/records`, { body: { values: { kind: 'session', minutes: 2 }, recommendationId: use.id }, token: b.token });
    const detail = await client.request<ProposalDetailDto>(`/api/recommendations/${use.id}`, { token: a.token });
    expect(detail.json.recommendation.status).toBe('fresh');
  });
});

describe('Case 11: Spotify and Instagram auto-sync', () => {
  it('names both missing integrations; no card implies a sync, and the reply keeps saying so', async () => {
    const me = await client.signup(uniqueEmail('v11'));
    const riff = await fixtureApp(me.token, 'riff-practice');
    const r = await share(me.token, { text: 'Auto-sync my Spotify and Instagram into Riff' });
    expect(r.reply?.unsupported.map((u) => u.request)).toEqual(['Spotify sync', 'Instagram sync']);
    expect(kindsOf(r)).not.toContain('update_app');
    expect(ofKind(r, 'use_app')).toMatchObject({ targetAppId: riff.app.id, title: 'Save links by hand in Riff' });
    const thread = await client.request<{ items: { reply: { unsupported: unknown[] } | null }[] }>('/api/agent/thread', { token: me.token });
    expect(thread.json.items[0]?.reply?.unsupported).toHaveLength(2);
  });
});

describe('Case 12: design undo after new entries', () => {
  let me: Session;
  let riff: AppDetailDto;
  beforeAll(async () => {
    me = await client.signup(uniqueEmail('v12'));
    riff = await fixtureApp(me.token, 'riff-practice');
  });

  async function apply(ops: unknown[]): Promise<AppDetailDto> {
    const res = await client.request<AppDetailDto>(`/api/apps/${riff.app.id}/revisions/apply`, { body: { ops }, token: me.token });
    if (res.status !== 200) throw new Error(`apply failed: ${res.status} ${res.text}`);
    return res.json;
  }

  it('the entry and its value survive the undo; the field stays (hidden), can come back, and its id is never reused for another type', async () => {
    await apply([{ op: 'add_field', field: { id: 'song', label: 'Which song', type: 'text' } }]);
    const saved = await client.request<{ record: AppRecord }>(`/api/apps/${riff.app.id}/records`, { body: { values: { kind: 'session', date: '2026-11-14', minutes: 9, song: 'Blackbird' } }, token: me.token });
    expect(saved.status).toBe(201);
    const plan = await client.request<UndoPreviewDto>(`/api/apps/${riff.app.id}/revisions/undo/preview`, { method: 'POST', token: me.token });
    expect(plan.json).toMatchObject({ ok: true, label: 'Undo', restores: 1 });
    expect(plan.json.kept.join(' ')).toMatch(/“Which song” stays saved in 1 session/);
    const undone = await client.request<AppDetailDto>(`/api/apps/${riff.app.id}/revisions/undo`, { body: {}, token: me.token });
    expect(undone.status).toBe(200);
    expect(undone.json.spec.fields.find((f) => f.id === 'song')).toMatchObject({ hidden: true, required: false });
    const records = await recordsOf(me.token, riff.app.id);
    expect(records.find((r) => r.id === saved.json.record.id)?.values.song).toBe('Blackbird');
    // Editing that entry under the older design sends only what changed: the song stays.
    const edited = await client.request<{ record: AppRecord }>(`/api/apps/${riff.app.id}/records/${saved.json.record.id}`, { method: 'PATCH', body: { values: { minutes: 10 }, baseUpdatedAt: saved.json.record.updatedAt }, token: me.token });
    expect(edited.json.record.values).toMatchObject({ minutes: 10, song: 'Blackbird' });
    // The id stays reserved: a number field called "song" would misread "Blackbird".
    const reused = await client.request<ErrorBody & { details: string[] }>(`/api/apps/${riff.app.id}/revisions/apply`, { body: { ops: [{ op: 'add_field', field: { id: 'song', label: 'Song number', type: 'number' } }] }, token: me.token });
    expect(reused.status).toBe(422);
    // And it can simply be shown again.
    const shown = await apply([{ op: 'unhide_field', fieldId: 'song' }]);
    expect(shown.spec.fields.find((f) => f.id === 'song')?.hidden).toBe(false);
  });

  it('a choice that entries use stays after an undo', async () => {
    await apply([{ op: 'add_select_option', fieldId: 'source_kind', option: { value: 'clip', label: 'Clip' } }]);
    const saved = await client.request(`/api/apps/${riff.app.id}/records`, { body: { values: { kind: 'source', url: 'https://example.com/clip', title: 'A clip', source_kind: 'clip' } }, token: me.token });
    expect(saved.status).toBe(201);
    const undone = await client.request<AppDetailDto>(`/api/apps/${riff.app.id}/revisions/undo`, { body: {}, token: me.token });
    expect(undone.status).toBe(200);
    const kind = undone.json.spec.fields.find((f) => f.id === 'source_kind');
    expect(kind?.type === 'select' && kind.options.some((o) => o.value === 'clip')).toBe(true);
  });

  it('an undo that would leave entries in no view is refused with the reason, and changes nothing', async () => {
    const before = await versionsOf(me.token, riff.app.id);
    await apply([
      { op: 'add_select_option', fieldId: 'kind', option: { value: 'lesson', label: 'Lesson' } },
      { op: 'add_view', view: { id: 'lessons', type: 'list', title: 'Lessons', filter: { fieldId: 'kind', value: 'lesson' }, titleFieldId: 'title' } },
    ]);
    const lesson = await client.request(`/api/apps/${riff.app.id}/records`, { body: { values: { kind: 'lesson', title: 'Travis picking basics', url: 'https://example.com/lesson' } }, token: me.token });
    expect(lesson.status).toBe(201);
    const plan = await client.request<UndoPreviewDto>(`/api/apps/${riff.app.id}/revisions/undo/preview`, { method: 'POST', token: me.token });
    expect(plan.json.ok).toBe(false);
    expect(plan.json.blocked.join(' ')).toMatch(/only shown in “Lessons”/);
    const refused = await client.request<ErrorBody>(`/api/apps/${riff.app.id}/revisions/undo`, { body: {}, token: me.token });
    expect(refused.status).toBe(409);
    expect(refused.json.code).toBe('undo_incompatible');
    expect(await versionsOf(me.token, riff.app.id)).toBe(before + 1);
  });
});

describe('Accepted decisions checked at the API', () => {
  it('a view can never lose the field it is built around, and one field cannot fill two roles', async () => {
    const me = await client.signup(uniqueEmail('vd1'));
    const people = await fixtureApp(me.token, 'people-queue');
    const hide = await client.request<ErrorBody & { details: string[] }>(`/api/apps/${people.app.id}/revisions/apply`, { body: { ops: [{ op: 'hide_field', fieldId: 'person' }] }, token: me.token });
    expect(hide.status).toBe(422);
    expect(hide.json.details.join(' ')).toMatch(/built around/);
    const riff = await fixtureApp(me.token, 'riff-practice');
    const practice = AppSpecSchema.parse(RIFF_PRACTICE).views.find((v) => v.type === 'practice')!;
    const twice = await client.request<ErrorBody>(`/api/apps/${riff.app.id}/revisions/apply`, { body: { ops: [{ op: 'replace_view', viewId: 'practice', view: { ...practice, tempoFieldId: 'minutes' } }] }, token: me.token });
    expect(twice.status).toBe(409);
    expect(twice.json.code).toBe('apply_incompatible');
  });

  it('an edit made on an older copy never overwrites a newer one (409 with the latest copy)', async () => {
    const me = await client.signup(uniqueEmail('vd2'));
    const people = await fixtureApp(me.token, 'people-queue');
    const saved = await client.request<{ record: AppRecord }>(`/api/apps/${people.app.id}/records`, { body: { values: { person: 'Maya', action: 'Send the deck' } }, token: me.token });
    const phone = await client.request<{ record: AppRecord }>(`/api/apps/${people.app.id}/records/${saved.json.record.id}`, { method: 'PATCH', body: { values: { done: true }, baseUpdatedAt: saved.json.record.updatedAt }, token: me.token });
    expect(phone.status).toBe(200);
    const laptop = await client.request<ErrorBody & { details: { record: AppRecord } }>(`/api/apps/${people.app.id}/records/${saved.json.record.id}`, { method: 'PATCH', body: { values: { action: 'Send the new deck' }, baseUpdatedAt: saved.json.record.updatedAt }, token: me.token });
    expect(laptop.status).toBe(409);
    expect(laptop.json.code).toBe('record_conflict');
    expect(laptop.json.details.record.values.done).toBe(true);
    // Undo of "done" from the phone, against its own latest copy, is a plain status change.
    const undo = await client.request<{ record: AppRecord }>(`/api/apps/${people.app.id}/records/${saved.json.record.id}`, { method: 'PATCH', body: { values: { done: false }, baseUpdatedAt: phone.json.record.updatedAt }, token: me.token });
    expect(undo.status).toBe(200);
    expect(await versionsOf(me.token, people.app.id)).toBe(1); // record actions never touch the design
  });

  it('a photo entry needs a photo or an observation; a legacy blank entry stays editable', async () => {
    const me = await client.signup(uniqueEmail('vd3'));
    const spec = AppSpecSchema.parse({ ...AppSpecSchema.parse({ schemaVersion: 1, name: 'Notebook', purpose: 'explore', pattern: 'gallery', icon: { symbol: 'camera', color: 'paper' }, fields: [{ id: 'photo', label: 'Photo', type: 'image' }, { id: 'caption', label: 'Caption', type: 'text' }], views: [{ id: 'sheet', type: 'gallery', imageFieldId: 'photo', captionFieldId: 'caption' }] }) }) as AppSpec;
    const app = await client.request<AppDetailDto>('/api/apps', { body: { spec }, token: me.token });
    const blank = await client.request<ErrorBody & { details: Record<string, string> }>(`/api/apps/${app.json.app.id}/records`, { body: { values: { caption: '   ' } }, token: me.token });
    expect(blank.status).toBe(422);
    expect(blank.json.details._).toMatch(/photo or write an observation/);
    expect((await client.request(`/api/apps/${app.json.app.id}/records`, { body: { values: { caption: 'Long shadows at five' } }, token: me.token })).status).toBe(201);
  });

  it('Make mine carries the shared link into the new app once, marked as not read', async () => {
    const me = await client.signup(uniqueEmail('vd4'));
    const r = await share(me.token, { text: GUITAR_NOTE, url: REEL });
    const proposal = ofKind(r, 'new_app');
    const draft = await client.request<ProposalPreviewDto>(`/api/recommendations/${proposal.id}/draft`, { body: {}, token: me.token });
    const built = await client.request<BuildResponseDto>(`/api/recommendations/${proposal.id}/build`, { body: { spec: draft.json.spec }, token: me.token });
    expect(built.status).toBe(201);
    expect(built.json.carried?.join(' ')).toMatch(/link is saved.*not read/);
    const records = await recordsOf(me.token, built.json.app.id);
    expect(records.filter((x) => x.values.url === REEL)).toHaveLength(1);
    const events = await client.request<{ events: { type: string; meta?: { origin?: string } | null }[] }>(`/api/apps/${built.json.app.id}/events`, { token: me.token });
    expect(events.json.events.find((e) => e.type === 'first_item_saved')?.meta?.origin).toBe('carried'); // never counted as an action
  });
});
