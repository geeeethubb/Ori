/**
 * Landing, header, sign-in destination, My apps launcher and pricing: the contracts behind the
 * screens, not their CSS. Pure helpers are tested directly; the landing page and the shell are
 * rendered to a string (no DOM) with the auth hook mocked.
 */
import { createElement, createRef, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BRAND } from '@shared/brand.ts';
import type { AppSummaryDto, UserDto } from '@shared/api.ts';
import { AppSpecSchema } from '@shared/appSpec.ts';
import { FIXTURES } from '../../../server/fixtures/specs.ts';

const auth: { user: UserDto | null; loading: boolean } = { user: null, loading: false };
vi.mock('../auth.tsx', () => ({
  useAuth: () => ({ ...auth, offline: false, refresh: async () => auth.user, login: async () => auth.user, signup: async () => auth.user, logout: async () => undefined }),
}));

const { publicAuthLinks, StoreLayout } = await import('../components/Layout.tsx');
const { authDestination, LoginPage } = await import('./LoginPage.tsx');
const { appLinks, launcherOrder, continueApp, continueLine, AppActions, AppTiles, MAKE_NEW_PATH } = await import('./MyAppsPage.tsx');
const { allowanceSentence } = await import('./PricingPage.tsx');
const { WelcomePage, START_PATH, EXAMPLE_ANCHOR, EXAMPLE_PATH, TRY_EXAMPLE_PATH } = await import('./WelcomePage.tsx');

/** Render inside a router at `url` (no DOM: effects do not run). */
function inRouter(node: ReactElement, url = '/'): string {
  return renderToString(createElement(MemoryRouter, { initialEntries: [url] }, node));
}

const USER: UserDto = {
  id: 'u1', email: 'zuyu@example.test', displayName: 'Zuyu', createdAt: '2026-11-01T10:00:00.000Z', trialStartedAt: '2026-11-01T10:00:00.000Z',
  trialEndsAt: '2026-11-15T10:00:00.000Z', plan: 'trial', premiumActive: true, aiGenerationsThisMonth: 3, aiGenerationAllowance: 300, modelMode: 'sample',
};

function app(id: string, over: Partial<AppSummaryDto> = {}): AppSummaryDto {
  return {
    id, name: id, icon: { symbol: 'camera', color: 'charcoal' }, purpose: 'explore', pattern: 'gallery',
    design: { theme: 'paper', accent: 'orange', typography: 'editorial', density: 'airy', artwork: 'none' }, capabilities: [],
    currentVersion: 1, pinned: false, archivedAt: null, createdAt: '2026-11-10T10:00:00.000Z', updatedAt: '2026-11-10T10:00:00.000Z',
    lastOpenedAt: null, recordCount: 0, launchPath: `/apps/${id}/`, isSample: false, ...over,
  };
}

/** The opening tag and text of the element with this test id (attribute order does not matter). */
function element(html: string, testId: string): string {
  const m = new RegExp(`<(\\w+)[^>]*data-testid="${testId}"[^>]*>[^<]*`).exec(html);
  return m ? m[0] : '';
}

beforeEach(() => {
  auth.user = null;
  auth.loading = false;
});

describe('sign-in keeps the intended destination', () => {
  it('returns to an app URL exactly, query included', () => {
    expect(authDestination('/apps/abc12345/', 'login')).toBe('/apps/abc12345/');
    expect(authDestination('/apps/abc12345/?install=1', 'login')).toBe('/apps/abc12345/?install=1');
    expect(authDestination('/apps/abc12345/?edit=1', 'signup')).toBe('/apps/abc12345/?edit=1');
    expect(authDestination('/apps/abc12345/settings', 'login')).toBe('/apps/abc12345/settings');
  });

  it('falls back by mode, and never to another site or back to a sign-in page', () => {
    expect(authDestination(null, 'login')).toBe('/playground');
    expect(authDestination(null, 'signup')).toBe('/agent');
    expect(authDestination('https://evil.example/', 'login')).toBe('/playground');
    expect(authDestination('//evil.example/apps/x/', 'signup')).toBe('/agent');
    expect(authDestination('/login?next=/apps/x/', 'login')).toBe('/playground');
    expect(authDestination('/signup', 'signup')).toBe('/agent');
    expect(authDestination('/loginhelp', 'login')).toBe('/loginhelp');
  });

  it('the header links keep the destination when moving between sign-in and sign-up', () => {
    const search = `?next=${encodeURIComponent('/apps/abc12345/?install=1')}`;
    expect(publicAuthLinks('/login', search)).toEqual({ signIn: `/login${search}`, signUp: `/signup${search}` });
    expect(publicAuthLinks('/signup', search)).toEqual({ signIn: `/login${search}`, signUp: `/signup${search}` });
    expect(publicAuthLinks('/', '')).toEqual({ signIn: '/login?next=%2Fplayground', signUp: '/signup' });
    expect(publicAuthLinks('/pricing', '?x=1').signIn).toBe(`/login?next=${encodeURIComponent('/pricing?x=1')}`);
  });
});

