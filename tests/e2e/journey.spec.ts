/**
 * The guitar slice, end to end in sample mode:
 * sign up → share a sound with the Agent → honest read status and a grounded proposal ("Preview Riff",
 * with "Keep inspiration") → the Make page designs its preview by itself, starting at the length the
 * share asked for, and follows a length choice → Make mine → Ready on the same URL (Open, Add to home
 * screen, Copy app link) → the practice app at its own URL → run the timer, save a session → reload
 * keeps it → a change from the app's Settings ('...' menu) adds a field, the session survives → undo →
 * My apps has it selected and opens it.
 * Second test: two contrasting sample profiles give materially different Playground sets.
 */
import { test, expect, type Page } from '@playwright/test';
import { PASSWORD, appDetail, appIdFrom, chooseFromAppMenu, expectNoHorizontalOverflow, listRecords, showMakePreview, signupViaApi, uniqueEmail } from './helpers.ts';

test.describe.configure({ mode: 'serial' });

/** E2E_LIVE=1 runs against the real model: copy varies, so some assertions become shape-based. */
const LIVE = process.env.E2E_LIVE === '1';

/** Current app version, or -1 while the app cannot be read (lets expect.poll retry quietly). */
async function appVersion(page: Page, appId: string): Promise<number> {
  const res = await page.request.get(`/api/apps/${appId}`);
  if (res.status() !== 200) return -1;
  return ((await res.json()) as { version: number }).version;
}

