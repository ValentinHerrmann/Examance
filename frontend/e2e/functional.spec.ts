/**
 * Functional regression suite: asserts behaviour and data, never layout or visuals, so UI redesigns only touch
 * `helpers/nav.ts`. Texts come from the i18n catalogs (`helpers/i18n.ts`); LaTeX compilation is never awaited or
 * asserted. Titles are tagged by area (`-g "\[exam\]"`).
 */
import { test, expect } from './helpers/guards';
import { label, labelExact, literal, rawTemplate, stem } from './helpers/i18n';
import {
  createExam,
  createExercise,
  createExerciseInLibrary,
  currentExamId,
  exerciseBody,
  exerciseGroupHeading,
  expandExerciseGroup,
  expectDashboard,
  groupEditButton,
  openExamFromDashboard,
  searchExerciseLibrary,
  setCodeMirror,
  signInAgain,
  signInFirstTime,
  t,
} from './helpers/flows';
import {
  clearWorkspace,
  exportWorkspace,
  gotoDashboard,
  gotoExamTab,
  gotoExerciseLibrary,
  gotoLegal,
  gotoSettings,
  helpDialog,
  importWorkspace,
  lockApp,
  openHelp,
  openHelpWithKeyboard,
  openStoragePolicy,
  switchLocale,
} from './helpers/nav';

/* -------------------------------------------------------------------------- */
/* 1. Authentication                                                           */
/* -------------------------------------------------------------------------- */

test.describe('auth', () => {
  test('[auth] sign in, lock and sign in again keeps the data', async ({ page }) => {
    await signInFirstTime(page);

    // Something to find again after the lock.
    await createExerciseInLibrary(page, { name: 'Persisted exercise', topic: 'Auth' });
    await gotoDashboard(page);
    await expectDashboard(page);

    await lockApp(page);
    // Locked: the sign-in form is back, with no setup codes this time.
    await expect(page.getByLabel(await t(page, 'auth.unlock.cloud.email'))).toBeVisible();

    // A locked session must not reach protected pages.
    await page.goto('/exercises');
    await expect(page).toHaveURL((url) => url.pathname === '/unlock');

    // The stored key envelopes open the vault again (the fake echoes them back unchanged).
    await signInAgain(page);
    await gotoExerciseLibrary(page);
    await expect(exerciseGroupHeading(page, 'Persisted exercise')).toBeVisible();
  });

  test('[auth] unauthenticated visits are sent to the unlock page', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL((url) => url.pathname === '/unlock');
    await expect(page.getByRole('heading', { name: await t(page, 'auth.unlock.title') })).toBeVisible();
    await page.goto('/exam/new');
    await expect(page).toHaveURL((url) => url.pathname === '/unlock');
  });
});

test.describe('auth, first storage choice', () => {
  // An account that has not chosen where its results live: the first sign-in must ask.
  test.use({ storageMode: null });

  for (const mode of ['all-server', 'hybrid'] as const) {
    test(`[auth] first sign-in asks for a storage mode and remembers ${mode}`, async ({ page, backend }) => {
      await signInFirstTime(page, { waitForDashboard: false });

      // The choice cannot be dismissed: no close button, and Escape leaves it open.
      const choice = page.getByRole('dialog', { name: await t(page, 'storagePolicy.choice.title') });
      await expect(choice).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(choice).toBeVisible();
      await expect(choice.getByRole('button', { name: labelExact('common.close') })).toHaveCount(0);

      // Picking a mode opens the move dialog; with nothing to move it just records the choice.
      const title = mode === 'all-server' ? 'misc.storageModal.allServerTitle' : 'misc.storageModal.hybridTitle';
      await choice.getByRole('radio', { name: await t(page, title) }).click();
      const wizard = page.getByRole('dialog', { name: await t(page, 'storagePolicy.switch.title', { to: '' }) });
      await expect(wizard).toBeVisible();
      await wizard
        .getByRole('button', { name: await t(page, 'storagePolicy.switch.chooseButton', { to: '' }) })
        .click();
      await expect.poll(() => backend.state.storageMode).toBe(mode);

      await wizard.getByRole('button', { name: await t(page, 'storagePolicy.switch.finish') }).click();
      await expectDashboard(page);
      await expect(page.getByRole('dialog', { name: await t(page, 'storagePolicy.choice.title') })).toHaveCount(0);

      // The server remembers the choice: a reload does not ask again.
      await page.reload();
      await expectDashboard(page);
      await expect(page.getByRole('dialog', { name: await t(page, 'storagePolicy.choice.title') })).toHaveCount(0);
    });
  }
});

