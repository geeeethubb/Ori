import { expect, type APIRequestContext, type Page } from '@playwright/test';

let counter = 0;
export function uniqueEmail(prefix = 'e2e'): string {
  counter++;
  return `${prefix}-${Date.now().toString(36)}-${counter}@example.test`;
}
export const PASSWORD = 'correct-horse-battery';

/** Sign up through the API so the browser context receives the session cookie. */
export async function signupViaApi(page: Page, email = uniqueEmail(), displayName = 'E2E Tester'): Promise<{ email: string }> {
  const res = await page.request.post('/api/auth/signup', { data: { email, password: PASSWORD, displayName } });
  expect(res.status(), await res.text()).toBe(201);
  return { email };
}

export async function createFixtureApp(request: APIRequestContext, fixture: 'photo-walk-journal' | 'follow-up-board' | 'practice-tracker', name?: string) {
  const res = await request.post('/api/apps/from-fixture', { data: { fixture, name } });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()) as { app: { id: string; name: string }; spec: unknown; version: number };
}

export async function addRecord(request: APIRequestContext, appId: string, values: Record<string, unknown>) {
  const res = await request.post(`/api/apps/${appId}/records`, { data: { values } });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()) as { record: { id: string; values: Record<string, unknown> } };
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
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
  expect(scrollWidth, `page is ${scrollWidth}px wide in a ${innerWidth}px viewport`).toBeLessThanOrEqual(innerWidth + 1);
}
