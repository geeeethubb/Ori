/**
 * End-to-end over the HTTP API in sample mode: in-memory SQLite, no model calls, no open port.
 * Each block signs up its own accounts, so tests never share state they did not create.
 * Context and recommendation routes are covered elsewhere.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_PASSWORD, clientFor, makeClient, uniqueEmail, type RequestOptions, type Session, type TestClient } from '../helpers/testServer.ts';
import { createServer } from '../../server/index.ts';
import { bootForApp, renderIndex } from '../../server/install.ts';
import { BRAND } from '../../shared/brand.ts';
import { PRACTICE_TRACKER } from '../../server/fixtures/specs.ts';
import type { AppDetailDto, AppExportDto, AppSummaryDto, AppVersionDto, UserDto } from '../../shared/api.ts';
import type { AppRecord } from '../../shared/records.ts';
import type { AppEvent } from '../../shared/context.ts';

interface ErrorBody {
  error: string;
  code?: string;
  details?: unknown;
}
type ApplyResponse = AppDetailDto & { changes: string[] };

const client: TestClient = await makeClient();

const WALK = { date: '2026-11-14', subject: 'Low sun on the brick wall by the station', location: 'Station Road', mood: 'curious', keeper: true };

async function buildJournal(token: string, name?: string): Promise<AppDetailDto> {
  const res = await client.request<AppDetailDto>('/api/apps/from-fixture', { body: { fixture: 'photo-walk-journal', ...(name ? { name } : {}) }, token });
  if (res.status !== 201) throw new Error(`from-fixture failed: ${res.status} ${res.text}`);
  return res.json;
}

async function saveEntry(token: string, appId: string, values: Record<string, unknown> = WALK): Promise<AppRecord> {
  const res = await client.request<{ record: AppRecord }>(`/api/apps/${appId}/records`, { body: { values }, token });
  if (res.status !== 201) throw new Error(`saving an entry failed: ${res.status} ${res.text}`);
  return res.json.record;
}

async function listRecords(token: string, appId: string): Promise<AppRecord[]> {
  const res = await client.request<{ records: AppRecord[] }>(`/api/apps/${appId}/records`, { token });
  if (res.status !== 200) throw new Error(`listing entries failed: ${res.status} ${res.text}`);
  return res.json.records;
}

/** Two saves inside one millisecond share created_at; a tiny pause keeps "newest first" unambiguous. */
const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 5));

describe('the test run is in sample mode', () => {
  it('health reports sample mode, so no live model is ever called from tests', async () => {
    const res = await client.request<{ ok: boolean; modelMode: string }>('/api/health');
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ ok: true, modelMode: 'sample' });
  });
});

