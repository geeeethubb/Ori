/**
 * Memory and exactly-once fixes from the review of the Velocity integration: a share that restates a
 * fact backs it too, Forget and "Just keep it" never take away what the person confirmed, Make mine
 * carries one copy of a link or photo shared twice, overlapping and forgotten share ids, and proposals
 * whose app was deleted. Then the follow-ups: a fact is the same only in the same words (in any script),
 * shares do not count toward the import limit, a fact never quotes a share it no longer comes from, a
 * card whose app was deleted is replaced like a fresh one, and a category change confirms a fact.
 * In-memory SQLite over HTTP, Sample mode, no network: the only outbound call the server makes (a link
 * title) is stubbed, and anything else fails the test. Where a live model could answer differently (facts
 * in other scripts, very short or blank values, an import that restates a fact), one Sample answer is
 * replaced for that call.
 *
 * Env is set BEFORE any server module loads (config reads it at import), so server modules are imported
 * dynamically below.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { makeClient, uniqueEmail, type TestClient } from '../helpers/testServer.ts';
import type { AgentThreadDto, AppDetailDto, BuildResponseDto, CaptureResultDto, MediaUploadDto, ProposalDetailDto, ProposalPreviewDto, RecommendationsDto } from '../../shared/api.ts';
import { MAX_SOURCES_PER_USER, RecommendationDraftSchema, type Recommendation, type RecommendationDraft } from '../../shared/context.ts';
import type { AppRecord } from '../../shared/records.ts';
import { fixtureSpec } from '../../server/fixtures/specs.ts';
import { proposalAction } from '../../client/src/pages/parts/helpers.ts';

const mediaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aas-memory-fixes-media-'));
process.env.MEDIA_DIR = mediaDir;
process.env.LINK_METADATA = 'on'; // the stubbed title lookup below is what makes two sends overlap

const fetchCalls: string[] = [];
vi.stubGlobal('fetch', async (input: unknown) => {
  const url = String((input as { url?: string })?.url ?? input);
  fetchCalls.push(url);
  if (!url.startsWith('https://www.youtube.com/oembed')) throw new Error(`unexpected network call to ${url}`);
  await new Promise((resolve) => setTimeout(resolve, 50));
  return new Response(JSON.stringify({ title: 'Slow blues lick lesson', author_name: 'A teacher' }), { status: 200, headers: { 'content-type': 'application/json' } });
});

const client: TestClient = await makeClient();
const ctx = await import('../../server/repos/context.ts');
const { getDb } = await import('../../server/db/index.ts');
const { sampleAdapter } = await import('../../server/model/index.ts');

afterAll(() => {
  vi.unstubAllGlobals();
  try {
    fs.rmSync(mediaDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch {
    /* the OS temp folder is cleaned eventually */
  }
});

interface ErrorBody { error: string; code?: string }
type ShareResult = CaptureResultDto & { duplicate?: boolean };
interface Fact { id: string; value: string; status: string; sourceIds: string[]; category?: string; confidence?: number; evidence?: string | null }

const REEL = 'https://www.instagram.com/reel/abc123/';
const BLUES = 'I love fingerstyle blues, especially slow ones';
const LIKES = 'Likes fingerstyle blues';
const GUITAR_NOTE = 'I like this sound and have 15 minutes to practice';
const LIGHT_1 = fs.readFileSync(fileURLToPath(new URL('../../server/fixtures/media/light-1.jpg', import.meta.url)));

async function share(token: string, body: Record<string, unknown>): Promise<ShareResult> {
  const res = await client.request<ShareResult & ErrorBody>('/api/agent/captures', { body, token });
  if (res.status !== 201 && res.status !== 200) throw new Error(`capture failed: ${res.status} ${res.text}`);
  return res.json;
}

async function memory(token: string): Promise<Fact[]> {
  return (await client.request<{ facts: Fact[] }>('/api/context', { token })).json.facts;
}

const values = (facts: Fact[]) => facts.map((f) => f.value).sort();

function ofKind(r: ShareResult, kind: Recommendation['kind']): Recommendation {
  const p = r.reply?.proposals.find((x) => x.kind === kind);
  if (!p) throw new Error(`no ${kind} in ${JSON.stringify(r.reply?.proposals.map((x) => x.kind))}`);
  return p;
}

async function forget(token: string, captureId: string): Promise<void> {
  expect((await client.request(`/api/agent/captures/${captureId}`, { method: 'DELETE', token })).status).toBe(200);
}

async function keep(token: string, r: ShareResult): Promise<{ ok: boolean; forgotten: number }> {
  const res = await client.request<{ ok: boolean; forgotten: number }>(`/api/recommendations/${ofKind(r, 'keep').id}/keep`, { method: 'POST', token });
  expect(res.status).toBe(200);
  return res.json;
}

async function detail(token: string, recId: string): Promise<ProposalDetailDto> {
  const res = await client.request<ProposalDetailDto>(`/api/recommendations/${recId}`, { token });
  expect(res.status).toBe(200);
  return res.json;
}

