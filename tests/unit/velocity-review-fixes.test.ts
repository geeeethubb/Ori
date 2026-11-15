/**
 * Fixes from the adversarial review of the Velocity integration (commit a88d8e0): exactly-once saves that
 * carry newer values, undo/redo labels, data-safe undo of untouched defaults, binding checks keyed by ids,
 * bound fields checked on the final design, a strict undo body, and photo fields on import. In-memory
 * SQLite over HTTP, Sample mode, no network.
 */
import { describe, expect, it } from 'vitest';
import { makeClient, type TestClient } from '../helpers/testServer.ts';
import { bindingProblems, checkBindings, type AppSpec } from '../../shared/appSpec.ts';
import { planUndo } from '../../shared/revision.ts';
import type { AppDetailDto, UndoPreviewDto } from '../../shared/api.ts';
import type { AppRecord } from '../../shared/records.ts';
import { fixtureSpec } from '../../server/fixtures/specs.ts';

const client: TestClient = await makeClient();

interface ErrorBody { error: string; code?: string; details?: unknown }
interface CreateBody { record: AppRecord; duplicate?: boolean; updated?: boolean }

async function fixtureApp(token: string, fixture: string): Promise<AppDetailDto> {
  const res = await client.request<AppDetailDto>('/api/apps/from-fixture', { body: { fixture }, token });
  if (res.status !== 201) throw new Error(`from-fixture failed: ${res.status} ${res.text}`);
  return res.json;
}

async function apply(token: string, appId: string, ops: unknown[]) {
  return client.request<AppDetailDto & ErrorBody>(`/api/apps/${appId}/revisions/apply`, { body: { ops }, token });
}

async function undoPreview(token: string, appId: string): Promise<UndoPreviewDto> {
  const res = await client.request<UndoPreviewDto>(`/api/apps/${appId}/revisions/undo/preview`, { body: {}, token });
  expect(res.status).toBe(200);
  return res.json;
}

describe('a retried save that carries newer values (a resumed timed session)', () => {
  it('updates the unedited entry, returns plain retries as duplicates, and never overwrites an edit', async () => {
    const { token } = await client.signup();
    const riff = await fixtureApp(token, 'riff-practice');
    const url = `/api/apps/${riff.app.id}/records`;
    const first = { kind: 'session', minutes: 5, timed_seconds: 300, target_minutes: 15, date: '2026-11-13' };

    const a = await client.request<CreateBody>(url, { body: { id: 'sessResume01', values: first }, token });
    expect(a.status).toBe(201);
    // The response was lost; the same save again is a duplicate, nothing changes.
    const b = await client.request<CreateBody>(url, { body: { id: 'sessResume01', values: first }, token });
    expect(b.status).toBe(200);
    expect(b.json.duplicate).toBe(true);
    expect(b.json.updated).toBeUndefined();

    // The person resumed and played 10 more minutes: the same session id now carries 15 minutes.
    const longer = { ...first, minutes: 15, timed_seconds: 900 };
    const c = await client.request<CreateBody>(url, { body: { id: 'sessResume01', values: longer }, token });
    expect(c.status).toBe(200);
    expect(c.json).toMatchObject({ duplicate: true, updated: true });
    expect(c.json.record.values).toMatchObject({ minutes: 15, timed_seconds: 900 });
    const list = (await client.request<{ records: AppRecord[] }>(url, { token })).json.records.filter((r) => r.id === 'sessResume01');
    expect(list).toHaveLength(1);
    expect(list[0]!.values.minutes).toBe(15);

    // Once someone edited the entry, a stale retry never overwrites it.
    const edited = await client.request<{ record: AppRecord }>(`${url}/sessResume01`, { method: 'PATCH', body: { values: { notes: 'Edited on the phone' } }, token });
    expect(edited.status).toBe(200);
    const d = await client.request<ErrorBody>(url, { body: { id: 'sessResume01', values: { ...first, minutes: 20, timed_seconds: 1200 } }, token });
    expect(d.status).toBe(409);
    expect(d.json.code).toBe('record_conflict');
    expect((d.json.details as { record: AppRecord }).record.values).toMatchObject({ minutes: 15, notes: 'Edited on the phone' });
  });

  it('still refuses an id that belongs to another app or person', async () => {
    const alice = await client.signup();
    const bob = await client.signup();
    const aliceApp = await fixtureApp(alice.token, 'riff-practice');
    const bobApp = await fixtureApp(bob.token, 'riff-practice');
    const values = { kind: 'session', minutes: 10, date: '2026-11-13' };
    expect((await client.request(`/api/apps/${aliceApp.app.id}/records`, { body: { id: 'sessShared01', values }, token: alice.token })).status).toBe(201);
    const other = await client.request<ErrorBody>(`/api/apps/${bobApp.app.id}/records`, { body: { id: 'sessShared01', values: { ...values, minutes: 30 } }, token: bob.token });
    expect(other.status).toBe(400);
  });
});

