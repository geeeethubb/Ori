/**
 * People, the next-action queue: Today first with the overdue item on top and its card open; a tap
 * expands another card (one open at a time) with Mark done inside; a completed item leaves Today for
 * Done and stays there after a reload; Reopen puts it back; finishing Today keeps the queue on Today;
 * Upcoming holds what is due later.
 */
import { test, expect } from '@playwright/test';
import { addRecord, createFixtureApp, expectNoHorizontalOverflow, isoDaysFromToday, listRecords, signupViaApi } from './helpers.ts';

test('People: cards expand one at a time, Mark done moves an item to Done for good, Reopen brings it back', async ({ page }) => {
  await signupViaApi(page);
  const people = await createFixtureApp(page.request, 'people-queue');
  const marcus = await addRecord(page.request, people.app.id, { person: 'Marcus (mentor)', action: 'Intro to a design partner', due: isoDaysFromToday(0) });
  const priya = await addRecord(page.request, people.app.id, { person: 'Priya (investor)', action: 'Send the deck', due: isoDaysFromToday(-1), context: 'Asked about pricing for small teams' });
  await addRecord(page.request, people.app.id, { person: 'Lena (meetup)', action: 'Share the photo walk route', due: isoDaysFromToday(3) });
  const doneOf = async (id: string) => (await listRecords(page.request, people.app.id)).find((r) => r.id === id)?.values.done ?? null;

  await page.goto(`/apps/${people.app.id}/`);
  const today = page.getByTestId('rt-queue-list-today');
  await expect(page.getByTestId('rt-queue-tab-today')).toHaveAttribute('aria-pressed', 'true');
  await expect(today.getByTestId('rt-queue-item')).toHaveCount(2);
  // The overdue item leads, and the first card of the tab is open with its context and actions.
  await expect(today.getByTestId('rt-queue-item').first()).toContainText('Priya');
  const priyaCard = page.getByTestId(`rt-queue-toggle-${priya.record.id}`);
  const marcusCard = page.getByTestId(`rt-queue-toggle-${marcus.record.id}`);
  await expect(priyaCard).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByTestId(`rt-queue-context-${priya.record.id}`)).toContainText('Asked about pricing for small teams');
  await expect(page.getByTestId(`rt-queue-done-${priya.record.id}`)).toBeVisible();
  await expect(marcusCard).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByTestId(`rt-queue-done-${marcus.record.id}`)).toBeHidden();
  await expectNoHorizontalOverflow(page);

  // A tap expands Marcus's card; Priya's closes.
  await marcusCard.click();
  await expect(marcusCard).toHaveAttribute('aria-expanded', 'true');
  await expect(priyaCard).toHaveAttribute('aria-expanded', 'false');
  const markDone = page.getByTestId(`rt-queue-done-${marcus.record.id}`);
  await expect(markDone).toHaveText('Mark done');

  // Mark done: Marcus leaves Today for Done, saved, and still done after a reload.
  await markDone.click();
  await expect(today.getByTestId('rt-queue-item')).toHaveCount(1);
  await expect(page.getByTestId('rt-queue-group-done').getByTestId('rt-queue-item')).toHaveCount(1);
  await expect.poll(() => doneOf(marcus.record.id)).toBe(true);
  await page.reload();
  await expect(today.getByTestId('rt-queue-item')).toHaveCount(1);
  await expect(today).not.toContainText('Marcus');

  // Reopen (in Done) puts it back in Today.
  const doneGroup = page.getByTestId('rt-queue-group-done');
  await doneGroup.locator('summary').click();
  const reopen = doneGroup.getByTestId(`rt-queue-done-${marcus.record.id}`);
  await expect(reopen).toHaveText('Reopen');
  await reopen.click();
  await expect(today.getByTestId('rt-queue-item')).toHaveCount(2);
  await expect.poll(() => doneOf(marcus.record.id)).not.toBe(true);

  // Finishing everything due today keeps the queue on Today ("Nothing due today."), not on another tab.
  for (const id of [priya.record.id, marcus.record.id]) {
    const toggle = page.getByTestId(`rt-queue-toggle-${id}`);
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
    await today.getByTestId(`rt-queue-done-${id}`).click();
    await expect(page.getByTestId(`rt-queue-toggle-${id}`)).toHaveCount(0);
  }
  await expect(page.getByTestId('rt-queue-empty-today')).toBeVisible();
  await expect(page.getByTestId('rt-queue-tab-today')).toHaveAttribute('aria-pressed', 'true');

  // Upcoming holds what is due later.
  await page.getByTestId('rt-queue-tab-upcoming').click();
  await expect(page.getByTestId('rt-queue-tab-upcoming')).toHaveAttribute('aria-pressed', 'true');
  const upcoming = page.getByTestId('rt-queue-list-upcoming');
  await expect(upcoming.getByTestId('rt-queue-item')).toHaveCount(1);
  await expect(upcoming).toContainText('Lena');
});