async function threadProposal(token: string, captureId: string, recId: string): Promise<Recommendation> {
  const thread = (await client.request<AgentThreadDto>('/api/agent/thread', { token })).json;
  const p = thread.items.find((i) => i.capture.id === captureId)?.reply?.proposals.find((x) => x.id === recId);
  if (!p) throw new Error(`proposal ${recId} is not in the thread`);
  return p;
}

async function fixtureApp(token: string, fixture: string): Promise<AppDetailDto> {
  const res = await client.request<AppDetailDto>('/api/apps/from-fixture', { body: { fixture }, token });
  if (res.status !== 201) throw new Error(`from-fixture failed: ${res.status} ${res.text}`);
  return res.json;
}

async function recordsOf(token: string, appId: string): Promise<AppRecord[]> {
  return (await client.request<{ records: AppRecord[] }>(`/api/apps/${appId}/records`, { token })).json.records;
}

async function uploadPhoto(token: string): Promise<string> {
  const fd = new FormData();
  fd.append('file', new File([new Uint8Array(LIGHT_1)], 'light-1.jpg', { type: 'image/jpeg' }));
  const res = await client.app.request(new Request('http://local/api/media', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd }));
  return ((await res.json()) as MediaUploadDto).media.id;
}

/** A Playground card (no capture of its own) citing the given shares and facts, stored as the Playground stores one. */
function playgroundCard(ownerId: string, cites: { captures?: string[]; facts?: string[] }, pattern: 'practice' | 'gallery' = 'practice'): Recommendation {
  const draft: RecommendationDraft = RecommendationDraftSchema.parse({
    kind: 'new_app',
    title: pattern === 'practice' ? 'Riff' : 'Light',
    purpose: 'explore',
    pattern,
    icon: pattern === 'practice' ? { symbol: 'guitar', color: 'ink' } : { symbol: 'aperture', color: 'charcoal' },
    tagline: 'Made from what you shared',
    description: 'A small app made from the things you shared.',
    reason: 'You shared this more than once, so it seems to matter to you.',
    evidenceFactIds: cites.facts ?? [],
    sourceCaptureIds: cites.captures ?? [],
    firstAction: 'Open it and look at what was carried over.',
    previewLines: ['What you shared'],
  });
  const card = ctx.replaceFreshRecommendations(ownerId, [draft], 'sample', 'memory-fixes-test').find((r) => !r.captureId && r.title === draft.title);
  if (!card) throw new Error('the Playground card was not stored');
  return card;
}

/** Share a note while the agent's reply learns exactly these values, as a live model might write them. */
async function shareLearning(token: string, text: string, learned: string[]): Promise<ShareResult> {
  const respond = sampleAdapter.respondToCapture.bind(sampleAdapter);
  const spy = vi.spyOn(sampleAdapter, 'respondToCapture').mockImplementationOnce(async (input) => {
    const res = await respond(input);
    return { ...res, data: { ...res.data, learned: learned.map((value) => ({ category: 'tool' as const, value, status: 'inferred' as const, confidence: 0.6, evidence: text })) } };
  });
  try {
    return await share(token, { text });
  } finally {
    spy.mockRestore();
  }
}

/** Import a pasted summary whose extraction is exactly these facts, as a live import might return them. */
async function importFacts(token: string, facts: { value: string; evidence?: string }[]): Promise<{ status: number; facts: Fact[] }> {
  const spy = vi.spyOn(sampleAdapter, 'extractFacts').mockResolvedValueOnce({
    generatedBy: 'sample',
    data: { facts: facts.map((f) => ({ category: 'interest' as const, status: 'inferred' as const, confidence: 0.6, ...f })), conflicts: [] },
  });
  try {
    const res = await client.request<{ facts: Fact[] }>('/api/context/sources', { body: { kind: 'paste', text: 'A summary of me that another AI wrote.' }, token });
    return { status: res.status, facts: res.json.facts };
  } finally {
    spy.mockRestore();
  }
}

