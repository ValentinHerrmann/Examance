/**
 * Shared Playwright fixtures: import `test` and `expect` from here. Adds a pinned UI locale, the mocked `backend`
 * (fresh fake API per test, unrouted requests fail), a guard failing on uncaught page errors or non-allowlisted
 * `console.error`, and a `dialogs` recorder for the native dialogs of the archive flows.
 */
import { test as base, expect, type Dialog, type Page } from '@playwright/test';
import { createFakeApi, type FakeApi, type FakeStorageMode } from '../../tests/helpers/fakeApi';
import { installFakeBackend } from './backend';
import { DEFAULT_LOCALE, type Locale } from './i18n';

/** localStorage key the app reads its locale from (`lib/i18n/index.ts`). */
const LOCALE_STORAGE_KEY = 'bg_locale';

/**
 * Expected console noise; keep minimal and justify every entry (anything else is a real finding). Empty because the
 * fake backend answers every request; add one only for a deliberate error answer the app handles itself (409, 404).
 */
interface AllowedConsoleError {
  /** Matched against the console message text. */
  message: RegExp;
  /** Matched against the URL the browser reports for the message (the failing request). */
  url: RegExp;
  /** Why this is expected. */
  why: string;
}

export const ALLOWED_CONSOLE_ERRORS: AllowedConsoleError[] = [];

/** A native browser dialog the app raised, as recorded by the `dialogs` fixture. */
export interface RecordedDialog {
  type: ReturnType<Dialog['type']>;
  message: string;
}

/**
 * Answers every native dialog and remembers it. Playwright auto-dismisses unheard dialogs,
 * which would silently abort the archive export/import password prompt.
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
  /**
   * The account's storage mode on the fake server: `'all-server'` (default, results go through the
   * fake too), `'hybrid'`, or `null` for an account that has not chosen one yet (the first sign-in
   * then asks). Set per file or describe with `test.use({ storageMode })`.
   */
  storageMode: FakeStorageMode | null;
  /** The stateful fake API answering for the default backend; inspect or seed `backend.state`. */
  backend: FakeApi;
  dialogs: DialogRecorder;
  /** Page errors / console errors collected for this test (read-only view). */
  pageIssues: string[];
}

export const test = base.extend<Fixtures>({
  appLocale: [DEFAULT_LOCALE, { option: true }],
  storageMode: ['all-server', { option: true }],

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

  // Automatic, so no test can reach a real (absent) backend. A route the fake lacks answers 404 and
  // is listed here after the test body, so a gap in the mock reads as one and not as an app bug.
  backend: [
    async ({ context, storageMode }, use) => {
      const api = createFakeApi({ storageMode });
      await installFakeBackend(context, api);
      await use(api);
      expect(
        api.state.unhandled,
        'requests the fake backend (tests/helpers/fakeApi.ts) has no route for; add a handler',
      ).toEqual([]);
    },
    { auto: true },
  ],

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
