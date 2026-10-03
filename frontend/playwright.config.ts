import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for the regression suite: Vite dev server, all-local mode, no backend.
 * `npm run dev` is NOT the web server command because its `predev` hook downloads the
 * LaTeX/WASM assets, making runs depend on the network.
 * Run one project: `--project=desktop`; one area: `-g "\[exercises\]"`.
 */
const PORT = 4173;
const BASE_URL = `http://localhost:${PORT}`;

/** `screens.spec.ts` only makes screenshots for manual review; skipped unless `--grep @screens`. */
const wantsScreens = process.argv.some((arg) => arg.includes('@screens'));

/** Specs that run on every device project (the functional suite stays on the first three). */
const DEVICE_SPECS = /(layout|a11y|screens)\.spec\.ts$/;

const touch = (width: number, height: number, mobile: boolean, dsf: number) => ({
  ...devices['Desktop Chrome'],
  viewport: { width, height },
  hasTouch: true,
  isMobile: mobile,
  deviceScaleFactor: dsf,
});
const pointer = (width: number, height: number) => ({
  ...devices['Desktop Chrome'],
  viewport: { width, height },
});

export default defineConfig({
  testDir: 'e2e',
  grepInvert: wantsScreens ? undefined : /@screens/,
  testMatch: /.*\.spec\.ts$/,

  // Generous timeouts: the vault passphrase is stretched with Argon2id running
  // in WASM, and the very first page load after a cold Vite start has to
  // pre-bundle dependencies.
  timeout: 120_000,
  expect: { timeout: 20_000 },

  // One worker, in file order: the dev server and Argon2 are CPU-bound, and parallel runs
  // made timing-sensitive steps flaky (contexts are already isolated).
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
    // Device matrix for layout.spec / a11y.spec / screens.spec only.
    { name: 'phone-small', testMatch: DEVICE_SPECS, use: touch(360, 780, true, 3) },
    { name: 'phone-large', testMatch: DEVICE_SPECS, use: touch(430, 932, true, 3) },
    { name: 'ipad-landscape', testMatch: DEVICE_SPECS, use: touch(1366, 1024, false, 2) },
    // Laptops with OS scaling: 1920x1080 at 150% / 125% minus browser chrome.
    { name: 'laptop-150', testMatch: DEVICE_SPECS, use: pointer(1280, 600) },
    { name: 'laptop-125', testMatch: DEVICE_SPECS, use: pointer(1536, 730) },
    { name: 'desktop-fullscreen', testMatch: DEVICE_SPECS, use: pointer(1920, 1080) },
    { name: 'desktop-wide', testMatch: DEVICE_SPECS, use: pointer(2560, 1300) },
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
