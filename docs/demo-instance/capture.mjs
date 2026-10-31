// Capture the pitch screenshots from the seeded demo instance into .state/shots/.
// Usage: node capture.mjs [name ...]   (no names = all). assets.py crops them into docs/screenshots/pitch/.
import { open, login, shot, BASE, readState, writeState, setCodeMirror } from './lib.mjs';

const ids = readState('exams.json', {});
const only = process.argv.slice(2);
const want = (n) => !only.length || only.includes(n);

/** Scroll the app's single scroller so `locator` sits near the top. */
async function scrollTo(page, locator, offset = 90) {
  await locator.first().evaluate((el, off) => {
    const main = document.querySelector('.app-main');
    main.scrollTo(0, el.getBoundingClientRect().top + main.scrollTop - off);
  }, offset);
  await page.waitForTimeout(600);
}

// The MC group is listed first on the grade page, so the free exercises Q1-Q3 are Q2-Q4; the label itself opens the exercise editor, so click the row's padding.
const pick = (page, q) => page.locator('div[role=button]').filter({ has: page.getByText(q, { exact: true }) }).first().click({ position: { x: 3, y: 3 } });

async function go(page, path, wait = 4500) {
  await page.goto(BASE + path);
  await page.waitForTimeout(wait);
}

async function teacher() {
  const { ctx, page } = await open({ profile: 'berger' });
  await login(page, 'berger');

  if (want('dashboard')) {
    await go(page, '/');
    await shot(page, 'dashboard');
  }
  if (want('library')) {
    await go(page, '/exercises');
    await page.getByRole('heading', { name: 'Binärzahlen umrechnen', level: 3 }).click();
    await page.waitForTimeout(1500);
    await shot(page, 'library');
  }
  if (want('editor')) {
    await go(page, '/exercises');
    await page.getByRole('heading', { name: 'Bubblesort nachvollziehen', level: 3 }).click();
    await page.waitForTimeout(1200);
    await page.getByRole('button', { name: /^Bearbeiten$/ }).first().click();
    await page.waitForTimeout(2000);
    const ed = page.getByRole('dialog').last();
    await ed.getByRole('button', { name: /Live-Vorschau PDF/ }).click();
    for (let k = 0; k < 30 && (await page.getByText(/Kompiliert/).count()); k++) await page.waitForTimeout(3000);
    for (const pane of ['Aufgabe PDF']) {
      const t = ed.getByText(pane, { exact: true });
      if (await t.count()) { await t.first().click(); await page.waitForTimeout(2500); }
    }
    await page.waitForTimeout(25000);
    await shot(page, 'editor');
    await page.keyboard.press('Escape');
  }
  if (want('editor-mc')) {
    await go(page, '/exercises');
    await page.getByRole('heading', { name: 'Personenbezogene Daten', level: 3 }).click();
    await page.waitForTimeout(1200);
    await page.getByRole('button', { name: /^Bearbeiten$/ }).first().click();
    await page.waitForTimeout(2500);
    await shot(page, 'editor-mc');
    await page.keyboard.press('Escape');
  }
  if (want('exam-new')) {
    await go(page, '/exam/new');
    await page.getByLabel(/Prüfungstitel/).fill('Leistungsnachweis Informatik 10c');
    await page.getByLabel(/^Klasse \/ Kurs/).fill('c');
    await page.getByLabel(/Lehrernachname/).fill('Berger');
    // Current UI: the exam is created first and the library picker opens on its page (delete the exam afterwards).
    await page.getByRole('button', { name: /Prüfung anlegen und Aufgaben wählen/ }).click();
    const search = page.getByRole('textbox', { name: /Aufgabenbibliothek nach Name/ });
    for (const n of ['Gruppe A', 'Bubblesort', 'Klassendiagramm']) {
      await search.fill(n);
      await page.waitForTimeout(600);
      await page.getByRole('checkbox', { name: /Zur Prüfung hinzufügen/ }).first().check();
    }
    await search.fill('');
    await page.waitForTimeout(800);
    await shot(page, 'exam-new');
  }
  if (want('exam-setup')) {
    await go(page, `/exam/${ids['10b']}`);
    await page.getByRole('button', { name: /Live-Vorschau PDF/ }).click();
    await page.getByText(/OMR-Vorlage gespeichert/).waitFor({ timeout: 300000 });
    const sol = page.getByText('Lösung PDF', { exact: true });
    if (await sol.count()) await sol.first().click();
    await page.waitForTimeout(5000);
    await shot(page, 'exam-setup');
  }
  if (want('scan')) {
    await go(page, `/exam/${ids['10b']}/scan`);
    await shot(page, 'scan');
  }
  if (want('grading')) {
    await go(page, `/exam/${ids['10b']}/grade`, 6000);
    for (let i = 0; i < 6; i++) { await page.getByRole('button', { name: /Nächster/ }).click(); await page.waitForTimeout(2000); }
    await pick(page, 'Q2');
    await page.waitForTimeout(800);
    await shot(page, 'grading');
  }
  if (want('mc-review')) {
    await page.setViewportSize({ width: 1600, height: 1200 });
    await go(page, `/exam/${ids['10b']}/verify`, 6000);
    await page.getByRole('button', { name: /Stichprobe/ }).first().click();
    await page.waitForTimeout(5000);
    await shot(page, 'mc-review');
    await page.setViewportSize({ width: 1600, height: 1000 });
  }
  if (want('results')) {
    await go(page, `/exam/${ids['10b']}/stats`, 6000);
    await shot(page, 'results');
  }
  if (want('paper')) {
    await go(page, `/exam/${ids['9c']}/manual`, 5000);
    await shot(page, 'paper');
  }
  if (want('analytics')) {
    await go(page, '/analytics', 7000);
    await shot(page, 'analytics');
    await scrollTo(page, page.getByText(/Schwierigkeits- & Fairnessvergleich/), 120);
    await shot(page, 'analytics-variants');
  }
  if (want('settings')) {
    await go(page, '/settings');
    await shot(page, 'settings');
  }
  if (want('security')) {
    await go(page, '/settings#security');
    await shot(page, 'security');
  }
  if (want('shared')) {
    await go(page, '/exercises');
    await page.getByRole('button', { name: /Von anderen geteilt/ }).or(page.getByRole('tab', { name: /Von anderen geteilt/ })).first().click();
    await page.waitForTimeout(2500);
    await page.getByRole('heading', { name: 'Türme von Hanoi', level: 3 }).click();
    await page.waitForTimeout(1500);
    await shot(page, 'shared');
  }
  await ctx.close();
}

