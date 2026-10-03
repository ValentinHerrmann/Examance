/**
 * Shared user flows for the e2e suite: create a vault, unlock it, create
 * exercises and exams. Specs compose these so they stay short and so a change
 * to a form has one place to be fixed.
 *
 * These flows drive page CONTENT (forms, lists, dialogs); anything that goes
 * through the application shell is delegated to `nav.ts`. Selectors are role /
 * label / catalog-text based. Where the app gives no better handle (the
 * CodeMirror editor) the workaround is isolated in a helper and commented.
 */
import type { Locator, Page } from '@playwright/test';
import { expect } from './guards';
import { label, labelExact, literal, type Locale } from './i18n';
import { currentLocale, gotoExerciseLibrary } from './nav';

/** Passphrase used for every test vault (12+ characters are required). */
export const VAULT_PASSPHRASE = 'correct horse battery staple 42';

/* -------------------------------------------------------------------------- */
/* Small shared helpers                                                        */
/* -------------------------------------------------------------------------- */

/** Catalog label in the language the app currently shows. */
async function l(page: Page, key: string, vars?: Record<string, string | number>): Promise<RegExp> {
  return label(key, vars, await currentLocale(page));
}

async function lx(page: Page, key: string, vars?: Record<string, string | number>): Promise<RegExp> {
  return labelExact(key, vars, await currentLocale(page));
}

/**
 * Replace the content of a CodeMirror 6 editor.
 *
 * CodeMirror renders a contenteditable `.cm-content` with no label, role or
 * test id, so this is the one place the suite relies on its class name (the
 * brief allows it for CodeMirror). Select-all + insertText is used instead of
 * per-key typing: it is faster and immune to the editor's key handling.
 *
 * @param scope  Container of exactly the editor to fill (e.g. a dialog).
 * @param index  Which editor inside the scope, when there are several.
 */
export async function setCodeMirror(
  page: Page,
  scope: Locator,
  value: string,
  index = 0,
): Promise<void> {
  const content = scope.locator('.cm-content').nth(index);
  await content.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText(value);
  // Wait until CodeMirror has applied the change before the caller saves.
  await expect(content).toContainText(value.split('\n')[0].trim().slice(0, 40));
}

/** Read the text content of a CodeMirror editor. */
export async function readCodeMirror(scope: Locator, index = 0): Promise<string> {
  return (await scope.locator('.cm-content').nth(index).innerText()).replace(/\u00a0/g, ' ');
}

/* -------------------------------------------------------------------------- */
/* Vault                                                                       */
/* -------------------------------------------------------------------------- */

/** The dashboard's main heading. */
export async function dashboardHeading(page: Page): Promise<Locator> {
  return page.getByRole('heading', { name: await l(page, 'dashboard.header.title') });
}

export async function expectDashboard(page: Page): Promise<void> {
  await expect(page).toHaveURL((url) => url.pathname === '/');
  await expect(await dashboardHeading(page)).toBeVisible();
}

/**
 * Create the local (all-local) vault on a fresh browser profile. The page ends
 * on the empty dashboard.
 */
export async function createVault(page: Page, passphrase = VAULT_PASSPHRASE): Promise<void> {
  await page.goto('/unlock');
  await page.getByLabel(await l(page, 'auth.unlock.local.choosePassphrase')).fill(passphrase);
  await page.getByLabel(await l(page, 'auth.unlock.local.repeatPassphrase')).fill(passphrase);
  await page.getByRole('button', { name: await l(page, 'auth.unlock.local.createWorkspace') }).click();
  await expectDashboard(page);
}

/**
 * Unlock the existing local vault on `/unlock`. Used after locking or after a
 * reload that dropped the session.
 */
export async function unlockVault(page: Page, passphrase = VAULT_PASSPHRASE): Promise<void> {
  await page.getByLabel(await l(page, 'auth.unlock.local.workspacePassphrase')).fill(passphrase);
  await page.getByRole('button', { name: await l(page, 'auth.unlock.local.unlockWorkspace') }).click();
  await expectDashboard(page);
}

/* -------------------------------------------------------------------------- */
/* Exercises                                                                   */
/* -------------------------------------------------------------------------- */

export interface McOption {
  text: string;
  correct?: boolean;
}

export interface ExerciseSpec {
  name: string;
  topic?: string;
  grade?: string;
  subject?: string;
  /** LaTeX body of a free-text exercise. */
  latex?: string;
  /** When set the exercise is a multiple-choice question. */
  mc?: { question: string; options: McOption[] };
}

/**
 * LaTeX body for a free-text exercise. The app scores an exercise by counting
 * `\BE` marks (`lib/latex/scoreParser.ts`), so `points` full-point marks give
 * the exercise exactly that many points. `marker` is plain text a test can
 * search for in the list preview.
 */
export function exerciseBody(marker: string, points = 3): string {
  return `\\begin{Aufgabe}{${marker}}\n${marker}\n${'\\BE '.repeat(points).trim()}\n\\end{Aufgabe}`;
}

