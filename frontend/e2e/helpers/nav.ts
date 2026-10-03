/**
 * App-shell navigation (header, menus, session buttons, footer, help, exam tab strip). A
 * shell redesign must only require changes HERE: selectors prefer landmarks, roles and
 * catalog-derived names. Shell today: `AppNavbar` (banner; burger drawer below `xl`, absent
 * on grade), `AppFooter` (contentinfo), `ExamSidebar` (from `lg`).
 */
import type { Download, Locator, Page } from '@playwright/test';
import { expect } from './guards';
import { DEFAULT_LOCALE, label, type Locale } from './i18n';

export type ExamTab = 'setup' | 'scan' | 'verify' | 'grade' | 'manual' | 'stats';
export type LegalPage = 'impressum' | 'datenschutz';

const EXAM_TAB_KEYS: Record<ExamTab, string> = {
  setup: 'exam.sidebar.setup',
  scan: 'exam.sidebar.scan',
  verify: 'exam.sidebar.verify',
  grade: 'exam.sidebar.grade',
  manual: 'exam.sidebar.manual',
  stats: 'exam.sidebar.stats',
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

/** Switch the UI language through the navbar language toggle (a no-op when already set). */
export async function switchLocale(page: Page, target: Locale): Promise<void> {
  const current = await currentLocale(page);
  if (current === target) return;
  await header(page)
    .getByRole('button', { name: label('statusBar.languageHint', undefined, current) })
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

/** The page footer (`<footer>` => contentinfo landmark). */
export function statusBar(page: Page): Locator {
  return page.getByRole('contentinfo');
}

/**
 * The shell's main-menu landmark, opening the navigation drawer first when the
 * inline links are not shown (below `xl`). Returns null when this page has no
 * shell navigation at all (the grade route hides the navbar by design).
 */
async function mainMenu(page: Page): Promise<Locator | null> {
  const locale = await currentLocale(page);
  const landmark = page.getByRole('navigation', { name: label('nav.menuLabel', undefined, locale) });
  if (await landmark.isVisible()) return landmark;

  const burger = header(page).getByRole('button', { name: label('nav.openMenu', undefined, locale) });
  if (!(await burger.isVisible())) return null;
  await burger.click();
  await expect(landmark).toBeVisible();
  return landmark;
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
  const locale = await currentLocale(page);
  const trigger = header(page).locator('button[aria-haspopup="menu"]').last();
  if (!(await trigger.isVisible())) {
    // No navbar on this route (grade): leave by address.
    await page.goto('/settings');
  } else {
    await trigger.click();
    await page.getByRole('menuitem', { name: label('nav.settings', undefined, locale) }).click();
  }
  await page.waitForURL((url) => url.pathname === '/settings');
}

/** The in-app manual page (`/help`), not the help panel. */
export async function gotoManual(page: Page): Promise<void> {
  const locale = await currentLocale(page);
  if (!(await header(page).isVisible())) {
    await page.goto('/help');
  } else {
    const dialog = await openHelp(page);
    await dialog.getByRole('link', { name: label('help.ui.openManual', undefined, locale) }).click();
  }
  await page.waitForURL((url) => url.pathname === '/help' || url.pathname === '/help/');
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
  const linkName = label(EXAM_TAB_KEYS[tab], undefined, locale);
  // From `lg` the exam sidebar lists the steps; below it the navigation
  // drawer does. The grade route has no navbar, so on phones it is left by
  // address.
  const sidebar = page.getByRole('navigation', { name: label('exam.sidebar.label', undefined, locale) });
  if (await sidebar.isVisible()) {
    await sidebar.getByRole('link', { name: linkName }).click();
  } else {
    const menu = await mainMenu(page);
    if (menu) await menu.getByRole('link', { name: linkName }).click();
    else await page.goto(targetPath);
  }
  await page.waitForURL((url) => url.pathname.replace(/\/$/, '') === targetPath);
}

/** Open the Impressum or the privacy policy from the footer. */
export async function gotoLegal(page: Page, which: LegalPage): Promise<void> {
  const locale = await currentLocale(page);
  const key = which === 'impressum' ? 'nav.imprint' : 'nav.privacy';
  await statusBar(page).getByRole('link', { name: label(key, undefined, locale) }).click();
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

/** Open the navbar's Workspace menu and return the menu that holds its items. */
export async function openWorkspaceMenu(page: Page): Promise<Locator> {
  const locale = await currentLocale(page);
  const menu = page.getByRole('menu', { name: label('nav.workspace', undefined, locale) });
  if (!(await menu.isVisible())) {
    await header(page).getByRole('button', { name: label('nav.workspace', undefined, locale) }).click();
  }
  await expect(menu).toBeVisible();
  return menu;
}

async function clickWorkspaceItem(page: Page, action: WorkspaceAction): Promise<void> {
  const locale = await currentLocale(page);
  const menu = await openWorkspaceMenu(page);
  await menu.getByRole('menuitem', { name: label(WORKSPACE_ITEM_KEYS[action], undefined, locale) }).click();
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

/** Lock the session through the navbar's account menu; lands on `/unlock`. */
export async function lockApp(page: Page): Promise<void> {
  const locale = await currentLocale(page);
  // Local mode: the trigger is named "Account"; signed in it carries the email.
  const trigger = header(page).locator('button[aria-haspopup="menu"]').last();
  await trigger.click();
  await page
    .getByRole('menuitem', { name: label('workspace.session.lock', undefined, locale) })
    .click();
  await page.waitForURL((url) => url.pathname === '/unlock');
  await settleNavigation(page);
}

/* -------------------------------------------------------------------------- */
/* Help and storage policy                                                     */
/* -------------------------------------------------------------------------- */

/** The help panel dialog. */
export async function helpDialog(page: Page): Promise<Locator> {
  const locale = await currentLocale(page);
  return page.getByRole('dialog', { name: label('help.ui.title', undefined, locale) });
}

/** Open the help panel from the navbar button. */
export async function openHelp(page: Page): Promise<Locator> {
  const locale = await currentLocale(page);
  await header(page).getByRole('button', { name: label('help.ui.openHelp', undefined, locale) }).click();
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

/** Open the storage & privacy dialog from the navbar's storage-mode button. */
export async function openStoragePolicy(page: Page): Promise<Locator> {
  const locale = await currentLocale(page);
  await header(page).getByRole('button', { name: label('nav.storageMode', undefined, locale) }).click();
  const dialog = page.getByRole('dialog', { name: label('misc.storageModal.heading', undefined, locale) });
  await expect(dialog).toBeVisible();
  return dialog;
}

/* -------------------------------------------------------------------------- */
/* Theme                                                                       */
/* -------------------------------------------------------------------------- */

/** Pick a colour scheme from the navbar's theme menu. */
export async function chooseTheme(page: Page, pref: 'system' | 'light' | 'dark'): Promise<void> {
  const locale = await currentLocale(page);
  const key = { system: 'nav.themeSystem', light: 'nav.themeLight', dark: 'nav.themeDark' }[pref];
  await header(page).getByRole('button', { name: label('nav.theme', undefined, locale) }).click();
  await page.getByRole('menu').getByText(label(key, undefined, locale)).click();
}
