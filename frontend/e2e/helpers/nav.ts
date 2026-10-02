/**
 * App-shell navigation for the e2e suite.
 *
 * EVERYTHING a test does through the application shell lives in this file: the
 * top header and its menu button, the workspace menu, the session buttons, the
 * status bar (locale toggle, storage badge, help, legal links) and the exam tab
 * strip. Specs and flows call these functions and never click shell controls
 * themselves.
 *
 * That is the point of the file: a redesign of the shell (new navbar, sidebar,
 * footer, icons instead of emoji) must only require changes HERE. Selectors
 * therefore prefer landmarks (banner, navigation, contentinfo), roles and
 * catalog-derived names, and every place that has to rely on something less
 * semantic says why.
 *
 * Today's shell, for orientation:
 *  - `AppHeader`: inline links from the `lg` breakpoint up; below it a menu
 *    button opens a slide-over holding the same links, the workspace actions
 *    and the session buttons. The header is not rendered on the grade route.
 *  - Workspace dropdown (header, `lg` up) with Open / Export / Clear `.bgproj`.
 *  - `StatusBar` (footer): locale toggle, storage badge, help, Imprint, Privacy,
 *    backend, version. Below `sm` the entries show only an icon and carry their
 *    text in `title`, so they are located by title.
 *  - `ExamNav`: the tab strip on exam pages (hidden on the grade route).
 */
import type { Download, Locator, Page } from '@playwright/test';
import { expect } from './guards';
import { DEFAULT_LOCALE, label, stem, type Locale } from './i18n';

export type ExamTab = 'setup' | 'scan' | 'verify' | 'grade' | 'manual' | 'stats';
export type LegalPage = 'impressum' | 'datenschutz';

const EXAM_TAB_KEYS: Record<ExamTab, string> = {
  setup: 'exam.nav.tabs.setup',
  scan: 'exam.nav.tabs.scan',
  verify: 'exam.nav.tabs.verify',
  grade: 'exam.nav.tabs.grade',
  manual: 'exam.nav.tabs.manual',
  stats: 'exam.nav.tabs.stats',
};

const EXAM_TAB_PATH: Record<ExamTab, string> = {
  setup: '',
  scan: '/scan',
  verify: '/verify',
  grade: '/grade',
  manual: '/manual',
  stats: '/stats',
};

/* -------------------------------------------------------------------------- */
/* Locale                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The language the app is currently showing. Read from the same localStorage
 * key the app persists it under rather than from `<html lang>`, which is only
 * correct after hydration.
 */
export async function currentLocale(page: Page): Promise<Locale> {
  for (let attempt = 0; ; attempt++) {
    try {
      const saved = await page.evaluate(() => window.localStorage.getItem('bg_locale'));
      return saved === 'de' || saved === 'en' ? saved : DEFAULT_LOCALE;
    } catch (error) {
      // A full-page navigation (lock, import, clear...) can destroy the
      // execution context between two statements of a helper: wait and retry.
      const navigating = /context was destroyed|navigation/i.test(String(error));
      if (!navigating || attempt >= 5) throw error;
      await page.waitForLoadState('domcontentloaded');
    }
  }
}

/**
 * Wait until the page has stopped navigating. Locking navigates to `/unlock`
 * more than once (the lock service and the layout's lock handler both assign
 * `location.href`, and the unlock page can reload again), so the first matching
 * URL is not yet the page the test will interact with.
 */
export async function settleNavigation(page: Page, quietMs = 700): Promise<void> {
  let lastNavigation = Date.now();
  const onNavigated = (frame: import('@playwright/test').Frame) => {
    if (frame === page.mainFrame()) lastNavigation = Date.now();
  };
  page.on('framenavigated', onNavigated);
  try {
    await expect
      .poll(() => Date.now() - lastNavigation, { message: 'page kept navigating', timeout: 20_000 })
      .toBeGreaterThan(quietMs);
  } finally {
    page.off('framenavigated', onNavigated);
  }
  await page.waitForLoadState('load');
}

/** Switch the UI language through the status bar toggle (a no-op when already set). */
export async function switchLocale(page: Page, target: Locale): Promise<void> {
  const current = await currentLocale(page);
  if (current === target) return;
  // The toggle's tooltip is the only text it carries once the label is an icon.
  await statusBar(page)
    .getByTitle(label('statusBar.languageHint', undefined, current))
    .click();
  await expect.poll(() => currentLocale(page)).toBe(target);
}

/* -------------------------------------------------------------------------- */
/* Landmarks                                                                   */
/* -------------------------------------------------------------------------- */

/** The top header (`<header>` => banner landmark). */
export function header(page: Page): Locator {
  return page.getByRole('banner');
}