async function colleague() {
  if (!want('share-confirm') && !want('proposal')) return;
  const { ctx, page } = await open({ profile: 'yilmaz' });
  await login(page, 'yilmaz');
  if (want('share-confirm')) {
    await go(page, '/exercises');
    await page.getByRole('button', { name: /Neue Aufgabe erstellen/ }).first().click();
    const ed = page.getByRole('dialog').last();
    await ed.waitFor();
    await ed.getByLabel(/^Name \*$/).fill('Struktogramm lesen');
    await ed.getByLabel(/^Thema \*$/).fill('Algorithmen');
    await ed.getByLabel(/^Klasse$/).fill('9');
    await ed.getByLabel(/^Fach$/).fill('Informatik');
    await setCodeMirror(page, ed, '\\begin{Aufgabe}{Struktogramme}\nGib an, welchen Wert die Variable \\texttt{summe} nach Ablauf des Struktogramms hat. \\BE \\BE\n\\end{Aufgabe}', 0);
    await ed.getByLabel(/Mit allen Konten teilen/).check();
    await page.waitForTimeout(800);
    await shot(page, 'share-confirm');
    await page.keyboard.press('Escape');
  }
  if (want('proposal')) {
    await go(page, '/exercises');
    await page.getByRole('button', { name: /Vorschläge/ }).or(page.getByRole('tab', { name: /Vorschläge/ })).first().click();
    await page.waitForTimeout(2500);
    await shot(page, 'proposals');
    await page.getByRole('button', { name: /^Prüfen/ }).first().click();
    await page.waitForTimeout(2500);
    await shot(page, 'proposal');
  }
  await ctx.close();
}

