/**
 * The Ori Light journey, end to end in Sample mode (BUILD_STATUS "O2"):
 * share a photo thought with a photo → an honest reply with a Light card (Preview Light / Keep
 * inspiration / Why this?) → the preview with labelled example photos → Make mine → Ready on the same
 * URL (Open Light / Add to home screen / Copy app link), the shared photo carried over → Light at its own
 * URL, without the parent navigation, with the install guide for this platform → add a photo, reload →
 * Edit with Ori: "Add camera settings to my photo notes" → review → Keep current version, then Apply
 * change → the new fields in the photo form, used → undo keeps every entry and the value typed since.
 */
import { test, expect, type Page } from '@playwright/test';
import { EXAMPLE_PHOTO, EXAMPLE_PHOTO_2, appDetail, appIdFrom, chooseFromAppMenu, expectNoHorizontalOverflow, listRecords, showMakePreview, signupViaApi, uniqueEmail } from './helpers.ts';

/** Sample mode only: the names, fields and wording asserted here are the built-in catalog's. */
const LIVE = process.env.E2E_LIVE === '1';

const THOUGHT = 'I keep stopping for long shadows on brick walls in the late afternoon. I want to get better at noticing light on my walks.';

async function appVersion(page: Page, appId: string): Promise<number> {
  const res = await page.request.get(`/api/apps/${appId}`);
  if (res.status() !== 200) return -1;
  return ((await res.json()) as { version: number }).version;
}

