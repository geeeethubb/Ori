import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: { '@shared': fileURLToPath(new URL('./shared', import.meta.url)) },
  },
  test: {
    include: ['tests/unit/**/*.test.ts', 'client/src/**/*.test.ts', 'shared/**/*.test.ts'],
    environment: 'node',
    testTimeout: 20_000,
    env: { NODE_ENV: 'test', DATABASE_PATH: ':memory:', MODEL_PROVIDER: 'sample' },
  },
});