/* -------------------------------------------------------------------------- */
/* 2. Exercises                                                                */
/* -------------------------------------------------------------------------- */

test.describe('exercises', () => {
  test('[exercises] create, filter, edit, add a variant and delete', async ({ page }) => {
    await signInFirstTime(page);
    await gotoExerciseLibrary(page);

    // Empty state first: the library offers to create the first exercise.
    await expect(page.getByText(await t(page, 'exercises.groupList.empty'))).toBeVisible();
    await createExercise(
      page,
      {
        name: 'Alpha Lists',
        topic: 'Lists',
        grade: '10',
        subject: 'Informatik',
        latex: exerciseBody('Alpha original body', 3),
      },
      'emptyState',
    );
    await expect(page.getByText(await t(page, 'exercises.groupList.empty'))).toHaveCount(0);
    await createExercise(page, {
      name: 'Beta Graphs',
      topic: 'Graphs',
      latex: exerciseBody('Beta body', 2),
    });
    await expect(exerciseGroupHeading(page, 'Alpha Lists')).toBeVisible();
    await expect(exerciseGroupHeading(page, 'Beta Graphs')).toBeVisible();

    // Search narrows the list, a non-matching query empties it, clearing restores it.
    await searchExerciseLibrary(page, 'Beta');
    await expect(exerciseGroupHeading(page, 'Beta Graphs')).toBeVisible();
    await expect(exerciseGroupHeading(page, 'Alpha Lists')).toHaveCount(0);
    await searchExerciseLibrary(page, 'no such exercise anywhere');
    await expect(page.getByText(await t(page, 'exercises.groupList.empty'))).toBeVisible();
    await searchExerciseLibrary(page, '');
    await expect(exerciseGroupHeading(page, 'Alpha Lists')).toBeVisible();
    await expect(exerciseGroupHeading(page, 'Beta Graphs')).toBeVisible();

    // Edit the body through the editor; the change shows in the list preview.
    await expandExerciseGroup(page, 'Alpha Lists');
    const editButton = page
      .getByRole('button', { name: await t(page, 'exercises.groupList.editExerciseTitle') })
      .or(page.getByTitle(await t(page, 'exercises.groupList.editExerciseTitle')));
    await editButton.first().click();
    const editor = page.getByRole('dialog', { name: await t(page, 'exercises.editor.titleEdit', { name: 'Alpha Lists' }) });
    await expect(editor).toBeVisible();
    await setCodeMirror(page, editor, exerciseBody('Alpha edited body', 4), 0);
    await editor.getByRole('button', { name: await t(page, 'exercises.editor.saveButton') }).click();
    await expect(editor).toBeHidden();

    // Rename the group (the title lives on the group, not in the exercise editor).
    await (await groupEditButton(page, 'Alpha Lists')).click();
    const groupDialog = page.getByRole('dialog', { name: await t(page, 'exercises.groupEditModal.title') });
    await groupDialog.getByLabel(await t(page, 'exercises.groupEditModal.nameLabel')).fill('Alpha Renamed');
    await groupDialog.getByRole('button', { name: await t(page, 'exercises.groupEditModal.saveButton') }).click();
    await expect(groupDialog).toBeHidden();
    await expect(exerciseGroupHeading(page, 'Alpha Renamed')).toBeVisible();
    await expect(exerciseGroupHeading(page, 'Alpha Lists')).toHaveCount(0);

    // Both changes persist across a reload.
    await page.reload();
    await expect(exerciseGroupHeading(page, 'Alpha Renamed')).toBeVisible();
    await expandExerciseGroup(page, 'Alpha Renamed');
    await expect(page.getByRole('main')).toContainText('Alpha edited body');

    // Add a variant: the group now reports two variants.
    await page
      .getByRole('button', { name: await t(page, 'exercises.groupList.createVariantTitle') })
      .or(page.getByTitle(await t(page, 'exercises.groupList.createVariantTitle')))
      .first()
      .click();
    const variantDialog = page.getByRole('dialog', { name: await t(page, 'exercises.variantModal.title') });
    await expect(variantDialog).toBeVisible();
    await variantDialog.getByLabel(await t(page, 'exercises.variantModal.keyLabel')).fill('Furniture');
    await variantDialog.getByRole('button', { name: await t(page, 'exercises.variantModal.saveButton') }).click();
    await expect(variantDialog).toBeHidden();
    await expect(page.getByText(await t(page, 'exercises.groupList.variantCountPlural', { count: 2 }))).toBeVisible();

    // Delete the other exercise through the confirm dialog.
    await expandExerciseGroup(page, 'Beta Graphs');
    await page
      .getByRole('button', { name: await t(page, 'exercises.groupList.deleteTitle') })
      .or(page.getByTitle(await t(page, 'exercises.groupList.deleteTitle')))
      .last()
      .click();
    const deleteDialog = page.getByRole('dialog', { name: await t(page, 'exercises.deleteModal.title', { name: 'Beta Graphs' }) });
    await expect(deleteDialog).toBeVisible();
    await deleteDialog.getByRole('button', { name: await t(page, 'exercises.deleteModal.deleteAnyway') }).click();
    await expect(deleteDialog).toBeHidden();
    await expect(exerciseGroupHeading(page, 'Beta Graphs')).toHaveCount(0);

    await page.reload();
    await expect(exerciseGroupHeading(page, 'Alpha Renamed')).toBeVisible();
    await expect(exerciseGroupHeading(page, 'Beta Graphs')).toHaveCount(0);
  });

  test('[exercises] a multiple-choice exercise validates and saves', async ({ page }) => {
    await signInFirstTime(page);
    await gotoExerciseLibrary(page);

    // Without a correct option the editor refuses to save.
    await page.getByRole('button', { name: await t(page, 'exercises.page.createButton') }).click();
    const editor = page.getByRole('dialog', { name: await t(page, 'exercises.editor.titleCreate') });
    await editor.getByLabel(await t(page, 'exercises.editor.nameLabel')).fill('MC validation');
    await editor.getByRole('button', { name: await t(page, 'exercises.editor.mcButton') }).click();
    await editor.getByRole('button', { name: await t(page, 'exercises.editor.saveButton') }).click();
    await expect(editor.getByText(await t(page, 'exercises.editor.mcCorrectRequired'))).toBeVisible();
    await expect(editor).toBeVisible();
    await editor.getByRole('button', { name: await t(page, 'common.cancel') }).click();
    // Nothing was typed that differs from the defaults except the name, so the
    // discard confirmation may or may not appear; confirm it if it does.
    const discard = page.getByRole('dialog', { name: await t(page, 'exercises.editor.discardTitle') });
    if (await discard.isVisible()) {
      await discard.getByRole('button', { name: await t(page, 'exercises.confirmDiscard.confirmText') }).click();
    }
    await expect(editor).toBeHidden();

    // A valid MC exercise is saved and listed with its type.
    await createExercise(page, {
      name: 'MC saved',
      topic: 'Choice',
      mc: {
        question: 'Which one is right?',
        options: [{ text: 'Right', correct: true }, { text: 'Wrong' }, { text: 'Also wrong' }],
      },
    });
    await expect(exerciseGroupHeading(page, 'MC saved')).toBeVisible();
  });
});

