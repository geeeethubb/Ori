/**
 * The guitar slice, end to end in sample mode:
 * sign up → share a sound with the Agent → honest read status and a grounded proposal → Make mine
 * with the 15-minute choice → the practice app at its own URL → run the timer, save a session →
 * reload keeps it → "Make this more me" adds a field, the session survives → undo.
 * Second test: two contrasting sample profiles give materially different Playground sets.
 */
import { test, expect, type Page } from '@playwright/test';
import { PASSWORD, appDetail, expectNoHorizontalOverflow, listRecords, signupViaApi, uniqueEmail } from './helpers.ts';

test.describe.configure({ mode: 'serial' });

/** E2E_LIVE=1 runs against the real model: copy varies, so some assertions become shape-based. */
const LIVE = process.env.E2E_LIVE === '1';

/** Current app version, or -1 while the app cannot be read (lets expect.poll retry quietly). */
async function appVersion(page: Page, appId: string): Promise<number> {
  const res = await page.request.get(`/api/apps/${appId}`);
  if (res.status() !== 200) return -1;
  return ((await res.json()) as { version: number }).version;
}

test('share a sound → Make mine → practise → the session survives a change and an undo', async ({ page }) => {
  test.setTimeout(240_000);
  const email = uniqueEmail('guitar');

  // Sign up through the UI; new people land on the Agent.
  await page.goto('/signup');
  await page.getByTestId('auth-email').fill(email);
  await page.getByTestId('auth-password').fill(PASSWORD);
  await page.getByTestId('auth-submit').click();
  await expect(page).toHaveURL(/\/agent/);
  await expectNoHorizontalOverflow(page);

  // Share the note: the item shows what was read, and the reply offers a new app (and a plain keep).
  await page.getByTestId('agent-text').fill('I like this sound and have 15 minutes to practice');
  await page.getByTestId('agent-send').click();
  const item = page.getByTestId('agent-item').first();
  await expect(item).toBeVisible({ timeout: 60_000 });
  await expect(item.getByTestId('agent-read-status')).toHaveAttribute('data-status', 'read');
  const reply = item.getByTestId('agent-reply');
  await expect(reply).toBeVisible({ timeout: 60_000 });
  const card = reply.locator('[data-testid="proposal-card"][data-kind="new_app"]').first();
  await expect(card).toBeVisible();
  await expect(reply.locator('[data-testid="proposal-card"][data-kind="keep"]')).toHaveCount(1);
  await expectNoHorizontalOverflow(page);

  // Make mine, with one meaningful choice: the 15-minute preset. The preview is the real renderer,
  // labelled as example content, and the CTA only arms once the preview is ready.
  await card.getByTestId('proposal-action').click();
  await expect(page).toHaveURL(/\/make\/[A-Za-z0-9_-]{8,40}/);
  await page.getByTestId('make-choice-minutes-15').click();
  // Preview is an explicit step (it spends a model call in Live mode): the real renderer appears,
  // labelled as example content.
  await page.getByTestId('make-preview-button').click();
  await expect(page.getByTestId('make-preview')).toBeVisible({ timeout: 90_000 });
  await expect(page.getByTestId('make-preview-example-banner')).toBeVisible();
  await expectNoHorizontalOverflow(page);
  const makeMine = page.getByTestId('make-mine');
  await expect(makeMine).toBeEnabled({ timeout: 90_000 });
  await makeMine.click();
  await expect(page).toHaveURL(/\/apps\/[A-Za-z0-9_-]{8,32}\/?$/, { timeout: 60_000 });
  const appUrl = page.url();
  const appId = /\/apps\/([A-Za-z0-9_-]+)/.exec(appUrl)?.[1] ?? '';
  expect(appId).not.toBe('');

  // The choice landed in the app: the timer offers 15 minutes first.
  const detail = await appDetail(page.request, appId);
  const practiceView = detail.spec.views.find((v) => v.type === 'practice');
  expect(practiceView, 'the built app has a practice view').toBeDefined();
  expect(practiceView?.presets?.[0]).toBe(15);

  // Practise: preset → start → pause → save, then the record sheet.
  await expect(page.getByTestId('rt-practice')).toBeVisible({ timeout: 30_000 });
  await expectNoHorizontalOverflow(page);
  await page.getByTestId('rt-practice-preset-15').click();
  await page.getByTestId('rt-practice-start').click();
  await page.waitForTimeout(1500);
  await page.getByTestId('rt-practice-pause').click();
  await page.getByTestId('rt-practice-save').click();
  await expect(page.getByTestId('rt-save-record')).toBeVisible();
  await page.getByTestId('rt-save-record').click();

  // A session appears, and it is a real record that belongs to the practice view.
  await expect(page.getByTestId('rt-session').first()).toBeVisible({ timeout: 15_000 });
  const saved = await listRecords(page.request, appId);
  expect(saved).toHaveLength(1);
  const session = saved[0]!.values;
  if (practiceView?.filter) expect(session[practiceView.filter.fieldId]).toBe(practiceView.filter.value);
  expect(Number(session[practiceView?.minutesFieldId ?? 'minutes'])).toBeGreaterThanOrEqual(1);

  // Reload the stable URL: the session is still there.
  await page.goto(appUrl);
  await expect(page.getByTestId('rt-session')).toHaveCount(1);

  // Make this more me: add a field for the song; the session survives.
  await page.getByTestId('rt-settings-link').click();
  await expectNoHorizontalOverflow(page);
  await page.getByTestId('rt-revise-input').fill('Add a field for which song I practised');
  await page.getByTestId('rt-revise-preview').click();
  await expect(page.getByTestId('rt-revise-changes')).toContainText(LIVE ? /song/i : /which song/i, { timeout: 90_000 });
  await page.getByTestId('rt-revise-accept').click();
  await expect.poll(() => appVersion(page, appId), { timeout: 30_000 }).toBe(2);
  const revised = await appDetail(page.request, appId);
  expect(revised.spec.fields.some((f) => /song/i.test(f.label))).toBe(true);
  await page.goto(appUrl);
  await expect(page.getByTestId('rt-session')).toHaveCount(1);
  expect(await listRecords(page.request, appId)).toEqual(saved);

  // Undo restores the previous definition and keeps the session.
  await page.getByTestId('rt-settings-link').click();
  await page.getByTestId('rt-undo').click();
  await expect.poll(() => appVersion(page, appId), { timeout: 30_000 }).toBe(3);
  const restored = await appDetail(page.request, appId);
  expect(restored.spec.fields.map((f) => f.id)).toEqual(detail.spec.fields.map((f) => f.id));
  await page.goto(appUrl);
  await expect(page.getByTestId('rt-session')).toHaveCount(1);

  // My apps lists it.
  await page.goto('/apps');
  await expect(page.locator(`[data-testid="app-tile"][data-app-id="${appId}"]`)).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test('two contrasting sample profiles produce different, visibly grounded Playground sets', async ({ browser }) => {
  test.setTimeout(240_000);
  const titlesFor = async (button: 'store-sample-founder' | 'store-sample-student') => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await signupViaApi(page, uniqueEmail(button));
    await page.goto('/settings/import');
    await expectNoHorizontalOverflow(page);
    await page.getByTestId(button).click();
    // The import is done once facts exist (the page may move on to What you've shared).
    await expect
      .poll(async () => ((await (await page.request.get('/api/context')).json()) as { facts: unknown[] }).facts.length, { timeout: 60_000 })
      .toBeGreaterThanOrEqual(8);

    await page.goto('/playground');
    const cards = page.getByTestId('pg-card');
    await cards.first().or(page.getByTestId('pg-refresh')).or(page.getByTestId('pg-empty')).first().waitFor({ timeout: 60_000 });
    if ((await cards.count()) === 0) await page.getByTestId('pg-refresh').click();
    await expect(cards.first()).toBeVisible({ timeout: 120_000 });
    expect(await cards.count()).toBeGreaterThanOrEqual(3);
    await expect(cards.first().getByTestId('pg-why')).toBeVisible(); // the grounding is on the card
    if (!LIVE) await expect(page.getByTestId('pg-sample-badge').first()).toBeVisible(); // Sample mode is always visible
    await expectNoHorizontalOverflow(page);

    const res = await page.request.get('/api/recommendations');
    expect(res.status()).toBe(200);
    const recs = ((await res.json()) as { recommendations: { title: string; status: string }[] }).recommendations.filter((r) => r.status === 'fresh');
    expect(recs.length).toBeGreaterThanOrEqual(3);
    for (const r of recs) await expect(page.getByText(r.title).first()).toBeVisible(); // every proposal is on the page
    await context.close();
    return recs.map((r) => r.title.trim());
  };
  const founder = await titlesFor('store-sample-founder');
  const student = await titlesFor('store-sample-student');
  const overlap = founder.filter((t) => student.includes(t));
  expect(overlap.length, `founder: ${founder.join(', ')} | student: ${student.join(', ')}`).toBeLessThanOrEqual(1);
});