describe('arriving ready to write', () => {
  it('"Make something new" uses the Agent’s own arrival (?start=new, dropped after use), not router state', () => {
    expect(MAKE_NEW_PATH).toBe('/agent?start=new');
    expect(new URLSearchParams(MAKE_NEW_PATH.split('?')[1]).get('start')).toBe('new');
  });
});

describe('the selected app’s actions', () => {
  const render = (a: AppSummaryDto) => inRouter(createElement(AppActions, { app: a, onPatch: () => undefined, barRef: createRef<HTMLElement>() }), '/apps');

  it('an app in use: Open, Edit with Ori and Add to home screen on its own URL', () => {
    const html = render(app('abc12345', { name: 'Light' }));
    expect(element(html, 'app-action-open')).toContain('href="/apps/abc12345/"');
    expect(element(html, 'app-action-edit')).toContain('href="/apps/abc12345/?edit=1"');
    expect(element(html, 'app-action-install')).toContain('href="/apps/abc12345/?install=1"');
    expect(html).not.toContain('data-testid="app-action-restore"');
  });

  it('an archived app: Restore first, then Open; no editing or adding to the home screen until it is restored', () => {
    const html = render(app('abc12345', { name: 'Light', archivedAt: '2026-11-13T12:00:00.000Z' }));
    const restore = html.indexOf('data-testid="app-action-restore"');
    const open = html.indexOf('data-testid="app-action-open"');
    expect(restore).toBeGreaterThan(-1);
    expect(open).toBeGreaterThan(restore);
    expect(html).not.toContain('data-testid="app-action-edit"');
    expect(html).not.toContain('data-testid="app-action-install"');
    expect(html).not.toContain('?install=1');
    expect(html).toContain('Archived. Its entries and address are kept.');
  });
});

describe('launcher tiles', () => {
  const apps = [app('a1', { name: 'Light' }), app('a2', { name: 'Riff' })];
  const html = inRouter(createElement(AppTiles, { apps, selectedId: 'a2', onSelect: () => undefined, label: 'Your apps' }), '/apps');

  it('are one radio group whose list items stay out of the accessibility tree', () => {
    expect(html).toContain('role="radiogroup"');
    expect(html.match(/<li [^>]*role="none"/g)).toHaveLength(2);
    expect(html.match(/role="radio"/g)).toHaveLength(2);
  });

  it('the selected tile, and only it, shows that activating it again opens the app', () => {
    expect(html.match(/data-testid="app-tile-open-cue"/g)).toHaveLength(1);
    const selected = /<button[^>]*aria-checked="true"[^>]*>/.exec(html)?.[0] ?? '';
    expect(selected).toContain('data-app-id="a2"');
    expect(selected).toContain('tabindex="0"');
    expect(html.slice(html.indexOf('data-app-id="a2"'))).toContain('data-testid="app-tile-open-cue"');
  });
});