async function onboarding() {
  // Needs an account that has never signed in; reset.sh creates one ("weber").
  if (!want('onboarding') || readState('progress.json', {}).onboarded) return;
  const { ctx, page } = await open({ profile: 'weber' });
  const acc = (await import('./lib.mjs')).ACCOUNTS.weber;
  await page.goto(BASE + '/unlock');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2500);
  await page.getByLabel(/^(E-Mail|Email)$/).fill(acc.email);
  await page.getByLabel(/^(Passwort|Password)$/).fill(acc.password);
  await page.getByRole('button', { name: /(Verbinden|Connect)/ }).click();
  await page.waitForTimeout(5000);
  await shot(page, 'onboarding-2fa');
  await login(page, 'weber', { formDone: true });
  await page.waitForTimeout(2500);
  await shot(page, 'onboarding-storage');
  writeState('progress.json', { ...readState('progress.json', {}), onboarded: true });
  await ctx.close();
}

async function admin() {
  if (!['admin-accounts', 'admin-approvals', 'admin-domains'].some(want)) return;
  const { ctx, page } = await open({ profile: 'admin' });
  await login(page, 'admin');
  await go(page, '/admin/users');
  for (const [tab, name] of [['Konten', 'admin-accounts'], ['Freigaben', 'admin-approvals'], ['Domains', 'admin-domains']]) {
    if (!want(name)) continue;
    await page.getByRole('tab', { name: new RegExp('^' + tab) }).or(page.getByRole('button', { name: new RegExp('^' + tab) })).first().click();
    await page.waitForTimeout(1500);
    await shot(page, name);
  }
  await ctx.close();
}