/* -------------------------------------------------------------------------- */
/* 3. Exams                                                                    */
/* -------------------------------------------------------------------------- */

test.describe('exam', () => {
  test('[exam] create from exercises and an MC group, and the links survive a reload', async ({
    page,
  }) => {
    await signInFirstTime(page);
    await gotoExerciseLibrary(page);
    await createExercise(page, { name: 'Free A', topic: 'T1', latex: exerciseBody('Free A body', 3) });
    await createExercise(page, { name: 'Free B', topic: 'T2', latex: exerciseBody('Free B body', 2) });
    await createExercise(page, {
      name: 'MC One',
      topic: 'T3',
      mc: { question: 'Pick the right one', options: [{ text: 'opt a', correct: true }, { text: 'opt b' }] },
    });
    await createExercise(page, {
      name: 'MC Two',
      topic: 'T3',
      mc: {
        question: 'Pick again',
        options: [{ text: 'x', correct: true }, { text: 'y' }, { text: 'z' }],
      },
    });

    await gotoDashboard(page);
    await createExam(page, {
      title: 'Exam with MC group',
      exercises: ['Free A', 'Free B'],
      mcGroups: [{ title: 'Basics', members: ['MC One', 'MC Two'] }],
    });

    const expectLinked = async () => {
      const main = page.getByRole('main');
      await expect(main.getByText('Free A').first()).toBeVisible();
      await expect(main.getByText('Free B').first()).toBeVisible();
      await expect(main.getByText(await t(page, 'exam.exerciseList.mcGroupLabel', { title: 'Basics' })).first()).toBeVisible();
      // Group members are listed under their group.
      await expect(main.getByText('MC One').first()).toBeVisible();
      await expect(main.getByText('MC Two').first()).toBeVisible();
      await expect(
        page.getByRole('heading', { name: stem('exam.exerciseList.heading') }),
      ).toContainText('3');
    };
    await expectLinked();

    await page.reload();
    await expectLinked();

    // The dashboard lists the new exam and opens it again.
    await gotoDashboard(page);
    await openExamFromDashboard(page, 'Exam with MC group');
    await expectLinked();
  });

  test('[exam] edit the metadata and link another exercise from the library', async ({ page }) => {
    await signInFirstTime(page);
    await gotoExerciseLibrary(page);
    await createExercise(page, { name: 'Linked first', topic: 'L', latex: exerciseBody('first', 2) });
    await createExercise(page, { name: 'Linked second', topic: 'L', latex: exerciseBody('second', 2) });
    await gotoDashboard(page);
    await createExam(page, { title: 'Original title', exercises: ['Linked first'] });
    const examId = currentExamId(page);

    // --- metadata modal ---
    await page.getByRole('button', { name: labelExact('exam.actionBar.edit') }).click();
    const metadata = page.getByRole('dialog', { name: await t(page, 'exam.metadataEditor.heading') });
    await expect(metadata).toBeVisible();
    await metadata.getByLabel(await t(page, 'exam.metadataEditor.examTitle')).fill('Renamed title');
    await metadata.getByRole('button', { name: labelExact('common.save') }).click();
    await expect(metadata).toBeHidden();

    await page.reload();
    await expect(page.getByRole('heading', { name: literal('Renamed title') })).toBeVisible();
    await expect(page.getByRole('heading', { name: literal('Original title') })).toHaveCount(0);

    // --- exam library modal ---
    await page.getByRole('button', { name: await t(page, 'exam.actionBar.addExercises') }).click();
    const library = page.getByRole('dialog', { name: await t(page, 'exam.libraryModal.header') });
    await expect(library).toBeVisible();
    await library
      .getByRole('textbox', { name: await t(page, 'exercises.libraryPicker.searchPlaceholder') })
      .fill('Linked second');
    const addBox = library.getByRole('checkbox', {
      name: await t(page, 'exercises.libraryPicker.checkboxAddToExam'),
    });
    await expect(addBox).toHaveCount(1);
    await addBox.check();
    await library.getByRole('button', { name: await t(page, 'exam.libraryModal.applyButton') }).click();
    await expect(library).toBeHidden();

    const main = page.getByRole('main');
    await expect(main.getByText('Linked first').first()).toBeVisible();
    await expect(main.getByText('Linked second').first()).toBeVisible();

    await page.reload();
    await expect(main.getByText('Linked second').first()).toBeVisible();
    expect(currentExamId(page)).toBe(examId);

    // The new title is what the dashboard shows.
    await gotoDashboard(page);
    await expect(page.getByRole('heading', { name: literal('Renamed title') })).toBeVisible();
  });

  test('[exam] every workflow tab renders its heading or empty state', async ({ page }) => {
    await signInFirstTime(page);
    await gotoExerciseLibrary(page);
    await createExercise(page, { name: 'Tab exercise', topic: 'Tabs', latex: exerciseBody('tab', 2) });
    await gotoDashboard(page);
    await createExam(page, { title: 'Tab exam', exercises: ['Tab exercise'] });

    await gotoExamTab(page, 'scan');
    await expect(page.getByRole('heading', { name: await t(page, 'scanning.pageTitle') })).toBeVisible();

    await gotoExamTab(page, 'verify');
    await expect(page.getByRole('heading', { name: await t(page, 'scanning.verify.heading') })).toBeVisible();

    await gotoExamTab(page, 'manual');
    await expect(page.getByRole('heading', { name: await t(page, 'grading.manual.container.title') })).toBeVisible();

    await gotoExamTab(page, 'stats');
    await expect(page.getByRole('heading', { name: await t(page, 'stats.page.title') })).toBeVisible();

    await gotoExamTab(page, 'setup');
    await expect(page.getByRole('heading', { name: literal('Tab exam') })).toBeVisible();

    await gotoExamTab(page, 'grade');
    await expect(page.getByText(await t(page, 'grading.page.empty'))).toBeVisible();
  });
});