describe('a share that restates a fact already in memory backs it too (findings 8 and 21)', () => {
  it('forgetting the first share keeps the fact while the later share still says it; forgetting both removes it', async () => {
    const me = await client.signup(uniqueEmail('mf-restate'));
    const a = await share(me.token, { text: BLUES, url: REEL });
    const learned = await memory(me.token);
    expect(values(learned)).toContain(LIKES);
    const b = await share(me.token, { text: BLUES });
    const both = await memory(me.token);
    expect(values(both)).toEqual(values(learned)); // restating adds no second copy
    for (const f of both) expect(f.sourceIds).toHaveLength(2); // but the later share is recorded as a source

    await forget(me.token, a.capture.id);
    const left = await memory(me.token);
    expect(values(left)).toEqual(values(learned));
    for (const f of left) {
      expect(f.status).toBe('inferred');
      expect(f.sourceIds).toHaveLength(1);
    }

    await forget(me.token, b.capture.id);
    expect(values(await memory(me.token))).not.toContain(LIKES);
  });

  it('"Just keep it" on the first share keeps what the later share also said, and the card built on it stays usable', async () => {
    const me = await client.signup(uniqueEmail('mf-restate-keep'));
    const a = await share(me.token, { text: BLUES, url: REEL });
    const b = await share(me.token, { text: BLUES });
    const fact = (await memory(me.token)).find((f) => f.value === LIKES);
    expect(fact).toBeDefined();
    const card = playgroundCard(me.user.id, { facts: [fact!.id] });

    expect(await keep(me.token, a)).toEqual({ ok: true, forgotten: 0 });
    expect(values(await memory(me.token))).toContain(LIKES);
    const after = await detail(me.token, card.id);
    expect(after.recommendation.status).toBe('fresh');
    expect(after.stale).toBeNull();

    // Keeping the second share too: nothing else says it any more, so it goes.
    expect((await keep(me.token, b)).forgotten).toBeGreaterThanOrEqual(1);
    expect(values(await memory(me.token))).not.toContain(LIKES);
  });
});

describe('Forget and "Just keep it" never take away what the person confirmed (finding 9)', () => {
  it('"Just keep it" keeps a fact the person edited in Memory', async () => {
    const me = await client.signup(uniqueEmail('mf-edited'));
    const a = await share(me.token, { text: BLUES, url: REEL });
    const fact = (await memory(me.token)).find((f) => f.value === LIKES);
    expect(fact).toBeDefined();
    const edit = await client.request<{ fact: Fact }>(`/api/context/facts/${fact!.id}`, { method: 'PATCH', body: { value: 'Loves slow fingerstyle blues' }, token: me.token });
    expect(edit.json.fact.status).toBe('confirmed');

    expect(await keep(me.token, a)).toEqual({ ok: true, forgotten: 0 });
    const kept = (await memory(me.token)).find((f) => f.id === fact!.id);
    expect(kept?.value).toBe('Loves slow fingerstyle blues');
    expect(kept?.status).toBe('confirmed');
  });

  it('Forget keeps a confirmed fact (without the forgotten share as its source) and still removes what was only inferred', async () => {
    const me = await client.signup(uniqueEmail('mf-confirmed'));
    const a = await share(me.token, { text: BLUES });
    const fact = (await memory(me.token)).find((f) => f.value === LIKES);
    expect(fact).toBeDefined();
    expect((await client.request(`/api/context/facts/${fact!.id}`, { method: 'PATCH', body: { status: 'confirmed' }, token: me.token })).status).toBe(200);

    const before = new Set((await memory(me.token)).map((f) => f.id));
    const c = await share(me.token, { text: 'I have 15 minutes a day for guitar practice' });
    const inferred = (await memory(me.token)).filter((f) => !before.has(f.id));
    expect(inferred.length).toBeGreaterThan(0);
    for (const f of inferred) expect(f.status).toBe('inferred');

    await forget(me.token, a.capture.id);
    const stays = (await memory(me.token)).find((f) => f.id === fact!.id);
    expect(stays?.status).toBe('confirmed');
    expect(stays?.sourceIds).toEqual([]);

    await forget(me.token, c.capture.id);
    const ids = new Set((await memory(me.token)).map((f) => f.id));
    for (const f of inferred) expect(ids.has(f.id)).toBe(false);
    expect(ids.has(fact!.id)).toBe(true);
  });
});

describe('Make mine carries one copy of a link or photo shared twice (finding 11)', () => {
  it('two shares of the same link become one saved source and one note', async () => {
    const me = await client.signup(uniqueEmail('mf-carry-link'));
    const url = 'https://example.com/blues-riff-lesson';
    const a = await share(me.token, { text: 'I like this guitar riff', url });
    const b = await share(me.token, { text: 'Learning this guitar riff, 15 minutes of practice a day', url: `${url}/` });
    const card = playgroundCard(me.user.id, { captures: [a.capture.id, b.capture.id] });
    const built = await client.request<BuildResponseDto>(`/api/recommendations/${card.id}/build`, { body: { spec: fixtureSpec('riff-practice') }, token: me.token });
    expect(built.status).toBe(201);
    expect(built.json.carried).toHaveLength(1);
    const links = (await recordsOf(me.token, built.json.app.id)).filter((r) => String(r.values.url ?? '').startsWith(url));
    expect(links).toHaveLength(1);
  });

  it('two shares of the same photo become one gallery entry', async () => {
    const me = await client.signup(uniqueEmail('mf-carry-photo'));
    const mediaId = await uploadPhoto(me.token);
    const a = await share(me.token, { text: 'Window light at five', mediaId });
    const b = await share(me.token, { text: 'The same window, softer light', mediaId });
    const card = playgroundCard(me.user.id, { captures: [a.capture.id, b.capture.id] }, 'gallery');
    const built = await client.request<BuildResponseDto>(`/api/recommendations/${card.id}/build`, { body: { spec: fixtureSpec('light-gallery') }, token: me.token });
    expect(built.status).toBe(201);
    expect(built.json.carried).toHaveLength(1);
    expect((await recordsOf(me.token, built.json.app.id)).filter((r) => r.values.photo === mediaId)).toHaveLength(1);
  });
});

