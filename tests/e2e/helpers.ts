import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, type APIRequestContext, type Locator, type Page } from '@playwright/test';

let counter = 0;
export function uniqueEmail(prefix = 'e2e'): string {
  counter++;
  return `${prefix}-${Date.now().toString(36)}-${counter}@example.test`;
}
export const PASSWORD = 'correct-horse-battery';

/** Every fixture POST /api/apps/from-fixture accepts (session-1 apps plus the redesign's reference apps). */
export type FixtureKey = 'photo-walk-journal' | 'follow-up-board' | 'practice-tracker' | 'riff-practice' | 'light-gallery' | 'people-queue';

/** Sign up through the API so the browser context receives the session cookie. */
export async function signupViaApi(page: Page, email = uniqueEmail(), displayName = 'E2E Tester'): Promise<{ email: string }> {
  const res = await page.request.post('/api/auth/signup', { data: { email, password: PASSWORD, displayName } });
  expect(res.status(), await res.text()).toBe(201);
  return { email };
}

export async function createFixtureApp(request: APIRequestContext, fixture: FixtureKey, name?: string) {
  const res = await request.post('/api/apps/from-fixture', { data: { fixture, name } });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()) as { app: { id: string; name: string; design: { theme: string }; capabilities: string[] }; spec: unknown; version: number };
}

export async function addRecord(request: APIRequestContext, appId: string, values: Record<string, unknown>) {
  const res = await request.post(`/api/apps/${appId}/records`, { data: { values } });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()) as { record: { id: string; values: Record<string, unknown> } };
}

export async function listRecords(request: APIRequestContext, appId: string) {
  const res = await request.get(`/api/apps/${appId}/records`);
  expect(res.status(), await res.text()).toBe(200);
  return ((await res.json()) as { records: { id: string; values: Record<string, unknown> }[] }).records;
}

export interface AppDetail {
  version: number;
  spec: { fields: { id: string; label: string; type: string }[]; views: { id: string; type: string; filter?: { fieldId: string; value: string }; minutesFieldId?: string; presets?: number[]; formFieldIds?: string[]; targetMinutesFieldId?: string; timedSecondsFieldId?: string }[] };
}

export async function appDetail(request: APIRequestContext, appId: string): Promise<AppDetail> {
  const res = await request.get(`/api/apps/${appId}`);
  expect(res.status(), await res.text()).toBe(200);
  return (await res.json()) as AppDetail;
}

/** One of the CC0 example photographs the server ships, uploaded through the real multipart route. */
export const EXAMPLE_PHOTO = fileURLToPath(new URL('../../server/fixtures/media/light-1.jpg', import.meta.url));
/** A second, different example photograph (for a photo added inside an app). */
export const EXAMPLE_PHOTO_2 = fileURLToPath(new URL('../../server/fixtures/media/light-2.jpg', import.meta.url));

export async function uploadPhoto(request: APIRequestContext, file = EXAMPLE_PHOTO) {
  const res = await request.post('/api/media', { multipart: { file: { name: path.basename(file), mimeType: 'image/jpeg', buffer: fs.readFileSync(file) } } });
  expect(res.status(), await res.text()).toBe(201);
  return ((await res.json()) as { media: { id: string; mime: string; width: number | null; height: number | null } }).media;
}

export interface ShareResult {
  capture: { id: string; kind: string; readStatus: string };
  reply: { proposals: { id: string; kind: string; title: string; targetAppId?: string }[] } | null;
}

/** Share a note (and optionally a link or photo) with the agent through the API. */
export async function shareNote(request: APIRequestContext, text: string, extra: Record<string, unknown> = {}): Promise<ShareResult> {
  const res = await request.post('/api/agent/captures', { data: { text, ...extra } });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()) as ShareResult;
}

/** Bring a labelled sample profile into context and generate Playground cards (Sample mode). */
export async function seedPlayground(request: APIRequestContext, profile: 'founder-photographer' | 'student-musician' = 'founder-photographer') {
  const ctx = await request.post('/api/context/sample', { data: { profile } });
  expect(ctx.status(), await ctx.text()).toBe(201);
  const gen = await request.post('/api/recommendations/generate', { data: {} });
  expect(gen.status(), await gen.text()).toBe(200);
  return ((await gen.json()) as { recommendations: { id: string; title: string; kind: string; status: string; captureId?: string | null }[] }).recommendations;
}