/* -------------------------------------------------------------------------- */
/* 4. Settings                                                                 */
/* -------------------------------------------------------------------------- */

test.describe('settings', () => {
  test('[settings] changing the language switches the UI and survives a reload', async ({ page }) => {
    await signInFirstTime(page);
    await gotoSettings(page);
    await expect(page.getByRole('heading', { name: label('settings.pageTitle', undefined, 'en') })).toBeVisible();

    // Through the shell toggle.
    await switchLocale(page, 'de');
    await expect(page.getByRole('heading', { name: label('settings.pageTitle', undefined, 'de') })).toBeVisible();
    await expect(page.getByRole('heading', { name: label('settings.pageTitle', undefined, 'en') })).toHaveCount(0);

    await page.reload();
    await expect(page.getByRole('heading', { name: label('settings.pageTitle', undefined, 'de') })).toBeVisible();

    // Other pages follow: the dashboard heading is German as well.
    await gotoDashboard(page);
    await expect(page.getByRole('heading', { name: label('dashboard.header.title', undefined, 'de') })).toBeVisible();

    // And back through the radio group on the settings page itself.
    await gotoSettings(page);
    await page.getByRole('radio', { name: 'English' }).check();
    await expect(page.getByRole('heading', { name: label('settings.pageTitle', undefined, 'en') })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: label('settings.pageTitle', undefined, 'en') })).toBeVisible();
    expect(rawTemplate('settings.pageTitle', 'de')).not.toBe(rawTemplate('settings.pageTitle', 'en'));
  });
});

