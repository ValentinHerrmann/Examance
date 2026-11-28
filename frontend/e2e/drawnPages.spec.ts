/** Drawn pages in the exercise editor (issue #352), with the real browser engine: they are the default, the caret, clicks and typing work on them, the switch in the preview header shows the exact PDF (EmbedPDF), and a page with an included PDF shows from the PDF. Logs the keystroke-to-page times. The fake API serves the TeX Live tree from a local install (`tests/helpers/fakeTexTree.ts`); without one the spec skips. */
import type { Locator, Page } from '@playwright/test';
import { test, expect } from './helpers/guards';
import { exerciseEditor, readCodeMirror, setCodeMirror, signInFirstTime, t } from './helpers/flows';
import { gotoExerciseLibrary } from './helpers/nav';
import { hasLocalTexTree } from '../tests/helpers/fakeTexTree';

const BODY = 'Die Katze sieht die Maus und die Maus sieht die Katze.';
/** Column of the second "Maus", plus one: between its M and a. */
const COLUMN = BODY.indexOf('Maus', BODY.indexOf('Maus') + 1) + 1;

async function openEditor(page: Page, body: string): Promise<Locator> {
  await page.addInitScript(() => window.localStorage.setItem('bg_latex_compilation', 'local'));
  await signInFirstTime(page);
  await gotoExerciseLibrary(page);
  await page.getByRole('button', { name: await t(page, 'exercises.page.createButton') }).click();
  const editor = await exerciseEditor(page);
  await expect(editor).toBeVisible();
  await setCodeMirror(page, editor, body, 0);
  await editor.getByRole('button', { name: await t(page, 'exercises.editor.previewButton') }).click();
  await expect(editor.getByRole('img', { name: await t(page, 'common.pdfPage') }).first()).toBeVisible({ timeout: 240_000 });
  return editor;
}

async function caretBox(editor: Locator): Promise<{ x: number; y: number; width: number; height: number }> {
  const caret = editor.getByTestId('pdf-caret').first();
  await expect(caret).toBeVisible();
  const box = await caret.boundingBox();
  if (!box) throw new Error('the caret has no box');
  return box;
}

