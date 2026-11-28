/** Inline editing in the exercise editor's preview (issue #347), with the real browser engine: the code editor's cursor shows as a caret in the page, a click on the page puts the cursor on that character (or at the line's end beside it), a drag selects, Space+drag pans, and typing on the page goes into the LaTeX there. The fake API serves the TeX Live tree from a local install (`tests/helpers/fakeTexTree.ts`); without one the spec skips. */
import type { Locator, Page } from '@playwright/test';
import { test, expect } from './helpers/guards';
import { exerciseEditor, readCodeMirror, setCodeMirror, showExactPdf, signInFirstTime, t } from './helpers/flows';
import { gotoExerciseLibrary } from './helpers/nav';
import { hasLocalTexTree } from '../tests/helpers/fakeTexTree';

const BODY = 'Die Katze sieht die Maus und die Maus sieht die Katze.';
/** Column of the second "Maus", plus one: between its M and a. */
const COLUMN = BODY.indexOf('Maus', BODY.indexOf('Maus') + 1) + 1;
/** More pages, so the pages scroll on every device. */
const FILLER = [String.raw`\vspace*{24cm}`, 'Ende.', String.raw`\newpage`, 'Seite drei.', String.raw`\newpage`, 'Seite vier.'].join('\n');

/** The pages' scroll offset (EmbedPDF's scroller in its open shadow root). */
function pagesScrollTop(page: Page): Promise<number> {
  return page.evaluate(() => {
    const root = document.querySelector('.embed-pdf-viewer embedpdf-container')?.shadowRoot;
    const el = [...(root?.querySelectorAll('div') ?? [])].find((d) => /(auto|scroll)/.test(getComputedStyle(d).overflowY) && d.scrollHeight > d.clientHeight);
    return el?.scrollTop ?? -1;
  });
}

async function caretBox(editor: Locator): Promise<{ x: number; y: number; width: number; height: number }> {
  const caret = editor.getByTestId('pdf-caret').first();
  await expect(caret).toBeVisible();
  const box = await caret.boundingBox();
  if (!box) throw new Error('the caret has no box');
  return box;
}

test.describe('inline editing', () => {
  test.skip(!hasLocalTexTree(), 'needs a local TeX Live (backend/latex-texlive/install.sh)'); // NOSONAR: conditional skip, reason given
  test.skip(({ isMobile }) => isMobile, 'desktop layout only'); // NOSONAR: conditional per-device skip, reason given

  test('[editor] the caret shows in the page, clicks and drags place and select, typing on the page edits the LaTeX', async ({ page }) => {
    // Boots the engine and fetches its TeX files from the fake tree.
    test.setTimeout(300_000);
    await page.addInitScript(() => window.localStorage.setItem('bg_latex_compilation', 'local'));
    await signInFirstTime(page);
    await gotoExerciseLibrary(page);
    await page.getByRole('button', { name: await t(page, 'exercises.page.createButton') }).click();
    const editor = await exerciseEditor(page);
    await expect(editor).toBeVisible();
    await setCodeMirror(page, editor, `${BODY}\n\n${FILLER}`, 0);
    await editor.getByRole('button', { name: await t(page, 'exercises.editor.previewButton') }).click();
    await expect(editor.getByRole('img', { name: await t(page, 'common.pdfPage') }).first()).toBeVisible({ timeout: 240_000 });
    await showExactPdf(page, editor);

    // The code editor's cursor between M and a of the second "Maus" shows as a caret in the page.
    await editor.locator('.cm-content').first().click();
    await page.keyboard.press('ControlOrMeta+Home');
    for (let i = 0; i < COLUMN; i++) await page.keyboard.press('ArrowRight');
    const atMaus = await caretBox(editor);
    const lineY = atMaus.y + atMaus.height / 2;

    // A plain click elsewhere on the line moves the caret there; far right of the line it goes to the line's end.
    await page.mouse.click(atMaus.x - 60, lineY);
    await expect.poll(async () => Math.round((await caretBox(editor)).x)).not.toBe(Math.round(atMaus.x));
    const sheet = await editor.getByRole('img', { name: await t(page, 'common.pdfPage') }).first().boundingBox();
    if (!sheet) throw new Error('the page has no box');
    await page.mouse.click(sheet.x + sheet.width - 8, lineY);
    await expect.poll(async () => (await caretBox(editor)).x).toBeGreaterThan(atMaus.x + 20);
    // The page has the keys; the code editor still shows its cursor.
    await expect(editor.locator('.cm-editor:not(.cm-focused) .cm-cursor').first()).toBeVisible();

    // A mouse drag along the line selects and does not scroll.
    const top = await pagesScrollTop(page);
    await page.mouse.move(atMaus.x - 45, lineY);
    await page.mouse.down();
    await page.mouse.move(atMaus.x - 5, lineY, { steps: 8 });
    await page.mouse.up();
    await expect(editor.locator('.bg-primary\\/25').first()).toBeVisible();
    expect(await pagesScrollTop(page)).toBe(top);

    // Space+drag pans the pages and leaves the text alone.
    const before = await readCodeMirror(editor);
    await page.keyboard.down(' ');
    await page.mouse.move(atMaus.x, lineY + 200);
    await page.mouse.down();
    await page.mouse.move(atMaus.x, lineY, { steps: 10 });
    await page.mouse.up();
    await page.keyboard.up(' ');
    await expect.poll(() => pagesScrollTop(page)).toBeGreaterThan(top);
    expect(await readCodeMirror(editor)).toBe(before);

    // Back to the top; a click just left of the "Maus" caret (right half of M) and typing put the character after M.
    await page.mouse.move(atMaus.x, lineY);
    await page.mouse.wheel(0, -2000);
    await expect.poll(() => pagesScrollTop(page)).toBeLessThanOrEqual(top);
    // Measured again after the scroll: the code editor's cursor before "a" of the second "Maus" shows where to click.
    await editor.locator('.cm-content').first().click();
    await page.keyboard.press('ControlOrMeta+Home');
    for (let i = 0; i < COLUMN; i++) await page.keyboard.press('ArrowRight');
    const again = await caretBox(editor);
    await page.mouse.click(again.x - 0.75, again.y + again.height / 2);
    await page.keyboard.type('§');
    await expect.poll(() => readCodeMirror(editor)).toContain('und die M§aus sieht');
    // A Space tap types a space.
    await page.keyboard.press(' ');
    await expect.poll(() => readCodeMirror(editor)).toContain('und die M§ aus sieht');
  });
});