describe('overlapping and forgotten share ids (findings 12 and 14)', () => {
  it('two overlapping sends of one share id make one capture; the later send gets it back, not a server error', async () => {
    const me = await client.signup(uniqueEmail('mf-race'));
    const body = { id: 'mf-race-share-0001', text: 'Riff idea for tonight', url: 'https://example.com/riff' };
    const sent = await Promise.all([
      client.request<ShareResult>('/api/agent/captures', { body, token: me.token }),
      client.request<ShareResult>('/api/agent/captures', { body, token: me.token }),
    ]);
    expect(sent.map((r) => r.status).sort()).toEqual([200, 201]);
    const again = sent.find((r) => r.status === 200)!;
    expect(again.json.duplicate).toBe(true);
    expect(again.json.capture.id).toBe(body.id);
    const thread = (await client.request<AgentThreadDto>('/api/agent/thread', { token: me.token })).json;
    expect(thread.items.filter((i) => i.capture.id === body.id)).toHaveLength(1);
  });

  it('a retry that arrives while the first send is still reading the link title gets the first share back', async () => {
    const me = await client.signup(uniqueEmail('mf-race-title'));
    const body = { id: 'mf-race-share-0002', text: 'Practise this lick tonight', url: 'https://www.youtube.com/watch?v=abc123xyz' };
    const lookupsBefore = fetchCalls.length;
    const first = client.request<ShareResult>('/api/agent/captures', { body, token: me.token });
    await new Promise((resolve) => setTimeout(resolve, 10));
    const second = client.request<ShareResult & ErrorBody>('/api/agent/captures', { body, token: me.token });
    const [a, b] = await Promise.all([first, second]);
    expect(fetchCalls.length - lookupsBefore).toBe(2); // both sends were inside the title lookup at once
    expect(a.status).toBe(201);
    expect(b.status).toBe(200);
    expect(b.json.duplicate).toBe(true);
    expect(b.json.capture.id).toBe(body.id);
    const thread = (await client.request<AgentThreadDto>('/api/agent/thread', { token: me.token })).json;
    expect(thread.items.filter((i) => i.capture.id === body.id)).toHaveLength(1);
  });

  it('a forgotten share id is refused on a retry: nothing comes back and nothing is learned again', async () => {
    const me = await client.signup(uniqueEmail('mf-forgotten-id'));
    const body = { id: 'mf-forget-retry-0001', text: BLUES };
    expect((await client.request('/api/agent/captures', { body, token: me.token })).status).toBe(201);
    expect(values(await memory(me.token))).toContain(LIKES);
    await forget(me.token, body.id);
    expect(values(await memory(me.token))).not.toContain(LIKES);

    const retry = await client.request<ErrorBody>('/api/agent/captures', { body, token: me.token });
    expect(retry.status).toBe(409);
    expect(retry.json.error).toMatch(/forget/);
    expect((await client.request(`/api/agent/captures/${body.id}`, { token: me.token })).status).toBe(404);
    expect(values(await memory(me.token))).not.toContain(LIKES);
    const thread = (await client.request<AgentThreadDto>('/api/agent/thread', { token: me.token })).json;
    expect(thread.items.some((i) => i.capture.id === body.id)).toBe(false);

    // Someone else sending that id learns nothing about it: the same refusal as any taken id.
    const other = await client.signup(uniqueEmail('mf-forgotten-other'));
    const theirs = await client.request<ErrorBody>('/api/agent/captures', { body, token: other.token });
    expect(theirs.status).toBe(400);
    expect(theirs.json.error).toBe('Share a thought, a link or a screenshot.');
  });
});

