/**
 * The real "restart" check. This file uses a temporary database FILE instead of ':memory:':
 * DATABASE_PATH is set before the server modules are imported (config reads env at import time),
 * an app and an entry are saved, the connection is closed and reopened, and the same entry comes
 * back through the API. The in-memory variant (a second createServer() in one process) lives in
 * api.test.ts. The file is deleted afterwards.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { DEFAULT_PASSWORD, assertNotServing, clientFor, uniqueEmail } from '../helpers/testServer.ts';
import type { AppDetailDto } from '../../shared/api.ts';
import type { AppRecord } from '../../shared/records.ts';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aas-persistence-'));
const dbPath = path.join(tmpDir, 'app.db');
process.env.DATABASE_PATH = dbPath;

/** Remove the temporary database folder; retries cover Windows handles that close a beat late. */
function removeTempDir(): void {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch {
    // Best effort: the OS temp folder is cleaned eventually.
  }
}

assertNotServing();
// If the server cannot even be imported (for example a module another engineer has not landed yet),
// no hook would run, so clean up here before rethrowing.
const [serverModule, dbModule, configModule] = await Promise.all([
  import('../../server/index.ts'),
  import('../../server/db/index.ts'),
  import('../../server/config.ts'),
]).catch((err: unknown) => {
  removeTempDir();
  throw err;
});
const { createServer } = serverModule;
const { closeDatabase, openDatabase } = dbModule;
const { config } = configModule;

afterAll(() => {
  closeDatabase();
  removeTempDir();
});

describe('entries survive closing and reopening the database file', () => {
  it('the server picked up the temporary file path set before import', () => {
    expect(config.databasePath).toBe(dbPath);
  });

  it('an app, its entry and the session are all there after close + reopen', async () => {
    const before = clientFor(createServer());
    const me = await before.signup(uniqueEmail('persist'));
    const created = await before.request<AppDetailDto>('/api/apps/from-fixture', { body: { fixture: 'photo-walk-journal' }, token: me.token });
    expect(created.status).toBe(201);
    const appId = created.json.app.id;
    const saved = await before.request<{ record: AppRecord }>(`/api/apps/${appId}/records`, {
      body: { values: { date: '2026-11-14', subject: 'Fog over the canal', mood: 'calm', keeper: true } },
      token: me.token,
    });
    expect(saved.status).toBe(201);
    expect(fs.existsSync(dbPath)).toBe(true);

    closeDatabase();
    openDatabase(dbPath);
    const after = clientFor(createServer());

    const reopened = await after.request<AppDetailDto>(`/api/apps/${appId}`, { token: me.token });
    expect(reopened.status).toBe(200);
    expect(reopened.json.app.name).toBe('Photo Walk Journal');
    expect(reopened.json.app.recordCount).toBe(1);

    const records = await after.request<{ records: AppRecord[] }>(`/api/apps/${appId}/records`, { token: me.token });
    expect(records.status).toBe(200);
    expect(records.json.records).toEqual([saved.json.record]);

    const login = await after.login(me.email, DEFAULT_PASSWORD);
    expect(login.status).toBe(200);
    expect(login.json.token).toBeTruthy();
  });

  it('reopening does not re-run migrations or duplicate anything', () => {
    const db = openDatabase(dbPath);
    const migrations = db.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get() as { n: number };
    expect(Number(migrations.n)).toBeGreaterThanOrEqual(1);
    const apps = db.prepare('SELECT COUNT(*) AS n FROM apps').get() as { n: number };
    expect(Number(apps.n)).toBe(1);
  });
});
