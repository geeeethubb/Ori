import { beforeAll, describe, expect, it } from 'vitest';
import { getDb } from '../../server/db/index.ts';
import { makeClient, type TestClient } from '../helpers/testServer.ts';

let client: TestClient;
beforeAll(async () => {
  client = await makeClient();
});

const rowsFor = (email: string) =>
  (getDb().prepare('SELECT email, source FROM waitlist WHERE email = ?').all(email) as { email: string; source: string }[]).map((r) => ({ ...r }));

describe('POST /api/waitlist (homepage waitlist, stores emails only)', () => {
  it('stores a valid address once, trimmed and lowercased, without an account', async () => {
    const first = await client.request('/api/waitlist', { method: 'POST', body: { email: '  Judge@Example.TEST ' }, headers: { 'x-forwarded-for': '203.0.113.1' } });
    expect(first.status).toBe(200);
    expect(first.json).toEqual({ ok: true });
    const again = await client.request('/api/waitlist', { method: 'POST', body: { email: 'judge@example.test' }, headers: { 'x-forwarded-for': '203.0.113.1' } });
    expect(again.status).toBe(200);
    expect(again.json).toEqual({ ok: true });
    expect(rowsFor('judge@example.test')).toEqual([{ email: 'judge@example.test', source: 'landing' }]);
  });

  it('rejects an address that is not an email, and a missing body', async () => {
    const bad = await client.request('/api/waitlist', { method: 'POST', body: { email: 'not-an-email' }, headers: { 'x-forwarded-for': '203.0.113.2' } });
    expect(bad.status).toBe(400);
    expect(bad.json.code).toBe('invalid');
    const empty = await client.request('/api/waitlist', { method: 'POST', body: 'nope', headers: { 'x-forwarded-for': '203.0.113.2' } });
    expect(empty.status).toBe(400);
  });

  it('answers a filled hidden field the same way but stores nothing', async () => {
    const res = await client.request('/api/waitlist', { method: 'POST', body: { email: 'bot@example.test', company: 'Acme' }, headers: { 'x-forwarded-for': '203.0.113.3' } });
    expect(res.status).toBe(200);
    expect(rowsFor('bot@example.test')).toEqual([]);
  });

  it('limits repeated attempts from one network', async () => {
    let last = 0;
    for (let i = 0; i < 31; i++) {
      last = (await client.request('/api/waitlist', { method: 'POST', body: { email: `person${i}@example.test` }, headers: { 'x-forwarded-for': '203.0.113.4' } })).status;
    }
    expect(last).toBe(429);
  });
});