/* -------------------------------------------------------------------------- */
/* 5. Help and modals                                                          */
/* -------------------------------------------------------------------------- */

test.describe('help', () => {
  test('[help] opens from the status bar, navigates topics, searches and closes with Escape', async ({
    page,
  }) => {
    await signInFirstTime(page);
    const dialog = await openHelp(page);

    // The topic index and one topic's content.
    const topics = dialog.getByRole('navigation', { name: await t(page, 'help.ui.contents') });
    // On narrow screens the index is replaced by the open topic (the panel
    // preselects one); "back to overview" returns to it. Wide layouts show both.
    const back = dialog.getByRole('button', { name: stem('help.ui.backToOverview') });
    if (await back.isVisible()) await back.click();
    await expect(topics).toBeVisible();
    await topics.getByRole('button', { name: await t(page, 'help.topics.storageModes.title') }).click();
    await expect(
      dialog.getByRole('heading', { name: await t(page, 'help.topics.storageModes.s1.h') }),
    ).toBeVisible();
    if (await back.isVisible()) await back.click();
    await topics.getByRole('button', { name: await t(page, 'help.topics.privacy.title') }).click();
    await expect(
      dialog.getByRole('heading', { name: await t(page, 'help.topics.privacy.s1.h') }),
    ).toBeVisible();

    // Search filters the index; a miss says so.
    const search = dialog.getByRole('searchbox', { name: await t(page, 'help.ui.searchPlaceholder') });
    await search.fill('zzzz-no-such-help-topic');
    await expect(dialog.getByText(await t(page, 'help.ui.noResults', { query: 'zzzz-no-such-help-topic' }))).toBeVisible();
    await search.fill('');
    if (await back.isVisible()) await back.click();
    await expect(topics).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('[help] opens with F1 unless a text field has focus', async ({ page }) => {
    await signInFirstTime(page);

    const dialog = await openHelpWithKeyboard(page);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    // F1 toggles: a second press closes the panel again.
    await openHelpWithKeyboard(page);
    await page.keyboard.press('F1');
    await expect(await helpDialog(page)).toBeHidden();

    // "?" and F1 must not steal keystrokes from a text field (a LaTeX body can contain "?").
    await page.goto('/exam/new');
    const title = page.getByLabel(await t(page, 'examCreation.metadataForm.titleLabel'));
    await title.focus();
    await page.keyboard.press('F1');
    await expect(await helpDialog(page)).toBeHidden();
    await title.fill('what?');
    await expect(title).toHaveValue('what?');
    await expect(await helpDialog(page)).toBeHidden();
  });

  test('[help] the storage and privacy dialog opens and closes', async ({ page }) => {
    await signInFirstTime(page);
    const dialog = await openStoragePolicy(page);

    // The mocked account stores everything on the server; LaTeX compiles locally by default.
    await expect(dialog.getByRole('radio', { name: await t(page, 'misc.storageModal.allServerTitle') })).toBeChecked();
    await expect(dialog.getByRole('radio', { name: await t(page, 'misc.storageModal.latexLocalTitle') })).toBeChecked();

    // The dialog has a close icon and a footer button; either closes it.
    await dialog.getByRole('button', { name: labelExact('common.close') }).first().click();
    await expect(dialog).toBeHidden();

    await openStoragePolicy(page);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: await t(page, 'misc.storageModal.heading') })).toBeHidden();
  });
});