describe('a proposal counts as made only while its app exists (finding 35)', () => {
  it('deleting the app makes the proposal a proposal again: Make mine works and nothing links to the deleted app', async () => {
    const me = await client.signup(uniqueEmail('mf-deleted-app'));
    const r = await share(me.token, { text: 'I want a 15-minute guitar practice every day' });
    const proposal = ofKind(r, 'new_app');
    const draft = await client.request<ProposalPreviewDto>(`/api/recommendations/${proposal.id}/draft`, { body: {}, token: me.token });
    expect(draft.status).toBe(200);
    const first = await client.request<BuildResponseDto>(`/api/recommendations/${proposal.id}/build`, { body: { spec: draft.json.spec }, token: me.token });
    expect(first.status).toBe(201);
    expect((await client.request(`/api/apps/${first.json.app.id}`, { method: 'DELETE', token: me.token })).status).toBe(200);

    // The Make page enables Make mine and Preview again and shows no "Open app" (it needs status built).
    const open = await detail(me.token, proposal.id);
    expect(open.recommendation.status).toBe('fresh');
    expect(open.recommendation.builtAppId).toBeNull();
    expect(open.stale).toBeNull();
    const card = await threadProposal(me.token, r.capture.id, proposal.id);
    // Ori's card says "Preview <App>" and leads to Make mine again (not to the deleted app).
    expect(proposalAction(card)).toMatchObject({ to: `/make/${proposal.id}`, emphasis: 'primary' });
    expect(proposalAction(card).label).toMatch(/^Preview\b/);

    const again = await client.request<BuildResponseDto>(`/api/recommendations/${proposal.id}/build`, { body: { spec: draft.json.spec }, token: me.token });
    expect(again.status).toBe(201);
    expect(again.json.alreadyBuilt).toBeUndefined();
    expect(again.json.app.id).not.toBe(first.json.app.id);
    const made = await detail(me.token, proposal.id);
    expect(made.recommendation.status).toBe('built');
    expect(made.recommendation.builtAppId).toBe(again.json.app.id);
  });

  it('a stored proposal that still points at a deleted app reads as not made, without rewriting it', async () => {
    const me = await client.signup(uniqueEmail('mf-orphan'));
    const r = await share(me.token, { text: 'I want a 15-minute guitar practice every day' });
    const proposal = ofKind(r, 'new_app');
    const draft = await client.request<ProposalPreviewDto>(`/api/recommendations/${proposal.id}/draft`, { body: {}, token: me.token });
    const first = await client.request<BuildResponseDto>(`/api/recommendations/${proposal.id}/build`, { body: { spec: draft.json.spec }, token: me.token });
    expect(first.status).toBe(201);
    // As an older build left it: the app row is gone, the proposal row still says built.
    getDb().prepare('DELETE FROM apps WHERE id = ?').run(first.json.app.id);
    const row = () => getDb().prepare('SELECT status FROM recommendations WHERE id = ?').get(proposal.id) as { status: string };
    expect(row().status).toBe('built');

    const open = await detail(me.token, proposal.id);
    expect(open.recommendation.status).toBe('fresh');
    expect(open.recommendation.builtAppId).toBeNull();
    const listed = (await client.request<RecommendationsDto>('/api/recommendations', { token: me.token })).json.recommendations.find((x) => x.id === proposal.id);
    expect(listed?.status).toBe('fresh');
    expect(proposalAction(await threadProposal(me.token, r.capture.id, proposal.id)).to).toBe(`/make/${proposal.id}`);
    expect(row().status).toBe('built'); // reading changed nothing
    expect((await client.request(`/api/recommendations/${proposal.id}/build`, { body: { spec: draft.json.spec }, token: me.token })).status).toBe(201);
  });

  it('a proposal to use an app that was deleted no longer links to it', async () => {
    const me = await client.signup(uniqueEmail('mf-deleted-target'));
    const riff = await fixtureApp(me.token, 'riff-practice');
    const r = await share(me.token, { text: GUITAR_NOTE, url: REEL });
    const use = ofKind(r, 'use_app');
    expect(use.targetAppId).toBe(riff.app.id);
    expect((await client.request(`/api/apps/${riff.app.id}`, { method: 'DELETE', token: me.token })).status).toBe(200);

    const card = await threadProposal(me.token, r.capture.id, use.id);
    expect(card.targetAppId).toBeUndefined();
    expect(proposalAction(card).to).not.toContain(riff.app.id);
    const open = await detail(me.token, use.id);
    expect(open.targetApp).toBeNull();
    expect(open.recommendation.targetAppId).toBeUndefined();
  });
});

