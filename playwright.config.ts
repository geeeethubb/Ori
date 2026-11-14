import { defineConfig, devices } from '@playwright/test';

/**
 * Browser tests run against the PRODUCTION server (built client served by Node with
 * head injection), on a dedicated port and a throwaway database, in sample model mode so they
 * never spend API credits or depend on the network.
 */
const PORT = Number(process.env.E2E_PORT ?? 8799);
const BASE = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'phone', use: { ...devices['Pixel 7'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: `npm run build && node --import tsx server/index.ts`,
    url: `${BASE}/api/health`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      ...process.env,
      PORT: String(PORT),
      AAS_SERVE: '1',
      NODE_ENV: 'test',
      MODEL_PROVIDER: 'sample',
      DATABASE_PATH: `./data/test-e2e-${PORT}.db`,
      PUBLIC_ORIGIN: BASE,
      COOKIE_SECURE: 'false',
    },
  },
});
