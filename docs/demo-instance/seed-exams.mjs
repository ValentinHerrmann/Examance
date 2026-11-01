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
  await page.getByLabel(/^Prüfungsnummer/).fill(e.nr);
  await page.getByLabel(/^Datum/).fill(e.datum);
  await page.getByLabel(/Lehrernachname/).fill('Berger');
  if (e.mcHint) await page.getByLabel(/wie man ein Kreuz korrigiert/).check();
  // Current UI: "Neue Prüfung" saves the exam and opens the library picker on the exam page.
  await page.getByRole('button', { name: /Prüfung anlegen und Aufgaben wählen/ }).click(); // NOSONAR: UI steps run in order in one browser
  await page.waitForURL((u) => /\/exam\/[^/]+$/.test(u.pathname) && !u.pathname.endsWith('/new'), { timeout: 60000 });
  ids[e.key] = page.url().split('/exam/')[1].split('?')[0];
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
  await page.getByRole('button', { name: /Verknüpfte Aufgaben übernehmen/ }).click(); // NOSONAR: UI steps run in order in one browser
  await page.waitForTimeout(2500); // NOSONAR: UI steps run in order in one browser
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
  await page.getByText(/Scan-Vorlage gespeichert/).waitFor({ timeout: 300000 });
  await page.waitForTimeout(3000);
  // The download link points at a blob URL; read it in the page instead of relying on a browser download.
  const href = await page.getByRole('link', { name: 'Herunterladen' }).first().getAttribute('href'); // NOSONAR: UI steps run in order in one browser
  const b64 = await page.evaluate(async (u) => { // NOSONAR: UI steps run in order in one browser
    const bytes = new Uint8Array(await (await fetch(u)).arrayBuffer());
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCodePoint(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }, href);
  fs.writeFileSync(pdf, Buffer.from(b64, 'base64'));
  console.log('compiled', e.key);
}
await ctx.close();