describe('a fact is the same only in the same words, in any script (follow-up to findings 8 and 21)', () => {
  const same = (a: string, b: string) => ctx.normalizeFact(a) === ctx.normalizeFact(b);

  it('compares letters, marks, digits and symbols of any script, case-folded, with punctuation read as a space', () => {
    expect(same('Likes 指弹布鲁斯', 'Likes 古典吉他')).toBe(false);
    expect(same('Любит джаз', 'Любит рок')).toBe(false);
    expect(same('Likes ไม้', 'Likes ไม่')).toBe(false); // Thai words that differ only in a tone mark
    expect(same('Likes 🎸', 'Likes 🎹')).toBe(false);
    expect(same('Plays in C#', 'Plays in C')).toBe(false);
    expect(same('Codes in C++', 'Codes in C')).toBe(false);
    expect(same('Likes 古典吉他', 'likes 古典吉他!')).toBe(true);
    expect(same('ЛЮБИТ ДЖАЗ', 'любит  джаз.')).toBe(true);
    expect(same('Likes fingerstyle blues', 'likes fingerstyle-blues.')).toBe(true);
    expect(same('Ｌｉｋｅｓ ｊａｚｚ', 'Likes jazz')).toBe(true); // full-width letters
  });

  it('a value too short to compare loosely matches only the same wording, and a blank value has no key', () => {
    expect(same('🎸', '🎹')).toBe(false);
    expect(same('C#', 'C')).toBe(false);
    expect(same('Go!', 'Go')).toBe(false);
    expect(same('?!', '…')).toBe(false);
    expect(same('Go', 'go')).toBe(true);
    expect(ctx.normalizeFact('')).toBe('');
    expect(ctx.normalizeFact(' \n ')).toBe('');
  });

  it('a share in another script is its own fact, and Forget takes only what that share said', async () => {
    const me = await client.signup(uniqueEmail('mf-script'));
    const a = await share(me.token, { text: 'I like 指弹布鲁斯' });
    await share(me.token, { text: 'I like 古典吉他' });
    const facts = await memory(me.token);
    expect(values(facts)).toEqual(['Likes 古典吉他', 'Likes 指弹布鲁斯']);
    for (const f of facts) expect(f.sourceIds).toHaveLength(1);

    // The same words shared again do back the fact they restate.
    await share(me.token, { text: 'I like 古典吉他' });
    expect((await memory(me.token)).find((f) => f.value === 'Likes 古典吉他')?.sourceIds).toHaveLength(2);

    await forget(me.token, a.capture.id);
    expect(values(await memory(me.token))).toEqual(['Likes 古典吉他']);
  });

  it('a share never stores a blank fact, and a fact too short to compare loosely is backed only by the same wording', async () => {
    const me = await client.signup(uniqueEmail('mf-short'));
    await shareLearning(me.token, 'I write C# and Go at work', [' ', 'C#', 'Go']);
    expect(values(await memory(me.token))).toEqual(['C#', 'Go']);

    await shareLearning(me.token, 'Mostly c# these days. Go!', ['c#', 'Go!']);
    const facts = await memory(me.token);
    expect(values(facts)).toEqual(['C#', 'Go', 'Go!']);
    expect(facts.find((f) => f.value === 'C#')?.sourceIds).toHaveLength(2);
    expect(facts.find((f) => f.value === 'Go')?.sourceIds).toHaveLength(1);
  });

  it('an import compares facts the same way: other scripts stay apart, and a fact it restates gains it as a source', async () => {
    const me = await client.signup(uniqueEmail('mf-import-script'));
    await share(me.token, { text: 'I like 古典吉他' });
    const known = (await memory(me.token)).find((f) => f.value === 'Likes 古典吉他');
    expect(known?.sourceIds).toHaveLength(1);

    const imported = await importFacts(me.token, ['Likes 古典吉他.', 'Likes 指弹布鲁斯', 'Любит джаз', 'Любит рок'].map((value) => ({ value })));
    expect(imported.status).toBe(201);
    expect(values(imported.facts)).toEqual(['Likes 指弹布鲁斯', 'Любит джаз', 'Любит рок']);
    const facts = await memory(me.token);
    expect(values(facts)).toEqual(['Likes 古典吉他', 'Likes 指弹布鲁斯', 'Любит джаз', 'Любит рок']);
    expect(facts.find((f) => f.id === known?.id)?.sourceIds).toHaveLength(2);
  });
});

describe('shares do not count toward the import limit (follow-up)', () => {
  it(`${MAX_SOURCES_PER_USER} shares still leave room to import, and imports still stop at the limit`, async () => {
    const me = await client.signup(uniqueEmail('mf-limit'));
    for (let i = 0; i < MAX_SOURCES_PER_USER; i++) await share(me.token, { text: BLUES });
    const sources = (await client.request<{ sources: { kind: string }[] }>('/api/context', { token: me.token })).json.sources;
    expect(sources.filter((s) => s.kind === 'capture')).toHaveLength(MAX_SOURCES_PER_USER);

    const paste = (n: number) => client.request<ErrorBody>('/api/context/sources', { body: { kind: 'paste', text: `I am a product designer who plays guitar on weekends, part ${n}.` }, token: me.token });
    expect((await paste(1)).status).toBe(201);
    for (let i = 2; i < MAX_SOURCES_PER_USER; i++) ctx.createSource(me.user.id, { label: `Earlier import ${i}`, kind: 'paste', text: 'An earlier import.' });
    expect((await paste(MAX_SOURCES_PER_USER)).status).toBe(201);
    const over = await paste(MAX_SOURCES_PER_USER + 1);
    expect(over.status).toBe(409);
    expect(over.json.error).toBe(`You can keep up to ${MAX_SOURCES_PER_USER} sources, not counting what you shared with the agent. Remove one in What you've shared first.`);
  });
});

