/**
 * The landing's two ways in. "Make it yours" creates an account (and lands on the Agent; journey.spec
 * signs up that way). "Try an example" creates an account and then, as the sign-up page promises,
 * offers the Agent's labelled example in the composer: nothing is sent until the person presses send.
 */
import { test, expect } from '@playwright/test';
import { PASSWORD, expectNoHorizontalOverflow, uniqueEmail } from './helpers.ts';

/** The Agent's one labelled example (client/src/pages/AgentPage.tsx). */
const EXAMPLE_NOTE = 'I keep stopping for long shadows on brick walls in the late afternoon. I want to get better at noticing light on my walks.';

test('landing: Try an example signs up, then arrives with the labelled example in the composer, unsent', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('landing-scene')).toBeVisible();
  await expect(page.getByTestId('welcome-signup')).toHaveAttribute('href', '/signup');
  const tryExample = page.getByTestId('welcome-example');
  await expect(tryExample).toHaveAttribute('href', '/signup?next=%2Fagent%3Fstart%3Dexample');
  await expect(page.getByTestId('welcome-example-try')).toHaveAttribute('href', '/signup?next=%2Fagent%3Fstart%3Dexample');
  await expectNoHorizontalOverflow(page);

  await tryExample.click();
  await expect(page).toHaveURL(/\/signup\?next=/);
  await expect(page.getByTestId('auth-lede')).toContainText('try the example');
  await page.getByTestId('auth-email').fill(uniqueEmail('example'));
  await page.getByTestId('auth-password').fill(PASSWORD);
  await page.getByTestId('auth-submit').click();

  await expect(page).toHaveURL(/\/agent$/);
  await expect(page.getByTestId('agent-text')).toHaveValue(EXAMPLE_NOTE);
  await expect(page.getByTestId('agent-text')).toBeFocused();
  await expect(page.getByTestId('agent-item')).toHaveCount(0);
});
