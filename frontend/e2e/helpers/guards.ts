/**
 * Shared Playwright fixtures for the Examance e2e suite.
 *
 * Every spec imports `test` and `expect` from here instead of from
 * `@playwright/test`. On top of the stock fixtures this provides:
 *
 *  - a pinned UI locale (`bg_locale` in localStorage, English unless a test
 *    sets the `appLocale` option), applied through a context init script that
 *    never overwrites a language the app itself saved, so a locale choice
 *    survives `page.reload()`;
 *  - an automatic guard that FAILS the test on any uncaught page error or
 *    `console.error`, apart from a small, justified allowlist;
 *  - a `dialogs` recorder that answers the native `alert` / `confirm` /
 *    `prompt` dialogs the archive import / export / clear flows use
 *    (`lib/services/archiveService.ts`) and lets a test assert on them.
 */
import { test as base, expect, type Dialog, type Page } from '@playwright/test';
import { DEFAULT_LOCALE, type Locale } from './i18n';

/** localStorage key the app reads its locale from (`lib/i18n/index.ts`). */
const LOCALE_STORAGE_KEY = 'bg_locale';

/**
 * Console errors that are expected noise in all-local mode without a backend.
 * Keep this list minimal: every entry must say why it is harmless. An error
 * that is not listed here is a real finding and fails the test.
 */
interface AllowedConsoleError {
  /** Matched against the console message text. */
  message: RegExp;
  /** Matched against the URL the browser reports for the message (the failing request). */
  url: RegExp;
  /** Why this is expected when no backend is running. */
  why: string;
}

/**
 * The default backend in a dev build is http://localhost:8000
 * (`lib/stores/backendStore.ts`); nothing listens there in this suite.
 */
const ABSENT_BACKEND = /^https?:\/\/localhost:8000\/api\//;

export const ALLOWED_CONSOLE_ERRORS: AllowedConsoleError[] = [
  {
    // `refreshBackendVersion()` (lib/stores/versionStore.ts) probes
    // GET /api/health on boot, after unlock and whenever the backend address
    // changes. All-local mode is explicitly supported without a server, so the
    // refused connection is the normal state, and the browser itself reports a
    // failed fetch as a console error.
    message: /Failed to load resource: net::ERR_CONNECTION_REFUSED/,
    url: ABSENT_BACKEND,
    why: 'version probe / best-effort logout against the absent default backend',
  },
];

/** A native browser dialog the app raised, as recorded by the `dialogs` fixture. */
export interface RecordedDialog {
  type: ReturnType<Dialog['type']>;
  message: string;
}

/**
 * Answers every native dialog and remembers it.
 *
 * Playwright auto-dismisses dialogs when nobody listens, which would cancel the
 * archive password prompt and silently abort the export/import. This recorder
 * accepts instead: `prompt` gets {@link promptAnswer}, `confirm` gets
 * {@link confirmAnswer}, `alert` is simply acknowledged.
 */
export class DialogRecorder {
  readonly seen: RecordedDialog[] = [];
  /** Password given to `prompt()` (the .bgproj archive password). */
  promptAnswer = 'e2e-archive-password';
  /** `true` accepts a `confirm()`, `false` cancels it. */
  confirmAnswer = true;

  attach(page: Page): void {
    page.on('dialog', (dialog) => {
      this.seen.push({ type: dialog.type(), message: dialog.message() });
      const type = dialog.type();
      if (type === 'prompt') {
        void dialog.accept(this.promptAnswer);
      } else if (type === 'confirm') {
        void (this.confirmAnswer ? dialog.accept() : dialog.dismiss());
      } else {
        void dialog.accept();
      }
    });
  }

  /** Dialogs of one type seen so far. */
  ofType(type: RecordedDialog['type']): RecordedDialog[] {
    return this.seen.filter((entry) => entry.type === type);
  }

  /** Wait until a dialog of `type` whose message matches `pattern` has been seen. */
  async expectSeen(type: RecordedDialog['type'], pattern: RegExp): Promise<void> {
    await expect
      .poll(() => this.ofType(type).some((entry) => pattern.test(entry.message)), {
        message: `expected a ${type} dialog matching ${pattern}; saw: ${JSON.stringify(this.seen)}`,
      })
      .toBe(true);
  }

  /** Forget everything recorded so far (between phases of one test). */
  reset(): void {
    this.seen.length = 0;
  }
}

interface Fixtures {
  /** Locale the app is pinned to for this test. */
  appLocale: Locale;
  dialogs: DialogRecorder;
  /** Page errors / console errors collected for this test (read-only view). */
  pageIssues: string[];
}

export const test = base.extend<Fixtures>({
  appLocale: [DEFAULT_LOCALE, { option: true }],

  context: async ({ context, appLocale }, use) => {
    // Runs before any page script on every navigation. Only seeds the value:
    // once the app (or a test) has saved a language, it is left alone.
    await context.addInitScript(
      ({ key, value }) => {
        try {
          if (!window.localStorage.getItem(key)) window.localStorage.setItem(key, value);
        } catch {
          // Storage blocked: the app falls back to navigator.language ('en-US').
        }
      },
      { key: LOCALE_STORAGE_KEY, value: appLocale },
    );
    await use(context);
  },

  // Automatic so that an unexpected dialog never hangs a test: Playwright would
  // auto-dismiss it (cancelling e.g. the archive password prompt) otherwise.
  dialogs: [
    async ({ page }, use) => {
      const recorder = new DialogRecorder();
      recorder.attach(page);
      await use(recorder);
    },
    { auto: true },
  ],

  pageIssues: [
    async ({ page }, use) => {
      const issues: string[] = [];

      page.on('pageerror', (error) => {
        issues.push(`pageerror: ${error.message}`);
      });
      page.on('console', (message) => {
        if (message.type() !== 'error') return;
        const text = message.text();
        const where = message.location().url;
        if (
          ALLOWED_CONSOLE_ERRORS.some(
            (allowed) => allowed.message.test(text) && allowed.url.test(where),
          )
        ) {
          return;
        }
        issues.push(`console.error: ${text}${where ? ` (${where})` : ''}`);
      });

      await use(issues);

      // Reported after the test body so a failing assertion keeps its own message.
      expect(issues, 'unexpected page errors / console errors').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
