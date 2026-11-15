/**
 * My apps, the launcher (reference 05): the first app is selected on arrival with its actions ready;
 * one tap selects another app and a second tap opens it; Open, Edit with Ori and Add to home screen go
 * to the app's own URL; the keyboard selects with Space and opens with Enter; Archive keeps the app
 * selected with Restore first, and Restore brings it back.
 */
import { test, expect } from '@playwright/test';
import { createFixtureApp, expectNoHorizontalOverflow, signupViaApi } from './helpers.ts';

test('My apps: a tap selects, a second tap opens; actions use the app’s own URL; archive and restore keep it selected', async ({ page }) => {
  test.setTimeout(120_000);
  await signupViaApi(page);
  const riff = await createFixtureApp(page.request, 'riff-practice');
  const light = await createFixtureApp(page.request, 'light-gallery');
  const people = await createFixtureApp(page.request, 'people-queue');
  const tile = (id: string) => page.locator(`[data-testid="app-tile"][data-app-id="${id}"]`);
  const actions = page.getByTestId('app-actions');

  // Newest first, and the first tile is selected on arrival with its actions: no "select an app" hint.
  await page.goto('/apps');
  await expect(page.getByTestId('apps-grid').getByTestId('app-tile')).toHaveCount(3);
  await expect(tile(people.app.id)).toHaveAttribute('aria-checked', 'true');
  await expect(actions).toHaveAttribute('data-app-id', people.app.id);
  await expect(page.getByTestId('apps-hint')).toHaveCount(0);
  await expect(page.getByTestId('apps-make-new')).toHaveAttribute('href', '/agent?start=new');
  await expectNoHorizontalOverflow(page);

  // One tap selects Light; its actions go to Light's own URL.
  await tile(light.app.id).click();
  await expect(tile(light.app.id)).toHaveAttribute('aria-checked', 'true');
  await expect(tile(people.app.id)).toHaveAttribute('aria-checked', 'false');
  await expect(tile(light.app.id).getByTestId('app-tile-open-cue')).toBeVisible();
  await expect(page).toHaveURL(/\/apps$/);
  await expect(actions).toHaveAttribute('data-app-id', light.app.id);
  await expect(actions.getByTestId('app-action-open')).toHaveAttribute('href', `/apps/${light.app.id}/`);
  await expect(actions.getByTestId('app-action-edit')).toHaveAttribute('href', `/apps/${light.app.id}/?edit=1`);
  await expect(actions.getByTestId('app-action-install')).toHaveAttribute('href', `/apps/${light.app.id}/?install=1`);

  // Archive (More menu): Light moves to the opened Archived group, still selected, with Restore first.
  await actions.getByTestId('app-tile-menu').click();
  await page.getByTestId('app-menu-archive').click();
  const archived = page.getByTestId('apps-archived');
  await expect(archived).toHaveAttribute('open', '');
  await expect(archived.locator(`[data-testid="app-tile"][data-app-id="${light.app.id}"]`)).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('apps-grid').getByTestId('app-tile')).toHaveCount(2);
  const archivedActions = archived.getByTestId('app-actions');
  await expect(archivedActions).toHaveAttribute('data-archived', 'true');
  await expect(archivedActions.locator('[data-testid^="app-action-"]')).toHaveText([/Restore/, /Open/]);
  await archivedActions.getByTestId('app-tile-menu').click();
  await expect(page.getByTestId('app-menu-restore')).toBeVisible();
  await expect(page.getByTestId('app-menu-pin')).toHaveCount(0);
  await page.keyboard.press('Escape');
  // Nothing in Your apps is selected now, so the hint says what selecting does.
  await expect(page.getByTestId('apps-hint')).toBeVisible();
  expect(((await (await page.request.get(`/api/apps/${light.app.id}`)).json()) as { app: { archivedAt: string | null } }).app.archivedAt).not.toBeNull();

  // Restore: back in Your apps, still selected; a second tap on the selected tile opens it.
  await archivedActions.getByTestId('app-action-restore').click();
  await expect(page.getByTestId('apps-grid').getByTestId('app-tile')).toHaveCount(3);
  await expect(tile(light.app.id)).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('apps-hint')).toHaveCount(0);
  await tile(light.app.id).click();
  await expect(page).toHaveURL(new RegExp(`/apps/${light.app.id}/?$`));
  await expect(page.getByTestId('rt-gallery').or(page.getByTestId('rt-gallery-empty')).first()).toBeVisible();

  // Keyboard: Space only selects, Enter on the selected tile opens it.
  await page.goto('/apps');
  await expect(tile(people.app.id)).toHaveAttribute('aria-checked', 'true');
  await tile(riff.app.id).focus();
  await page.keyboard.press('Space');
  await expect(tile(riff.app.id)).toHaveAttribute('aria-checked', 'true');
  await expect(page).toHaveURL(/\/apps$/);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`/apps/${riff.app.id}/?$`));
  await expect(page.getByTestId('rt-practice')).toBeVisible();

  // Edit with Ori from My apps opens in the app itself, at its own URL.
  await page.goto('/apps');
  await tile(riff.app.id).click();
  await actions.getByTestId('app-action-edit').click();
  await expect(page).toHaveURL(new RegExp(`/apps/${riff.app.id}/$`));
  await expect(page.getByTestId('rt-edit-sheet')).toBeVisible();
});
