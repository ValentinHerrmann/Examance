/** Live preview with the real browser engine (issue #350): typing in the exercise editor brings new PDFs, and no frame in between shows a blank pane. The fake API serves the TeX Live tree from a local install (`tests/helpers/fakeTexTree.ts`); without one the spec skips. */
import type { Page } from '@playwright/test';
import { test, expect } from './helpers/guards';
import { exerciseEditor, setCodeMirror, signInFirstTime, t } from './helpers/flows';
import { gotoExerciseLibrary } from './helpers/nav';
import { hasLocalTexTree } from '../tests/helpers/fakeTexTree';

interface FrameWatch {
  frames: number;
  blank: number;
  stop: boolean;
}

/** Counts animation frames in which no visible preview viewer shows a loaded page image in its view (EmbedPDF draws into open shadow roots). */
function watchFrames(page: Page): Promise<void> {
  return page.evaluate(() => {
    const watch: FrameWatch = { frames: 0, blank: 0, stop: false };
    (window as unknown as { __frameWatch: FrameWatch }).__frameWatch = watch;
    const showsPage = () =>
      [...document.querySelectorAll('.embed-pdf-viewer embedpdf-container')].some((host) => {
        if (getComputedStyle(host).visibility === 'hidden') return false;
        const view = host.getBoundingClientRect();
        return [...(host.shadowRoot?.querySelectorAll('img') ?? [])].some((img) => {
          const r = img.getBoundingClientRect();
          return img.complete && img.naturalWidth > 0 && r.bottom > view.top && r.top < view.bottom && r.width > 0;
        });
      });
    const tick = () => {
      if (watch.stop) return;
      watch.frames++;
      if (!showsPage()) watch.blank++;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

function stopWatch(page: Page): Promise<FrameWatch> {
  return page.evaluate(() => {
    const watch = (window as unknown as { __frameWatch: FrameWatch }).__frameWatch;
    watch.stop = true;
    return { ...watch };
  });
}

test.describe('live preview', () => {
  test.skip(!hasLocalTexTree(), 'needs a local TeX Live (backend/latex-texlive/install.sh)'); // NOSONAR: conditional skip, reason given
  test.skip(({ isMobile }) => isMobile, 'desktop layout only'); // NOSONAR: conditional per-device skip, reason given

  test('[editor] typing brings new PDFs without a blank frame in between', async ({ page }) => {
    // Boots the engine and fetches its TeX files from the fake tree.
    test.setTimeout(300_000);
    let swaps = 0;
    page.on('console', (msg) => {
      if (msg.text().startsWith('[preview] swap')) swaps++;
    });
    await page.addInitScript(() => window.localStorage.setItem('bg_latex_compilation', 'local'));
    await signInFirstTime(page);
    await gotoExerciseLibrary(page);
    await page.getByRole('button', { name: await t(page, 'exercises.page.createButton') }).click();
    const editor = await exerciseEditor(page);
    await expect(editor).toBeVisible();
    await setCodeMirror(page, editor, 'Die Katze sieht die Maus.', 0);
    await editor.getByRole('button', { name: await t(page, 'exercises.editor.previewButton') }).click();
    await expect(editor.getByRole('img', { name: await t(page, 'common.pdfPage') }).first()).toBeVisible({ timeout: 240_000 });
    await expect.poll(() => page.evaluate(() => document.querySelectorAll('.embed-pdf-viewer embedpdf-container').length)).toBeGreaterThan(0);

    await watchFrames(page);
    const before = swaps;
    await editor.locator('.cm-content').first().click();
    await page.keyboard.press('ControlOrMeta+End');
    // Typed one key at a time: each keystroke starts a live compile, so several PDFs replace each other while the watch runs.
    for (const key of ' Und der Hund.') await page.keyboard.type(key, { delay: 120 });
    await expect.poll(() => swaps, { timeout: 60_000 }).toBeGreaterThanOrEqual(before + 2);
    const watch = await stopWatch(page);
    expect(watch.frames).toBeGreaterThan(10);
    expect(watch.blank, `blank frames out of ${watch.frames}`).toBe(0);
  });
});
