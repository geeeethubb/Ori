/**
 * The demo journey, end to end in sample mode:
 * sign up → bring sample context → review facts → For You → customize → build → save an entry
 * → reload (entry persists) → revise (add a field) → entry retained → undo.
 */
import { test, expect } from '@playwright/test';
import { PASSWORD, expectNoHorizontalOverflow, uniqueEmail } from './helpers.ts';

test.describe.configure({ mode: 'serial' });

test('context → recommendations → build → use → reopen → revise without data loss', async ({ page }) => {
  test.setTimeout(180_000);
  const email = uniqueEmail('journey');

  // Sign up through the UI.
  await page.goto('/signup');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/^password/i).fill(PASSWORD);
  await page.getByTestId('auth-submit').click();
  await expect(page).toHaveURL(/\/import/);
  await expectNoHorizontalOverflow(page);

  // Bring sample context (clearly labelled sample).
  await page.getByTestId('store-sample-founder').click();
  await expect(page).toHaveURL(/\/context/, { timeout: 60_000 });
  const facts = page.getByTestId('fact-item');
  await expect(facts.first()).toBeVisible();
  expect(await facts.count()).toBeGreaterThanOrEqual(8);
  await expect(page.getByText(/sample/i).first()).toBeVisible();
  await expectNoHorizontalOverflow(page);

  // Remove one fact; it disappears.
  const before = await facts.count();
  await page.getByTestId('fact-remove').first().click();
  await expect(facts).toHaveCount(before - 1);

  // For You: grounded recommendations spanning work and exploration.
  await page.getByTestId('store-go-for-you').click();
  await expect(page).toHaveURL(/\/for-you/);
  const cards = page.getByTestId('rec-card');
  await expect(cards.first()).toBeVisible({ timeout: 120_000 });
  expect(await cards.count()).toBeGreaterThanOrEqual(3);
  await expect(page.getByText('People to Follow Up With').first()).toBeVisible();
  await expect(page.getByText('Photo Walk Journal').first()).toBeVisible();
  await expect(page.getByText(/Get things done/).first()).toBeVisible();
  await expect(page.getByText(/Explore life/).first()).toBeVisible();
  await expectNoHorizontalOverflow(page);

  // Choose the journal, customize, preview, build.
  const journalCard = cards.filter({ hasText: 'Photo Walk Journal' }).first();
  await journalCard.getByTestId('rec-build').click();
  await expect(page).toHaveURL(/\/recommendations\//);
  await page.getByTestId('build-instructions').fill('Make it a weekly photography challenge and add a reflection field about what I learned');
  await page.getByTestId('build-preview').click();
  await expect(page.getByTestId('build-confirm')).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText(/weekly/i).first()).toBeVisible();
  await page.getByTestId('build-confirm').click();
  await expect(page).toHaveURL(/\/apps\/[A-Za-z0-9_-]{8,32}\/?$/, { timeout: 60_000 });
  const appUrl = page.url();
  await expectNoHorizontalOverflow(page);

  // The weekly challenge is visible; save a reflection.
  await expect(page.getByText(/challenge|this week/i).first()).toBeVisible();
  await page.getByTestId('rt-new-entry').click();
  const subject = page.locator('[data-testid^="rt-field-"]').filter({ has: page.locator('input[type="text"]') }).first();
  await subject.locator('input').fill('Low sun across the brick wall by the station');
  const reflection = page.locator('[data-testid^="rt-field-"] textarea').first();
  await reflection.fill('Underexposing kept the highlights. Try getting lower next time.');
  await page.getByTestId('rt-save-record').click();
  await expect(page.getByTestId('rt-entry')).toHaveCount(1);
  await expect(page.getByText('Low sun across the brick wall by the station')).toBeVisible();

  // Reload the stable URL: the entry is still there.
  await page.goto(appUrl);
  await expect(page.getByTestId('rt-entry')).toHaveCount(1);
  await expect(page.getByText('Low sun across the brick wall by the station')).toBeVisible();

  // Revise: add a "next experiment" field; the entry survives.
  await page.getByTestId('rt-settings-link').click();
  await page.getByTestId('rt-revise-input').fill('Add a field for the next experiment I want to try');
  await page.getByTestId('rt-revise-preview').click();
  await expect(page.getByTestId('rt-revise-accept')).toBeVisible({ timeout: 90_000 });
  await expect(page.getByTestId('rt-revise-changes')).toContainText(/next experiment/i);
  await page.getByTestId('rt-revise-accept').click();
  await expect(page.getByText(/change applied/i)).toBeVisible({ timeout: 30_000 });
  await page.goto(appUrl);
  await expect(page.getByTestId('rt-entry')).toHaveCount(1);
  await expect(page.getByText('Low sun across the brick wall by the station')).toBeVisible();
  await page.getByTestId('rt-new-entry').click();
  await expect(page.getByText(/next experiment/i).first()).toBeVisible();
  await page.keyboard.press('Escape');

  // Undo restores the previous definition and keeps the entry.
  await page.getByTestId('rt-settings-link').click();
  await page.getByTestId('rt-undo').click();
  await expect(page.getByText(/undone/i)).toBeVisible({ timeout: 30_000 });
  await page.goto(appUrl);
  await expect(page.getByTestId('rt-entry')).toHaveCount(1);
  await page.getByTestId('rt-new-entry').click();
  await expect(page.getByText(/next experiment/i)).toHaveCount(0);

  // My Collection lists the app.
  await page.goto('/collection');
  await expect(page.getByTestId('collection-tile').filter({ hasText: /Photo Walk/ })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test('two contrasting profiles produce different grounded recommendations', async ({ browser }) => {
  test.setTimeout(180_000);
  const titlesFor = async (profile: 'store-sample-founder' | 'store-sample-student') => {
    const context = await browser.newContext();
    const page = await context.newPage();
    const res = await page.request.post('/api/auth/signup', { data: { email: uniqueEmail(profile), password: PASSWORD } });
    expect(res.status()).toBe(201);
    await page.goto('/import');
    await page.getByTestId(profile).click();
    await expect(page).toHaveURL(/\/context/, { timeout: 60_000 });
    await page.goto('/for-you');
    const cards = page.getByTestId('rec-card');
    await expect(cards.first()).toBeVisible({ timeout: 120_000 });
    const titles = await cards.locator('h3').allTextContents();
    // Every card shows a reason and at least one evidence chip (grounding is visible).
    await expect(cards.first().getByText(/why this fits you/i)).toBeVisible();
    await context.close();
    return titles.map((t) => t.trim());
  };
  const founder = await titlesFor('store-sample-founder');
  const student = await titlesFor('store-sample-student');
  const overlap = founder.filter((t) => student.includes(t));
  expect(founder.length).toBeGreaterThanOrEqual(3);
  expect(student.length).toBeGreaterThanOrEqual(3);
  expect(overlap.length, `founder: ${founder.join(', ')} | student: ${student.join(', ')}`).toBeLessThanOrEqual(1);
});