describe('a fact never quotes a share it no longer comes from (follow-up to findings 8, 9 and 21)', () => {
  const OTHER_BLUES = 'I love fingerstyle blues and practise every evening';
  const quoteOf = (f: unknown) => (f as { evidence?: string | null }).evidence;

  it('Forget: a fact another share still states quotes that share instead, wherever it is shown', async () => {
    const me = await client.signup(uniqueEmail('mf-quote-forget'));
    const a = await share(me.token, { text: BLUES, url: REEL });
    await share(me.token, { text: OTHER_BLUES });
    const fact = (await memory(me.token)).find((f) => f.value === LIKES);
    expect(fact?.sourceIds).toHaveLength(2);
    expect(fact?.evidence).toBe(BLUES);
    const card = playgroundCard(me.user.id, { facts: [fact!.id] });

    await forget(me.token, a.capture.id);
    expect((await memory(me.token)).find((f) => f.id === fact!.id)?.evidence).toBe(OTHER_BLUES);
    expect((await detail(me.token, card.id)).evidence.map(quoteOf)).toEqual([OTHER_BLUES]);
  });

  it('a long note quotes only its sentence that supports the fact, never its unrelated start', async () => {
    const me = await client.signup(uniqueEmail('mf-quote-long'));
    const a = await share(me.token, { text: BLUES, url: REEL });
    const errands = 'Today I cleaned the flat, called my landlord about the boiler and booked a dentist appointment for Thursday. Then a long walk by the river with my sister.';
    await share(me.token, { text: `${errands} Also, I love fingerstyle blues.` });
    const fact = (await memory(me.token)).find((f) => f.value === LIKES);
    expect(fact?.sourceIds).toHaveLength(2);
    await forget(me.token, a.capture.id);
    const quote = (await memory(me.token)).find((f) => f.id === fact!.id)?.evidence;
    expect(quote).toBe('Also, I love fingerstyle blues.');
    expect(quote).not.toMatch(/landlord|dentist/);
  });

  it('"Just keep it" does the same', async () => {
    const me = await client.signup(uniqueEmail('mf-quote-keep'));
    const a = await share(me.token, { text: BLUES, url: REEL });
    await share(me.token, { text: OTHER_BLUES });
    expect(await keep(me.token, a)).toEqual({ ok: true, forgotten: 0 });
    const fact = (await memory(me.token)).find((f) => f.value === LIKES);
    expect(fact?.sourceIds).toHaveLength(1);
    expect(fact?.evidence).toBe(OTHER_BLUES);
  });

  it('a fact kept because the person edited it keeps no quote, and a removed fact keeps none stored', async () => {
    const me = await client.signup(uniqueEmail('mf-quote-edited'));
    const a = await share(me.token, { text: BLUES });
    const fact = (await memory(me.token)).find((f) => f.value === LIKES);
    expect(fact?.evidence).toBe(BLUES);
    const edited = await client.request(`/api/context/facts/${fact?.id}`, { method: 'PATCH', body: { value: 'Loves slow fingerstyle blues' }, token: me.token });
    expect(edited.status).toBe(200);
    const c = await share(me.token, { text: 'I have 15 minutes a day for guitar practice' });
    const others = (await memory(me.token)).filter((f) => f.id !== fact?.id);
    expect(others.length).toBeGreaterThan(0);

    await forget(me.token, a.capture.id);
    expect((await memory(me.token)).find((f) => f.id === fact?.id)).toMatchObject({ value: 'Loves slow fingerstyle blues', status: 'confirmed', sourceIds: [], evidence: null });

    await forget(me.token, c.capture.id);
    for (const f of others) {
      const row = getDb().prepare('SELECT status, evidence FROM profile_facts WHERE id = ?').get(f.id) as { status: string; evidence: string | null };
      expect(row.status).toBe('removed');
      expect(row.evidence).toBeNull();
    }
  });

  it('a quote from an import stays when a later share is forgotten, and a quote from a share goes when only an import still backs the fact', async () => {
    const IMPORT_QUOTE = 'I play guitar and like fingerstyle blues.';
    const me = await client.signup(uniqueEmail('mf-quote-import'));
    expect((await importFacts(me.token, [{ value: LIKES, evidence: IMPORT_QUOTE }])).status).toBe(201);
    const a = await share(me.token, { text: BLUES });
    const fact = (await memory(me.token)).find((f) => f.value === LIKES);
    expect(fact?.evidence).toBe(IMPORT_QUOTE);
    expect(fact?.sourceIds).toHaveLength(2);
    await forget(me.token, a.capture.id);
    expect((await memory(me.token)).find((f) => f.id === fact?.id)).toMatchObject({ value: LIKES, sourceIds: [fact?.sourceIds[0]], evidence: IMPORT_QUOTE });

    // The other way round: the share said it first, then an import restated it (an import keeps no quote of a fact it restates).
    const other = await client.signup(uniqueEmail('mf-quote-import-later'));
    const b = await share(other.token, { text: BLUES });
    expect((await importFacts(other.token, [{ value: 'likes fingerstyle blues', evidence: IMPORT_QUOTE }])).facts).toEqual([]);
    const restated = (await memory(other.token)).find((f) => f.value === LIKES);
    expect(restated?.evidence).toBe(BLUES);
    expect(restated?.sourceIds).toHaveLength(2);
    await forget(other.token, b.capture.id);
    expect((await memory(other.token)).find((f) => f.id === restated?.id)).toMatchObject({ value: LIKES, status: 'inferred', sourceIds: [restated?.sourceIds[1]], evidence: null });
  });
});

