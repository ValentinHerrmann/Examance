// Create the demo exams and compile the scanned ones (blank PDF + OMR template) in the browser.
import fs from 'node:fs';
import path from 'node:path';
import { open, login, shot, BASE, STATE, readState, writeState } from './lib.mjs';

const EXAMS = JSON.parse(fs.readFileSync(new URL('./data/exams.json', import.meta.url), 'utf8'));
const ids = readState('exams.json', {});
const { ctx, page } = await open({ profile: 'berger' });
await login(page, 'berger');

for (const e of EXAMS) {
  if (ids[e.key]) continue;
  await page.goto(BASE + '/exam/new');
  await page.waitForTimeout(3000);
  await page.getByLabel(/Prüfungstitel/).fill(e.title);
  await page.getByLabel(/^Testart/).fill(e.testart);
  await page.getByLabel(/^Jahrgangsstufe/).fill(e.grade);
  await page.getByLabel(/^Klasse \/ Kurs/).fill(e.klasse);
  await page.getByLabel(/^Nummer/).fill(e.nr);
  await page.getByLabel(/^Datum/).fill(e.datum);
  await page.getByLabel(/Lehrer Nachname/).fill('Berger');
  await page.getByRole('button', { name: /Aus Bibliothek/ }).click();
  const search = page.getByRole('textbox', { name: /Aufgabenbibliothek nach Name/ });
  for (const [name, variant] of e.free) {
    await search.fill(variant ? `${variant}` : name);
    await page.waitForTimeout(600);
    const boxes = page.getByRole('checkbox', { name: /Zur Prüfung hinzufügen/ });
    await boxes.first().check();
  }
  await search.fill('');
  if (e.mc.length) {
    await page.getByRole('button', { name: /MC-Gruppen/ }).click();
    for (const n of e.mc) {
      await search.fill(n);
      await page.waitForTimeout(600);
      await page.getByRole('checkbox', { name: /MC-Sammelbereich/ }).first().check();
    }
    await page.getByLabel(/Titel der MC-Gruppe/).fill('Grundwissen');
    await page.getByRole('button', { name: /MC-Gruppe zur Prüfung hinzufügen/ }).click();
    await search.fill('');
  }
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: /Prüfung speichern & fortfahren/ }).click();
  await page.waitForURL((u) => /\/exam\/[^/]+$/.test(u.pathname) && !u.pathname.endsWith('/new'), { timeout: 60000 });
  ids[e.key] = page.url().split('/exam/')[1];
  writeState('exams.json', ids);
  console.log('exam', e.key, ids[e.key]);
  await page.waitForTimeout(2000);
}

for (const e of EXAMS.filter((x) => x.scan)) {
  const pdf = path.join(STATE, `exam-${e.key}.pdf`);
  if (fs.existsSync(pdf)) continue;
  await page.goto(`${BASE}/exam/${ids[e.key]}`);
  await page.waitForTimeout(4000);
  await page.getByRole('button', { name: /Live-Vorschau PDF/ }).click();
  await page.getByText(/OMR-Vorlage gespeichert/).waitFor({ timeout: 300000 });
  await page.waitForTimeout(3000);
  const [d] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.getByText('Herunterladen', { exact: true }).first().click()]);
  await d.saveAs(pdf);
  console.log('compiled', e.key);
}
await ctx.close();
