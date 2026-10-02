import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for the Examance frontend regression suite.
 *
 * The suite runs against the Vite dev server in all-local storage mode with no
 * backend. `npm run dev` is deliberately NOT used as the web server command:
 * its `predev` hook downloads the LaTeX/WASM assets, which are already present
 * in a working checkout and would make every test run depend on the network.
 *
 * Run one device project:   npx playwright test --project=desktop
 * Run one feature area:     npx playwright test -g "\[exercises\]"
 */
const PORT = 4173;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: 'e2e',
  testMatch: /.*\.spec\.ts$/,

  // Generous timeouts: the vault passphrase is stretched with Argon2id running
  // in WASM, and the very first page load after a cold Vite start has to
  // pre-bundle dependencies.
  timeout: 120_000,
  expect: { timeout: 20_000 },

  // One worker, tests in file order. Each test already gets a fresh browser
  // context (empty IndexedDB / localStorage), so parallelism would be safe from
  // a data point of view; it is off because the dev server and the Argon2 work
  // are CPU-bound and parallel runs made timing-sensitive steps flaky.
  fullyParallel: false,
  workers: 1,
  // Flakiness is a bug to fix in the test or helper, never to hide with retries.
  retries: 0,
  forbidOnly: !!process.env.CI,

  reporter: [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: BASE_URL,
    // The app detects its language from the saved choice and then from
    // `navigator.language`; the e2e fixtures pin it explicitly (see
    // e2e/helpers/guards.ts), this only keeps the browser default consistent.
    locale: 'en-US',
    acceptDownloads: true,
    actionTimeout: 20_000,
    navigationTimeout: 60_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      // Primary target: a 1920x1080 display with browser chrome (about 950px
      // of viewport height), unscaled.
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 950 },
      },
    },
    {
      name: 'ipad-portrait',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1024, height: 1366 },
        hasTouch: true,
        deviceScaleFactor: 2,
      },
    },
    {
      name: 'phone',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
        deviceScaleFactor: 3,
      },
    },
  ],

  webServer: {
    command: `npx vite dev --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 180_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
