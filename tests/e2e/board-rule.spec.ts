/** The follow-up board's due-soon/overdue rule on real records, including completion. */
import { test, expect } from '@playwright/test';
import { addRecord, createFixtureApp, expectNoHorizontalOverflow, isoDaysFromToday, signupViaApi } from './helpers.ts';

test('board highlights overdue and due-soon follow-ups and clears them when done', async ({ page }) => {
  await signupViaApi(page);
  const board = await createFixtureApp(page.request, 'follow-up-board');
  const overdue = await addRecord(page.request, board.app.id, { person: 'Priya (investor)', stage: 'promised', commitment: 'Send the deck', due: isoDaysFromToday(-2) });
  await addRecord(page.request, board.app.id, { person: 'Marcus (mentor)', stage: 'waiting', commitment: 'Intro to a design partner', due: isoDaysFromToday(0) });
  await addRecord(page.request, board.app.id, { person: 'Lena (meetup)', stage: 'met', commitment: 'Share the photo walk route', due: isoDaysFromToday(2) });
  await addRecord(page.request, board.app.id, { person: 'Sam (lawyer)', stage: 'done', commitment: 'SAFE questions', due: isoDaysFromToday(-5) });
  await addRecord(page.request, board.app.id, { person: 'Far future', stage: 'met', commitment: 'Catch up', due: isoDaysFromToday(30) });

  await page.goto(`/apps/${board.app.id}/`);
  await expect(page.getByTestId('rt-card')).toHaveCount(5);
  await expectNoHorizontalOverflow(page);

  // Summary line and badges reflect the rule; the done card is never overdue.
  await expect(page.getByText(/1 overdue/)).toBeVisible();
  await expect(page.getByText(/1 due today/)).toBeVisible();
  await expect(page.getByText(/1 due soon/)).toBeVisible();
  const priya = page.getByTestId('rt-card').filter({ hasText: 'Priya' });
  await expect(priya.getByText(/overdue/i)).toBeVisible();
  const sam = page.getByTestId('rt-card').filter({ hasText: 'Sam' });
  await expect(sam.getByText(/overdue/i)).toHaveCount(0);

  // Attention filter shows only the three that need attention.
  await page.getByTestId('rt-attention-filter').click();
  await expect(page.getByTestId('rt-card')).toHaveCount(3);
  await expect(page.getByTestId('rt-card').filter({ hasText: 'Far future' })).toHaveCount(0);

  // Completing the overdue card removes it from the overdue count.
  await page.getByTestId(`rt-move-${overdue.record.id}`).selectOption('done');
  await expect(page.getByText(/0 overdue|no overdue/i).or(page.getByText(/1 due today/))).toBeVisible();
  await expect(page.getByText(/1 overdue/)).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId('rt-board-column-done').getByText('Priya')).toBeVisible();
  await expect(page.getByText(/1 overdue/)).toHaveCount(0);
});