describe('undo and redo labels', () => {
  it('alternates Undo / Redo / Undo instead of staying on Redo', async () => {
    const { token } = await client.signup();
    const riff = await fixtureApp(token, 'riff-practice');
    const appId = riff.app.id;
    const added = await apply(token, appId, [{ op: 'add_field', field: { id: 'song', label: 'Which song', type: 'text' } }]);
    expect(added.status).toBe(200);
    expect((await client.request(`/api/apps/${appId}/records`, { body: { values: { kind: 'session', minutes: 10, date: '2026-11-13', song: 'Blackbird' } }, token })).status).toBe(201);

    expect((await undoPreview(token, appId)).label).toBe('Undo');
    const undo = await client.request<AppDetailDto>(`/api/apps/${appId}/revisions/undo`, { body: { expectedVersion: added.json.app.currentVersion }, token });
    expect(undo.status).toBe(200);
    expect(undo.json.spec.fields.find((f) => f.id === 'song')?.hidden).toBe(true);

    expect((await undoPreview(token, appId)).label).toBe('Redo');
    const redo = await client.request<AppDetailDto>(`/api/apps/${appId}/revisions/undo`, { body: { expectedVersion: undo.json.app.currentVersion }, token });
    expect(redo.json.spec.fields.find((f) => f.id === 'song')?.hidden).toBeFalsy();

    // After the redo, undoing again removes the change, so it is labelled Undo again.
    expect((await undoPreview(token, appId)).label).toBe('Undo');
  });

  it('refuses a malformed expected version instead of switching the retry guard off', async () => {
    const { token } = await client.signup();
    const riff = await fixtureApp(token, 'riff-practice');
    const appId = riff.app.id;
    const added = await apply(token, appId, [{ op: 'set_design', design: { theme: 'charcoal' } }]);
    expect(added.status).toBe(200);
    const bad = await client.request<ErrorBody>(`/api/apps/${appId}/revisions/undo`, { body: { expectedVersion: String(added.json.app.currentVersion) }, token });
    expect(bad.status).toBe(400);
    const app = await client.request<AppDetailDto>(`/api/apps/${appId}`, { token });
    expect(app.json.app.currentVersion).toBe(added.json.app.currentVersion);
  });
});

describe('undo only carries newer fields someone actually filled in', () => {
  it('drops an added checkbox and choice whose values are all untouched defaults', async () => {
    const { token } = await client.signup();
    const people = await fixtureApp(token, 'people-queue');
    const appId = people.app.id;
    const added = await apply(token, appId, [
      { op: 'add_field', field: { id: 'favourite', label: 'Favourite', type: 'checkbox' } },
      { op: 'add_field', field: { id: 'priority', label: 'Priority', type: 'select', options: [{ value: 'normal', label: 'Normal' }, { value: 'high', label: 'High' }] } },
    ]);
    expect(added.status).toBe(200);
    // The form submits the defaults for fields the person did not touch.
    expect((await client.request(`/api/apps/${appId}/records`, { body: { values: { person: 'Maya', action: 'Send the deck', done: false, favourite: false, priority: 'normal' } }, token })).status).toBe(201);
    const preview = await undoPreview(token, appId);
    expect(preview.ok).toBe(true);
    expect(preview.kept.join(' ')).not.toMatch(/Favourite|Priority/);

    // A ticked box is real data and comes along hidden.
    expect((await client.request(`/api/apps/${appId}/records`, { body: { values: { person: 'Sam', action: 'Book the room', done: false, favourite: true, priority: 'normal' } }, token })).status).toBe(201);
    const again = await undoPreview(token, appId);
    expect(again.kept.join(' ')).toMatch(/Favourite/);
    expect(again.kept.join(' ')).not.toMatch(/Priority/);
  });

  it('keeps a typed value even when it matches nothing special', () => {
    const before = fixtureSpec('people-queue')!;
    const after: AppSpec = structuredClone(before);
    after.fields.push({ id: 'met_at', label: 'Where we met', type: 'text' } as AppSpec['fields'][number]);
    const plan = planUndo(after, before, [{ values: { person: 'Maya', action: 'Call', met_at: 'Design meetup' } }]);
    expect(plan.ok).toBe(true);
    expect(plan.spec?.fields.find((f) => f.id === 'met_at')?.hidden).toBe(true);
  });
});

