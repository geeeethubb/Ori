#!/usr/bin/env node
/**
 * Deployment check for a running Ori server (local stand-in or the real host). Two phases:
 *
 *   node scripts/verify-deploy.mjs --base <url> --phase before --state <file>
 *     health · /pitch → /pitch/ · /pitch/ page · the three demo recordings · sign up · log out · log in ·
 *     make an app the real way (share → proposal → design → build) · upload a photo · save an entry with it
 *
 *   (restart the server on the same disk)
 *
 *   node scripts/verify-deploy.mjs --base <url> --phase after --state <file>
 *     the old session still works · log in again · the same app, entry and photo are there after the restart
 *
 * The state file holds the throwaway account's email and password and the ids made in phase one. Never
 * point this at real data you care about without reading it first: it creates one account and one app.
 */
import fs from 'node:fs';
import path from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => (a.startsWith('--') ? [a.slice(2), all[i + 1] ?? ''] : [])).filter((x) => x.length));
const BASE = (args.base ?? 'http://localhost:8850').replace(/\/$/, '');
const PHASE = args.phase ?? 'before';
const STATE = path.resolve(args.state ?? 'deploy-check-state.json');
const PHOTO = path.resolve('server/fixtures/media/light-2.jpg');

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` (${detail})` : ''}`);
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
    const res = await fetch(`${BASE}${url}`, { method, headers, body: payload, redirect: 'manual' });
    const set = res.headers.getSetCookie?.() ?? [];
    for (const c of set) { const kv = c.split(';')[0]; if (kv.startsWith('aas_session=')) jar = kv; }
    const type = res.headers.get('content-type') ?? '';
    const data = type.includes('application/json') ? await res.json().catch(() => null) : null;
    return { status: res.status, data, headers: res.headers, res };
  };
  return { req, get cookie() { return jar; } };
}

async function pitchChecks() {
  const redirect = await fetch(`${BASE}/pitch`, { redirect: 'manual' });
  check('/pitch redirects to /pitch/', [301, 302, 308].includes(redirect.status) && /\/pitch\/$/.test(redirect.headers.get('location') ?? ''), `${redirect.status} → ${redirect.headers.get('location')}`);
  const page = await fetch(`${BASE}/pitch/`);
  const html = await page.text();
  // The deck itself (its own scripts), never the app's index served by the SPA fallback.
  check('/pitch/ serves the presentation', page.status === 200 && /config\.js/.test(html) && /pitch\.js|scenes\.js/.test(html) && !/id="root"/.test(html), `${page.status}`);
  const config = await fetch(`${BASE}/pitch/config.js`);
  const configText = await config.text();
  const clips = [...configText.matchAll(/(media\/[A-Za-z0-9._-]+\.(?:webm|mp4))/g)].map((m) => m[1]);
  check('pitch config names the three recordings', clips.length >= 3, clips.join(', '));
  for (const clip of clips) {
    const r = await fetch(`${BASE}/pitch/${clip}`, { headers: { range: 'bytes=0-1023' } });
    const size = Number(r.headers.get('content-range')?.split('/')[1] ?? r.headers.get('content-length') ?? 0);
    check(`recording served: ${clip}`, (r.status === 200 || r.status === 206) && /^video\//.test(r.headers.get('content-type') ?? '') && size > 10_000, `${r.status} ${r.headers.get('content-type')} ${size} bytes`);
  }
}

async function before() {
  const health = await fetch(`${BASE}/api/health`).then((r) => r.json());
  check('health', health.ok === true, `model mode ${health.modelMode}`);
  await pitchChecks();

  const email = `deploy-check-${Date.now().toString(36)}@example.test`;
  const password = 'walks-and-brick-walls-2026';
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

  // Make an app the real way: share → the reply's new-app proposal → its design → build.
  const share = await b.req('POST', '/api/agent/captures', { text: 'I keep stopping for long shadows on brick walls in the late afternoon. I want to get better at noticing light on my walks.' });
  const proposal = share.data?.reply?.proposals?.find((p) => p.kind === 'new_app');
  check('share gets a reply with an app idea', [200, 201].includes(share.status) && Boolean(proposal), proposal?.title ?? `${share.status}`);
  const draft = await b.req('POST', `/api/recommendations/${proposal.id}/draft`, { instructions: '' });
  check('the idea is designed', draft.status === 200 && Boolean(draft.data?.spec), `${draft.status}`);
  const built = await b.req('POST', `/api/recommendations/${proposal.id}/build`, { spec: draft.data.spec, description: draft.data.description });
  const appId = built.data?.app?.id;
  check('Make mine creates the app', [200, 201].includes(built.status) && Boolean(appId), `${built.status} ${built.data?.app?.name ?? ''}`);
  const spec = built.data.spec;
  const imageField = spec.fields.find((f) => f.type === 'image');
  const textField = spec.fields.find((f) => (f.type === 'text' || f.type === 'long_text') && !f.hidden);

  // Upload a photo and save an entry with it.
  const form = new FormData();
  form.append('file', new Blob([fs.readFileSync(PHOTO)], { type: 'image/jpeg' }), 'light-2.jpg');
  const up = await b.req('POST', '/api/media', form);
  const mediaId = up.data?.media?.id;
  check('photo upload', up.status === 201 && Boolean(mediaId), `${up.status}`);
  const values = {};
  if (imageField) values[imageField.id] = mediaId;
  if (textField) values[textField.id] = 'Deploy check: low sun on the brick wall';
  const today = new Date();
  const local = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  for (const f of spec.fields) if (f.required && values[f.id] === undefined && f.type === 'date') values[f.id] = local;
  const rec = await b.req('POST', `/api/apps/${appId}/records`, { values });
  check('entry with the photo saved', rec.status === 201, `${rec.status} ${JSON.stringify(rec.data?.details ?? '')}`);
  const img = await b.req('GET', `/api/media/${mediaId}`);
  check('photo served to its owner', img.status === 200 && /^image\//.test(img.headers.get('content-type') ?? ''), `${img.status} ${img.headers.get('content-type')}`);
  const stranger = client();
  await stranger.req('POST', '/api/auth/signup', { email: `deploy-stranger-${Date.now().toString(36)}@example.test`, password, displayName: 'Stranger' });
  const foreign = await stranger.req('GET', `/api/media/${mediaId}`);
  check('photo refused to another account', foreign.status === 404, `${foreign.status}`);
  const direct = await b.req('GET', `/apps/${appId}/`);
  check('the app opens at its own URL', direct.status === 200, `${direct.status}`);

  fs.writeFileSync(STATE, JSON.stringify({ base: BASE, email, password, cookie: b.cookie, appId, recordId: rec.data?.record?.id, mediaId, values }, null, 2));
}

async function after() {
  const s = JSON.parse(fs.readFileSync(STATE, 'utf8'));
  const health = await fetch(`${BASE}/api/health`).then((r) => r.json());
  check('health after restart', health.ok === true);
  await pitchChecks();
  const old = client(s.cookie);
  const me = await old.req('GET', '/api/auth/me');
  check('the session from before the restart still works', me.status === 200 && me.data?.user?.email === s.email, `${me.status}`);
  const b = client();
  const login = await b.req('POST', '/api/auth/login', { email: s.email, password: s.password });
  check('log in after restart', login.status === 200, `${login.status}`);
  const app = await b.req('GET', `/api/apps/${s.appId}`);
  check('the app is still there', app.status === 200 && app.data?.app?.id === s.appId, `${app.status} ${app.data?.app?.name ?? ''}`);
  const recs = await b.req('GET', `/api/apps/${s.appId}/records`);
  const kept = recs.data?.records?.find((r) => r.id === s.recordId);
  check('the entry is still there, unchanged', Boolean(kept) && JSON.stringify(Object.keys(s.values).map((k) => kept.values[k])) === JSON.stringify(Object.keys(s.values).map((k) => s.values[k])), `${recs.data?.records?.length ?? 0} entries`);
  const img = await b.req('GET', `/api/media/${s.mediaId}`);
  check('the photo file is still there', img.status === 200 && /^image\//.test(img.headers.get('content-type') ?? ''), `${img.status}`);
}

console.log(`deploy check · ${PHASE} · ${BASE}`);
try {
  if (PHASE === 'after') await after(); else await before();
} catch (err) {
  check('no unexpected error', false, err instanceof Error ? err.message : String(err));
}
const failed = results.filter((r) => !r.ok).length;
console.log(`SUMMARY: ${results.length - failed}/${results.length} passed`);
if (failed) process.exitCode = 1;