test('Light: share a photo → Preview Light → Make mine → Ready → a photo that persists → Edit with Ori → undo keeps every entry', async ({ page }) => {
  test.skip(LIVE, 'asserts the built-in catalog’s Light app and its camera-settings change');
  test.setTimeout(240_000);
  await signupViaApi(page, uniqueEmail('light'));

  // Share a photo thought and a photo of one's own.
  await page.goto('/agent');
  await page.getByTestId('agent-file-input').setInputFiles(EXAMPLE_PHOTO);
  await expect(page.getByTestId('agent-file')).toBeVisible();
  await page.getByTestId('agent-text').fill(THOUGHT);
  await page.getByTestId('agent-send').click();
  const item = page.getByTestId('agent-item').last();
  await expect(item).toBeVisible({ timeout: 60_000 });
  // Honest about what was read: the note, not the photo (Sample mode cannot read images).
  await expect(item.getByTestId('agent-read-status')).toHaveAttribute('data-status', 'not_read');
  await expect(item.getByTestId('agent-read-status')).toHaveText('Note read, photo not read');
  await expect(item.getByAltText('Your photo')).toBeVisible();
  const reply = item.getByTestId('agent-reply');
  await expect(reply).toBeVisible({ timeout: 60_000 });
  const card = reply.locator('[data-testid="proposal-card"][data-kind="new_app"]').first();
  await expect(card).toBeVisible();
  await expect(card.getByTestId('proposal-action')).toHaveText('Preview Light');
  await expect(card.getByTestId('proposal-keep')).toHaveText('Keep inspiration');
  await expect(card.getByTestId('proposal-why')).toBeVisible();
  await expectNoHorizontalOverflow(page);

  // The preview: Light's gallery with labelled example photos, designed without a click.
  await card.getByTestId('proposal-action').click();
  await expect(page).toHaveURL(/\/make\/[A-Za-z0-9_-]{8,40}$/);
  const makeUrl = page.url();
  await expect(page.getByTestId('make-title')).toHaveText('Make Light yours');
  await expect(page.getByTestId('make-example').getByTestId('make-strip')).toHaveAttribute('data-strip', 'photos');
  await expect(page.getByTestId('make-sample')).toBeVisible();
  const preview = await showMakePreview(page);
  await expect(preview.getByTestId('rt-gallery-tile').first()).toBeVisible();
  // The page keeps one level-1 heading: the app's name inside the preview is a section of it.
  await expect(page.locator('h1')).toHaveCount(1);
  await expectNoHorizontalOverflow(page);

  // Full screen: the preview over the whole page with the one Make mine at its foot (not a second copy).
  await page.getByTestId('make-fullscreen').click();
  await expect(page.getByTestId('make-example')).toHaveAttribute('aria-modal', 'true');
  await expect(page.getByTestId('make-mine')).toHaveCount(1);
  await expect(page.getByTestId('make-fullscreen-foot').getByTestId('make-mine')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('make-example')).not.toHaveAttribute('aria-modal', 'true');
  await expect(page.getByTestId('make-mine')).toHaveCount(1);
  await page.getByTestId('make-fullscreen').click();

  // Make mine, from the full-screen preview → Ready on the same URL once the server returned the app;
  // the shared photo came along.
  await page.getByTestId('make-fullscreen-foot').getByTestId('make-mine').click();
  await expect(page.getByTestId('make-ready')).toBeVisible({ timeout: 60_000 });
  await expect(page).toHaveURL(makeUrl);
  await expect(page.getByTestId('make-ready-title')).toHaveText('Light is yours');
  await expect(page.getByTestId('make-ready-carried')).toContainText('Your photo is the first entry');
  await expect(page.getByTestId('make-ready-card')).toBeVisible();
  const openLight = page.getByTestId('make-ready-open');
  await expect(openLight).toHaveText('Open Light');
  const appId = appIdFrom(await openLight.getAttribute('href'));
  expect(appId, 'Open Light goes to the app at its own URL').not.toBe('');
  await expect(openLight).toHaveAttribute('href', `/apps/${appId}/`);
  const install = page.getByTestId('make-ready-install');
  await expect(install).toHaveText('Add to home screen');
  await expect(install).toHaveAttribute('href', `/apps/${appId}/?install=1`);
  // Copy app link copies the app's own absolute address.
  const origin = new URL(page.url()).origin;
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
  await page.getByTestId('make-ready-copy').click();
  await expect(page.getByTestId('make-ready-copy')).toContainText('Link copied');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`${origin}/apps/${appId}/`);
  await expectNoHorizontalOverflow(page);
  const carried = await listRecords(page.request, appId);
  expect(carried).toHaveLength(1);
  expect(Object.values(carried[0]!.values)).toContain(((await (await page.request.get('/api/agent/thread')).json()) as { items: { capture: { mediaId: string | null } }[] }).items[0]?.capture.mediaId);

  // Add to home screen: Light at its own URL (no parent navigation), the guide for this platform, once.
  await install.click();
  await expect(page).toHaveURL(new RegExp(`/apps/${appId}/$`));
  const sheet = page.getByTestId('rt-install-sheet');
  await expect(sheet).toBeVisible();
  const android = /Android/.test(await page.evaluate(() => navigator.userAgent));
  await expect(sheet.getByTestId('rt-install-steps')).toContainText(android ? 'Add to Home screen or Install app' : 'Open Ori on your phone');
  await expect(sheet.getByTestId('rt-install-local')).toBeVisible(); // localhost cannot be opened on a phone, and it says so
  await expectNoHorizontalOverflow(page);
  await sheet.getByTestId('rt-install-done').click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByTestId('tab-agent')).toHaveCount(0);
  await expect(page.getByTestId('nav-agent')).toHaveCount(0);
  await expect(page.getByTestId('rt-gallery-tile')).toHaveCount(1);
  // The weekly prompt is the gallery's own chip, not a second card above it.
  await expect(page.getByTestId('rt-gallery-prompt')).toBeVisible();
  await expect(page.getByTestId('rt-prompt-card')).toHaveCount(0);

  // Add a photo of one's own in the app, then reload: both photos are there.
  await page.getByTestId('rt-photo-input').first().setInputFiles(EXAMPLE_PHOTO_2);
  const form = page.getByTestId('rt-record-form');
  await expect(form).toBeVisible({ timeout: 30_000 });
  await form.getByLabel('What caught your eye?').fill('Tree shadows across the pavement');
  await page.getByTestId('rt-save-record').click();
  await expect(form).toHaveCount(0);
  await expect(page.getByTestId('rt-gallery-tile')).toHaveCount(2);
  await page.reload();
  await expect(page.getByTestId('rt-gallery-tile')).toHaveCount(2, { timeout: 30_000 });
  const before = await listRecords(page.request, appId);
  expect(before).toHaveLength(2);
  const added = before.find((r) => r.values.caption === 'Tree shadows across the pavement');
  expect(added, 'the photo added in Light is saved with its caption').toBeDefined();
  const base = await appDetail(page.request, appId);
  expect(base.version).toBe(1);
  // Optional choices start empty: the photo is saved without a "Light" value nobody picked.
  const choice = base.spec.fields.find((f) => f.type === 'select');
  expect(choice, 'Light has an optional choice').toBeDefined();
  expect(added!.values[choice!.id] ?? null).toBeNull();

  // Edit with Ori, in the app: the review previews the change on the latest photo and nothing is saved.
  const ask = 'Add camera settings to my photo notes';
  await page.getByTestId('rt-edit-with-ori').click();
  const edit = page.getByTestId('rt-edit-sheet');
  await expect(edit).toBeVisible();
  await edit.getByTestId('rt-revise-input').fill(ask);
  await edit.getByTestId('rt-revise-preview').click();
  const changes = edit.getByTestId('rt-revise-changes');
  await expect(changes).toContainText('Camera', { timeout: 60_000 });
  await expect(changes).toContainText('Shutter');
  await expect(changes).toContainText('Aperture');
  await expect(edit.getByTestId('rt-revise-keeps')).toBeVisible();
  await expect(edit.getByTestId('rt-change-preview')).toBeVisible();
  await expectNoHorizontalOverflow(page);

  // Keep current version changes nothing.
  await expect(edit.getByTestId('rt-revise-decline')).toHaveText('Keep current version');
  await edit.getByTestId('rt-revise-decline').click();
  await expect(edit).toHaveCount(0);
  expect(await appVersion(page, appId)).toBe(1);

  // Asked again and applied: the toast offers Undo.
  await page.getByTestId('rt-edit-with-ori').click();
  await expect(edit).toBeVisible();
  await edit.getByTestId('rt-revise-input').fill(ask);
  await edit.getByTestId('rt-revise-preview').click();
  await expect(edit.getByTestId('rt-revise-accept')).toHaveText('Apply change', { timeout: 60_000 });
  await edit.getByTestId('rt-revise-accept').click();
  await expect(edit).toHaveCount(0);
  await expect.poll(() => appVersion(page, appId), { timeout: 30_000 }).toBe(2);
  const applied = page.getByTestId('toast').filter({ has: page.getByTestId('toast-action') });
  await expect(applied).toContainText('Updated');
  await expect(applied.getByTestId('toast-action')).toHaveText('Undo');
  const revised = await appDetail(page.request, appId);
  const camera = revised.spec.fields.find((f) => /camera/i.test(f.label));
  expect(camera, 'the change added a camera field').toBeDefined();
  expect(revised.spec.views.find((v) => v.type === 'gallery')?.formFieldIds ?? []).toContain(camera!.id);
  expect(await listRecords(page.request, appId)).toEqual(before);

  // The new fields are in the photo form: note the camera on the newest photo.
  await page.goto(`/apps/${appId}/`);
  await page.getByTestId('rt-gallery-tile').first().click();
  await expect(page.getByTestId('rt-lightbox')).toBeVisible();
  await page.getByTestId('rt-lightbox-edit').click();
  await expect(form).toBeVisible();
  await expect(form.getByLabel(/shutter/i).first()).toBeVisible();
  await expect(form.getByLabel(/aperture/i).first()).toBeVisible();
  await form.getByLabel(/camera/i).first().fill('Fuji X100V');
  await page.getByTestId('rt-save-record').click();
  await expect(form).toHaveCount(0);
  await expect.poll(async () => (await listRecords(page.request, appId)).filter((r) => r.values[camera!.id] === 'Fuji X100V').length).toBe(1);

  // Undo from History and undo: the earlier design comes back, every entry stays, and so does the camera noted since.
  await chooseFromAppMenu(page, 'rt-menu-history');
  await expect(page).toHaveURL(new RegExp(`/apps/${appId}/settings#history$`));
  await page.getByTestId('rt-undo').click();
  const plan = page.getByTestId('rt-undo-plan');
  await expect(plan).toContainText('Your entries stay');
  await expect(plan).toContainText(`“${camera!.label}” stays saved in 1 photo`);
  await page.getByTestId('rt-undo-confirm').click();
  await expect.poll(() => appVersion(page, appId), { timeout: 30_000 }).toBe(3);
  const restored = await appDetail(page.request, appId);
  expect(restored.spec.fields.filter((f) => !(f as { hidden?: boolean }).hidden).map((f) => f.id)).toEqual(base.spec.fields.map((f) => f.id));
  const after = await listRecords(page.request, appId);
  expect(after).toHaveLength(2);
  expect(after.filter((r) => r.values[camera!.id] === 'Fuji X100V')).toHaveLength(1);
  await page.goto(`/apps/${appId}/`);
  await expect(page.getByTestId('rt-gallery-tile')).toHaveCount(2);
});