describe('My apps launcher', () => {
  it('every action opens the app on its own URL', () => {
    expect(appLinks(app('abc12345'))).toEqual({
      open: '/apps/abc12345/', edit: '/apps/abc12345/?edit=1', install: '/apps/abc12345/?install=1', settings: '/apps/abc12345/settings',
    });
    expect(appLinks({ id: 'zz', launchPath: '' }).install).toBe('/apps/zz/?install=1');
  });

  it('orders tiles pinned first, then newest first, and opening an app does not reshuffle them', () => {
    const apps = [
      app('old', { createdAt: '2026-11-01T00:00:00.000Z', lastOpenedAt: '2026-11-14T09:00:00.000Z' }),
      app('new', { createdAt: '2026-11-12T00:00:00.000Z' }),
      app('pinned', { createdAt: '2026-10-01T00:00:00.000Z', pinned: true }),
      app('gone', { createdAt: '2026-11-13T00:00:00.000Z', archivedAt: '2026-11-13T12:00:00.000Z' }),
    ];
    const { active, archived } = launcherOrder(apps);
    expect(active.map((a) => a.id)).toEqual(['pinned', 'new', 'old']);
    expect(archived.map((a) => a.id)).toEqual(['gone']);
  });

  it('continues in the most recently opened app, never an archived or unopened one', () => {
    expect(continueApp([app('a'), app('b')])).toBeNull();
    const apps = [
      app('riff', { lastOpenedAt: '2026-11-14T09:00:00.000Z' }),
      app('light', { lastOpenedAt: '2026-11-13T09:00:00.000Z' }),
      app('archived', { lastOpenedAt: '2026-11-14T10:00:00.000Z', archivedAt: '2026-11-14T11:00:00.000Z' }),
    ];
    expect(continueApp(apps)?.id).toBe('riff');
  });

  it('says a practice app’s plan (not time played) and otherwise counts entries in the app’s words', () => {
    const riff = AppSpecSchema.parse(FIXTURES['riff-practice']);
    const light = AppSpecSchema.parse(FIXTURES['light-gallery']);
    const people = AppSpecSchema.parse(FIXTURES['people-queue']);
    expect(continueLine({ recordCount: 4 }, riff)).toBe('15-minute plan');
    expect(continueLine({ recordCount: 4 }, light)).toBe('4 photos');
    expect(continueLine({ recordCount: 1 }, people)).toBe('1 follow-up');
    expect(continueLine({ recordCount: 0 }, light)).toBe('No photos yet');
    expect(continueLine({ recordCount: 3 }, null)).toBe('3 entries');
  });
});

describe('pricing', () => {
  it('states the allowance in plain words with the real number, naming everything the server meters', () => {
    expect(allowanceSentence(300)).toBe(
      `300 AI generations a month. Each reply, set of suggestions, app preview or proposed change from ${BRAND.name} counts as one, as does each profile you import.`,
    );
    // A preview counts even when no app is made from it, and importing a profile counts too.
    for (const n of [300, null]) expect(allowanceSentence(n)).toMatch(/app preview.*profile you import/);
    expect(allowanceSentence(null)).toContain('monthly allowance');
    expect(allowanceSentence(0)).not.toMatch(/\b0 AI/);
  });
});

