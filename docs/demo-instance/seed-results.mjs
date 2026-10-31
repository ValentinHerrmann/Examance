// Import the synthetic scans, grade every booklet from the plan written by mkscans.py,
// annotate one showcase booklet, and enter the paper-graded class via the Excel paste import.
import fs from 'node:fs';
import path from 'node:path';
import { open, login, shot, BASE, STATE, readState, writeState } from './lib.mjs';

const ids = readState('exams.json', {});
const done = readState('progress.json', {});
const { ctx, page } = await open({ profile: 'berger' });
await login(page, 'berger');

for (const key of ['10b', '10a']) {
  if (done[`scanned-${key}`]) continue;
  await page.goto(`${BASE}/exam/${ids[key]}/scan`);
  await page.waitForTimeout(8000);
  await page.locator('#scanFiles').setInputFiles(path.join(STATE, `scan-${key}.pdf`));
  await page.getByText(/Fertig!/).waitFor({ timeout: 900000 });
  await page.waitForTimeout(3000);
  console.log('scanned', key, await page.getByText(/Eingelesene Scans \(\d+\)/).innerText());
  done[`scanned-${key}`] = true;
  writeState('progress.json', done);
}

// The MC group is listed first now (Q1 a-c), so the plan's free exercises q1-q3 are Q2-Q4 on the grade page.
const LABEL = { q1: 'Q2', q2: 'Q3', q3: 'Q4' };
// The row label itself opens the exercise editor; click the row's padding to set the stamp target.
const pick = (q) => page.locator('div[role=button]').filter({ has: page.getByText(q, { exact: true }) }).first().click({ position: { x: 3, y: 3 } });
const row = (q) => page.getByText(q, { exact: true }).first().locator('xpath=ancestor::*[.//input][1]').locator('input').first();
for (const key of ['10b', '10a']) {
  if (done[`graded-${key}`]) continue;
  const plan = JSON.parse(fs.readFileSync(path.join(STATE, `plan-${key}.json`), 'utf8'));
  await page.goto(`${BASE}/exam/${ids[key]}/grade`);
  await page.waitForTimeout(6000);
  const n = Object.keys(plan).length / 2;
  for (let i = 0; i < n; i++) {
    if (await page.getByText(/konnten nicht geladen werden/).count()) {
      await page.getByRole('button', { name: 'Erneut versuchen' }).click();
      await page.waitForTimeout(2500);
    }
    const header = (await page.locator('body').innerText()).split('Stift')[0];
    const pid = Object.keys(plan).find((p) => header.includes(p));
    if (!pid) throw new Error(`booklet ${i}: pseudonym not in plan`);
    for (const [q, v] of Object.entries(plan[pid].scores)) {
      const inp = row(LABEL[q]);
      await inp.click();
      await inp.fill(String(v));
      await inp.press('Tab');
    }
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: /Note & Anmerkungen speichern/ }).click();
    await page.waitForTimeout(1500);
    if (i < n - 1) {
      await page.getByRole('button', { name: /Nächster/ }).click();
      await page.waitForTimeout(2500);
    }
  }
  console.log('graded', key, n);
  done[`graded-${key}`] = true;
  writeState('progress.json', done);
}

if (!done.annotated) {
  // Showcase booklet: correction stamps on page 1 of a mid-range 10b paper.
  await page.goto(`${BASE}/exam/${ids['10b']}/grade`);
  await page.waitForTimeout(6000);
  for (let i = 0; i < 6; i++) { await page.getByRole('button', { name: /Nächster/ }).click(); await page.waitForTimeout(2000); }
  const tool = async (n) => { await page.getByRole('button', { name: n }).first().click(); await page.waitForTimeout(300); };
  const at = async (x, y) => { await page.mouse.click(x, y); await page.waitForTimeout(400); };
  const saved = {};
  for (const q of ['Q2', 'Q3', 'Q4']) saved[q] = await row(q).inputValue();
  await pick('Q2');
  await tool(/^\+1\.0|\+1,0/); await at(570, 289); await at(470, 343);
  await pick('Q3');
  await tool(/^\+1\.0|\+1,0/); await at(452, 508); await at(452, 528);
  await tool(/Fehlt/); await at(445, 548);
  await tool(/Falsch/); await at(600, 625);
  // Stamps rewrite the scores they touch; restore the planned ones.
  for (const q of ['Q2', 'Q3', 'Q4']) { const inp = row(q); await inp.fill(saved[q]); await inp.press('Tab'); }
  await pick('Q2');
  await page.getByRole('button', { name: /Note & Anmerkungen speichern/ }).click();
  await page.waitForTimeout(2000);
  done.annotated = true;
  writeState('progress.json', done);
}

if (!done.paper) {
  // 9c was graded on paper: names, IDs and points pasted from a spreadsheet.
  const tsv = fs.readFileSync(path.join(STATE, 'paper-9c.tsv'), 'utf8');
  await page.goto(`${BASE}/exam/${ids['9c']}/manual`);
  await page.waitForTimeout(5000);
  await page.getByRole('button', { name: /Aus Excel importieren/ }).click();
  const modal = page.getByRole('dialog').last();
  await modal.locator('textarea').fill(tsv);
  await page.waitForTimeout(500);
  await modal.getByRole('button', { name: /Weiter: Vorschau/ }).click();
  await page.waitForTimeout(1500);
  const auto = modal.getByLabel(/Fehlende Schüler automatisch/);
  if ((await auto.count()) && !(await auto.isChecked())) await auto.check();
  await shot(page, 'seed-paste-preview');
  await modal.getByRole('button', { name: /Weiter: Bestätigen/ }).click();
  await page.waitForTimeout(1000);
  await modal.getByRole('button', { name: /Import ausführen/ }).click();
  await page.waitForTimeout(5000);
  done.paper = true;
  writeState('progress.json', done);
}
await ctx.close();