export function isoDaysFromToday(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Fails when the page scrolls horizontally (clipped phone layout). */
export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  // body has overflow-x hidden, so scrollWidth alone can hide clipped content: also measure the
  // widest element's right edge (ignoring intentionally scrollable containers' children).
  const r = await page.evaluate(() => {
    const innerWidth = window.innerWidth;
    let worst = { right: 0, tag: '' };
    const scrollers = new Set<Element>();
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('*'))) {
      const cs = getComputedStyle(el);
      if (/(auto|scroll)/.test(cs.overflowX)) scrollers.add(el);
    }
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('body *'))) {
      if (el.closest('.toast-host')) continue;
      let p: Element | null = el.parentElement;
      let inScroller = false;
      while (p) { if (scrollers.has(p)) { inScroller = true; break; } p = p.parentElement; }
      if (inScroller) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0) continue;
      if (rect.right > worst.right) worst = { right: rect.right, tag: `${el.tagName.toLowerCase()}.${(el.className && typeof el.className === 'string' ? el.className : '').split(' ')[0]}` };
    }
    return { scrollWidth: document.documentElement.scrollWidth, innerWidth, worst };
  });
  expect(r.scrollWidth, `page is ${r.scrollWidth}px wide in a ${r.innerWidth}px viewport`).toBeLessThanOrEqual(r.innerWidth + 1);
  expect(r.worst.right, `${r.worst.tag} extends to ${Math.round(r.worst.right)}px in a ${r.innerWidth}px viewport`).toBeLessThanOrEqual(r.innerWidth + 1);
}

/** An app's own address: /apps/<id>/, optionally absolute, with or without a query. */
const APP_HREF = /^(?:https?:\/\/[^/]+)?\/apps\/([A-Za-z0-9_-]{8,40})\/?(?:[?#].*)?$/;

/** The app id in an app's own address; '' when it is not one. */
export function appIdFrom(href: string | null | undefined): string {
  return APP_HREF.exec(href ?? '')?.[1] ?? '';
}

/** Below this width the Make page leads with a compact example strip and keeps the whole preview one tap away. */
export const MAKE_WIDE_MIN = 1000;

/**
 * The Make page designs its preview by itself (no Preview click). Waits for it, then makes the real
 * preview visible on every width: wide screens show it at once; narrow screens show the compact strip
 * first (the preview is mounted but hidden) and open the whole preview with "Show the whole preview".
 * Returns the preview (the real renderer, labelled as example content).
 */
export async function showMakePreview(page: Page): Promise<Locator> {
  const example = page.getByTestId('make-example');
  const preview = example.getByTestId('make-preview');
  const banner = example.getByTestId('make-preview-example-banner');
  await expect(page.getByTestId('make-mine')).toBeEnabled({ timeout: 90_000 });
  await expect(preview).toBeAttached();
  if ((page.viewportSize()?.width ?? 1280) < MAKE_WIDE_MIN) {
    await expect(example.getByTestId('make-strip')).toBeVisible();
    await expect(preview).toBeHidden();
    await page.getByTestId('make-preview-more').click();
    await expect(page.getByTestId('make-preview-more')).toHaveAttribute('aria-expanded', 'true');
  }
  await expect(preview).toBeVisible();
  await expect(banner).toBeVisible();
  await expect(banner).toContainText('Example content');
  return preview;
}

/** An app's own "..." menu (rt-app-menu): its Settings, History and undo, Add to home screen, Export data, My apps. */
export async function chooseFromAppMenu(page: Page, item: 'rt-settings-link' | 'rt-menu-history' | 'rt-menu-install' | 'rt-menu-export' | 'rt-back-collection'): Promise<void> {
  await page.getByTestId('rt-app-menu').click();
  await expect(page.getByTestId('rt-app-menu')).toHaveAttribute('aria-expanded', 'true');
  await page.getByTestId(item).click();
}

/** Visible buttons and button-styled links shorter than 44px (empty when every tap target is large enough). */
export async function smallTapTargets(page: Page, scope = 'body'): Promise<{ h: number; text: string }[]> {
  return page.locator(`${scope} button:visible, ${scope} a.btn:visible`).evaluateAll((els) =>
    els
      .map((el) => ({ h: el.getBoundingClientRect().height, text: (el.textContent ?? '').trim().slice(0, 30) || el.getAttribute('aria-label') || el.tagName }))
      .filter((b) => b.h > 0 && b.h < 44),
  );
}