describe('landing', () => {
  const render = () => renderToString(createElement(MemoryRouter, { initialEntries: ['/'] }, createElement(WelcomePage)));

  it('leads with the headline, the explainer and two honest actions', () => {
    const html = render();
    expect(html).toContain(`>${BRAND.headline}</h1>`);
    expect(html).toContain(BRAND.landingExplainer);
    expect(html).toContain(BRAND.signature);
    expect(START_PATH).toBe('/signup');
    const primary = element(html, 'welcome-signup');
    expect(primary).toContain('href="/signup"');
    expect(primary).toMatch(/>Make it yours$/);
    const example = element(html, 'welcome-example');
    // "Try an example" is the real example flow: an account, then the Agent's labelled example.
    expect(TRY_EXAMPLE_PATH).toBe('/signup?next=%2Fagent%3Fstart%3Dexample');
    expect(example).toContain(`href="${TRY_EXAMPLE_PATH}"`);
    expect(example).toMatch(/>Try an example$/);
    expect(element(html, 'welcome-example-try')).toContain(`href="${TRY_EXAMPLE_PATH}"`);
    expect(authDestination(EXAMPLE_PATH, 'signup')).toBe('/agent?start=example');
    expect(html).toContain(`id="${EXAMPLE_ANCHOR}"`);
    expect(html).toContain('No payment is collected in this prototype.');
  });

  it('draws the walkthrough as captioned example screens with no button-like controls in them', () => {
    const html = render();
    const section = html.slice(html.indexOf(`id="${EXAMPLE_ANCHOR}"`));
    expect(section.match(/<figure class="ld-step-art" aria-hidden="true">/g)).toHaveLength(3);
    expect(section.match(/>Example screen</g)).toHaveLength(3);
    const art = section.split('<figure class="ld-step-art"').slice(1).map((s) => s.slice(0, s.indexOf('</figure>')));
    for (const a of art) expect(a).not.toMatch(/<(a|button)\b|class="btn|lx-btn/);
  });

  it('labels every preview as an example and shows each app with its own icon on a home screen', () => {
    const html = render();
    expect(html).toContain('Example apps, not a real account.');
    expect(html).toContain('written for this page, not taken from anyone');
    for (const name of ['Ori', 'Light', 'Riff', 'People']) expect(html).toContain(`<span>${name}</span>`);
    expect(html).toContain('Open each app directly.');
    expect(html).toContain('href="/pricing"');
    // No recreated device frame or status bar.
    expect(html).not.toMatch(/ph-status|ph-notch|9:41/);
  });

  it('sends signed-in people to their Playground', () => {
    auth.user = USER;
    expect(render()).not.toContain(BRAND.headline);
  });
});

describe('sign-up from "Try an example"', () => {
  // The page reads window.location for its localhost-only demo hint.
  const renderAt = (url: string, mode: 'login' | 'signup') => {
    const g = globalThis as { window?: unknown };
    const had = 'window' in g;
    g.window = { location: { hostname: 'localhost' } };
    try {
      return inRouter(createElement(LoginPage, { mode }), url);
    } finally {
      if (!had) delete g.window;
    }
  };

  it('says why there is a form first, and both auth pages keep the example as the destination', () => {
    const signup = renderAt(TRY_EXAMPLE_PATH, 'signup');
    expect(element(signup, 'auth-lede')).toMatch(/try the example with Ori\. It is labelled as an example, and nothing is sent until you press send\.$/);
    expect(element(signup, 'auth-switch')).toContain(`href="/login?next=${encodeURIComponent(EXAMPLE_PATH)}"`);
    expect(element(renderAt(`/login?next=${encodeURIComponent(EXAMPLE_PATH)}`, 'login'), 'auth-lede')).toContain('try the example');
    expect(element(renderAt('/signup', 'signup'), 'auth-lede')).not.toContain('example');
  });

  it('the local demo hint points to the docs instead of showing the old product name', () => {
    const hint = element(renderAt('/login', 'login'), 'auth-demo-hint');
    expect(hint).toContain('docs/DEMO.md');
    expect(hint).not.toMatch(/aiappstore/i);
  });
});

describe('shell', () => {
  const renderAt = (url: string) =>
    renderToString(
      createElement(
        MemoryRouter,
        { initialEntries: [url] },
        createElement(
          Routes,
          null,
          createElement(Route, { element: createElement(StoreLayout) }, createElement(Route, { path: '*', element: createElement('p', null, 'page') })),
        ),
      ),
    );

  it('signed in: three destinations with the current one marked, and a working account menu; no bell or hamburger', () => {
    auth.user = USER;
    const html = renderAt('/apps');
    for (const id of ['nav-apps', 'tab-apps']) {
      expect(element(html, id)).toContain('aria-current="page"');
      expect(element(html, id)).toContain('class="active"');
    }
    expect(element(html, 'nav-agent')).not.toContain('aria-current');
    expect(element(html, 'nav-playground')).not.toContain('aria-current');
    expect(html).toContain('aria-label="Account menu"');
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).not.toMatch(/[Nn]otification|hamburger|aria-label="Menu"/);
    // The companion and wordmark beside the desktop pills (01, 03); the wordmark alone on phones.
    const brand = html.slice(html.indexOf('data-testid="brand-home"'), html.indexOf('</a>', html.indexOf('data-testid="brand-home"')));
    expect(brand).toMatch(/class="ori-lockup brand-wide"/);
    expect(brand).toMatch(/class="ori-wordmark brand-compact"/);
  });

  it('signed out on the sign-in page: the sign-up link keeps where the person was going', () => {
    const html = renderAt(`/login?next=${encodeURIComponent('/apps/abc12345/')}`);
    expect(html).toContain(`href="/signup?next=${encodeURIComponent('/apps/abc12345/')}"`);
    expect(html).not.toContain('data-testid="nav-signin"');
  });
});