/** Narrower window for the UI tour posters: larger text once printed. Saved as tour-<name>.png. */
async function tour() {
  const T = ['variant-diff', 'editor', 'editor-mc', 'exam-new', 'exam-setup', 'grading', 'mc-review', 'paper', 'results', 'analytics-variants', 'library', 'proposal'];
  if (!T.some((n) => want('tour-' + n))) return;
  const { ctx, page } = await open({ profile: 'berger', width: 1280, height: 800 });
  await login(page, 'berger');
  const t = (n) => want('tour-' + n);
  if (t('editor')) {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await go(page, '/exercises');
    await page.getByRole('heading', { name: 'Bubblesort nachvollziehen', level: 3 }).click();
    await page.waitForTimeout(1200);
    await page.getByRole('button', { name: /^Bearbeiten$/ }).first().click();
    await page.waitForTimeout(2000);
    const ed = page.getByRole('dialog').last();
    await ed.getByRole('button', { name: /Live-Vorschau PDF/ }).click();
    for (let k = 0; k < 30 && (await page.getByText(/Kompiliert/).count()); k++) await page.waitForTimeout(3000);
    for (const pane of ['Aufgabe PDF']) {
      const p = ed.getByText(pane, { exact: true });
      if (await p.count()) { await p.first().click(); await page.waitForTimeout(2500); }
    }
    await page.waitForTimeout(25000);
    await shot(page, 'tour-editor');
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 1280, height: 800 });
  }
  if (t('editor-mc')) {
    await go(page, '/exercises');
    await page.getByRole('heading', { name: 'Personenbezogene Daten', level: 3 }).click();
    await page.waitForTimeout(1200);
    await page.getByRole('button', { name: /^Bearbeiten$/ }).first().click();
    await page.waitForTimeout(2500);
    await page.getByRole('dialog').last().locator('.overflow-y-auto, [class*=overflow-auto]').first().evaluate((el) => el.scrollTo(0, 260)).catch(() => {});
    await page.waitForTimeout(800);
    await shot(page, 'tour-editor-mc');
    await page.keyboard.press('Escape');
  }
  if (t('exam-new')) {
    await go(page, '/exam/new');
    await page.getByLabel(/Prüfungstitel/).fill('Leistungsnachweis Informatik 10c');
    await page.getByRole('button', { name: /Prüfung anlegen und Aufgaben wählen/ }).click();
    const search = page.getByRole('textbox', { name: /Aufgabenbibliothek nach Name/ });
    for (const n of ['Gruppe A', 'Bubblesort', 'Klassendiagramm']) {
      await search.fill(n);
      await page.waitForTimeout(600);
      await page.getByRole('checkbox', { name: /Zur Prüfung hinzufügen/ }).first().check();
    }
    await search.fill('');
    await page.waitForTimeout(800);
    await shot(page, 'tour-exam-new');
  }
  if (t('exam-setup')) {
    await page.setViewportSize({ width: 1280, height: 1100 });
    await go(page, `/exam/${ids['10b']}`);
    await page.getByRole('button', { name: /Live-Vorschau PDF/ }).click();
    await page.getByText(/OMR-Vorlage gespeichert/).waitFor({ timeout: 300000 });
    const sol = page.getByText('Lösung PDF', { exact: true });
    if (await sol.count()) await sol.first().click();
    await page.waitForTimeout(6000);
    await scrollTo(page, page.getByText(/LaTeX-Prüfungskompilierung/), 20);
    await shot(page, 'tour-exam-setup');
    await page.setViewportSize({ width: 1280, height: 800 });
  }
  if (t('grading')) {
    // Booklet af14… (plan 3 / 4 / 2.5), zoomed onto tasks 1-2. With stamps a task's score is the sum of its
    // stamps, so the stamps (set once, persisted) cover Q1-Q3 and add up to the plan.
    await go(page, `/exam/${ids['10b']}/scan`, 8000);
    const subId = await page.locator('td[title^="Pseudonym: af14e273c5"]').locator('xpath=ancestor::tr[1]').locator('td[title^="Abgabe-ID: "]').getAttribute('title');
    const open1 = async () => {
      await go(page, `/exam/${ids['10b']}/grade?submissionId=${subId.replace('Abgabe-ID: ', '')}`, 9000);
      for (let i = 0; i < 3; i++) { await page.getByRole('button', { name: /Vergrößern/ }).first().click(); await page.waitForTimeout(500); }
      await page.mouse.move(600, 500);
      await page.mouse.wheel(0, 330);
      await page.waitForTimeout(1500);
    };
    await open1();
    const progress = readState('progress.json', {});
    if (!progress['tour-stamps']) {
      const stamp = async (q, tool, pts) => {
        await pick(page, q);
        await page.getByRole('button', { name: tool }).first().click();
        for (const [x, y] of pts) { await page.mouse.click(x, y); await page.waitForTimeout(400); }
      };
      const ONE = /^\+1\.0|\+1,0/, HALF = /^\+0\.5|\+0,5|½/;
      await stamp('Q2', ONE, [[448, 166], [275, 234], [358, 337]]);
      await stamp('Q3', ONE, [[262, 526], [262, 558], [262, 589]]);
      await page.mouse.move(600, 500); await page.mouse.wheel(0, 120); await page.waitForTimeout(1200);
      await stamp('Q3', ONE, [[540, 613]]);
      await page.mouse.click(611, 721); await page.waitForTimeout(3000); // next page
      await stamp('Q4', ONE, [[506, 256], [602, 290]]);
      await stamp('Q4', HALF, [[640, 322]]);
      await page.getByRole('button', { name: /Note & Anmerkungen speichern/ }).click();
      await page.waitForTimeout(3000);
      writeState('progress.json', { ...progress, 'tour-stamps': true });
      await open1();
      const v = [];
      for (const q of ['Q2', 'Q3', 'Q4']) v.push(await page.getByText(q, { exact: true }).first().locator('xpath=ancestor::*[.//input][1]').locator('input').first().inputValue()); // NOSONAR: UI steps run in order in one browser
      console.log('af14 scores after stamping', v.join(' / '));
    }
    await shot(page, 'tour-grading');
  }
  if (t('results')) {
    await go(page, `/exam/${ids['10b']}/stats`, 6000);
    await shot(page, 'tour-results');
  }
  if (t('analytics-variants')) {
    await go(page, '/analytics', 7000);
    await scrollTo(page, page.getByText(/Schwierigkeits- & Fairnessvergleich/), 20);
    await shot(page, 'tour-analytics-variants');
  }
  if (t('variant-diff')) {
    await go(page, '/exercises');
    await page.getByRole('heading', { name: 'Binärzahlen umrechnen', level: 3 }).click();
    await page.waitForTimeout(1500);
    await page.getByRole('button', { name: /^Bearbeiten$/ }).first().locator('xpath=following-sibling::*[1]').click();
    await page.waitForTimeout(800);
    await page.getByText('LaTeX-Diff vergleichen').first().click();
    await page.waitForTimeout(3000);
    await shot(page, 'tour-variant-diff');
    await page.keyboard.press('Escape');
  }
  if (t('library')) {
    await go(page, '/exercises');
    await page.getByRole('heading', { name: 'Binärzahlen umrechnen', level: 3 }).click();
    await page.waitForTimeout(1500);
    await shot(page, 'tour-library');
  }
  await ctx.close();
  if (t('mc-review')) {
    // Showcase booklet (mkscans.py CFG.showcase). Narrow window: the page stacks the scan crop above the
    // answer panel at full width, so the crop is large in a genuine screenshot.
    const c = await open({ profile: 'berger', width: 760, height: 1150, scale: 3 });
    await login(c.page, 'berger');
    await go(c.page, `/exam/${ids['10b']}/verify`, 7000);
    const item = c.page.locator('div, li').filter({ hasText: 'Y5QYAD' }).filter({ has: c.page.getByRole('link', { name: /Element überprüfen/ }) }).last();
    await item.getByRole('link', { name: /Element überprüfen/ }).first().click();
    await c.page.waitForTimeout(15000);
    await shot(c.page, 'tour-mc-review');
    await c.ctx.close();
  }
  if (t('paper')) {
    // Narrow window: the points column holds one number.
    const c = await open({ profile: 'berger', width: 900, height: 800 });
    await login(c.page, 'berger');
    await go(c.page, `/exam/${ids['9c']}/manual`, 5000);
    await shot(c.page, 'tour-paper');
    await c.ctx.close();
  }
  if (t('proposal')) {
    const c = await open({ profile: 'yilmaz', width: 1280, height: 800 });
    await login(c.page, 'yilmaz');
    await go(c.page, '/exercises');
    await c.page.getByRole('button', { name: /Vorschläge/ }).or(c.page.getByRole('tab', { name: /Vorschläge/ })).first().click();
    await c.page.waitForTimeout(2500);
    await c.page.getByRole('button', { name: /^Prüfen/ }).first().click();
    await c.page.waitForTimeout(2500);
    await shot(c.page, 'tour-proposal');
    await c.ctx.close();
  }
}

