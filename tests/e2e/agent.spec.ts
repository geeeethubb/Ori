/**
 * The Agent's "Keep inspiration" (the lead card's plain save): it keeps the share as a save, takes what
 * Ori noted from it back out of memory, says so, and stays kept after a reload.
 */
import { test, expect, type Page } from '@playwright/test';
import { signupViaApi, uniqueEmail } from './helpers.ts';

/** Facts in memory (removed ones excluded). */
async function factsInMemory(page: Page): Promise<number> {
  const ctx = (await (await page.request.get('/api/context')).json()) as { facts: { status: string }[] };
  return ctx.facts.filter((f) => f.status !== 'removed').length;
}

test('Agent: Keep inspiration keeps the share, takes back what was noted from it, and stays kept', async ({ page }) => {
  await signupViaApi(page, uniqueEmail('keep'));
  await page.goto('/agent');
  await page.getByTestId('agent-text').fill('I like this sound and have 15 minutes to practice');
  await page.getByTestId('agent-send').click();
  const reply = page.getByTestId('agent-item').last().getByTestId('agent-reply');
  await expect(reply).toBeVisible({ timeout: 60_000 });
  // The share taught Ori something (the time budget), shown in memory until it is kept as a save.
  await expect.poll(() => factsInMemory(page)).toBeGreaterThan(0);

  const keep = reply.getByTestId('proposal-keep');
  await expect(keep).toHaveText('Keep inspiration');
  await keep.click();
  await expect(reply.getByTestId('proposal-keep')).toHaveAttribute('data-state', 'kept');
  await expect(page.getByTestId('toast').filter({ hasText: 'Kept as inspiration' })).toBeVisible();
  expect(await factsInMemory(page)).toBe(0);

  await page.reload();
  await expect(page.getByTestId('agent-item').last().getByTestId('proposal-keep')).toHaveAttribute('data-state', 'kept');
  expect(await factsInMemory(page)).toBe(0);
});