/** The status bar (`<footer>` => contentinfo landmark). */
export function statusBar(page: Page): Locator {
  return page.getByRole('contentinfo');
}

/**
 * The shell's main-menu landmark, opening the slide-over first when the inline
 * navigation is not shown (phone). Returns null when this page has no shell
 * navigation at all (the grade route hides the header by design).
 */
async function mainMenu(page: Page): Promise<Locator | null> {
  const locale = await currentLocale(page);
  const menuName = label('nav.menuLabel', undefined, locale);
  const landmark = page.getByRole('navigation', { name: menuName });
  if (await landmark.isVisible()) return landmark;

  const toggle = page.getByRole('button', { name: menuName });
  if (!(await toggle.isVisible())) return null;
  await toggle.click();
  await expect(landmark).toBeVisible();
  return landmark;
}

/**
 * The container that holds the workspace and session controls. With the inline
 * header that is the header itself; on narrow viewports those controls live in
 * the slide-over, which is opened here.
 */
async function shellControls(page: Page): Promise<Locator> {
  const locale = await currentLocale(page);
  const toggle = page.getByRole('button', { name: label('nav.menuLabel', undefined, locale) });
  if (await toggle.isVisible()) {
    const menu = await mainMenu(page);
    if (!menu) throw new Error('shellControls: the main menu did not open');
    return menu;
  }
  return header(page);
}

async function clickMainMenuLink(page: Page, key: string, fallbackPath: string): Promise<void> {
  const locale = await currentLocale(page);
  const menu = await mainMenu(page);
  if (!menu) {
    // No shell navigation on this route (grade). Leave the way a user would:
    // by address.
    await page.goto(fallbackPath);
  } else {
    await menu.getByRole('link', { name: label(key, undefined, locale) }).click();
  }
  await page.waitForURL((url) => url.pathname === fallbackPath || url.pathname === `${fallbackPath}/`);
}

/* -------------------------------------------------------------------------- */
/* Page navigation                                                             */
/* -------------------------------------------------------------------------- */

export async function gotoDashboard(page: Page): Promise<void> {
  await clickMainMenuLink(page, 'nav.dashboard', '/');
}

export async function gotoExerciseLibrary(page: Page): Promise<void> {
  await clickMainMenuLink(page, 'nav.exerciseLibrary', '/exercises');
}

export async function gotoAnalytics(page: Page): Promise<void> {
  await clickMainMenuLink(page, 'nav.analytics', '/analytics');
}

export async function gotoSettings(page: Page): Promise<void> {
  await clickMainMenuLink(page, 'nav.settings', '/settings');
}

/** The in-app manual page (`/help`), not the help panel. */
export async function gotoManual(page: Page): Promise<void> {
  await clickMainMenuLink(page, 'help.ui.navLabel', '/help');
}

/**
 * Go to one tab of the current exam. Uses the tab strip when it is shown and
 * falls back to the address on routes that hide it (the grade route).
 */