/** The exercise editor dialog (create, edit and new-version all use it). */
export async function exerciseEditor(page: Page): Promise<Locator> {
  // The accessible name is "Create new exercise" / "Edit exercise: <name>" / "New version: <name>".
  return page.getByRole('dialog', {
    name: new RegExp(
      [
        (await l(page, 'exercises.editor.titleCreate')).source,
        (await l(page, 'exercises.editor.titleEdit')).source,
        (await l(page, 'exercises.editor.titleNewVersion')).source,
      ].join('|'),
      'i',
    ),
  });
}

/**
 * Create an exercise through the editor dialog. Must be called on the exercise
 * library page (use {@link createExerciseInLibrary} otherwise); ends there with
 * the dialog closed.
 */
export async function createExercise(
  page: Page,
  spec: ExerciseSpec,
  via: 'header' | 'emptyState' = 'header',
): Promise<void> {
  const trigger = via === 'header' ? 'exercises.page.createButton' : 'exercises.groupList.createFirst';
  await page.getByRole('button', { name: await l(page, trigger) }).click();
  const editor = await exerciseEditor(page);
  await expect(editor).toBeVisible();

  await editor.getByLabel(await lx(page, 'exercises.editor.nameLabel')).fill(spec.name);
  if (spec.topic) await editor.getByLabel(await l(page, 'exercises.editor.topicLabel')).fill(spec.topic);
  if (spec.grade) await editor.getByLabel(await lx(page, 'exercises.editor.gradeLabel')).fill(spec.grade);
  if (spec.subject) {
    await editor.getByLabel(await l(page, 'exercises.editor.subjectLabel')).fill(spec.subject);
  }

  if (spec.mc) {
    await editor.getByRole('button', { name: await l(page, 'exercises.editor.mcButton') }).click();
    // First editor = question text; the second one is the assembled LaTeX.
    await setCodeMirror(page, editor, spec.mc.question, 0);

    // The structured editor starts with a default option set; make it match.
    const optionInputs = editor.getByPlaceholder(
      await l(page, 'exercises.editor.mcOptionPlaceholder', { number: '' }),
    );
    const add = editor.getByRole('button', { name: await l(page, 'exercises.editor.mcAddOptionButton') });
    while ((await optionInputs.count()) < spec.mc.options.length) await add.click();
    const correctBoxes = editor.getByRole('checkbox', {
      name: await l(page, 'exercises.editor.mcOptionCorrectTitle'),
    });
    for (let i = 0; i < spec.mc.options.length; i++) {
      await optionInputs.nth(i).fill(spec.mc.options[i].text);
      const box = correctBoxes.nth(i);
      if ((await box.isChecked()) !== Boolean(spec.mc.options[i].correct)) await box.click();
    }
  } else {
    await setCodeMirror(page, editor, spec.latex ?? exerciseBody(`Body of ${spec.name}`), 0);
  }

  await editor.getByRole('button', { name: await l(page, 'exercises.editor.saveButton') }).click();
  await expect(editor).toBeHidden();
  await expect(exerciseGroupHeading(page, spec.name)).toBeVisible();
}

/** Open the library, then {@link createExercise}. */
export async function createExerciseInLibrary(page: Page, spec: ExerciseSpec): Promise<void> {
  if (new URL(page.url()).pathname !== '/exercises') await gotoExerciseLibrary(page);
  await createExercise(page, spec);
}

/** The heading of one exercise group row in the library list. */
export function exerciseGroupHeading(page: Page, name: string): Locator {
  return page.getByRole('heading', { name: literal(name), level: 3 });
}

/**
 * Type into the exercise-library search. Below the `lg` breakpoint the filters
 * live in a drawer behind a "Show filters" button; this opens and closes it as
 * needed so callers do not care about the layout.
 */
export async function searchExerciseLibrary(page: Page, query: string): Promise<void> {
  const locale = await currentLocale(page);
  const search = page.getByRole('textbox', {
    name: label('exercises.filterSidebar.searchPlaceholder', undefined, locale),
  });
  if (await search.isVisible()) {
    await search.fill(query);
    return;
  }
  await page.getByRole('button', { name: label('exercises.page.showFilters', undefined, locale) }).click();
  const drawer = page.getByRole('dialog', { name: label('exercises.page.filtersTitle', undefined, locale) });
  await expect(drawer).toBeVisible();
  await drawer
    .getByRole('textbox', { name: label('exercises.filterSidebar.searchPlaceholder', undefined, locale) })
    .fill(query);
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
}

/** Expand an exercise group so its actions are reachable. */
export async function expandExerciseGroup(page: Page, name: string): Promise<void> {
  const collapsed = page.getByRole('button', { name: literal(name), expanded: false });
  if ((await collapsed.count()) > 0) {
    // Click the title, not the middle of the header: on narrower layouts the
    // header's centre is occupied by its own "edit group" icon button.
    await exerciseGroupHeading(page, name).click();
  }
  await expect(page.getByRole('button', { name: literal(name), expanded: true })).toBeVisible();
}

