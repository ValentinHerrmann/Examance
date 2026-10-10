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
    await page.getByLabel(/Lehrer Nachname/).fill('Berger');
    await page.getByRole('button', { name: /Aus Bibliothek/ }).click();
    const search = page.getByRole('textbox', { name: /Aufgabenbibliothek nach Name/ });
    for (const n of ['Gruppe A', 'Bubblesort', 'Klassendiagramm']) {
      await search.fill(n);
      await page.waitForTimeout(600);
      await page.getByRole('checkbox', { name: /Zur Prüfung hinzufügen/ }).first().check();
    }
    await search.fill('');
    await page.waitForTimeout(800);
    await scrollTo(page, page.getByText(/2\. Aufgaben auswählen/), 70);
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
    await page.getByText('Q1', { exact: true }).first().click();
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
    await go(page, '/settings/security');
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

await teacher();
await colleague();
await onboarding();
await admin();