describe('a card whose app was deleted is replaced like a fresh one (follow-up to finding 35)', () => {
  it('one Refresh clears the banner such a card kept bringing back, and a card whose app exists stays made', async () => {
    const me = await client.signup(uniqueEmail('mf-legacy-refresh'));
    await client.request('/api/context/interests', { body: { interest: 'learning guitar' }, token: me.token });
    const first = await client.request<RecommendationsDto>('/api/recommendations/generate', { body: {}, token: me.token });
    expect(first.status).toBe(200);
    const cards = first.json.recommendations.filter((r) => r.kind === 'new_app' && !r.captureId);
    expect(cards.length).toBeGreaterThanOrEqual(2);
    const [gone, kept] = cards as [Recommendation, Recommendation];
    const made = new Map<string, string>();
    for (const card of [gone, kept]) {
      const draft = await client.request<ProposalPreviewDto>(`/api/recommendations/${card.id}/draft`, { body: {}, token: me.token });
      const built = await client.request<BuildResponseDto>(`/api/recommendations/${card.id}/build`, { body: { spec: draft.json.spec }, token: me.token });
      expect(built.status).toBe(201);
      made.set(card.id, built.json.app.id);
    }
    // As older builds left it: the app row is gone and the card is still marked built (it reads as fresh).
    getDb().prepare('DELETE FROM apps WHERE id = ?').run(made.get(gone.id) ?? '');
    await client.request('/api/context/interests', { body: { interest: 'film photography' }, token: me.token });
    const overview = async () => (await client.request<RecommendationsDto>('/api/recommendations', { token: me.token })).json;
    const before = await overview();
    expect(before.stale).toBe(true);
    expect(before.recommendations.find((r) => r.id === gone.id)?.status).toBe('fresh');

    expect((await client.request('/api/recommendations/generate', { body: {}, token: me.token })).status).toBe(200);
    const after = await overview();
    expect(after.stale).toBe(false);
    expect(after.recommendations.some((r) => r.id === gone.id)).toBe(false);
    expect(after.recommendations.find((r) => r.id === kept.id)).toMatchObject({ status: 'built', builtAppId: made.get(kept.id) });
  });

  it('asking again about a share replaces its card whose app was deleted', async () => {
    const me = await client.signup(uniqueEmail('mf-legacy-again'));
    const r = await share(me.token, { text: 'I want a 15-minute guitar practice every day' });
    const proposal = ofKind(r, 'new_app');
    const draft = await client.request<ProposalPreviewDto>(`/api/recommendations/${proposal.id}/draft`, { body: {}, token: me.token });
    const built = await client.request<BuildResponseDto>(`/api/recommendations/${proposal.id}/build`, { body: { spec: draft.json.spec }, token: me.token });
    expect(built.status).toBe(201);
    getDb().prepare('DELETE FROM apps WHERE id = ?').run(built.json.app.id);

    expect((await client.request(`/api/agent/captures/${r.capture.id}/respond`, { method: 'POST', token: me.token })).status).toBe(200);
    const thread = (await client.request<AgentThreadDto>('/api/agent/thread', { token: me.token })).json;
    const proposals = thread.items.find((i) => i.capture.id === r.capture.id)?.reply?.proposals ?? [];
    expect(proposals.some((p) => p.id === proposal.id)).toBe(false);
    expect(proposals.filter((p) => p.kind === 'new_app')).toHaveLength(1);
  });
});

describe('a category change is a correction too (follow-up to finding 9)', () => {
  it('confirms the fact, so Forget keeps it; removing it in the same change still removes it', async () => {
    const me = await client.signup(uniqueEmail('mf-category'));
    const a = await share(me.token, { text: BLUES });
    const fact = (await memory(me.token)).find((f) => f.value === LIKES);
    expect(fact?.status).toBe('inferred');
    const moved = await client.request<{ fact: Fact }>(`/api/context/facts/${fact?.id}`, { method: 'PATCH', body: { category: 'goal' }, token: me.token });
    expect(moved.status).toBe(200);
    expect(moved.json.fact).toMatchObject({ category: 'goal', status: 'confirmed', confidence: 1 });

    await forget(me.token, a.capture.id);
    expect((await memory(me.token)).find((f) => f.id === fact?.id)).toMatchObject({ value: LIKES, category: 'goal', status: 'confirmed' });

    await share(me.token, { text: 'I have 15 minutes a day for guitar practice' });
    const other = (await memory(me.token)).find((f) => f.id !== fact?.id);
    expect(other).toBeDefined();
    const removed = await client.request<{ fact: Fact }>(`/api/context/facts/${other?.id}`, { method: 'PATCH', body: { category: 'goal', status: 'removed' }, token: me.token });
    expect(removed.json.fact.status).toBe('removed');
    expect((await memory(me.token)).some((f) => f.id === other?.id)).toBe(false);
  });
});
