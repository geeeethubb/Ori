/**
 * Layout checks at 320, 390, 768 and 1440: every Ori screen (signed out: the landing, sign up, sign in,
 * pricing, the companion gallery; signed in: the parent screens, the Make page's preview and Ready, the
 * three reference apps, their Edit with Ori and install sheets, settings) never overflows horizontally,
 * and a full-page screenshot of each lands in test-results/screens/<name>-<width>.png for visual review.
 * Tap targets are at least 44px on the Ori screens at phone width. Runs once (in the "phone" project)
 * and sets its own viewport sizes.
 */
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import {
  EXAMPLE_PHOTO_2, MAKE_WIDE_MIN, addRecord, createFixtureApp, expectNoHorizontalOverflow, isoDaysFromToday, seedPlayground, shareNote, signupViaApi, smallTapTargets, uploadPhoto,
} from './helpers.ts';

const WIDTHS = [320, 390, 768, 1440] as const;
const HEIGHT_FOR: Record<number, number> = { 320: 568, 390: 844, 768: 1024, 1440: 900 };
const SHOTS = path.join(process.cwd(), 'test-results', 'screens');

test.beforeEach(async ({}, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', 'this spec sets its own viewports; one emulated project is enough');
});

interface Screen {
  url: string;
  name: string;
  /** What shows once the screen has its content (checked before measuring). */
  ready?: (page: Page) => Promise<void>;
  /** A second state of the same screen, measured and photographed as <name>-<then.name>. */
  then?: { name: string; run: (page: Page, width: number) => Promise<void> };
}

const visible = (testId: string) => async (page: Page) => {
  await expect(page.getByTestId(testId).first()).toBeVisible({ timeout: 30_000 });
};

/** Each screen at each width: no horizontal overflow (also in its second state), and a full-page screenshot. */
async function fitsEveryWidth(page: Page, screens: Screen[]): Promise<void> {
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: HEIGHT_FOR[width] ?? 900 });
    for (const screen of screens) {
      await test.step(`${screen.name} at ${width}px`, async () => {
        await page.goto(screen.url);
        await page.waitForLoadState('networkidle');
        await screen.ready?.(page);
        await expectNoHorizontalOverflow(page);
        await page.screenshot({ path: path.join(SHOTS, `${screen.name}-${width}.png`), fullPage: true });
        if (screen.then) {
          await screen.then.run(page, width);
          await expectNoHorizontalOverflow(page);
          await page.screenshot({ path: path.join(SHOTS, `${screen.name}-${screen.then.name}-${width}.png`), fullPage: true });
        }
      });
    }
  }
}

test('main screens fit 320, 390, 768 and 1440 without clipping', async ({ page }) => {
  test.setTimeout(420_000);
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
  // A photo share, so the conversation shows the person's own photo.
  const shot = await uploadPhoto(page.request, EXAMPLE_PHOTO_2);
  await shareNote(page.request, 'Tree shadows across the pavement this afternoon', { mediaId: shot.id });
  // The full Make flow (choices, preview, Make mine) comes from a new-app idea on the Playground.
  const ideas = await page.request.get('/api/recommendations');
  const newApps = ((await ideas.json()) as { recommendations: { id: string; kind: string; status: string }[] }).recommendations.filter((r) => r.kind === 'new_app' && r.status === 'fresh');
  const newApp = newApps[0];
  expect(newApp, 'the Playground should have a new-app idea').toBeDefined();
  // Ready: another new-app idea, made through the same routes Make mine uses (a repeat visit shows
  // Ready for the app it made). A second Playground idea, else one from a share.
  const madeId = newApps[1]?.id ?? (await shareNote(page.request, 'I want to learn to cook a few vegetarian dinners this month')).reply?.proposals.find((p) => p.kind === 'new_app')?.id;
  expect(madeId, 'a second new-app idea to make').toBeDefined();
  const draft = await page.request.post(`/api/recommendations/${madeId}/draft`, { data: { instructions: '', choices: {} } });
  expect(draft.status(), await draft.text()).toBe(200);
  const design = (await draft.json()) as { spec: unknown; description: string };
  const build = await page.request.post(`/api/recommendations/${madeId}/build`, { data: { spec: design.spec, description: design.description } });
  expect(build.status(), await build.text()).toBe(201);

  const screens: Screen[] = [
    { url: '/agent', name: 'agent', ready: visible('agent-composer') },
    { url: '/playground', name: 'playground', ready: visible('pg-card') },
    { url: '/apps', name: 'apps', ready: visible('app-actions') },
    {
      url: `/make/${newApp!.id}`,
      name: 'make',
      ready: async (p) => {
        await expect(p.getByTestId('make-mine')).toBeEnabled({ timeout: 60_000 });
      },
      // Narrow screens lead with a compact strip: the whole preview, opened in place, fits too.
      then: {
        name: 'open',
        run: async (p, width) => {
          if (width < MAKE_WIDE_MIN) await p.getByTestId('make-preview-more').click();
          await expect(p.getByTestId('make-example').getByTestId('make-preview')).toBeVisible();
        },
      },
    },
    { url: `/make/${madeId}`, name: 'make-ready', ready: visible('make-ready') },
    { url: `/make/${proposal!.id}`, name: 'make-use', ready: visible('make-use-open') },
    { url: `/apps/${riff.app.id}/`, name: 'riff', ready: visible('rt-practice') },
    { url: `/apps/${light.app.id}/`, name: 'light', ready: visible('rt-gallery-tile') },
    { url: `/apps/${people.app.id}/`, name: 'people', ready: visible('rt-queue-item') },
    {
      url: `/apps/${light.app.id}/?edit=1`,
      name: 'light-edit',
      ready: visible('rt-edit-sheet'),
      // The review of a change, with its preview on the latest photo.
      then: {
        name: 'review',
        run: async (p) => {
          await p.getByTestId('rt-revise-input').fill('Add camera settings to my photo notes');
          await p.getByTestId('rt-revise-preview').click();
          await expect(p.getByTestId('rt-revise-card')).toBeVisible({ timeout: 60_000 });
        },
      },
    },
    { url: `/apps/${riff.app.id}/?install=1`, name: 'riff-install', ready: visible('rt-install-sheet') },
    { url: `/apps/${riff.app.id}/settings`, name: 'riff-settings', ready: visible('rt-settings') },
    { url: '/settings/memory', name: 'memory' },
    { url: '/settings', name: 'settings' },
    { url: '/settings/import', name: 'import' },
  ];
  await fitsEveryWidth(page, screens);
});

