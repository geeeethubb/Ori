/**
 * Layout checks at 320, 390, 768 and 1440: the main screens never overflow horizontally, and a
 * full-page screenshot of each lands in test-results/screens/<name>-<width>.png for visual review.
 * Runs once (in the "phone" project) and sets its own viewport sizes.
 */
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { addRecord, createFixtureApp, expectNoHorizontalOverflow, isoDaysFromToday, seedPlayground, shareNote, signupViaApi, uploadPhoto } from './helpers.ts';

const WIDTHS = [320, 390, 768, 1440] as const;
const HEIGHT_FOR: Record<number, number> = { 320: 568, 390: 844, 768: 1024, 1440: 900 };
const SHOTS = path.join(process.cwd(), 'test-results', 'screens');

test.beforeEach(async ({}, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', 'this spec sets its own viewports; one emulated project is enough');
});

test('main screens fit 320, 390, 768 and 1440 without clipping', async ({ page }) => {
  test.setTimeout(300_000);
  await signupViaApi(page);

  // Real content on every screen: the three reference apps with records, Playground cards, a thread.
  const riff = await createFixtureApp(page.request, 'riff-practice');
  await addRecord(page.request, riff.app.id, { kind: 'session', date: isoDaysFromToday(0), minutes: 12, focus: 'Fingerpicked intro at half speed', feel: 4 });
  await addRecord(page.request, riff.app.id, { kind: 'source', url: 'https://example.org/lessons/fingerstyle', title: 'Fingerstyle lesson', source_note: 'That intro', source_kind: 'lesson' });
  const light = await createFixtureApp(page.request, 'light-gallery');
  const photo = await uploadPhoto(page.request);
  await addRecord(page.request, light.app.id, { date: isoDaysFromToday(0), photo: photo.id, caption: 'Low sun on the brick wall', light: 'golden' });
  const people = await createFixtureApp(page.request, 'people-queue');
  await addRecord(page.request, people.app.id, { person: 'Priya (investor)', action: 'Send the deck', due: isoDaysFromToday(-1) });
  await addRecord(page.request, people.app.id, { person: 'Marcus (mentor)', action: 'Intro to a design partner', due: isoDaysFromToday(0), context: 'Asked about pricing for small teams' });
  await addRecord(page.request, people.app.id, { person: 'Lena (meetup)', action: 'Share the photo walk route', due: isoDaysFromToday(5), done: true });
  await seedPlayground(page.request);
  // With Riff already made, the guitar note points back to Riff (use the app you have).
  const shared = await shareNote(page.request, 'I like this sound and have 15 minutes to practice');
  const proposal = shared.reply?.proposals.find((p) => p.kind === 'use_app');
  expect(proposal, 'the agent should point the guitar note to the Riff app it already has').toBeDefined();
  // The full Make flow (choices, preview, Make mine) comes from a new-app idea on the Playground.
  const ideas = await page.request.get('/api/recommendations');
  const newApp = ((await ideas.json()) as { recommendations: { id: string; kind: string }[] }).recommendations.find((r) => r.kind === 'new_app');
  expect(newApp, 'the Playground should have a new-app idea').toBeDefined();

  const screens: [string, string][] = [
    ['/agent', 'agent'],
    ['/playground', 'playground'],
    ['/apps', 'apps'],
    [`/make/${newApp!.id}`, 'make'],
    [`/make/${proposal!.id}`, 'make-use'],
    [`/apps/${riff.app.id}/`, 'riff'],
    [`/apps/${light.app.id}/`, 'light'],
    [`/apps/${people.app.id}/`, 'people'],
    ['/settings/memory', 'memory'],
  ];
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: HEIGHT_FOR[width] ?? 900 });
    for (const [url, name] of screens) {
      await test.step(`${name} at ${width}px`, async () => {
        await page.goto(url);
        await page.waitForLoadState('networkidle');
        await expectNoHorizontalOverflow(page);
        await page.screenshot({ path: path.join(SHOTS, `${name}-${width}.png`), fullPage: true });
      });
    }
  }
});

test('tap targets are at least 44px and the session form is reachable at phone width', async ({ page }) => {
  await signupViaApi(page);
  const riff = await createFixtureApp(page.request, 'riff-practice');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/apps/${riff.app.id}/`);
  await expect(page.getByTestId('rt-practice')).toBeVisible();
  const small = await page.locator('button:visible, a.btn:visible').evaluateAll((els) =>
    els
      .map((el) => ({ h: el.getBoundingClientRect().height, text: (el.textContent ?? '').trim().slice(0, 30) || el.getAttribute('aria-label') || el.tagName }))
      .filter((b) => b.h > 0 && b.h < 44),
  );
  expect(small, `tap targets under 44px: ${JSON.stringify(small)}`).toEqual([]);

  await page.getByTestId('rt-practice-save').click();
  await expect(page.getByTestId('rt-save-record')).toBeVisible();
  await expectNoHorizontalOverflow(page);

  // The Agent composer at the narrowest supported width.
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/agent');
  await expect(page.getByTestId('agent-text')).toBeVisible();
  await expect(page.getByTestId('agent-send')).toBeVisible();
  await expectNoHorizontalOverflow(page);
});