describe('binding checks compare ids, not wording', () => {
  it('lets an older app with an existing quirk rename the field or retitle the view', async () => {
    const { token } = await client.signup();
    const spec = fixtureSpec('photo-walk-journal')!;
    const quirky: AppSpec = structuredClone(spec);
    quirky.fields = quirky.fields.map((f) => (f.id === 'subject' ? { ...f, hidden: true, required: false } : f)) as AppSpec['fields'];
    const created = await client.request<AppDetailDto>('/api/apps', { body: { spec: quirky }, token });
    expect(created.status).toBe(201);
    const appId = created.json.app.id;
    expect(checkBindings(created.json.spec).length).toBeGreaterThan(0);

    const rename = await apply(token, appId, [{ op: 'update_field', fieldId: 'subject', patch: { label: 'What caught your eye' } }]);
    expect(rename.status).toBe(200);
    const view = rename.json.spec.views.find((v) => v.id === 'entries')!;
    const retitle = await apply(token, appId, [{ op: 'replace_view', viewId: 'entries', view: { ...view, title: 'My walks' } }]);
    expect(retitle.status).toBe(200);
  });

  it('does not flag a list sorted by its own title or a count metric over a non-date field', () => {
    const spec = fixtureSpec('photo-walk-journal')!;
    const s: AppSpec = structuredClone(spec);
    s.views.push({ id: 'all', type: 'list', title: 'All walks', titleFieldId: 'subject', sortFieldId: 'subject' } as AppSpec['views'][number]);
    s.views.push({ id: 'glance', type: 'summary', title: 'At a glance', metrics: [{ id: 'n', label: 'Walks', kind: 'count', fieldId: 'subject' }] } as AppSpec['views'][number]);
    expect(bindingProblems(s)).toEqual([]);
  });

  it('still flags one field used as minutes played and as the plan', () => {
    const riff = fixtureSpec('riff-practice')!;
    const s: AppSpec = structuredClone(riff);
    s.views = s.views.map((v) => (v.type === 'practice' ? { ...v, targetMinutesFieldId: v.minutesFieldId } : v)) as AppSpec['views'];
    const problems = bindingProblems(s);
    expect(problems.some((p) => p.key.includes(':shared:minutes+target_minutes:'))).toBe(true);
  });
});

describe('bound fields are checked on the final design', () => {
  it('refuses hiding a due-rule field by removing the rule, hiding it and adding the rule back', async () => {
    const { token } = await client.signup();
    const people = await fixtureApp(token, 'people-queue');
    const appId = people.app.id;
    const alone = await apply(token, appId, [{ op: 'hide_field', fieldId: 'due' }]);
    expect(alone.status).toBe(422);
    const rule = people.spec.rules.find((r) => r.id === 'due_soon')!;
    const stepped = await apply(token, appId, [
      { op: 'remove_rule', ruleId: 'due_soon' },
      { op: 'hide_field', fieldId: 'due' },
      { op: 'add_rule', rule },
    ]);
    expect(stepped.status).toBe(409);
    expect(stepped.json.code).toBe('apply_incompatible');
    expect(stepped.json.error).toMatch(/built around/);
  });
});

describe('import keeps text in a field that was a photo field only in an older version', () => {
  it('decides photo fields by the most recent definition', async () => {
    const { token } = await client.signup();
    const v1 = fixtureSpec('photo-walk-journal')!;
    const withPhoto: AppSpec = structuredClone(v1);
    withPhoto.fields.push({ id: 'shot', label: 'Shot', type: 'image' } as AppSpec['fields'][number]);
    const asText: AppSpec = structuredClone(v1);
    asText.fields.push({ id: 'shot', label: 'Shot name', type: 'text' } as AppSpec['fields'][number]);
    const file = {
      format: 'ai-app-store/app-export',
      exportVersion: 1,
      app: { name: 'Walks' },
      versions: [
        { version: 1, spec: withPhoto, changeSummary: 'First', origin: 'generate', createdAt: '2026-11-01T10:00:00.000Z' },
        { version: 2, spec: asText, changeSummary: 'Shot became a name', origin: 'revision', createdAt: '2026-11-02T10:00:00.000Z' },
      ],
      records: [{ id: 'walkRecord01', values: { date: '2026-11-03', subject: 'River light', shot: 'Blackbird' }, createdAt: '2026-11-03T10:00:00.000Z', updatedAt: '2026-11-03T10:00:00.000Z' }],
    };
    const res = await client.request<AppDetailDto>('/api/apps/import', { body: file, token });
    expect(res.status).toBe(201);
    const records = (await client.request<{ records: AppRecord[] }>(`/api/apps/${res.json.app.id}/records`, { token })).json.records;
    expect(records[0]!.values.shot).toBe('Blackbird');
  });
});

