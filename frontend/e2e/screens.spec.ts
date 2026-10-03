/**
 * @screens - full-page screenshots for the manual visual review. No
 * assertions. Skipped by default; run with
 *   npx playwright test --grep @screens
 * Output: test-results/screens/<project>/<theme>-<name>.png
 */
import { test } from './helpers/guards';
import { label } from './helpers/i18n';
import { openHelp, openStoragePolicy } from './helpers/nav';
import { exerciseEditor } from './helpers/flows';
import { THEMES, mainRoutes, pinTheme, seedWorkspace, visit } from './helpers/seed';

const PROJECTS = ['desktop', 'laptop-150', 'ipad-portrait', 'ipad-landscape', 'phone'];

for (const theme of THEMES) {
  test(`@screens screenshots (${theme})`, async ({ page }) => {
    const project = test.info().project.name;
    test.skip(!PROJECTS.includes(project), 'screens run on the review devices only');
    await pinTheme(page, theme);
    const examId = await seedWorkspace(page);
    const shot = (name: string) => `test-results/screens/${project}/${theme}-${name}.png`;

    for (const route of mainRoutes(examId)) {
      await visit(page, route.path);
      await page.screenshot({ path: shot(route.name), fullPage: true });
    }

    await visit(page, '/');
    const help = await openHelp(page);
    await page.screenshot({ path: shot('modal-help') });
    await page.keyboard.press('Escape');
    await help.waitFor({ state: 'hidden' });

    const storage = await openStoragePolicy(page);
    await page.screenshot({ path: shot('modal-storage') });
    await page.keyboard.press('Escape');
    await storage.waitFor({ state: 'hidden' });

    await visit(page, '/exercises');
    await page.getByRole('button', { name: label('exercises.page.createButton', undefined, 'en') }).click();
    const editor = await exerciseEditor(page);
    await editor.waitFor();
    await page.waitForTimeout(800);
    await page.screenshot({ path: shot('modal-exercise-editor') });
    await page.keyboard.press('Escape');

    await visit(page, `/exam/${examId}`);
    await page.getByRole('button', { name: label('exam.actionBar.addExercises', undefined, 'en') }).click();
    await page.getByRole('dialog', { name: label('exam.libraryModal.header', undefined, 'en') }).waitFor();
    await page.screenshot({ path: shot('modal-exam-library') });
  });
}