describe('accounts and sessions', () => {
  it('signup gives a native client a bearer token that /me accepts, with the 14-day trial started', async () => {
    const me = await client.signup(uniqueEmail('signup'), DEFAULT_PASSWORD, 'Ada');
    expect(me.user).toMatchObject({ email: me.email, displayName: 'Ada', plan: 'trial', premiumActive: true, modelMode: 'sample' });
    expect(new Date(me.user.trialEndsAt).getTime() - new Date(me.user.trialStartedAt).getTime()).toBe(14 * 86_400_000);
    const res = await client.request<{ user: UserDto }>('/api/auth/me', { token: me.token });
    expect(res.status).toBe(200);
    expect(res.json.user.id).toBe(me.user.id);
  });

  it('web signup sets an httpOnly session cookie instead of returning a token', async () => {
    const email = uniqueEmail('web');
    const res = await client.request<{ user: UserDto; token?: string }>('/api/auth/signup', { body: { email, password: DEFAULT_PASSWORD } });
    expect(res.status).toBe(201);
    expect(res.json.token).toBeUndefined();
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toMatch(/^aas_session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    const token = /aas_session=([^;]+)/.exec(cookie)?.[1];
    expect(token).toBeTruthy();
    const me = await client.request<{ user: UserDto }>('/api/auth/me', { headers: { Cookie: `aas_session=${token}` } });
    expect(me.status).toBe(200);
    expect(me.json.user.email).toBe(email);
  });

  it('login works with the right password and is refused (401) with the wrong one', async () => {
    const me = await client.signup(uniqueEmail('login'));
    const good = await client.login(me.email, DEFAULT_PASSWORD);
    expect(good.status).toBe(200);
    expect(good.json.token).toBeTruthy();
    expect(good.json.token).not.toBe(me.token); // a fresh session each time
    const bad = await client.login(me.email, 'not-the-password');
    expect(bad.status).toBe(401);
    expect(bad.json.code).toBe('bad_credentials');
    expect(bad.json.token).toBeUndefined();
    const unknown = await client.login(uniqueEmail('nobody'), DEFAULT_PASSWORD);
    expect(unknown.status).toBe(401);
  });

  it('signing up twice with the same email (any case) is refused with 409', async () => {
    const me = await client.signup(uniqueEmail('dup'));
    const again = await client.request<ErrorBody>('/api/auth/signup', { body: { email: me.email.toUpperCase(), password: DEFAULT_PASSWORD }, headers: { 'X-Client': 'native' } });
    expect(again.status).toBe(409);
    expect(again.json.error).toMatch(/already exists/i);
  });

  it('a short password, a malformed email or a broken body is a readable 400', async () => {
    const short = await client.request<ErrorBody>('/api/auth/signup', { body: { email: uniqueEmail('short'), password: 'abc' } });
    expect(short.status).toBe(400);
    expect(short.json.error).toBe('Use at least 8 characters');
    const bad = await client.request<ErrorBody>('/api/auth/signup', { body: { email: 'not-an-email', password: DEFAULT_PASSWORD } });
    expect(bad.status).toBe(400);
    const garbage = await client.request<ErrorBody>('/api/auth/signup', { body: '{not json' });
    expect(garbage.status).toBe(400);
  });

  it('the collection needs a session: no token and unknown tokens both get 401', async () => {
    const none = await client.request<ErrorBody>('/api/apps');
    expect(none.status).toBe(401);
    expect(none.json.code).toBe('unauthenticated');
    const bogus = await client.request<ErrorBody>('/api/apps', { token: 'x'.repeat(43) });
    expect(bogus.status).toBe(401);
    const me = await client.request<ErrorBody>('/api/auth/me');
    expect(me.status).toBe(401);
  });

  it('logout revokes the token', async () => {
    const me = await client.signup(uniqueEmail('logout'));
    const out = await client.request<{ ok: boolean }>('/api/auth/logout', { method: 'POST', token: me.token });
    expect(out.status).toBe(200);
    expect(out.json.ok).toBe(true);
    const after = await client.request<ErrorBody>('/api/auth/me', { token: me.token });
    expect(after.status).toBe(401);
  });
});

describe('building an app and saving entries', () => {
  let me: Session;
  let app: AppDetailDto;
  let first: AppRecord;

  beforeAll(async () => {
    me = await client.signup(uniqueEmail('builder'));
    app = await buildJournal(me.token);
  });

  it('from-fixture builds the Photo Walk Journal: version 1, sample-labelled, with a launch path', () => {
    expect(app.version).toBe(1);
    expect(app.canUndo).toBe(false);
    expect(app.spec.name).toBe('Photo Walk Journal');
    expect(app.spec.fields.map((f) => f.id)).toEqual(['date', 'subject', 'location', 'reflection', 'mood', 'keeper']);
    expect(app.app).toMatchObject({
      name: 'Photo Walk Journal', isSample: true, currentVersion: 1, recordCount: 0, pinned: false, archivedAt: null,
      launchPath: `/apps/${app.app.id}/`, purpose: 'explore', pattern: 'journal', icon: { symbol: 'camera', color: 'terracotta' },
    });
    expect(app.app.id).toMatch(/^[A-Za-z0-9_-]{8,32}$/);
  });

  it('the app can be fetched by id and shows up in the collection', async () => {
    const one = await client.request<AppDetailDto>(`/api/apps/${app.app.id}`, { token: me.token });
    expect(one.status).toBe(200);
    expect(one.json.spec).toEqual(app.spec);
    const list = await client.request<{ apps: AppSummaryDto[] }>('/api/apps', { token: me.token });
    expect(list.status).toBe(200);
    expect(list.json.apps.map((a) => a.id)).toContain(app.app.id);
  });

  it('a valid entry is saved (201) with its values as typed', async () => {
    first = await saveEntry(me.token, app.app.id);
    expect(first.id).toMatch(/^[A-Za-z0-9_-]{8,40}$/);
    expect(first.appId).toBe(app.app.id);
    expect(first.values).toEqual(WALK);
    expect(first.createdAt).toBe(first.updatedAt);
    const detail = await client.request<AppDetailDto>(`/api/apps/${app.app.id}`, { token: me.token });
    expect(detail.json.app.recordCount).toBe(1);
  });

  it('a missing required field is refused with 422 and a per-field message', async () => {
    const res = await client.request<ErrorBody>(`/api/apps/${app.app.id}/records`, { body: { values: { date: '2026-11-14', location: 'Park' } }, token: me.token });
    expect(res.status).toBe(422);
    expect(res.json.code).toBe('validation');
    expect(res.json.details).toEqual({ subject: 'Required' });
    expect(await listRecords(me.token, app.app.id)).toHaveLength(1);
  });

  it('a malformed body is a 400, not a crash', async () => {
    const res = await client.request<ErrorBody>(`/api/apps/${app.app.id}/records`, { body: { nope: true }, token: me.token });
    expect(res.status).toBe(400);
    const raw = await client.request<ErrorBody>(`/api/apps/${app.app.id}/records`, { body: '{"values":', token: me.token });
    expect(raw.status).toBe(400);
  });

  it('PATCH merges values: untouched fields stay, the edited one changes, bad edits are refused', async () => {
    const res = await client.request<{ record: AppRecord }>(`/api/apps/${app.app.id}/records/${first.id}`, { method: 'PATCH', body: { values: { location: 'Canal path' } }, token: me.token });
    expect(res.status).toBe(200);
    expect(res.json.record.values).toEqual({ ...WALK, location: 'Canal path' });
    expect(res.json.record.id).toBe(first.id);
    expect(res.json.record.createdAt).toBe(first.createdAt);
    const bad = await client.request<ErrorBody>(`/api/apps/${app.app.id}/records/${first.id}`, { method: 'PATCH', body: { values: { mood: 'angry' } }, token: me.token });
    expect(bad.status).toBe(422);
    expect(bad.json.details).toEqual({ mood: 'Pick one of the options' });
    const unchanged = await listRecords(me.token, app.app.id);
    expect(unchanged[0]?.values.mood).toBe('curious');
  });

  it('the list is newest first', async () => {
    await pause();
    const second = await saveEntry(me.token, app.app.id, { ...WALK, subject: 'Second walk' });
    const records = await listRecords(me.token, app.app.id);
    expect(records.map((r) => r.id)).toEqual([second.id, first.id]);
    expect(records[0]!.createdAt >= records[1]!.createdAt).toBe(true);
  });

  it('DELETE hides the entry from the list and from further edits', async () => {
    const records = await listRecords(me.token, app.app.id);
    const target = records[0]!;
    const res = await client.request<{ ok: boolean }>(`/api/apps/${app.app.id}/records/${target.id}`, { method: 'DELETE', token: me.token });
    expect(res.status).toBe(200);
    expect(res.json.ok).toBe(true);
    expect((await listRecords(me.token, app.app.id)).map((r) => r.id)).toEqual([first.id]);
    const patch = await client.request<ErrorBody>(`/api/apps/${app.app.id}/records/${target.id}`, { method: 'PATCH', body: { values: { location: 'x' } }, token: me.token });
    expect(patch.status).toBe(404);
    const again = await client.request<ErrorBody>(`/api/apps/${app.app.id}/records/${target.id}`, { method: 'DELETE', token: me.token });
    expect(again.status).toBe(404);
    const detail = await client.request<AppDetailDto>(`/api/apps/${app.app.id}`, { token: me.token });
    expect(detail.json.app.recordCount).toBe(1);
  });

  it('an unknown fixture is a 400 and an unknown or malformed app id a 404', async () => {
    const bad = await client.request<ErrorBody>('/api/apps/from-fixture', { body: { fixture: 'unicorn-tracker' }, token: me.token });
    expect(bad.status).toBe(400);
    const missing = await client.request<ErrorBody>('/api/apps/doesnotexist1', { token: me.token });
    expect(missing.status).toBe(404);
    expect(missing.json.code).toBe('not_found');
    const malformed = await client.request<ErrorBody>('/api/apps/x', { token: me.token });
    expect(malformed.status).toBe(404);
  });

  it('POST /api/apps builds a real (non-sample) app from a full spec and refuses an invalid one', async () => {
    const built = await client.request<AppDetailDto>('/api/apps', { body: { spec: PRACTICE_TRACKER, changeSummary: 'Built from your request' }, token: me.token });
    expect(built.status).toBe(201);
    expect(built.json.app).toMatchObject({ name: 'Practice Companion', isSample: false, pattern: 'tracker' });
    const invalid = await client.request<ErrorBody>('/api/apps', { body: { spec: { ...PRACTICE_TRACKER, fields: [] } }, token: me.token });
    expect(invalid.status).toBe(400);
    expect(invalid.json.code).toBe('invalid_spec');
  });

  it('pin and archive flags are editable; pinned apps come first in the collection', async () => {
    const pinned = await client.request<AppDetailDto>(`/api/apps/${app.app.id}`, { method: 'PATCH', body: { pinned: true }, token: me.token });
    expect(pinned.status).toBe(200);
    expect(pinned.json.app.pinned).toBe(true);
    const list = await client.request<{ apps: AppSummaryDto[] }>('/api/apps', { token: me.token });
    expect(list.json.apps[0]?.id).toBe(app.app.id);
    const archived = await client.request<AppDetailDto>(`/api/apps/${app.app.id}`, { method: 'PATCH', body: { archived: true }, token: me.token });
    expect(archived.json.app.archivedAt).toEqual(expect.any(String));
    const restored = await client.request<AppDetailDto>(`/api/apps/${app.app.id}`, { method: 'PATCH', body: { archived: false, pinned: false }, token: me.token });
    expect(restored.json.app).toMatchObject({ archivedAt: null, pinned: false });
  });
});

describe('a fresh server instance in the same process', () => {
  it('sees the same apps and entries (nothing lives only in the first instance)', async () => {
    // The test database is in-memory and opened once per process, so this cannot prove a disk
    // round-trip; persistence.test.ts does that with a temporary file. It does prove the API keeps
    // no per-instance state.
    const me = await client.signup(uniqueEmail('restart'));
    const app = await buildJournal(me.token);
    const saved = await saveEntry(me.token, app.app.id);
    const second = clientFor(createServer());
    const detail = await second.request<AppDetailDto>(`/api/apps/${app.app.id}`, { token: me.token });
    expect(detail.status).toBe(200);
    expect(detail.json.spec).toEqual(app.spec);
    const records = await second.request<{ records: AppRecord[] }>(`/api/apps/${app.app.id}/records`, { token: me.token });
    expect(records.json.records).toEqual([saved]);
  });
});

describe('ownership: another user never sees or touches my app', () => {
  let owner: Session;
  let other: Session;
  let app: AppDetailDto;
  let entry: AppRecord;

  beforeAll(async () => {
    owner = await client.signup(uniqueEmail('owner'));
    other = await client.signup(uniqueEmail('other'));
    app = await buildJournal(owner.token);
    entry = await saveEntry(owner.token, app.app.id);
  });

  it('every app route answers 404 for a foreign app id (never 403, never 200)', async () => {
    const id = app.app.id;
    const attempts: Array<[string, RequestOptions]> = [
      [`/api/apps/${id}`, {}],
      [`/api/apps/${id}`, { method: 'PATCH', body: { pinned: true } }],
      [`/api/apps/${id}`, { method: 'DELETE' }],
      [`/api/apps/${id}/records`, {}],
      [`/api/apps/${id}/records`, { body: { values: WALK } }],
      [`/api/apps/${id}/records/${entry.id}`, { method: 'PATCH', body: { values: { location: 'stolen' } } }],
      [`/api/apps/${id}/records/${entry.id}`, { method: 'DELETE' }],
      [`/api/apps/${id}/versions`, {}],
      [`/api/apps/${id}/revisions/apply`, { body: { ops: [{ op: 'rename_app', name: 'Mine now' }] } }],
      [`/api/apps/${id}/revisions/undo`, { method: 'POST' }],
      [`/api/apps/${id}/export`, {}],
      [`/api/apps/${id}/events`, {}],
      [`/api/apps/${id}/events`, { body: { type: 'app_opened' } }],
    ];
    for (const [path, opts] of attempts) {
      const res = await client.request<ErrorBody>(path, { ...opts, token: other.token });
      const label = `${opts.method ?? (opts.body ? 'POST' : 'GET')} ${path}`;
      expect(res.status, label).toBe(404);
      expect(res.json?.code, label).toBe('not_found');
    }
  });

  it("nothing changed for the owner, and the other user's collection is still empty", async () => {
    expect(await listRecords(owner.token, app.app.id)).toEqual([entry]);
    const detail = await client.request<AppDetailDto>(`/api/apps/${app.app.id}`, { token: owner.token });
    expect(detail.json.version).toBe(1);
    expect(detail.json.spec.name).toBe('Photo Walk Journal');
    expect(detail.json.app.pinned).toBe(false);
    const list = await client.request<{ apps: AppSummaryDto[] }>('/api/apps', { token: other.token });
    expect(list.json.apps).toEqual([]);
  });
});

describe('home-screen install metadata is public, by unguessable id', () => {
  let app: AppDetailDto;
  beforeAll(async () => {
    const me = await client.signup(uniqueEmail('install'));
    app = await buildJournal(me.token);
  });

  it('the manifest needs no session and installs as THAT app', async () => {
    const res = await client.request<Record<string, unknown>>(`/apps/${app.app.id}/manifest.webmanifest`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/manifest+json');
    expect(res.json).toMatchObject({
      id: `/apps/${app.app.id}/`, start_url: `/apps/${app.app.id}/`, scope: `/apps/${app.app.id}/`, name: 'Photo Walk Journal', display: 'standalone',
    });
    const icons = res.json.icons as Array<{ src: string; sizes: string; purpose: string }>;
    expect(icons.map((i) => i.src)).toEqual([`/apps/${app.app.id}/icon-192.png`, `/apps/${app.app.id}/icon-512.png`, `/apps/${app.app.id}/icon-512-maskable.png`]);
    expect(res.text).not.toMatch(/record|values|owner|email/i);
  });

  it('unknown or malformed ids are 404', async () => {
    expect((await client.request('/apps/doesnotexist1/manifest.webmanifest')).status).toBe(404);
    expect((await client.request('/apps/x/manifest.webmanifest')).status).toBe(404);
    expect((await client.request('/apps/doesnotexist1/icon.svg')).status).toBe(404);
  });

  it('the SVG icon renders for the app', async () => {
    const svg = await client.request(`/apps/${app.app.id}/icon.svg`);
    expect(svg.status).toBe(200);
    expect(svg.headers.get('content-type')).toContain('image/svg+xml');
    expect(svg.text).toContain('<svg');
  });

  it('PNG icons (home-screen and manifest) are images, never the app page', async () => {
    // BUG: see report. The PNG icon routes in server/install.ts put the parameter inside a path
    // segment (`icon-:size{\d+}.png`, `store-:size{\d+}.png`). Hono only matches a parameter that is
    // a whole segment, so these routes never match and the request falls through to the SPA
    // catch-all, which answers with HTML. iOS loads /apps/<id>/icon-180.png for the home-screen
    // icon and the manifest points at icon-192/512.png, so "Add to Home Screen" gets no icon.
    const isImage = (type: string | null) => type === 'image/png' || type === 'image/svg+xml';
    for (const file of ['icon-192.png', 'icon-180.png', 'icon-512.png', 'icon-512-maskable.png']) {
      const res = await client.request(`/apps/${app.app.id}/${file}`);
      expect(res.status, file).toBe(200);
      expect(isImage(res.headers.get('content-type')), `${file} has content-type ${res.headers.get('content-type')}`).toBe(true);
    }
    expect((await client.request('/apps/doesnotexist1/icon-192.png')).status).toBe(404);
    const store = await client.request('/icons/store-192.png');
    expect(store.status).toBe(200);
    expect(isImage(store.headers.get('content-type')), `store icon has content-type ${store.headers.get('content-type')}`).toBe(true);
  });

  it('the storefront manifest is served too', async () => {
    const manifest = await client.request<Record<string, unknown>>('/manifest.webmanifest');
    expect(manifest.status).toBe(200);
    expect(manifest.json).toMatchObject({ id: '/', start_url: '/', name: BRAND.name });
  });

  it('the launch URL is routable: the app page, or a clear "client not built" notice, never 404', async () => {
    const res = await client.request(`/apps/${app.app.id}/`);
    expect([200, 503]).toContain(res.status);
    if (res.status === 200) expect(res.text).toContain('<title>Photo Walk Journal</title>');
  });

  it('deleting the app removes its public metadata', async () => {
    const me = await client.signup(uniqueEmail('deleter'));
    const gone = await buildJournal(me.token);
    expect((await client.request(`/apps/${gone.app.id}/manifest.webmanifest`)).status).toBe(200);
    const del = await client.request<{ ok: boolean }>(`/api/apps/${gone.app.id}`, { method: 'DELETE', token: me.token });
    expect(del.status).toBe(200);
    expect((await client.request(`/apps/${gone.app.id}/manifest.webmanifest`)).status).toBe(404);
    expect((await client.request<ErrorBody>(`/api/apps/${gone.app.id}`, { token: me.token })).status).toBe(404);
  });
});

describe('revisions keep history and never touch entries', () => {
  let me: Session;
  let app: AppDetailDto;
  let before: AppRecord[];
  const addField = { op: 'add_field', field: { id: 'next_experiment', label: 'Next experiment', type: 'long_text' } };

  beforeAll(async () => {
    me = await client.signup(uniqueEmail('reviser'));
    app = await buildJournal(me.token);
    await saveEntry(me.token, app.app.id);
    await pause();
    await saveEntry(me.token, app.app.id, { ...WALK, subject: 'Rain on the tram stop', keeper: false });
    before = await listRecords(me.token, app.app.id);
  });

  it('applying add_field makes version 2 with the new field and readable change lines', async () => {
    const res = await client.request<ApplyResponse>(`/api/apps/${app.app.id}/revisions/apply`, { body: { ops: [addField], baseVersion: 1 }, token: me.token });
    expect(res.status).toBe(200);
    expect(res.json.version).toBe(2);
    expect(res.json.canUndo).toBe(true);
    expect(res.json.app.currentVersion).toBe(2);
    expect(res.json.spec.fields.map((f) => f.id)).toContain('next_experiment');
    expect(res.json.spec.fields).toHaveLength(app.spec.fields.length + 1);
    expect(res.json.changes).toEqual(['Add “Next experiment” (long text). Existing walks keep their data; this field starts empty for them.']);
  });

  it('existing entries are untouched: same values, same timestamps, no invented key', async () => {
    const after = await listRecords(me.token, app.app.id);
    expect(after).toEqual(before);
    for (const r of after) expect('next_experiment' in r.values).toBe(false);
  });

  it('new entries can use the field, and GET versions lists both versions oldest first', async () => {
    const saved = await saveEntry(me.token, app.app.id, { ...WALK, next_experiment: 'Try the same corner at dusk' });
    expect(saved.values.next_experiment).toBe('Try the same corner at dusk');
    const res = await client.request<{ versions: AppVersionDto[] }>(`/api/apps/${app.app.id}/versions`, { token: me.token });
    expect(res.status).toBe(200);
    expect(res.json.versions.map((v) => [v.version, v.origin])).toEqual([[1, 'build'], [2, 'revision']]);
    expect(res.json.versions[0]!.spec).toEqual(app.spec);
    expect(res.json.versions[1]!.changeSummary).toContain('Next experiment');
  });

  it('undo appends version 3 with version 1’s design, and the field saved since stays (hidden, value kept, id reserved)', async () => {
    const res = await client.request<AppDetailDto & { kept: string[] }>(`/api/apps/${app.app.id}/revisions/undo`, { method: 'POST', token: me.token });
    expect(res.status).toBe(200);
    expect(res.json.version).toBe(3);
    // Version 1's design comes back. The field added in version 2 holds a saved value, so it is carried
    // over hidden (never dropped from the definition, so its id cannot be reused for another type).
    const { fields, ...design } = res.json.spec;
    const { fields: v1Fields, ...v1Design } = app.spec;
    expect(design).toEqual(v1Design);
    expect(fields.slice(0, v1Fields.length)).toEqual(v1Fields);
    expect(fields.slice(v1Fields.length)).toEqual([expect.objectContaining({ id: 'next_experiment', hidden: true, required: false })]);
    expect(res.json.kept.join(' ')).toMatch(/stays saved/);
    expect(res.json.canUndo).toBe(true);
    const versions = await client.request<{ versions: AppVersionDto[] }>(`/api/apps/${app.app.id}/versions`, { token: me.token });
    expect(versions.json.versions).toHaveLength(3);
    expect(versions.json.versions[2]).toMatchObject({ version: 3, origin: 'undo' });
    const records = await listRecords(me.token, app.app.id);
    expect(records.some((r) => r.values.next_experiment === 'Try the same corner at dusk')).toBe(true);
  });

  it('a stale preview (baseVersion mismatch) is refused with 409 and nothing changes', async () => {
    const res = await client.request<ErrorBody>(`/api/apps/${app.app.id}/revisions/apply`, { body: { ops: [{ op: 'rename_app', name: 'Stale' }], baseVersion: 1 }, token: me.token });
    expect(res.status).toBe(409);
    expect(res.json.code).toBe('stale_preview');
    const detail = await client.request<AppDetailDto>(`/api/apps/${app.app.id}`, { token: me.token });
    expect(detail.json.version).toBe(3);
    expect(detail.json.spec.name).toBe('Photo Walk Journal');
  });

  it('an unknown op is a 400; an op that cannot apply (duplicate field) is a 422 with the reason', async () => {
    const unknown = await client.request<ErrorBody>(`/api/apps/${app.app.id}/revisions/apply`, { body: { ops: [{ op: 'explode' }] }, token: me.token });
    expect(unknown.status).toBe(400);
    expect(unknown.json.code).toBe('invalid');
    const empty = await client.request<ErrorBody>(`/api/apps/${app.app.id}/revisions/apply`, { body: { ops: [] }, token: me.token });
    expect(empty.status).toBe(400);
    const dup = await client.request<ErrorBody>(`/api/apps/${app.app.id}/revisions/apply`, { body: { ops: [{ op: 'add_field', field: { id: 'subject', label: 'Again', type: 'text' } }] }, token: me.token });
    expect(dup.status).toBe(422);
    expect(dup.json.details).toEqual(['A field with id "subject" already exists']);
    const detail = await client.request<AppDetailDto>(`/api/apps/${app.app.id}`, { token: me.token });
    expect(detail.json.version).toBe(3);
  });

  it('undo on a first version is refused with 409 nothing_to_undo', async () => {
    const fresh = await buildJournal(me.token);
    const res = await client.request<ErrorBody>(`/api/apps/${fresh.app.id}/revisions/undo`, { method: 'POST', token: me.token });
    expect(res.status).toBe(409);
    expect(res.json.code).toBe('nothing_to_undo');
  });

  it('a rename is reflected in the collection and in the public manifest', async () => {
    const res = await client.request<ApplyResponse>(`/api/apps/${app.app.id}/revisions/apply`, { body: { ops: [{ op: 'rename_app', name: 'Evening Walks' }], baseVersion: 3 }, token: me.token });
    expect(res.status).toBe(200);
    expect(res.json.app.name).toBe('Evening Walks');
    expect(res.json.version).toBe(4);
    const manifest = await client.request<{ name: string }>(`/apps/${app.app.id}/manifest.webmanifest`);
    expect(manifest.json.name).toBe('Evening Walks');
  });
});

describe('export and import', () => {
  let me: Session;
  let app: AppDetailDto;

  beforeAll(async () => {
    me = await client.signup(uniqueEmail('porter'));
    app = await buildJournal(me.token);
    await saveEntry(me.token, app.app.id);
    await pause();
    await saveEntry(me.token, app.app.id, { ...WALK, subject: 'Second walk' });
    const revised = await client.request(`/api/apps/${app.app.id}/revisions/apply`, { body: { ops: [{ op: 'add_field', field: { id: 'weather', label: 'Weather', type: 'text' } }] }, token: me.token });
    if (revised.status !== 200) throw new Error(`revision failed: ${revised.status} ${revised.text}`);
  });

  it('export is a downloadable file with the whole history and every entry', async () => {
    const res = await client.request<AppExportDto>(`/api/apps/${app.app.id}/export`, { token: me.token });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toMatch(/^attachment; filename="/);
    expect(res.json.format).toBe('ai-app-store/app-export');
    expect(res.json.exportVersion).toBe(1);
    expect(res.json.app).toMatchObject({ id: app.app.id, name: 'Photo Walk Journal' });
    expect(res.json.versions.map((v) => v.version)).toEqual([1, 2]);
    expect(res.json.records).toHaveLength(2);
    expect(res.json.events.map((e) => e.type)).toEqual(expect.arrayContaining(['app_built', 'first_item_saved', 'item_saved', 'revision_accepted']));
  });

  it('import recreates the app under a new id with the same entries, history and latest spec', async () => {
    const exported = (await client.request<AppExportDto>(`/api/apps/${app.app.id}/export`, { token: me.token })).json;
    const res = await client.request<AppDetailDto>('/api/apps/import', { body: exported, token: me.token });
    expect(res.status).toBe(201);
    expect(res.json.app.id).not.toBe(app.app.id);
    expect(res.json.app.recordCount).toBe(exported.records.length);
    expect(res.json.spec).toEqual(exported.versions.at(-1)!.spec);
    expect(res.json.version).toBe(2);
    const records = await listRecords(me.token, res.json.app.id);
    const essentials = (rs: AppRecord[]) => rs.map((r) => ({ values: r.values, createdAt: r.createdAt })).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    expect(essentials(records)).toEqual(essentials(exported.records));
    const versions = await client.request<{ versions: AppVersionDto[] }>(`/api/apps/${res.json.app.id}/versions`, { token: me.token });
    expect(versions.json.versions.map((v) => v.spec)).toEqual(exported.versions.map((v) => v.spec));
    expect(await listRecords(me.token, app.app.id)).toHaveLength(2); // the original is untouched
  });

  it('a file that is not an export is refused with 400', async () => {
    const res = await client.request<ErrorBody>('/api/apps/import', { body: { format: 'something-else', versions: [] }, token: me.token });
    expect(res.status).toBe(400);
    expect(res.json.code).toBe('invalid_import');
  });
});

describe('events', () => {
  let me: Session;
  let app: AppDetailDto;
  beforeAll(async () => {
    me = await client.signup(uniqueEmail('events'));
    app = await buildJournal(me.token);
  });

  it('app_built and first_item_saved are recorded by the server, then item_saved', async () => {
    await saveEntry(me.token, app.app.id);
    await saveEntry(me.token, app.app.id, { ...WALK, subject: 'Second' });
    const res = await client.request<{ events: AppEvent[] }>(`/api/apps/${app.app.id}/events`, { token: me.token });
    expect(res.status).toBe(200);
    const types = res.json.events.map((e) => e.type);
    expect(types.filter((t) => t === 'app_built')).toHaveLength(1);
    expect(types.filter((t) => t === 'first_item_saved')).toHaveLength(1);
    expect(types.filter((t) => t === 'item_saved')).toHaveLength(1);
  });

  it('clients may post their own event types; server-owned types are refused with 400', async () => {
    const opened = await client.request<{ ok: boolean }>(`/api/apps/${app.app.id}/events`, { body: { type: 'app_opened' }, token: me.token });
    expect(opened.status).toBe(200);
    const detail = await client.request<AppDetailDto>(`/api/apps/${app.app.id}`, { token: me.token });
    expect(detail.json.app.lastOpenedAt).toEqual(expect.any(String));
    for (const type of ['app_built', 'first_item_saved', 'item_saved', 'task_completed', 'revision_accepted', 'revision_undone']) {
      const res = await client.request<ErrorBody>(`/api/apps/${app.app.id}/events`, { body: { type }, token: me.token });
      expect(res.status, type).toBe(400);
    }
    const unknown = await client.request<ErrorBody>(`/api/apps/${app.app.id}/events`, { body: { type: 'made_up' }, token: me.token });
    expect(unknown.status).toBe(400);
  });

  it('moving a follow-up to Done records task_completed', async () => {
    const board = await client.request<AppDetailDto>('/api/apps/from-fixture', { body: { fixture: 'follow-up-board' }, token: me.token });
    expect(board.status).toBe(201);
    const card = await saveEntry(me.token, board.json.app.id, { person: 'Sam from the meetup', stage: 'promised', commitment: 'Send the deck', due: '2026-11-13' });
    const done = await client.request<{ record: AppRecord }>(`/api/apps/${board.json.app.id}/records/${card.id}`, { method: 'PATCH', body: { values: { stage: 'done' } }, token: me.token });
    expect(done.status).toBe(200);
    expect(done.json.record.values).toMatchObject({ person: 'Sam from the meetup', stage: 'done', commitment: 'Send the deck' });
    const events = await client.request<{ events: AppEvent[] }>(`/api/apps/${board.json.app.id}/events`, { token: me.token });
    expect(events.json.events.map((e) => e.type)).toContain('task_completed');
  });
});

describe('the launch page installs as the app', () => {
  const TEMPLATE = '<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="utf-8">\n    <title>AI App Store</title>\n  </head>\n  <body><div id="root"></div></body>\n</html>';
  const bootOf = (html: string) => {
    const m = /window\.__AAS_BOOT__=(.*?)<\/script>/s.exec(html);
    if (!m) throw new Error('boot script missing');
    return JSON.parse(m[1]!) as { appId: string | null; name: string; icon: { symbol: string; color: string }; purpose: string | null };
  };

  it('title, manifest, touch icon, theme color and boot data are specific to the app', async () => {
    const me = await client.signup(uniqueEmail('launch'));
    const app = await buildJournal(me.token);
    const html = renderIndex(TEMPLATE, bootForApp(app.app.id));
    expect(html).toContain('<title>Photo Walk Journal</title>');
    expect(html).not.toContain('<title>AI App Store</title>');
    expect(html).toContain(`<link rel="manifest" href="/apps/${app.app.id}/manifest.webmanifest">`);
    expect(html).toContain(`<link rel="apple-touch-icon" sizes="180x180" href="/apps/${app.app.id}/icon-180.png">`);
    expect(html).toContain('<meta name="apple-mobile-web-app-title" content="Photo Walk Journal">');
    expect(html).toContain('<meta name="theme-color" content="#B8441C">'); // terracotta
    expect(bootOf(html)).toEqual({ appId: app.app.id, name: 'Photo Walk Journal', icon: { symbol: 'camera', color: 'terracotta' }, purpose: 'explore', theme: 'bright' });
    expect(html.match(/<\/head>/g)).toHaveLength(1);
  });

  it('a hostile app name cannot inject markup or script', async () => {
    const me = await client.signup(uniqueEmail('xss'));
    const app = await buildJournal(me.token, 'Walks <script>alert(1)</script>');
    const html = renderIndex(TEMPLATE, bootForApp(app.app.id));
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('<title>Walks &lt;script&gt;alert(1)&lt;/script&gt;</title>');
    expect(html.match(/<script/g)).toHaveLength(1); // only the boot script
    expect(html).toContain('\\u003cscript');
    expect(bootOf(html).name).toBe('Walks <script>alert(1)</script>'); // the browser decodes it back as data
    const manifest = await client.request<{ name: string }>(`/apps/${app.app.id}/manifest.webmanifest`);
    expect(manifest.json.name).toBe('Walks <script>alert(1)</script>');
  });

  it('an unknown id falls back to the storefront boot', () => {
    const html = renderIndex(TEMPLATE, bootForApp('doesnotexist1'));
    expect(html).toContain(`<title>${BRAND.name}</title>`);
    expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest">');
    expect(bootOf(html)).toMatchObject({ appId: null, name: BRAND.name });
    expect(renderIndex(TEMPLATE, bootForApp(undefined))).toContain('/icons/store-180.png');
  });
});
