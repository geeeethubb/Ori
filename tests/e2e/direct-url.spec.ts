/**
 * Direct app URLs: install metadata on a fresh request, sign-in inside the app's own URL,
 * two apps → two distinct manifests, and no access across users.
 */
import { test, expect } from '@playwright/test';
import { PASSWORD, addRecord, createFixtureApp, signupViaApi, uniqueEmail } from './helpers.ts';

test('fresh direct request serves app-specific install metadata and signs in in place', async ({ browser }) => {
  const owner = await browser.newContext();
  const ownerPage = await owner.newPage();
  const { email } = await signupViaApi(ownerPage, uniqueEmail('owner'));
  const journal = await createFixtureApp(ownerPage.request, 'photo-walk-journal', 'Morning Light Journal');
  const board = await createFixtureApp(ownerPage.request, 'follow-up-board');
  await addRecord(ownerPage.request, journal.app.id, { date: '2026-11-13', subject: 'Fog over the river', reflection: 'Wait for the gaps.' });

  // Metadata is app-specific on a request with no cookies at all.
  const anon = await browser.newContext();
  const html = await (await anon.request.get(`/apps/${journal.app.id}/`)).text();
  expect(html).toContain('<title>Morning Light Journal</title>');
  expect(html).toContain(`/apps/${journal.app.id}/manifest.webmanifest`);
  expect(html).toContain(`/apps/${journal.app.id}/icon-180.png`);
  expect(html).toContain('apple-mobile-web-app-title" content="Morning Light Journal"');

  const m1 = await (await anon.request.get(`/apps/${journal.app.id}/manifest.webmanifest`)).json();
  const m2 = await (await anon.request.get(`/apps/${board.app.id}/manifest.webmanifest`)).json();
  expect(m1.start_url).toBe(`/apps/${journal.app.id}/`);
  expect(m2.start_url).toBe(`/apps/${board.app.id}/`);
  expect(m1.id).not.toBe(m2.id);
  expect(m1.name).toBe('Morning Light Journal');
  expect(m2.name).toBe('People to Follow Up With');
  expect(m1.display).toBe('standalone');
  const icon = await anon.request.get(`/apps/${journal.app.id}/icon-192.png`);
  expect(icon.status()).toBe(200);
  expect(['image/png', 'image/svg+xml']).toContain(icon.headers()['content-type']?.split(';')[0]);

  // Records are never public.
  expect((await anon.request.get(`/api/apps/${journal.app.id}/records`)).status()).toBe(401);

  // Open the direct URL with no session: inline sign-in at the same URL, then the app with its data.
  const page = await anon.newPage();
  await page.goto(`/apps/${journal.app.id}/`);
  await expect(page).toHaveURL(new RegExp(`/apps/${journal.app.id}/?$`));
  await expect(page.getByTestId('rt-signin-submit')).toBeVisible();
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/^password/i).fill(PASSWORD);
  await page.getByTestId('rt-signin-submit').click();
  await expect(page.getByText('Fog over the river')).toBeVisible({ timeout: 20_000 });
  await expect(page).toHaveURL(new RegExp(`/apps/${journal.app.id}/?$`));

  // A different user cannot read the app (404 API, not-found UI).
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await signupViaApi(otherPage, uniqueEmail('other'));
  expect((await otherPage.request.get(`/api/apps/${journal.app.id}`)).status()).toBe(404);
  expect((await otherPage.request.get(`/api/apps/${journal.app.id}/records`)).status()).toBe(404);
  await otherPage.goto(`/apps/${journal.app.id}/`);
  await expect(otherPage.getByText(/could not find/i)).toBeVisible();
  await expect(otherPage.getByText('Fog over the river')).toHaveCount(0);

  await Promise.all([owner.close(), anon.close(), other.close()]);
});
