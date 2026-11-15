#!/usr/bin/env node
/**
 * Deployment check for a running Ori server (local stand-in or the real host). Two phases:
 *
 *   node scripts/verify-deploy.mjs --base <url> --phase before --state <file> [--pitch no] [--expect-live yes]
 *                                  [--demo-password-file <file>]
 *     health · /pitch → /pitch/ · /pitch/ page · the three demo recordings · sign up · log out · log in ·
 *     make an app the real way (share → reply → design → build), recording which model produced each step and
 *     how long it took · upload a photo · save an entry with it · revise the app (preview → apply) and check the
 *     entry is unchanged · reopen the app by its own link · optional: the demo account signs in and has its apps
 *
 *   (restart the server on the same disk; on Render a deploy restarts it)
 *
 *   node scripts/verify-deploy.mjs --base <url> --phase after --state <file> [--pitch no]
 *     the old session still works · log in again · the same app (revised), entry and photo are there
 *
 * --expect-live yes  a step answered by the Sample fallback instead of the live model counts as a failure
 * --pitch no         skip the pitch checks (for a deployment that does not have the pitch yet)
 * --demo-password-file  a local file holding the demo account's password (never printed or stored)
 *
 * It creates one throwaway account (random password, kept only in the state file), one stranger account and one
 * app (its entry's note starts "Deploy check:"). The state file holds the throwaway account's email, password, ids
 * and a session cookie: it defaults to the system temp folder, and if you pass --state keep it outside the
 * repository (deploy-check*.json is git-ignored as a safety net). Never point this at a server you care about
 * without reading it first.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => (a.startsWith('--') ? [a.slice(2), all[i + 1] ?? ''] : [])).filter((x) => x.length));
const BASE = (args.base ?? 'http://localhost:8850').replace(/\/$/, '');
const PHASE = args.phase ?? 'before';
const STATE = path.resolve(args.state ?? path.join(os.tmpdir(), 'ori-deploy-check-state.json'));
const PITCH = args.pitch !== 'no';
const EXPECT_LIVE = args['expect-live'] === 'yes';
const DEMO_PASSWORD_FILE = args['demo-password-file'] ? path.resolve(args['demo-password-file']) : '';
const DEMO_EMAIL = 'demo@aiappstore.local';
const PHOTO = path.resolve('server/fixtures/media/light-2.jpg');

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` (${detail})` : ''}`);
};
const info = (name, detail) => {
  results.push({ name, ok: null, detail });
  console.log(`  INFO  ${name}: ${detail}`);
};

/** A tiny cookie-aware client: the session cookie is the browser's sign-in. */
function client(cookie = '') {
  let jar = cookie;
  const req = async (method, url, body, extraHeaders = {}) => {
    const headers = { ...extraHeaders };
    if (jar) headers.cookie = jar;
    let payload;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
    const started = Date.now();
    const res = await fetch(`${BASE}${url}`, { method, headers, body: payload, redirect: 'manual' });
    const set = res.headers.getSetCookie?.() ?? [];
    for (const c of set) { const kv = c.split(';')[0]; if (kv.startsWith('aas_session=')) jar = kv; }
    const type = res.headers.get('content-type') ?? '';
    const data = type.includes('application/json') ? await res.json().catch(() => null) : null;
    return { status: res.status, data, headers: res.headers, res, ms: Date.now() - started };
  };
  return { req, get cookie() { return jar; } };
}

/** Which model produced a step, from the server's own record of it. */
function provenance(step, generatedBy, fallbackReason, ms) {
  const live = generatedBy === 'anthropic' && !fallbackReason;
  const detail = `${generatedBy ?? 'unknown'}${fallbackReason ? `, fallback: ${fallbackReason}` : ''}, ${(ms / 1000).toFixed(1)} s`;
  if (EXPECT_LIVE) check(`${step} came from the live model`, live, detail);
  else info(`${step} produced by`, detail);
  return { step, generatedBy: generatedBy ?? null, fallbackReason: fallbackReason ?? null, seconds: Math.round(ms / 100) / 10 };
}

