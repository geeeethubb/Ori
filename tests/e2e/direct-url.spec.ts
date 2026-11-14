/**
 * Direct app URLs: install metadata on a fresh request (brand on the storefront, the app's own name
 * and look on its URL), two apps → two distinct manifests, sign-in inside the app's own URL, the
 * owner's photo rendered through the session, and no access across users.
 */
import { test, expect } from '@playwright/test';
import { BRAND } from '../../shared/brand.ts';
import { PASSWORD, addRecord, createFixtureApp, isoDaysFromToday, signupViaApi, uniqueEmail, uploadPhoto } from './helpers.ts';

test('fresh direct requests serve app-specific install metadata, sign in in place, and never leak across users', async ({ browser }) => {
  test.setTimeout(120_000);
  const owner = await browser.newContext();
  const ownerPage = await owner.newPage();
  const { email } = await signupViaApi(ownerPage, uniqueEmail('owner'));
  const riff = await createFixtureApp(ownerPage.request, 'riff-practice');
  const light = await createFixtureApp(ownerPage.request, 'light-gallery');
  await addRecord(ownerPage.request, riff.app.id, { kind: 'session', date: isoDaysFromToday(0), minutes: 12, focus: 'Fingerpicked intro at half speed', feel: 4 });
  const photo = await uploadPhoto(ownerPage.request);
  await addRecord(ownerPage.request, light.app.id, { date: isoDaysFromToday(0), photo: photo.id, caption: 'Low sun on the brick wall', light: 'golden' });

  // Metadata is app-specific on a request with no cookies at all; the storefront carries the brand.
  const anon = await browser.newContext();
  const html = await (await anon.request.get(`/apps/${riff.app.id}/`)).text();
  expect(html).toContain('<title>Riff</title>');
  expect(html).toContain(`/apps/${riff.app.id}/manifest.webmanifest`);
  expect(html).toContain(`/apps/${riff.app.id}/icon-180.png`);
  expect(html).toContain('apple-mobile-web-app-title" content="Riff"');
  const home = await (await anon.request.get('/')).text();
  expect(home).toContain(`<title>${BRAND.name}</title>`);
  expect(home).not.toContain(`<title>${BRAND.legacyName}</title>`);
  const storeManifest = await (await anon.request.get('/manifest.webmanifest')).json();
  expect(storeManifest.name).toBe(BRAND.name);

  // Two apps → two manifests, each with its own identity and look (ink vs paper).
  const m1 = await (await anon.request.get(`/apps/${riff.app.id}/manifest.webmanifest`)).json();
  const m2 = await (await anon.request.get(`/apps/${light.app.id}/manifest.webmanifest`)).json();
  expect(m1.start_url).toBe(`/apps/${riff.app.id}/`);
  expect(m2.start_url).toBe(`/apps/${light.app.id}/`);
  expect(m1.id).not.toBe(m2.id);
  expect(m1.name).toBe('Riff');
  expect(m2.name).toBe('Light');
  expect(m1.display).toBe('standalone');
  expect(m1.background_color).toMatch(/^#[0-9A-Fa-f]{6}$/);
  expect(m2.background_color).toMatch(/^#[0-9A-Fa-f]{6}$/);
  expect(m1.background_color).not.toBe(m2.background_color);
  expect(riff.app.design.theme).not.toBe(light.app.design.theme);
  const icon = await anon.request.get(`/apps/${riff.app.id}/icon-192.png`);
  expect(icon.status()).toBe(200);
  expect(['image/png', 'image/svg+xml']).toContain(icon.headers()['content-type']?.split(';')[0]);

  // Records and photos are never public.
  expect((await anon.request.get(`/api/apps/${riff.app.id}/records`)).status()).toBe(401);
  expect((await anon.request.get(`/api/media/${photo.id}`)).status()).toBe(401);

  // Open the direct URL with no session: inline sign-in at the same URL, then the app with its data.
  const page = await anon.newPage();
  await page.goto(`/apps/${riff.app.id}/`);
  await expect(page).toHaveURL(new RegExp(`/apps/${riff.app.id}/?$`));
  await expect(page.getByTestId('rt-signin-submit')).toBeVisible();
  await page.getByTestId('rt-signin-email').or(page.getByLabel(/email/i)).first().fill(email);
  await page.getByTestId('rt-signin-password').or(page.getByLabel(/^password/i)).first().fill(PASSWORD);
  await page.getByTestId('rt-signin-submit').click();
  await expect(page.getByTestId('rt-practice')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Fingerpicked intro at half speed')).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/apps/${riff.app.id}/?$`));

  // The gallery shows the owner's real photo, served owner-only through the session cookie.
  await page.goto(`/apps/${light.app.id}/`);
  await expect(page.getByTestId('rt-gallery')).toBeVisible({ timeout: 20_000 });
  const tiles = page.getByTestId('rt-gallery-tile');
  await expect(tiles).toHaveCount(1);
  const img = tiles.first().locator('img').first();
  await expect(img).toBeVisible();
  await expect.poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth), { timeout: 15_000 }).toBeGreaterThan(0);

  // A different user cannot read either app or the photo (404 API, not-found UI).
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await signupViaApi(otherPage, uniqueEmail('other'));
  for (const id of [riff.app.id, light.app.id]) {
    expect((await otherPage.request.get(`/api/apps/${id}`)).status()).toBe(404);
    expect((await otherPage.request.get(`/api/apps/${id}/records`)).status()).toBe(404);
  }
  expect((await otherPage.request.get(`/api/media/${photo.id}`)).status()).toBe(404);
  await otherPage.goto(`/apps/${light.app.id}/`);
  await expect(otherPage.getByText(/could not find/i)).toBeVisible();
  await expect(otherPage.getByTestId('rt-gallery-tile')).toHaveCount(0);
  await expect(otherPage.getByText('Low sun on the brick wall')).toHaveCount(0);

  await Promise.all([owner.close(), anon.close(), other.close()]);
});
