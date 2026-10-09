/**
 * Layout regression suite, run on every device project: asserts geometry, not behaviour
 * (no document scroll, no horizontal overflow, one h1, 44px touch targets, breakpoints,
 * dialog widths). Soft assertions in the per-route loops list every offending route.
 */
import type { Locator, Page } from '@playwright/test';
import { test, expect } from './helpers/guards';
import { label } from './helpers/i18n';
import { chooseTheme, header, openHelp, openStoragePolicy, openWorkspaceMenu } from './helpers/nav';
import { exerciseEditor, signInFirstTime } from './helpers/flows';
import { THEMES, mainRoutes, pinTheme, seedWorkspace, visit } from './helpers/seed';

const projectName = () => test.info().project.name;
const isTouch = () => Boolean(test.info().project.use.hasTouch);
const viewportWidth = (page: Page) => page.viewportSize()!.width;

/* -------------------------------------------------------------------------- */
/* Every route, both themes                                                    */
/* -------------------------------------------------------------------------- */

for (const theme of THEMES) {
  test(`[layout] routes do not scroll the document or overflow (${theme})`, async ({ page }) => {
    await pinTheme(page, theme);
    const examId = await seedWorkspace(page);

    for (const route of mainRoutes(examId)) {
      await visit(page, route.path);
      const where = `${route.name} (${route.path})`;

      const m = await page.evaluate(() => {
        const doc = document.scrollingElement!;
        const main = document.querySelector('.app-main');
        // Horizontal overflow of .app-main is acceptable only when it comes
        // from inside a TableScroller region (role=region); an element that
        // sticks out of the viewport beyond such a region is a defect.
        const regions = [...document.querySelectorAll('[role=region]')];
        const outside = main
          ? [...main.querySelectorAll('*')].filter((el) => {
              const r = el.getBoundingClientRect();
              if (r.width === 0 || r.height === 0) return false;
              if (regions.some((g) => g !== el && g.contains(el))) return false;
              const cs = getComputedStyle(el);
              if (cs.position === 'fixed' || cs.visibility === 'hidden') return false;
              // Clipped by an ancestor that scrolls on its own.
              for (let p = el.parentElement; p && p !== main; p = p.parentElement) {
                const o = getComputedStyle(p).overflowX;
                if (o === 'auto' || o === 'scroll' || o === 'hidden' || o === 'clip') return false;
              }
              return r.right > document.documentElement.clientWidth + 1;
            })
              .slice(0, 3)
              .map((el) => `${el.tagName.toLowerCase()} "${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 40)}"`)
          : [];
        return {
          docV: doc.scrollHeight - doc.clientHeight,
          docH: doc.scrollWidth - doc.clientWidth,
          mainH: main ? main.scrollWidth - main.clientWidth : 0,
          outside,
          h1: document.querySelectorAll('h1').length,
          theme: document.documentElement.dataset.theme,
        };
      });

      expect.soft(m.docV, `${where}: document scrolls vertically`).toBeLessThanOrEqual(0);
      expect.soft(m.docH, `${where}: document scrolls horizontally`).toBeLessThanOrEqual(0);
      expect.soft(m.mainH, `${where}: .app-main overflows horizontally ${m.outside.join(' | ')}`).toBeLessThanOrEqual(1);
      expect.soft(m.outside, `${where}: elements stick out of the viewport`).toEqual([]);
      expect.soft(m.h1, `${where}: number of h1`).toBe(1);
      expect.soft(m.theme, `${where}: <html data-theme>`).toBe(theme);
    }
  });
}

test('[layout] the unlock page fits when locked', async ({ page }) => {
  await page.goto('/unlock');
  await expect(page.getByLabel(label('auth.unlock.cloud.email'))).toBeVisible();
  await page.waitForTimeout(500);
  const m = await page.evaluate(() => {
    const doc = document.scrollingElement!;
    const main = document.querySelector('.app-main');
    return {
      docV: doc.scrollHeight - doc.clientHeight,
      docH: doc.scrollWidth - doc.clientWidth,
      mainH: main ? main.scrollWidth - main.clientWidth : 0,
      h1: document.querySelectorAll('h1').length,
    };
  });
  expect.soft(m.docV, 'unlock: document scrolls vertically').toBeLessThanOrEqual(0);
  expect.soft(m.docH, 'unlock: document scrolls horizontally').toBeLessThanOrEqual(0);
  expect.soft(m.mainH, 'unlock: .app-main overflows horizontally').toBeLessThanOrEqual(1);
  expect.soft(m.h1, 'unlock: number of h1').toBe(1);
});

/* -------------------------------------------------------------------------- */
/* Shell: navbar, sidebar, grade, widths, touch targets, theme                 */
/* -------------------------------------------------------------------------- */