async function pitchChecks() {
  if (!PITCH) { info('pitch', 'skipped (--pitch no)'); return; }
  const redirect = await fetch(`${BASE}/pitch`, { redirect: 'manual' });
  check('/pitch redirects to /pitch/', [301, 302, 308].includes(redirect.status) && /\/pitch\/$/.test(redirect.headers.get('location') ?? ''), `${redirect.status} → ${redirect.headers.get('location')}`);
  const page = await fetch(`${BASE}/pitch/`);
  const html = await page.text();
  // The deck itself (its own scripts), never the app's index served by the SPA fallback.
  check('/pitch/ serves the presentation', page.status === 200 && /config\.js/.test(html) && /pitch\.js|scenes\.js/.test(html) && !/id="root"/.test(html), `${page.status}`);
  const config = await fetch(`${BASE}/pitch/config.js`);
  const configText = await config.text();
  const clips = [...new Set([...configText.matchAll(/(media\/[A-Za-z0-9._-]+\.(?:webm|mp4))/g)].map((m) => m[1]))];
  check('pitch config names the recordings', clips.length >= 3, clips.join(', '));
  for (const clip of clips) {
    const r = await fetch(`${BASE}/pitch/${clip}`, { headers: { range: 'bytes=0-1023' } });
    const size = Number(r.headers.get('content-range')?.split('/')[1] ?? r.headers.get('content-length') ?? 0);
    check(`recording served: ${clip}`, (r.status === 200 || r.status === 206) && /^video\//.test(r.headers.get('content-type') ?? '') && size > 10_000, `${r.status} ${r.headers.get('content-type')} ${size} bytes`);
  }
}

async function demoAccountCheck() {
  if (!DEMO_PASSWORD_FILE) { info('demo account', 'not checked (no --demo-password-file)'); return; }
  const password = fs.readFileSync(DEMO_PASSWORD_FILE, 'utf8').trim();
  const d = client();
  const login = await d.req('POST', '/api/auth/login', { email: DEMO_EMAIL, password });
  check('the demo account signs in', login.status === 200 && Boolean(d.cookie), `${login.status}`);
  if (login.status !== 200) return;
  const list = await d.req('GET', '/api/apps');
  const names = (list.data?.apps ?? []).map((a) => a.name);
  check('the demo account has Riff, Light and People', ['Riff', 'Light', 'People'].every((n) => names.includes(n)), names.join(', '));
}

async function before() {
  const health = await fetch(`${BASE}/api/health`).then((r) => r.json());
  check('health', health.ok === true, `model mode ${health.modelMode}`);
  await pitchChecks();
  await demoAccountCheck();

  const email = `deploy-check-${Date.now().toString(36)}@example.test`;
  const password = `dc-${crypto.randomBytes(12).toString('base64url')}`;
  const a = client();
  const signup = await a.req('POST', '/api/auth/signup', { email, password, displayName: 'Deploy check' });
  check('sign up', signup.status === 201 && Boolean(a.cookie), `${signup.status}`);
  const out = await a.req('POST', '/api/auth/logout', {});
  check('log out', out.status === 200, `${out.status}`);
  const b = client();
  const login = await b.req('POST', '/api/auth/login', { email, password });
  check('log in', login.status === 200 && Boolean(b.cookie), `${login.status}`);
  const me = await b.req('GET', '/api/auth/me');
  check('signed in as the account', me.data?.user?.email === email);
  const models = [];
  const state = { base: BASE, email, password, cookie: b.cookie, models };
  const save = () => fs.writeFileSync(STATE, JSON.stringify(state, null, 2));
  save();

  // Make an app the real way: share → the reply's new-app proposal → its design → build.
  const share = await b.req('POST', '/api/agent/captures', { text: 'I keep stopping for long shadows on brick walls in the late afternoon. I want a simple app for my street photos with a note about what the light was doing in each one.' });
  const reply = share.data?.reply;
  if (reply) models.push(provenance('agent reply', reply.generatedBy, reply.fallbackReason, share.ms));
  if (reply?.message) info('agent reply text', reply.message.slice(0, 160));
  const proposal = reply?.proposals?.find((p) => p.kind === 'new_app');
  check('share gets a reply with an app idea', [200, 201].includes(share.status) && Boolean(proposal), proposal?.title ?? `${share.status} ${share.data?.error ?? ''} proposals: ${(reply?.proposals ?? []).map((p) => p.kind).join(', ')}`);
  if (!proposal) { save(); return; }
  const draft = await b.req('POST', `/api/recommendations/${proposal.id}/draft`, { instructions: '' });
  if (draft.data?.spec) models.push(provenance('app design', draft.data.generatedBy, draft.data.fallbackReason, draft.ms));
  check('the idea is designed', draft.status === 200 && Boolean(draft.data?.spec), `${draft.status}${draft.data?.spec ? ` "${draft.data.spec.name}"` : ''}`);
  if (!draft.data?.spec) { save(); return; }
  const built = await b.req('POST', `/api/recommendations/${proposal.id}/build`, { spec: draft.data.spec, description: draft.data.description });
  const appId = built.data?.app?.id;
  check('Make mine creates the app', [200, 201].includes(built.status) && Boolean(appId), `${built.status} ${built.data?.app?.name ?? ''}`);
  if (!appId) { save(); return; }
  state.appId = appId;
  const spec = built.data.spec;
  const imageField = spec.fields.find((f) => f.type === 'image');
  const textField = spec.fields.find((f) => (f.type === 'text' || f.type === 'long_text') && !f.hidden);

  // Upload a photo and save an entry (an observation) with it.
  const form = new FormData();
  form.append('file', new Blob([fs.readFileSync(PHOTO)], { type: 'image/jpeg' }), 'light-2.jpg');
  const up = await b.req('POST', '/api/media', form);
  const mediaId = up.data?.media?.id;
  check('photo upload', up.status === 201 && Boolean(mediaId), `${up.status}`);
  const values = {};
  if (imageField) values[imageField.id] = mediaId;
  if (textField) values[textField.id] = 'Deploy check: low sun turns the brick wall gold';
  const today = new Date();
  const local = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  for (const f of spec.fields) if (f.required && values[f.id] === undefined && f.type === 'date') values[f.id] = local;
  const rec = await b.req('POST', `/api/apps/${appId}/records`, { values });
  const recordId = rec.data?.record?.id;
  check('observation with the photo saved', rec.status === 201 && Boolean(recordId), `${rec.status} ${JSON.stringify(rec.data?.details ?? '')}`);
  Object.assign(state, { recordId, mediaId, values });
  save();
  const img = await b.req('GET', `/api/media/${mediaId}`);
  check('photo served to its owner', img.status === 200 && /^image\//.test(img.headers.get('content-type') ?? ''), `${img.status} ${img.headers.get('content-type')}`);
  const stranger = client();
  await stranger.req('POST', '/api/auth/signup', { email: `deploy-stranger-${Date.now().toString(36)}@example.test`, password: `st-${crypto.randomBytes(12).toString('base64url')}`, displayName: 'Stranger' });
  const foreign = await stranger.req('GET', `/api/media/${mediaId}`);
  check('photo refused to another account', foreign.status === 404, `${foreign.status}`);

  // Revise the app by asking, then check the saved observation is untouched.
  const preview = await b.req('POST', `/api/apps/${appId}/revisions/preview`, { request: 'Add camera settings to my photo notes.' });
  if (preview.data?.ops) models.push(provenance('app revision', preview.data.generatedBy, preview.data.fallbackReason, preview.ms));
  check('the change is previewed', preview.status === 200 && (preview.data?.ops?.length ?? 0) > 0, `${preview.status} ${preview.data?.summary ?? preview.data?.error ?? ''}`);
  if (preview.data?.ops?.length) {
    const apply = await b.req('POST', `/api/apps/${appId}/revisions/apply`, { ops: preview.data.ops, summary: preview.data.summary, baseVersion: preview.data.baseVersion, proposalId: preview.data.proposalId });
    const fieldsAfter = apply.data?.spec?.fields?.length ?? 0;
    check('the change is applied', apply.status === 200 && fieldsAfter > spec.fields.length, `${apply.status}; fields ${spec.fields.length} → ${fieldsAfter}`);
    state.fieldsAfterRevision = fieldsAfter;
    const recs = await b.req('GET', `/api/apps/${appId}/records`);
    const kept = recs.data?.records?.find((r) => r.id === recordId);
    check('the observation and its photo are unchanged after the revision', Boolean(kept) && Object.keys(values).every((k) => kept.values[k] === values[k]), `${recs.data?.records?.length ?? 0} entries`);
  }
  const direct = await b.req('GET', `/apps/${appId}/`);
  check('the app reopens at its own link', direct.status === 200 && /<html/i.test(await direct.res.text().catch(() => '')), `${direct.status} ${BASE}/apps/${appId}/`);
  save();
}

async function after() {
  const s = JSON.parse(fs.readFileSync(STATE, 'utf8'));
  const health = await fetch(`${BASE}/api/health`).then((r) => r.json());
  check('health after restart', health.ok === true, `model mode ${health.modelMode}`);
  await pitchChecks();
  await demoAccountCheck();
  const old = client(s.cookie);
  const me = await old.req('GET', '/api/auth/me');
  check('the session from before the restart still works', me.status === 200 && me.data?.user?.email === s.email, `${me.status}`);
  const b = client();
  const login = await b.req('POST', '/api/auth/login', { email: s.email, password: s.password });
  check('log in after restart', login.status === 200, `${login.status}`);
  if (!s.appId) { check('an app from the first phase to look for', false, 'the first phase did not make one'); return; }
  const app = await b.req('GET', `/api/apps/${s.appId}`);
  check('the app is still there', app.status === 200 && app.data?.app?.id === s.appId, `${app.status} ${app.data?.app?.name ?? ''}`);
  if (s.fieldsAfterRevision) {
    const fields = app.data?.spec?.fields?.length ?? 0;
    check('the revision is still applied', fields === s.fieldsAfterRevision, `${fields} fields`);
  }
  const recs = await b.req('GET', `/api/apps/${s.appId}/records`);
  const kept = recs.data?.records?.find((r) => r.id === s.recordId);
  check('the observation is still there, unchanged', Boolean(kept) && Object.keys(s.values ?? {}).every((k) => kept.values[k] === s.values[k]), `${recs.data?.records?.length ?? 0} entries`);
  const img = await b.req('GET', `/api/media/${s.mediaId}`);
  check('the photo file is still there', img.status === 200 && /^image\//.test(img.headers.get('content-type') ?? ''), `${img.status}`);
  const direct = await b.req('GET', `/apps/${s.appId}/`);
  check('the app reopens at its own link', direct.status === 200, `${direct.status}`);
}

console.log(`deploy check · ${PHASE} · ${BASE}`);
try {
  if (PHASE === 'after') await after(); else await before();
} catch (err) {
  check('no unexpected error', false, err instanceof Error ? err.message : String(err));
}
const failed = results.filter((r) => r.ok === false).length;
const passed = results.filter((r) => r.ok === true).length;
console.log(`SUMMARY: ${passed}/${passed + failed} passed`);
if (failed) process.exitCode = 1;
