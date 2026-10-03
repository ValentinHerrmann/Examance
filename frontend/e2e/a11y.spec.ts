/**
 * Accessibility scan (axe-core) of every main route in both themes, on the
 * desktop and phone projects. Serious and critical violations fail the test.
 */
import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './helpers/guards';
import { THEMES, mainRoutes, pinTheme, seedWorkspace, visit } from './helpers/seed';

/** Third-party widgets we cannot fix: pdf.js canvas/text layer and CodeMirror's generated unlabeled contenteditable. */
const THIRD_PARTY = ['.cm-editor', '.pdf-viewer canvas', '.textLayer'];

for (const theme of THEMES) {
  test(`[a11y] main routes have no serious or critical violations (${theme})`, async ({ page }) => {
    test.skip(!['desktop', 'phone'].includes(test.info().project.name), 'a11y runs on desktop and phone only');
    await pinTheme(page, theme);
    const examId = await seedWorkspace(page);

    const failures: string[] = [];
    for (const route of mainRoutes(examId)) {
      await visit(page, route.path);
      let builder = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);
      for (const selector of THIRD_PARTY) builder = builder.exclude(selector);
      const { violations } = await builder.analyze();
      for (const v of violations.filter((x) => x.impact === 'serious' || x.impact === 'critical')) {
        failures.push(
          `${route.name} [${v.impact}] ${v.id}: ${v.help} -> ${v.nodes
            .slice(0, 3)
            .map((n) => n.target.join(' '))
            .join(' | ')} (${v.nodes.length} nodes)`,
        );
      }
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });
}