test('signed-out screens fit 320, 390, 768 and 1440 without clipping', async ({ page }) => {
  test.setTimeout(120_000);
  await fitsEveryWidth(page, [
    { url: '/', name: 'landing', ready: visible('landing-scene') },
    { url: '/signup', name: 'signup', ready: visible('auth-submit') },
    { url: '/login', name: 'login', ready: visible('auth-submit') },
    { url: '/pricing', name: 'pricing', ready: visible('pricing-allowance') },
    { url: '/ori', name: 'ori-gallery', ready: visible('ori-gallery') },
  ]);
});

test('tap targets are at least 44px on the Ori screens and the session form is reachable at phone width', async ({ page }) => {
  test.setTimeout(120_000);
  await signupViaApi(page);
  const riff = await createFixtureApp(page.request, 'riff-practice');
  const light = await createFixtureApp(page.request, 'light-gallery');
  const photo = await uploadPhoto(page.request);
  await addRecord(page.request, light.app.id, { date: isoDaysFromToday(0), photo: photo.id, caption: 'Low sun on the brick wall', light: 'golden' });
  const people = await createFixtureApp(page.request, 'people-queue');
  await addRecord(page.request, people.app.id, { person: 'Priya (investor)', action: 'Send the deck', due: isoDaysFromToday(-1), context: 'Asked about pricing for small teams' });
  await addRecord(page.request, people.app.id, { person: 'Marcus (mentor)', action: 'Intro to a design partner', due: isoDaysFromToday(0) });
  await seedPlayground(page.request);
  await shareNote(page.request, 'I like this sound and have 15 minutes to practice');
  const recs = ((await (await page.request.get('/api/recommendations')).json()) as { recommendations: { id: string; kind: string; status: string }[] }).recommendations;
  const newApp = recs.find((r) => r.kind === 'new_app' && r.status === 'fresh');
  expect(newApp, 'the Playground should have a new-app idea').toBeDefined();

  // Every visible button and button-styled link on the Ori screens is at least 44px tall at phone width
  // (People's first card is open, so its Mark done / Draft message / Edit count too).
  await page.setViewportSize({ width: 390, height: 844 });
  const screens: [string, string, string][] = [
    ['Riff', `/apps/${riff.app.id}/`, 'rt-practice'],
    ['Light', `/apps/${light.app.id}/`, 'rt-gallery-tile'],
    ['People', `/apps/${people.app.id}/`, 'rt-queue-item'],
    ['My apps', '/apps', 'app-actions'],
    ['Agent', '/agent', 'agent-reply'],
    ['Playground', '/playground', 'pg-card'],
    ['Make', `/make/${newApp!.id}`, 'make-example'],
  ];
  for (const [name, url, ready] of screens) {
    await page.goto(url);
    await expect(page.getByTestId(ready).first()).toBeVisible({ timeout: 30_000 });
    if (name === 'Make') await expect(page.getByTestId('make-mine')).toBeEnabled({ timeout: 60_000 });
    const small = await smallTapTargets(page);
    expect(small, `${name}: tap targets under 44px: ${JSON.stringify(small)}`).toEqual([]);
  }

  // Riff's rotating prompt is part of the practice room, after the timer and its save row (not above the page).
  await page.goto(`/apps/${riff.app.id}/`);
  const room = page.getByTestId('rt-practice');
  await expect(room.getByTestId('rt-prompt-card')).toBeVisible();
  await expect(page.getByTestId('rt-prompt-card')).toHaveCount(1);
  const below = await room.evaluate((el) => {
    const save = el.querySelector('[data-testid="rt-practice-save"]');
    const prompt = el.querySelector('[data-testid="rt-prompt-card"]');
    return Boolean(save && prompt && save.compareDocumentPosition(prompt) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  expect(below, 'the prompt comes after the timer and its save row').toBe(true);

  // The session form is reachable from the timer.
  await expect(page.getByTestId('rt-practice')).toBeVisible();
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