/* -------------------------------------------------------------------------- */
/* 6. Workspace round trip                                                     */
/* -------------------------------------------------------------------------- */

test.describe('workspace', () => {
  test('[workspace] export, clear and import restores exercises and exams', async ({
    page,
    dialogs,
    backend,
  }, testInfo) => {
    await signInFirstTime(page);
    await gotoExerciseLibrary(page);
    await createExercise(page, { name: 'Roundtrip exercise', topic: 'RT', latex: exerciseBody('rt', 2) });
    await gotoDashboard(page);
    await createExam(page, { title: 'Roundtrip exam', exercises: ['Roundtrip exercise'] });
    await gotoDashboard(page);
    await expect(page.getByRole('heading', { name: literal('Roundtrip exam') })).toBeVisible();

    // --- export ---
    const download = await exportWorkspace(page);
    expect(download.suggestedFilename()).toMatch(/\.bgproj$/);
    const archivePath = testInfo.outputPath('roundtrip.bgproj');
    await download.saveAs(archivePath);
    await dialogs.expectSeen('prompt', label('workspace.archive.promptExportPassword'));

    // --- clear ---
    // Clearing only empties this browser's tables; exams and exercises live on the server. Drop them
    // there too, so the import below has to bring them back.
    for (const table of [
      backend.state.exams,
      backend.state.exercises,
      backend.state.links,
      backend.state.mcGroups,
      backend.state.groups,
    ]) {
      table.clear();
    }
    await clearWorkspace(page);
    await dialogs.expectSeen('confirm', label('workspace.archive.confirmClear'));
    await dialogs.expectSeen('alert', label('workspace.archive.cleared'));
    await expect(page.getByRole('heading', { name: await t(page, 'dashboard.onboarding.welcome') })).toBeVisible();
    await expect(page.getByRole('heading', { name: literal('Roundtrip exam') })).toHaveCount(0);
    await gotoExerciseLibrary(page);
    await expect(exerciseGroupHeading(page, 'Roundtrip exercise')).toHaveCount(0);
    await gotoDashboard(page);

    // --- import ---
    await importWorkspace(page, archivePath);
    await dialogs.expectSeen('prompt', label('workspace.archive.promptImportPassword'));
    await dialogs.expectSeen(
      'alert',
      label('workspace.archive.summarySuccess', { loaded: '' }),
    );
    await expect(page.getByRole('heading', { name: literal('Roundtrip exam') })).toBeVisible();

    await openExamFromDashboard(page, 'Roundtrip exam');
    await expect(page.getByRole('main').getByText('Roundtrip exercise').first()).toBeVisible();
    await gotoExerciseLibrary(page);
    await expect(exerciseGroupHeading(page, 'Roundtrip exercise')).toBeVisible();
  });
});

