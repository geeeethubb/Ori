/** Phone-width layout checks: no horizontal overflow, tap targets, screenshots for review. */
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { addRecord, createFixtureApp, expectNoHorizontalOverflow, isoDaysFromToday, signupViaApi } from './helpers.ts';

test.skip(({ isMobile }) => !isMobile, 'phone project only');

test('primary screens fit a phone without clipping', async ({ page }) => {
  await signupViaApi(page);
  const journal = await createFixtureApp(page.request, 'photo-walk-journal');
  await addRecord(page.request, journal.app.id, { date: isoDaysFromToday(0), subject: 'Rain on the tram window', reflection: 'Shoot through glass more often; the reflections add a second frame.' });
  const board = await createFixtureApp(page.request, 'follow-up-board');
  await addRecord(page.request, board.app.id, { person: 'Priya', stage: 'promised', commitment: 'Send the deck', due: isoDaysFromToday(-1) });

  // Context + recommendations (Sample mode) so the discovery screens have real content.
  expect((await page.request.post('/api/context/sample', { data: { profile: 'founder-photographer' } })).status()).toBe(201);
  const gen = await page.request.post('/api/recommendations/generate', { data: {} });
  expect(gen.status()).toBe(200);
  const firstRec = ((await gen.json()) as { recommendations: { id: string }[] }).recommendations[0];

  const shots = path.join(process.cwd(), 'test-results', 'screens');
  const pages: [string, string][] = [
    ['/import', 'import'],
    ['/context', 'context'],
    ['/for-you', 'for-you'],
    [`/recommendations/${firstRec?.id}`, 'recommendation'],
    ['/collection', 'collection'],
    [`/apps/${journal.app.id}/`, 'journal'],
    [`/apps/${board.app.id}/`, 'board'],
    [`/apps/${journal.app.id}/settings`, 'settings'],
    ['/pricing', 'pricing'],
  ];
  for (const [url, name] of pages) {
    await page.goto(url);
    await page.waitForLoadState('networkidle');
    await expectNoHorizontalOverflow(page);
    await page.screenshot({ path: `${shots}/${name}-phone.png`, fullPage: true });
  }

  // Tap targets on the app screen: visible buttons are at least 40px tall.
  await page.goto(`/apps/${journal.app.id}/`);
  const small = await page.locator('button:visible, a.btn:visible').evaluateAll((els) =>
    els.map((el) => ({ h: (el as HTMLElement).getBoundingClientRect().height, text: (el.textContent ?? '').trim().slice(0, 30) })).filter((b) => b.h > 0 && b.h < 40),
  );
  expect(small, `small tap targets: ${JSON.stringify(small)}`).toEqual([]);

  // The new-entry sheet is usable: fields visible, save button reachable.
  await page.getByTestId('rt-new-entry').click();
  await expect(page.getByTestId('rt-save-record')).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