test('[layout] shell: navbar, sidebar, grade page, widths and touch targets', async ({ page }) => {
  const examId = await seedWorkspace(page);
  const width = viewportWidth(page);
  const name = projectName();
  const locale = 'en' as const;

  // Navbar: inline links from xl, burger below.
  await visit(page, '/');
  const inlineNav = page.getByRole('navigation', { name: label('nav.menuLabel', undefined, locale) });
  const burger = header(page).getByRole('button', { name: label('nav.openMenu', undefined, locale) });
  if (width >= 1280) {
    await expect(inlineNav, 'inline main nav visible from 1280').toBeVisible();
    await expect(burger).toBeHidden();
  } else {
    await expect(burger, 'burger visible below 1280').toBeVisible();
    await expect(inlineNav).toBeHidden();
  }

  // Data + LaTeX indicators sit in the bar from `sm` (icon-only until xl); on phones they live in the drawer.
  const dataPill = header(page).getByRole('button', { name: label('nav.storageMode', undefined, locale) });
  const latexPill = header(page).getByRole('button', { name: label('nav.latexMode', undefined, locale) });
  if (width >= 640) {
    await expect(dataPill).toBeVisible();
    await expect(latexPill).toBeVisible();
  } else {
    await expect(dataPill).toBeHidden();
    await expect(latexPill).toBeHidden();
    await burger.click();
    const drawer = page.getByRole('navigation', { name: label('nav.menuLabel', undefined, locale) });
    await expect(drawer.getByRole('link', { name: label('nav.dataLabel', undefined, locale) })).toBeVisible();
    await expect(drawer.getByRole('link', { name: label('nav.latexLabel', undefined, locale) })).toBeVisible();
    await page.keyboard.press('Escape');
  }

  // Touch targets in navbar and sidebar.
  if (isTouch()) {
    const small = await smallTargets(header(page));
    expect.soft(small, 'navbar touch targets under 44px').toEqual([]);
    await visit(page, `/exam/${examId}`);
    const sidebar = page.locator('aside');
    if (await sidebar.isVisible()) {
      expect.soft(await smallTargets(sidebar), 'sidebar touch targets under 44px').toEqual([]);
    }
    // The workspace menu items too.
    const menu = await openWorkspaceMenu(page);
    expect.soft(await smallTargets(menu), 'workspace menu items under 44px').toEqual([]);
    await page.keyboard.press('Escape');
  }

  // Exam sidebar: rail 64 at 1024-1279 and on grade, 164 from 1280, none on phones.
  const sidebar = page.locator('aside');
  await visit(page, `/exam/${examId}`);
  if (width < 1024) {
    await expect(sidebar, 'no sidebar below 1024').toBeHidden();
  } else {
    await expect(sidebar).toBeVisible();
    const w = (await sidebar.boundingBox())!.width;
    expect(w, `sidebar width on setup at ${width}px`).toBeCloseTo(width >= 1280 ? 164 : 64, -1);
    await visit(page, `/exam/${examId}/grade`);
    if (await sidebar.isVisible()) {
      expect((await sidebar.boundingBox())!.width, 'sidebar is a rail on grade').toBeCloseTo(64, -1);
    }
  }

  // Grade page: .app-main must not scroll vertically on the target devices.
  if (['laptop-150', 'laptop-125', 'desktop', 'ipad-portrait', 'ipad-landscape'].includes(name)) {
    await visit(page, `/exam/${examId}/grade`);
    const v = await page.evaluate(() => {
      const el = document.querySelector('.app-main')!;
      return el.scrollHeight - el.clientHeight;
    });
    expect(v, 'grade: .app-main scrolls vertically').toBeLessThanOrEqual(1);
  }

  // Desktop: workspace content uses the available width.
  if (name === 'desktop') {
    for (const p of ['', '/scan', '/verify', '/manual', '/stats']) {
      await visit(page, `/exam/${examId}${p}`);
      const ratio = await page.evaluate(() => {
        const main = document.querySelector('.app-main')!;
        const shell = main.querySelector('div.mx-auto.w-full') as HTMLElement | null;
        return shell ? shell.getBoundingClientRect().width / main.clientWidth : 0;
      });
      expect(ratio, `workspace content width ratio on /exam/<id>${p}`).toBeGreaterThanOrEqual(0.85);
    }
  }
});

/** Visible buttons, links and menu items under 44px tall, described for the message. */
async function smallTargets(scope: Locator): Promise<string[]> {
  return scope.evaluate((root) => {
    const out: string[] = [];
    for (const el of root.querySelectorAll('button, a[href], [role=menuitem], [role=menuitemradio], [role=menuitemcheckbox]')) {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (r.width === 0 || r.height === 0 || cs.visibility === 'hidden' || cs.display === 'none') continue;
      if (r.height < 43.5) out.push(`${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30)}" h=${r.height.toFixed(1)}`);
    }
    return out;
  });
}