/* -------------------------------------------------------------------------- */
/* 7. Legal pages                                                              */
/* -------------------------------------------------------------------------- */

test.describe('legal', () => {
  test('[legal] Impressum and privacy policy are reachable from the dashboard and the grade page', async ({
    page,
  }) => {
    await signInFirstTime(page);

    const expectLegalPages = async () => {
      await gotoLegal(page, 'impressum');
      await expect(
        page.getByRole('heading', { name: await t(page, 'legal.impressum.title'), level: 1 }),
      ).toBeVisible();
      await gotoLegal(page, 'datenschutz');
      await expect(
        page.getByRole('heading', { name: await t(page, 'legal.datenschutz.title'), level: 1 }),
      ).toBeVisible();
    };

    // From the dashboard.
    await expectLegalPages();
    await gotoDashboard(page);
    await expectDashboard(page);

    // From an exam's grade page (the route that hides the main header).
    await gotoExerciseLibrary(page);
    await createExercise(page, { name: 'Legal exercise', topic: 'Legal', latex: exerciseBody('legal', 1) });
    await gotoDashboard(page);
    await createExam(page, { title: 'Legal exam', exercises: ['Legal exercise'] });
    await gotoExamTab(page, 'grade');
    await expect(page.getByText(await t(page, 'grading.page.empty'))).toBeVisible();
    await expectLegalPages();
  });
});

/* -------------------------------------------------------------------------- */
/* 8. Public pages                                                             */
/* -------------------------------------------------------------------------- */

test.describe('public', () => {
  test('[public] forgot-password renders without a session', async ({ page }) => {
    await page.goto('/forgot-password');
    await expect(page.getByRole('heading', { name: await t(page, 'auth.forgotPassword.title') })).toBeVisible();
    await expect(page.getByLabel(await t(page, 'auth.forgotPassword.emailLabel'))).toBeVisible();
    await expect(page.getByRole('button', { name: await t(page, 'auth.forgotPassword.sendLink') })).toBeVisible();
    await expect(page.getByRole('link', { name: await t(page, 'auth.forgotPassword.backToUnlock') })).toBeVisible();
    // Public: no redirect to the unlock page.
    await expect(page).toHaveURL((url) => url.pathname === '/forgot-password');
  });

  test('[public] reset-password renders without a session and explains the missing token', async ({
    page,
  }) => {
    await page.goto('/reset-password');
    await expect(page.getByRole('heading', { name: await t(page, 'auth.resetPassword.title') })).toBeVisible();
    await expect(page.getByText(await t(page, 'auth.resetPassword.errors.tokenMissingOnLoad'))).toBeVisible();
    await expect(page.getByRole('button', { name: await t(page, 'auth.resetPassword.setPassword') })).toBeDisabled();
    await expect(page).toHaveURL((url) => url.pathname === '/reset-password');
  });

  test('[public] the manual and the legal pages are readable while locked', async ({ page }) => {
    await page.goto('/help');
    await expect(page.getByRole('heading', { name: await t(page, 'help.ui.manualTitle'), level: 1 })).toBeVisible();
    await page.goto('/legal/impressum');
    await expect(page.getByRole('heading', { name: await t(page, 'legal.impressum.title'), level: 1 })).toBeVisible();
    await page.goto('/legal/datenschutz');
    await expect(page.getByRole('heading', { name: await t(page, 'legal.datenschutz.title'), level: 1 })).toBeVisible();
  });
});
