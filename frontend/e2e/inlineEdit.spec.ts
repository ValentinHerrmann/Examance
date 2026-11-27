/** Inline editing in the exercise editor's preview (issue #347), with the real browser engine: the code editor's cursor shows as a caret in the page, a click on the page puts the cursor on that character, and typing on the page goes into the LaTeX there. The fake API serves the TeX Live tree from a local install (`tests/helpers/fakeTexTree.ts`); without one the spec skips. */
import { test, expect } from './helpers/guards';
import { exerciseEditor, readCodeMirror, setCodeMirror, signInFirstTime, t } from './helpers/flows';
import { gotoExerciseLibrary } from './helpers/nav';
import { hasLocalTexTree } from '../tests/helpers/fakeTexTree';

const BODY = 'Die Katze sieht die Maus und die Maus sieht die Katze.';
/** Column of the second "Maus", plus one: between its M and a. */
const COLUMN = BODY.indexOf('Maus', BODY.indexOf('Maus') + 1) + 1;

test.describe('inline editing', () => {
  test.skip(!hasLocalTexTree(), 'needs a local TeX Live (backend/latex-texlive/install.sh)');
  test.skip(({ isMobile }) => isMobile, 'desktop layout only');

  test('[editor] the caret shows in the page, a click places it, typing on the page edits the LaTeX', async ({ page }) => {
    // Boots the engine and fetches its TeX files from the fake tree.
    test.setTimeout(300_000);
    await page.addInitScript(() => window.localStorage.setItem('bg_latex_compilation', 'local'));
    await signInFirstTime(page);
    await gotoExerciseLibrary(page);
    await page.getByRole('button', { name: await t(page, 'exercises.page.createButton') }).click();
    const editor = await exerciseEditor(page);
    await expect(editor).toBeVisible();
    await setCodeMirror(page, editor, BODY, 0);
    await editor.getByRole('button', { name: await t(page, 'exercises.editor.previewButton') }).click();
    await expect(editor.getByRole('img', { name: await t(page, 'common.pdfPage') }).first()).toBeVisible({ timeout: 240_000 });

    // The code editor's cursor between M and a of the second "Maus" shows as a caret in the page.
    await editor.locator('.cm-content').first().click();
    await page.keyboard.press('ControlOrMeta+Home');
    for (let i = 0; i < COLUMN; i++) await page.keyboard.press('ArrowRight');
    const caret = editor.getByTestId('pdf-caret').first();
    await expect(caret).toBeVisible();
    const box = await caret.boundingBox();
    if (!box) throw new Error('the caret has no box');

    // A click just left of the caret is on the right half of "M" at any zoom: the cursor goes after it, and the page keeps the keys.
    await page.mouse.click(box.x - 0.75, box.y + box.height / 2);
    await page.keyboard.type('§');
    await expect.poll(() => readCodeMirror(editor)).toContain('und die M§aus sieht');
    // The next PDF arrives with the caret after the new character.
    await expect(caret).toBeVisible();
  });
});