/**
 * The "edit group metadata" icon button of one exercise group. The group header
 * is itself a button whose text contains that label, hence the exact name and
 * the scoping to the group's own header.
 */
export async function groupEditButton(page: Page, groupName: string): Promise<Locator> {
  const locale = await currentLocale(page);
  const header = page.getByRole('button', { name: literal(groupName) }).first();
  return header.getByRole('button', {
    name: labelExact('exercises.groupList.editGroupAriaLabel', undefined, locale),
  });
}

/* -------------------------------------------------------------------------- */
/* Exams                                                                       */
/* -------------------------------------------------------------------------- */

export interface ExamSpec {
  title: string;
  /** Names of free-text exercises (library) to add. */
  exercises: string[];
  /** MC groups to build from MC questions, by exercise name. */
  mcGroups?: { title?: string; members: string[] }[];
  /** `\Lehrernachname`; the field is required by the form. */
  teacher?: string;
}

/** Narrow a library picker (exam creation / exam library modal) to one exercise. */
async function filterPicker(page: Page, scope: Locator, query: string): Promise<void> {
  await scope
    .getByRole('textbox', { name: await l(page, 'exercises.libraryPicker.searchPlaceholder') })
    .fill(query);
}

/**
 * Tick the single exercise the picker is currently narrowed to.
 * `checkboxKey` is the catalog key of the checkbox tooltip (add vs. stage).
 */
async function tickOnlyMatch(page: Page, scope: Locator, checkboxKey: string): Promise<void> {
  const box = scope.getByRole('checkbox', { name: await l(page, checkboxKey) });
  await expect(box).toHaveCount(1);
  await box.check();
}

/**
 * Create an exam on `/exam/new` from library exercises and optional MC groups,
 * save it and wait for the exam page. Exercises must already exist.
 */
export async function createExam(page: Page, spec: ExamSpec): Promise<void> {
  await page.getByRole('link', { name: await l(page, 'dashboard.header.createButton') }).click();
  await page.waitForURL((url) => url.pathname === '/exam/new');

  await page.getByLabel(await l(page, 'examCreation.metadataForm.titleLabel')).fill(spec.title);
  await page
    .getByLabel(await l(page, 'examCreation.metadataForm.lehrerLabel'))
    .fill(spec.teacher ?? 'Tester');

  const selector = page;
  const libraryTab = page.getByRole('button', { name: await l(page, 'examCreation.exerciseSelector.tabLibrary') });
  await libraryTab.click();
  for (const name of spec.exercises) {
    await filterPicker(page, selector, name);
    await tickOnlyMatch(page, selector, 'exercises.libraryPicker.checkboxAddToExam');
  }
  if (spec.exercises.length > 0) await filterPicker(page, selector, '');

  for (const group of spec.mcGroups ?? []) {
    await page.getByRole('button', { name: await l(page, 'examCreation.exerciseSelector.tabMc') }).click();
    for (const member of group.members) {
      await filterPicker(page, selector, member);
      await tickOnlyMatch(page, selector, 'exercises.libraryPicker.checkboxAddMcStaging');
    }
    if (group.title) {
      await page.getByLabel(await l(page, 'exam.mcStagingPanel.titleLabel')).fill(group.title);
    }
    await page
      .getByRole('button', {
        name: await l(page, 'exam.mcStagingPanel.addButton', { count: group.members.length }),
      })
      .click();
    await filterPicker(page, selector, '');
  }

  await page.getByRole('button', { name: await l(page, 'examCreation.submit.saveAndContinue') }).click();
  await page.waitForURL((url) => /^\/exam\/[^/]+$/.test(url.pathname) && url.pathname !== '/exam/new');
  await expect(examTitleHeading(page, spec.title)).toBeVisible();
}

/** The exam title heading shown above the exam tab strip. */
export function examTitleHeading(page: Page, title: string): Locator {
  return page.getByRole('heading', { name: literal(title) });
}

/** The exam id from the current `/exam/<id>...` URL. */
export function currentExamId(page: Page): string {
  const id = /\/exam\/([^/?#]+)/.exec(new URL(page.url()).pathname)?.[1];
  if (!id || id === 'new') throw new Error(`not on an exam page: ${page.url()}`);
  return id;
}

/** Open an exam from the dashboard by its title. */
export async function openExamFromDashboard(page: Page, title: string): Promise<void> {
  await page.getByRole('button', { name: literal(title) }).click();
  await page.waitForURL((url) => /^\/exam\/[^/]+\/?$/.test(url.pathname));
  await expect(examTitleHeading(page, title)).toBeVisible();
}

/** Short alias so specs can build locale-specific regexes without importing i18n. */
export async function t(page: Page, key: string, vars?: Record<string, string | number>): Promise<RegExp> {
  return l(page, key, vars);
}

export type { Locale };