test('share a sound → Preview Riff → Make mine → Ready → practise → the session survives a change and an undo', async ({ page }) => {
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
  // The conversation reads oldest first, newest last; this is its only exchange.
  const item = page.getByTestId('agent-item').last();
  await expect(item).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('agent-item')).toHaveCount(1);
  await expect(item.getByTestId('agent-read-status')).toHaveAttribute('data-status', 'read');
  const reply = item.getByTestId('agent-reply');
  await expect(reply).toBeVisible({ timeout: 60_000 });
  const card = reply.locator('[data-testid="proposal-card"][data-kind="new_app"]').first();
  await expect(card).toBeVisible();
  await expect(card.getByTestId('proposal-action')).toHaveText(/^Preview\b/);
  // Sample mode always offers "just keep it": the lead card's "Keep inspiration" (a separate keep card
  // only when a reply has no lead). The live model offers it only when the share reads like a passing save.
  if (!LIVE) {
    await expect(reply.getByTestId('proposal-keep')).toHaveCount(1);
    await expect(card.getByTestId('proposal-keep')).toHaveText('Keep inspiration');
  }
  await expectNoHorizontalOverflow(page);

  // Preview Riff: the Make page designs the preview by itself (the real renderer, labelled as example
  // content; on a phone behind "Show the whole preview"), starting at the length the share asked for.
  await card.getByTestId('proposal-action').click();
  await expect(page).toHaveURL(/\/make\/[A-Za-z0-9_-]{8,40}$/);
  const makeUrl = page.url();
  const preview = await showMakePreview(page);
  await expectNoHorizontalOverflow(page);
  const fifteen = page.getByTestId('make-choice-minutes-15');
  if (LIVE) await fifteen.click();
  else await expect(fifteen).toHaveAttribute('aria-pressed', 'true');
  const firstPreset = preview.locator('[data-testid^="rt-practice-preset-"]').first();
  if (!LIVE) {
    await expect(firstPreset).toHaveAttribute('data-testid', 'rt-practice-preset-15');
    // One meaningful choice, and the preview follows it: 25 minutes is designed (its timer starts at 25),
    // then back to 15. Make mine, pressed while that design may still be on its way, makes the design
    // of the last choice, never the one that happened to be on show.
    const twentyFive = page.getByTestId('make-choice-minutes-25');
    await twentyFive.click();
    await expect(twentyFive).toHaveAttribute('aria-pressed', 'true');
    await expect(firstPreset).toHaveAttribute('data-testid', 'rt-practice-preset-25', { timeout: 30_000 });
    await fifteen.click();
    await expect(fifteen).toHaveAttribute('aria-pressed', 'true');
  }
  const makeMine = page.getByTestId('make-mine');
  await expect(makeMine).toBeEnabled({ timeout: 90_000 });
  await makeMine.click();

  // Ready on the same URL, only once the server returned the app: Open, Add to home screen, Copy app link.
  await expect(page.getByTestId('make-ready')).toBeVisible({ timeout: 60_000 });
  await expect(page).toHaveURL(makeUrl);
  await expect(page.getByTestId('make-ready-title')).toContainText('is yours');
  const openApp = page.getByTestId('make-ready-open');
  const appId = appIdFrom(await openApp.getAttribute('href'));
  expect(appId, 'Open goes to the app at its own URL').not.toBe('');
  await expect(openApp).toHaveAttribute('href', `/apps/${appId}/`);
  await expect(page.getByTestId('make-ready-install')).toHaveAttribute('href', `/apps/${appId}/?install=1`);
  await expect(page.getByTestId('make-ready-copy')).toContainText('Copy app link');
  await expectNoHorizontalOverflow(page);
  // One proposal, one app, however the choices went.
  const mine = ((await (await page.request.get('/api/apps')).json()) as { apps: { id: string }[] }).apps;
  expect(mine.map((a) => a.id)).toEqual([appId]);
  await openApp.click();
  await expect(page).toHaveURL(new RegExp(`/apps/${appId}/?$`));
  const appUrl = page.url();

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
  // The measured time survives a reload of the page: it is kept on this device, not only in the tab.
  await page.reload();
  await expect(page.getByTestId('rt-practice')).toHaveAttribute('data-status', 'paused', { timeout: 30_000 });
  await expect(page.getByTestId('rt-practice-hint')).toContainText('Timed');
  await page.getByTestId('rt-practice-save').click();
  await expect(page.getByTestId('rt-save-record')).toBeVisible();
  // The form says what the clock measured; the plan is never saved as time played.
  await expect(page.getByTestId('rt-form-note')).toContainText('Your timer measured');
  await page.getByTestId('rt-save-record').click();

  // A session appears, and it is a real record that belongs to the practice view.
  await expect(page.getByTestId('rt-session').first()).toBeVisible({ timeout: 15_000 });
  const saved = await listRecords(page.request, appId);
  expect(saved).toHaveLength(1);
  const session = saved[0]!.values;
  if (practiceView?.filter) expect(session[practiceView.filter.fieldId]).toBe(practiceView.filter.value);
  expect(Number(session[practiceView?.minutesFieldId ?? 'minutes'])).toBeGreaterThanOrEqual(1);
  // Plan and measurement are stored apart when the app binds them (new Riff apps do).
  if (practiceView?.targetMinutesFieldId) expect(session[practiceView.targetMinutesFieldId]).toBe(15);
  if (practiceView?.timedSecondsFieldId) expect(Number(session[practiceView.timedSecondsFieldId])).toBeGreaterThanOrEqual(1);

  // Reload the stable URL: the session is still there.
  await page.goto(appUrl);
  await expect(page.getByTestId('rt-session')).toHaveCount(1);

  // Make this more me, from the app's Settings in its '...' menu: add a field for the song; the session survives.
  await chooseFromAppMenu(page, 'rt-settings-link');
  await expect(page).toHaveURL(new RegExp(`/apps/${appId}/settings$`));
  await expect(page.getByTestId('rt-settings')).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.getByTestId('rt-revise-input').fill('Add a field for which song I practised');
  await page.getByTestId('rt-revise-preview').click();
  await expect(page.getByTestId('rt-revise-changes')).toContainText(LIVE ? /song/i : /which song/i, { timeout: 90_000 });
  // The review says the saved session is kept, and offers exactly the two decisions.
  await expect(page.getByTestId('rt-revise-keeps')).toBeVisible();
  await expect(page.getByTestId('rt-revise-decline')).toHaveText('Keep current version');
  await expect(page.getByTestId('rt-revise-accept')).toHaveText('Apply change');
  await page.getByTestId('rt-revise-accept').click();
  await expect.poll(() => appVersion(page, appId), { timeout: 30_000 }).toBe(2);
  // The review and its Apply button are gone: focus lands on the section's heading, not the top of the page.
  await expect(page.locator('#rt-edit-heading')).toBeFocused();
  const revised = await appDetail(page.request, appId);
  expect(revised.spec.fields.some((f) => /song/i.test(f.label))).toBe(true);
  await page.goto(appUrl);
  await expect(page.getByTestId('rt-session')).toHaveCount(1);
  expect(await listRecords(page.request, appId)).toEqual(saved);

  // The new field is reachable: it is in the practice view's form and shows up in Save session.
  const songField = revised.spec.fields.find((f) => /song/i.test(f.label));
  expect(songField, 'the revision added a song field').toBeDefined();
  expect(revised.spec.views.find((v) => v.type === 'practice')?.formFieldIds ?? []).toContain(songField!.id);
  await page.getByTestId('rt-practice-save').click();
  await expect(page.getByTestId('rt-record-form')).toBeVisible();
  const songLabel = new RegExp(songField!.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  await expect(page.getByTestId('rt-record-form').getByLabel(songLabel).first()).toBeVisible();
  await page.getByTestId('rt-cancel-record').click();
  await expect(page.getByTestId('rt-record-form')).toHaveCount(0);

  // Undo shows what it restores and keeps, then restores the previous definition and keeps the session.
  await chooseFromAppMenu(page, 'rt-settings-link');
  await expect(page).toHaveURL(new RegExp(`/apps/${appId}/settings$`));
  await page.getByTestId('rt-undo').click();
  await expect(page.getByTestId('rt-undo-plan')).toContainText('Your entries stay');
  await page.getByTestId('rt-undo-confirm').click();
  await expect.poll(() => appVersion(page, appId), { timeout: 30_000 }).toBe(3);
  const restored = await appDetail(page.request, appId);
  expect(restored.spec.fields.map((f) => f.id)).toEqual(detail.spec.fields.map((f) => f.id));
  await page.goto(appUrl);
  await expect(page.getByTestId('rt-session')).toHaveCount(1);

  // My apps lists it, already selected with its actions ready; tapping the selected tile opens it.
  await page.goto('/apps');
  const tile = page.locator(`[data-testid="app-tile"][data-app-id="${appId}"]`);
  await expect(tile).toBeVisible();
  await expect(tile).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('app-actions')).toHaveAttribute('data-app-id', appId);
  await expect(page.getByTestId('app-action-open')).toHaveAttribute('href', `/apps/${appId}/`);
  await expectNoHorizontalOverflow(page);
  await tile.click();
  await expect(page).toHaveURL(new RegExp(`/apps/${appId}/?$`));
  await expect(page.getByTestId('rt-session')).toHaveCount(1);
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

    // The first visit makes ideas by itself once something is shared; "Update app ideas" only when none came.
    await page.goto('/playground');
    const cards = page.getByTestId('pg-card');
    await cards.first().or(page.getByTestId('pg-empty')).first().waitFor({ timeout: 120_000 });
    if ((await cards.count()) === 0) await page.getByTestId('pg-refresh').click();
    await expect(cards.first()).toBeVisible({ timeout: 120_000 });
    // No update is running, so the cards on the page are the server's current set.
    await expect(page.getByTestId('pg-updating')).toHaveCount(0, { timeout: 120_000 });
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