export async function gotoExamTab(page: Page, tab: ExamTab): Promise<void> {
  const examId = /\/exam\/([^/?#]+)/.exec(new URL(page.url()).pathname)?.[1];
  if (!examId) throw new Error(`gotoExamTab('${tab}'): not on an exam page (${page.url()})`);
  const targetPath = `/exam/${examId}${EXAM_TAB_PATH[tab]}`;

  const locale = await currentLocale(page);
  const tabs = page.getByRole('navigation', { name: label('exam.nav.tabsLabel', undefined, locale) });
  if (await tabs.isVisible()) {
    await tabs.getByRole('link', { name: stem(EXAM_TAB_KEYS[tab], locale) }).click();
  } else {
    await page.goto(targetPath);
  }
  await page.waitForURL((url) => url.pathname.replace(/\/$/, '') === targetPath);
}

/** Open the Impressum or the privacy policy from the status bar. */
export async function gotoLegal(page: Page, which: LegalPage): Promise<void> {
  const locale = await currentLocale(page);
  const key = which === 'impressum' ? 'nav.imprint' : 'nav.privacy';
  // Below `sm` the status bar shows only an icon; the text is the title.
  await statusBar(page).getByTitle(label(key, undefined, locale)).click();
  await page.waitForURL((url) => url.pathname === `/legal/${which}`);
}

/* -------------------------------------------------------------------------- */
/* Workspace menu (.bgproj open / export / clear)                              */
/* -------------------------------------------------------------------------- */

type WorkspaceAction = 'open' | 'export' | 'clear';

const WORKSPACE_ITEM_KEYS: Record<WorkspaceAction, string> = {
  open: 'workspace.menu.open',
  export: 'workspace.menu.export',
  clear: 'workspace.menu.clear',
};

/**
 * Open the workspace menu and return the locator that contains its items.
 * Desktop: the header dropdown. Phone: the slide-over (items are listed there
 * directly).
 */
export async function openWorkspaceMenu(page: Page): Promise<Locator> {
  const locale = await currentLocale(page);
  const controls = await shellControls(page);
  const firstItem = page.getByRole('button', {
    name: label(WORKSPACE_ITEM_KEYS.open, undefined, locale),
  });

  // Narrow viewports: the slide-over already lists the workspace actions.
  if (controls !== header(page) && (await firstItem.isVisible())) return controls;

  // The trigger shows "Workspace" only from `xl`; between `lg` and `xl` it is an
  // icon button, so fall back to "the header button that expands something".
  const named = controls.getByRole('button', { name: label('nav.workspace', undefined, locale) });
  const trigger = (await named.count()) > 0 ? named : controls.locator('button[aria-expanded]:visible');
  if (!(await firstItem.isVisible())) await trigger.first().click();
  await expect(firstItem).toBeVisible();
  return page.locator('body');
}

async function clickWorkspaceItem(page: Page, action: WorkspaceAction): Promise<void> {
  const locale = await currentLocale(page);
  const scope = await openWorkspaceMenu(page);
  await scope
    .getByRole('button', { name: label(WORKSPACE_ITEM_KEYS[action], undefined, locale) })
    .click();
}

/**
 * Export the whole workspace as a `.bgproj`. The archive password prompt is
 * answered by the `dialogs` fixture (`dialogs.promptAnswer`).
 */
export async function exportWorkspace(page: Page): Promise<Download> {
  const downloadPromise = page.waitForEvent('download');
  await clickWorkspaceItem(page, 'export');
  return downloadPromise;
}

/**
 * Clear the workspace. The confirmation and the "cleared" alert are native
 * dialogs handled by the `dialogs` fixture; the app then reloads to the
 * dashboard.
 */
export async function clearWorkspace(page: Page): Promise<void> {
  await clickWorkspaceItem(page, 'clear');
  // `window.location.href = "/"` after the alert: wait for the reload to land.
  await page.waitForURL((url) => url.pathname === '/');
}

/**
 * Import a `.bgproj` through the workspace menu. The password prompt and the
 * result alert are handled by the `dialogs` fixture; the app reloads to the
 * dashboard afterwards.
 */
export async function importWorkspace(page: Page, filePath: string): Promise<void> {
  const chooserPromise = page.waitForEvent('filechooser');
  await clickWorkspaceItem(page, 'open');
  const chooser = await chooserPromise;
  await chooser.setFiles(filePath);
  await page.waitForURL((url) => url.pathname === '/');
}

/* -------------------------------------------------------------------------- */
/* Session                                                                     */
/* -------------------------------------------------------------------------- */

/** Lock the session through the header's lock button; lands on `/unlock`. */
export async function lockApp(page: Page): Promise<void> {
  const locale = await currentLocale(page);
  const controls = await shellControls(page);
  await controls.getByRole('button', { name: label('workspace.session.lock', undefined, locale) }).click();
  await page.waitForURL((url) => url.pathname === '/unlock');
  await settleNavigation(page);
}

/* -------------------------------------------------------------------------- */
/* Status bar: help and storage policy                                         */
/* -------------------------------------------------------------------------- */

/** The help panel dialog. */
export async function helpDialog(page: Page): Promise<Locator> {
  const locale = await currentLocale(page);
  return page.getByRole('dialog', { name: label('help.ui.title', undefined, locale) });
}

/** Open the help panel from the status bar button. */
export async function openHelp(page: Page): Promise<Locator> {
  const locale = await currentLocale(page);
  await statusBar(page).getByTitle(label('help.ui.statusBarHint', undefined, locale)).click();
  const dialog = await helpDialog(page);
  await expect(dialog).toBeVisible();
  return dialog;
}

/**
 * Open the help panel with the global F1 shortcut. The shortcut is ignored
 * while a text field has focus, so focus is parked on the page body first.
 */
export async function openHelpWithKeyboard(page: Page): Promise<Locator> {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('F1');
  const dialog = await helpDialog(page);
  await expect(dialog).toBeVisible();
  return dialog;
}

/** Open the storage & privacy dialog from the status bar badge. */
export async function openStoragePolicy(page: Page): Promise<Locator> {
  const locale = await currentLocale(page);
  await statusBar(page).getByTitle(label('statusBar.storageSettingsHint', undefined, locale)).click();
  const dialog = page.getByRole('dialog', { name: label('misc.storageModal.heading', undefined, locale) });
  await expect(dialog).toBeVisible();
  return dialog;
}
