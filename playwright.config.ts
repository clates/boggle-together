import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  // *.test.ts files in e2e/ are Vitest unit tests (e.g. the safety guards)
  testMatch: '**/*.spec.ts',
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  // Tests measure timing across browser contexts; run them one at a time.
  workers: 1,
  fullyParallel: false,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: { baseURL: 'http://localhost:5173' },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
  },
})