describe('a re-save of an entry this person deleted', () => {
  it('answers record_deleted (409) for their own app, a generic 400 elsewhere', async () => {
    const me = await client.signup();
    const other = await client.signup();
    const riff = await fixtureApp(me.token, 'riff-practice');
    const url = `/api/apps/${riff.app.id}/records`;
    const values = { kind: 'session', minutes: 6, date: '2026-11-13' };
    expect((await client.request(url, { body: { id: 'sessDeleted01', values }, token: me.token })).status).toBe(201);
    expect((await client.request(`${url}/sessDeleted01`, { method: 'DELETE', token: me.token })).status).toBe(200);
    const again = await client.request<ErrorBody>(url, { body: { id: 'sessDeleted01', values: { ...values, minutes: 12 } }, token: me.token });
    expect(again.status).toBe(409);
    expect(again.json.code).toBe('record_deleted');
    const otherApp = await fixtureApp(other.token, 'riff-practice');
    const foreign = await client.request<ErrorBody>(`/api/apps/${otherApp.app.id}/records`, { body: { id: 'sessDeleted01', values }, token: other.token });
    expect(foreign.status).toBe(400);
    expect(foreign.json.code).toBe('invalid');
  });
});

describe('Accept re-checks the suggestion a change came from', () => {
  async function designChange(token: string) {
    const riff = await fixtureApp(token, 'riff-practice');
    const shared = await client.request<{ reply: { proposals: { id: string; kind: string }[] } }>('/api/agent/captures', { body: { text: 'Change Riff to the charcoal look' }, token });
    const up = shared.json.reply.proposals.find((p) => p.kind === 'update_app')!;
    const preview = await client.request<{ ops: unknown[]; summary: string; baseVersion: number }>(`/api/recommendations/${up.id}/update-preview`, { body: {}, token });
    expect(preview.status).toBe(200);
    return { riff, up, preview: preview.json };
  }

  it('refuses a dismissed suggestion and leaves the app unchanged', async () => {
    const { token } = await client.signup();
    const { riff, up, preview } = await designChange(token);
    expect((await client.request(`/api/recommendations/${up.id}/dismiss`, { body: {}, token })).status).toBe(200);
    const accept = await client.request<ErrorBody>(`/api/apps/${riff.app.id}/revisions/apply`, { body: { ops: preview.ops, summary: preview.summary, baseVersion: preview.baseVersion, recommendationId: up.id }, token });
    expect(accept.status).toBe(409);
    expect(accept.json.code).toBe('stale_proposal');
    const now = await client.request<AppDetailDto>(`/api/apps/${riff.app.id}`, { token });
    expect(now.json.app.currentVersion).toBe(1);
  });

  it('refuses the same suggestion a second time once it was applied', async () => {
    const { token } = await client.signup();
    const { riff, up, preview } = await designChange(token);
    const first = await client.request<AppDetailDto>(`/api/apps/${riff.app.id}/revisions/apply`, { body: { ops: preview.ops, summary: preview.summary, baseVersion: preview.baseVersion, recommendationId: up.id }, token });
    expect(first.status).toBe(200);
    const second = await client.request<ErrorBody>(`/api/apps/${riff.app.id}/revisions/apply`, { body: { ops: preview.ops, summary: preview.summary, recommendationId: up.id }, token });
    expect(second.status).toBe(409);
    expect(second.json.code).toBe('stale_proposal');
  });
});

describe('two lost responses in a row are still one entry', () => {
  it('a retried save that already updated the entry may update it again; an edit by hand still blocks', async () => {
    const { token } = await client.signup();
    const riff = await fixtureApp(token, 'riff-practice');
    const url = `/api/apps/${riff.app.id}/records`;
    const base = { kind: 'session', minutes: 5, timed_seconds: 300, date: '2026-11-13' };
    expect((await client.request(url, { body: { id: 'sessTwice0001', values: base }, token })).status).toBe(201);
    const second = await client.request<CreateBody>(url, { body: { id: 'sessTwice0001', values: { ...base, focus: 'Intro' } }, token });
    expect(second.json).toMatchObject({ duplicate: true, updated: true });
    const third = await client.request<CreateBody>(url, { body: { id: 'sessTwice0001', values: { ...base, focus: 'Intro, slowly', minutes: 7, timed_seconds: 420 } }, token });
    expect(third.status).toBe(200);
    expect(third.json).toMatchObject({ duplicate: true, updated: true });
    expect(third.json.record.values).toMatchObject({ focus: 'Intro, slowly', minutes: 7 });
    const list = (await client.request<{ records: AppRecord[] }>(url, { token })).json.records;
    expect(list.filter((r) => r.values.kind === 'session')).toHaveLength(1);

    expect((await client.request(`${url}/sessTwice0001`, { method: 'PATCH', body: { values: { notes: 'Edited' } }, token })).status).toBe(200);
    const after = await client.request<ErrorBody>(url, { body: { id: 'sessTwice0001', values: { ...base, minutes: 9 } }, token });
    expect(after.status).toBe(409);
    expect(after.json.code).toBe('record_conflict');
  });
});