async function cursorAt(page: Page, editor: Locator, column: number): Promise<void> {
  await editor.locator('.cm-content').first().click();
  await page.keyboard.press('ControlOrMeta+Home');
  for (let i = 0; i < column; i++) await page.keyboard.press('ArrowRight');
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

/** The whole number right before the first ` ms` that has one in a log line (0 when none). */
function millisecondsIn(text: string): number {
  for (let end = text.indexOf(' ms'); end >= 0; end = text.indexOf(' ms', end + 1)) {
    let start = end;
    while (start > 0 && text[start - 1] >= '0' && text[start - 1] <= '9') start--;
    if (start < end) return Number(text.slice(start, end));
  }
  return 0;
}

/** Milliseconds from a keystroke at the end of the code to the next `marker` log line of a compile that started after it (a drawn page, or EmbedPDF's swap; the line's own duration must fit in the elapsed time), and the page and engine time a drawn-page line names; medians of `n`. */
async function keystrokeLatency(page: Page, editor: Locator, marker: string, n = 6): Promise<{ ms: number; page: number; shippedMs: number }> {
  const times: number[] = [];
  const shipped: number[] = [];
  let pageNo = 0;
  for (let i = 0; i < n; i++) {
    await editor.locator('.cm-content').first().click();
    await page.keyboard.press('ControlOrMeta+End');
    let t0 = 0;
    const own = (text: string) => {
      const ms = millisecondsIn(text);
      return text.startsWith(marker) && ms <= Date.now() - t0 + 5;
    };
    const seen = page.waitForEvent('console', { predicate: (m) => own(m.text()), timeout: 30_000 });
    // The PDF of this compile follows the drawn pages; the next keystroke waits for it.
    const settled = page.waitForEvent('console', { predicate: (m) => m.text().startsWith('[compiler] engine:'), timeout: 30_000 }).catch(() => undefined);
    t0 = Date.now();
    await page.keyboard.type('x');
    const line = (await seen).text();
    times.push(Date.now() - t0);
    const m = /drawn page (\d+) after (\d+) ms/.exec(line);
    if (m) {
      pageNo = Number(m[1]);
      shipped.push(Number(m[2]));
    }
    await settled;
  }
  return { ms: median(times), page: pageNo, shippedMs: shipped.length ? median(shipped) : 0 };
}

test.describe('drawn pages', () => {
  test.skip(!hasLocalTexTree(), 'needs a local TeX Live (backend/latex-texlive/install.sh)'); // NOSONAR: conditional skip, reason given
  test.skip(({ isMobile }) => isMobile, 'desktop layout only'); // NOSONAR: conditional per-device skip, reason given

  test('[editor] drawn pages by default; caret, clicks and typing work; the switch shows the exact PDF', async ({ page }) => {
    test.setTimeout(300_000);
    const editor = await openEditor(page, BODY);
    await expect(editor.locator('.drawn-pages canvas').first()).toBeVisible();
    await expect(editor.getByRole('radio', { name: await t(page, 'exercises.editor.previewDrawn') })).toHaveAttribute('aria-checked', 'true');

    // The code editor's cursor shows as a caret on the drawn page; a click left of it moves it; typing there edits the LaTeX.
    await cursorAt(page, editor, COLUMN);
    const atMaus = await caretBox(editor);
    await page.mouse.click(atMaus.x - 60, atMaus.y + atMaus.height / 2);
    await expect.poll(async () => Math.round((await caretBox(editor)).x)).not.toBe(Math.round(atMaus.x));
    await cursorAt(page, editor, COLUMN);
    const again = await caretBox(editor);
    await page.mouse.click(again.x - 0.75, again.y + again.height / 2);
    await page.keyboard.type('§');
    await expect.poll(() => readCodeMirror(editor)).toContain('und die M§aus sieht');

    const drawn = await keystrokeLatency(page, editor, '[preview] drawn page');

    // The exact PDF: EmbedPDF takes over, with the caret too.
    await editor.getByRole('radio', { name: await t(page, 'exercises.editor.previewExact') }).click();
    await expect(editor.locator('.embed-pdf-viewer embedpdf-container').first()).toBeVisible({ timeout: 30_000 });
    await cursorAt(page, editor, COLUMN);
    await caretBox(editor);
    const exact = await keystrokeLatency(page, editor, '[preview] swap');
    console.log(`single exercise, keystroke to page shown (median): drawn pages ${drawn.ms} ms (page ${drawn.page} drawn ${drawn.shippedMs} ms after the compile started), exact PDF ${exact.ms} ms`);
  });

  test('[editor] an edit on the third page of three redraws that page', async ({ page }) => {
    test.setTimeout(300_000);
    const pages = [BODY, String.raw`\newpage`, 'Seite zwei.', String.raw`\newpage`, 'Seite drei, hier wird getippt.'].join('\n');
    const editor = await openEditor(page, pages);
    await expect(editor.locator('.drawn-pages [data-page="3"] canvas')).toBeVisible({ timeout: 60_000 });
    const drawn = await keystrokeLatency(page, editor, '[preview] drawn page');
    expect(drawn.page).toBe(3);
    await editor.getByRole('radio', { name: await t(page, 'exercises.editor.previewExact') }).click();
    await expect(editor.locator('.embed-pdf-viewer embedpdf-container').first()).toBeVisible({ timeout: 30_000 });
    const exact = await keystrokeLatency(page, editor, '[preview] swap');
    console.log(`three pages, edit on page 3, keystroke to page shown (median): drawn pages ${drawn.ms} ms (page ${drawn.page} drawn ${drawn.shippedMs} ms after the compile started), exact PDF ${exact.ms} ms`);
  });

  test('[editor] a page with an included PDF shows from the PDF', async ({ page }) => {
    test.setTimeout(300_000);
    const editor = await openEditor(page, `${BODY}\n\n\\includegraphics[width=3cm]{example-image-a.pdf}`);
    const first = editor.locator('.drawn-pages [data-page="1"]');
    await expect(first.locator('img')).toBeVisible({ timeout: 60_000 });
    await expect(first.locator('canvas')).toHaveCount(0);
  });
});