/** Detail screenshots for the user guide (docs/screenshots/guide/, cropped by assets.py). Saved as guide-<name>.png. */
async function guide() {
  const G = ['score', 'ai-prompt', 'compile-error', 'exam-exercises', 'exam-export', 'backup', 'help', 'settings-storage', 'settings-mc', 'settings-packages', 'security', 'borderline', 'maintenance'];
  if (!G.some((n) => want('guide-' + n))) return;
  const g = (n) => want('guide-' + n);
  const { ctx, page } = await open({ profile: 'berger' });
  await login(page, 'berger');
  const editExercise = async (name) => {
    await go(page, '/exercises');
    await page.getByRole('heading', { name, level: 3 }).click();
    await page.waitForTimeout(1200);
    await page.getByRole('button', { name: /^Bearbeiten$/ }).first().click();
    await page.waitForTimeout(2500);
    return page.getByRole('dialog').last();
  };
  if (g('score')) {
    const ed = await editExercise('Bubblesort nachvollziehen');
    await ed.getByRole('button', { name: /Punkte & Aufbau/ }).click();
    await page.waitForTimeout(1500);
    await shot(page, 'guide-score');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    await page.keyboard.press('Escape');
  }
  if (g('ai-prompt')) {
    const ed = await editExercise('Bubblesort nachvollziehen');
    await ed.getByRole('button', { name: /KI-Prompt erstellen/ }).click();
    await page.waitForTimeout(1500);
    await shot(page, 'guide-ai-prompt');
    await page.keyboard.press('Escape');
  }
  if (g('compile-error')) {
    // An unknown macro in an unsaved edit; the dialog is closed without saving.
    const ed = await editExercise('Caesar-Verschlüsselung');
    const cm = ed.locator('.cm-content').first();
    await cm.click();
    await page.keyboard.press('Control+End');
    await page.keyboard.insertText('\n\\Lsungsfeld{3}');
    await ed.getByRole('button', { name: /Live-Vorschau PDF/ }).click();
    await page.getByText(/Wahrscheinliche Ursache/).first().waitFor({ timeout: 900000 });
    await page.waitForTimeout(3000);
    await shot(page, 'guide-compile-error');
  }
  if (g('exam-exercises')) {
    await go(page, `/exam/${ids['10b']}`);
    await scrollTo(page, page.getByText(/^Aufgaben \(\d+\)$/), 110);
    await shot(page, 'guide-exam-exercises');
  }
  if (g('exam-export')) {
    await go(page, `/exam/${ids['10b']}`);
    await page.getByRole('button', { name: /^Exportieren$/ }).click();
    await page.waitForTimeout(2000);
    await shot(page, 'guide-exam-export');
    await page.keyboard.press('Escape');
  }
  if (g('backup')) {
    await go(page, '/');
    await page.getByRole('button', { name: /^Arbeitsbereich$/ }).click();
    await page.waitForTimeout(800);
    await page.getByText(/Arbeitsbereich sichern oder teilen/).first().click();
    await page.waitForTimeout(2000);
    await shot(page, 'guide-backup');
    await page.keyboard.press('Escape');
  }
  if (g('help')) {
    await go(page, `/exam/${ids['10b']}/scan`);
    await page.getByRole('button', { name: 'Hilfe öffnen' }).first().click();
    await page.waitForTimeout(2000);
    await shot(page, 'guide-help');
    await page.keyboard.press('Escape');
  }
  // The settings section nav scrolls the page itself.
  for (const [name, link] of [['settings-storage', 'Globale Speicherstrategie'], ['settings-mc', 'MC-Erkennung (OMR) feinjustieren'], ['settings-packages', 'LaTeX-Pakete'], ['security', 'Anmeldung & Sicherheit']]) {
    if (!g(name)) continue;
    await go(page, '/settings'); // NOSONAR: UI steps run in order in one browser
    await page.getByRole('link', { name: link, exact: true }).first().click(); // NOSONAR: UI steps run in order in one browser
    await page.waitForTimeout(1200); // NOSONAR: UI steps run in order in one browser
    await shot(page, 'guide-' + name); // NOSONAR: UI steps run in order in one browser
  }
  if (g('borderline')) {
    await page.setViewportSize({ width: 1600, height: 1400 });
    await go(page, `/exam/${ids['10b']}/stats`, 6000);
    await scrollTo(page, page.getByText(/^Plus: höchstens/), 160);
    await shot(page, 'guide-borderline');
    await page.setViewportSize({ width: 1600, height: 1000 });
  }
  await ctx.close();
  if (g('maintenance')) {
    const c = await open({ profile: 'admin' });
    await login(c.page, 'admin');
    await c.page.goto(BASE + '/admin/users');
    await c.page.waitForTimeout(4500);
    await c.page.getByRole('tab', { name: /^Wartung/ }).or(c.page.getByRole('button', { name: /^Wartung/ })).first().click();
    await c.page.waitForTimeout(1500);
    await shot(c.page, 'guide-maintenance');
    await c.ctx.close();
  }
}

if (only.some((n) => n.startsWith('guide'))) { await guide(); process.exit(0); }
if (only.some((n) => n.startsWith('tour')) || !only.length) await tour();
if (only.some((n) => n.startsWith('tour'))) process.exit(0);
await teacher();
await colleague();
await onboarding();
await admin();
await guide();
