/** Click-to-source (issue #347): a click on a word in the exercise editor's preview puts the LaTeX cursor on that word. The fake server answers a synced compile with a one-word PDF and SyncTeX pointing at the line that holds the word (`tests/helpers/fakeApi.ts`, `SYNC_WORD`). */
import { test, expect } from './helpers/guards';
import { exerciseEditor, readCodeMirror, setCodeMirror, signInFirstTime, t } from './helpers/flows';
import { gotoExerciseLibrary } from './helpers/nav';
import { SYNC_WORD, SYNC_WORD_AT } from '../tests/helpers/fakeApi';

test.describe('editor preview', () => {
  // The two-pane preview with its page images is the desktop layout; touch devices tap the same code path.
  test.skip(({ isMobile }) => isMobile, 'desktop layout only');

  test('[editor] a click on a word in the preview moves the cursor to that word', async ({ page }) => {
    await signInFirstTime(page);
    await gotoExerciseLibrary(page);
    await page.getByRole('button', { name: await t(page, 'exercises.page.createButton') }).click();
    const editor = await exerciseEditor(page);
    await expect(editor).toBeVisible();

    const body = [String.raw`\begin{Aufgabe}{Klick}`, 'Erste Zeile', `Zweite ${SYNC_WORD} Zeile`, String.raw`\end{Aufgabe}`].join('\n');
    await setCodeMirror(page, editor, body, 0);
    await editor.getByRole('button', { name: await t(page, 'exercises.editor.previewButton') }).click();

    // EmbedPDF's page image lives in an open shadow root, which Playwright locators pierce.
    const pageImage = editor.getByRole('img', { name: await t(page, 'common.pdfPage') }).first();
    await expect(pageImage).toBeVisible();
    const box = await pageImage.boundingBox();
    if (!box) throw new Error('the preview page has no box');
    const scale = box.width / 595.28;
    await page.mouse.click(box.x + (SYNC_WORD_AT.x + 10) * scale, box.y + (SYNC_WORD_AT.y - 4) * scale);

    // The click took the focus to the PDF; the jump (pdf.js reads the word first) gives it back to the code editor.
    await expect(editor.locator('.cm-editor.cm-focused')).toBeVisible();
    // The cursor sits right before the word: typing lands there.
    await page.keyboard.type('§');
    await expect.poll(() => readCodeMirror(editor)).toContain(`Zweite §${SYNC_WORD} Zeile`);
  });
});