test('[layout] theme chosen in the navbar persists across a reload', async ({ page }) => {
  await seedWorkspace(page);
  await chooseTheme(page, 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await chooseTheme(page, 'light');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

/* -------------------------------------------------------------------------- */
/* Modals                                                                      */
/* -------------------------------------------------------------------------- */

const REM = 16;
/** Size tokens of ui/Modal (small 32rem, medium 48rem, large 72rem, full 90dvw). */
const SIZE_PX = { small: 32 * REM, medium: 48 * REM, large: 72 * REM, full: -1 };

async function expectDialogFits(page: Page, dialog: Locator, size: keyof typeof SIZE_PX, what: string) {
  const vw = viewportWidth(page);
  const box = (await dialog.boundingBox())!;
  // From sm (640px) the overlay has 1rem padding on each side; phones get a full-width sheet except for small dialogs.
  const expected = size === 'full' ? (vw >= 640 ? vw * 0.9 : vw) : Math.min(SIZE_PX[size], vw - (vw >= 640 || size === 'small' ? 32 : 0));
  expect.soft(box.width, `${what}: dialog narrower than its size token (${size})`).toBeGreaterThanOrEqual(expected - 2);
  expect.soft(box.x, `${what}: dialog starts off-screen`).toBeGreaterThanOrEqual(-1);
  expect.soft(box.x + box.width, `${what}: dialog ends off-screen`).toBeLessThanOrEqual(vw + 1);

  // No scroller nested inside the modal body that actually scrolls: the body
  // (the dialog's own scroll area) is the only one allowed.
  const nested = await dialog.evaluate((root) => {
    const found: string[] = [];
    const scrollers = [...root.querySelectorAll('*')].filter((el) => {
      const cs = getComputedStyle(el);
      return /auto|scroll/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1;
    });
    // The modal body is the first scroller directly under the panel; skip it.
    for (const el of scrollers) {
      const isBody = el.parentElement === root || el.getAttribute('data-modal-body') !== null;
      if (!isBody) found.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)}`);
    }
    return found;
  });
  expect.soft(nested, `${what}: nested scroller inside the modal body`).toEqual([]);
}

test('[layout] main dialogs are as wide as their size token and have no nested scroller', async ({ page }) => {
  const examId = await seedWorkspace(page);

  // Help (large).
  await visit(page, '/');
  const help = await openHelp(page);
  await expectDialogFits(page, help, 'large', 'help');
  await page.keyboard.press('Escape');
  await expect(help).toBeHidden();

  // Storage policy (medium).
  const storage = await openStoragePolicy(page);
  await expectDialogFits(page, storage, 'medium', 'storage policy');
  await page.keyboard.press('Escape');
  await expect(storage).toBeHidden();

  // Exercise editor (full).
  await visit(page, '/exercises');
  await page.getByRole('button', { name: label('exercises.page.createButton', undefined, 'en') }).click();
  const editor = await exerciseEditor(page);
  await expect(editor).toBeVisible();
  await page.waitForTimeout(800);
  await expectDialogFits(page, editor, 'full', 'exercise editor');
  await page.keyboard.press('Escape');
  await expect(editor).toBeHidden();

  // Exam library (large).
  await visit(page, `/exam/${examId}`);
  await page.getByRole('button', { name: label('exam.actionBar.addExercises', undefined, 'en') }).click();
  const library = page.getByRole('dialog', { name: label('exam.libraryModal.header', undefined, 'en') });
  await expect(library).toBeVisible();
  await expectDialogFits(page, library, 'large', 'exam library');
});

/* -------------------------------------------------------------------------- */
/* Account management (admin)                                                   */
/* -------------------------------------------------------------------------- */

test('[layout] account management fits every tab without sideways scrolling', async ({ page, backend }) => {
  backend.state.role = 'admin';
  // Admins land on account management, never on the dashboard (issue #58).
  await signInFirstTime(page, { waitForDashboard: false });
  await visit(page, '/admin/users');

  const tabs = page.getByRole('tablist').getByRole('tab');
  await expect(tabs).toHaveCount(4);
  for (let i = 0; i < 4; i++) {
    await tabs.nth(i).click();
    await page.waitForTimeout(300);
    const where = `admin tab ${i + 1}`;

    const m = await page.evaluate(() => {
      const doc = document.scrollingElement!;
      const main = document.querySelector('.app-main');
      const width = document.documentElement.clientWidth;
      // Every visible switch must sit inside the viewport, reachable without scrolling sideways.
      const switches = [...document.querySelectorAll('[role=switch]')].filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
      const offscreen = switches.filter((el) => {
        const r = el.getBoundingClientRect();
        return r.left < 0 || r.right > width + 1;
      }).length;
      return {
        docH: doc.scrollWidth - doc.clientWidth,
        mainH: main ? main.scrollWidth - main.clientWidth : 0,
        switches: switches.length,
        offscreen,
      };
    });

    expect.soft(m.docH, `${where}: document scrolls horizontally`).toBeLessThanOrEqual(0);
    expect.soft(m.mainH, `${where}: .app-main overflows horizontally`).toBeLessThanOrEqual(1);
    expect.soft(m.offscreen, `${where}: switches outside the viewport`).toBe(0);
  }
});
