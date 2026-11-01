// Import the synthetic scans, grade every booklet from the plan written by mkscans.py,
// annotate one showcase booklet, and enter the paper-graded class via the Excel paste import.
import fs from 'node:fs';
import path from 'node:path';
import { open, login, shot, BASE, STATE, readState, writeState, openBooklet } from './lib.mjs';

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
  const byCode = Object.fromEntries(Object.values(plan).map((p) => [p.code, p]));
  // Booklets are found by their printed fallback code: the grade page shows only the exam-keyed pseudonym (issue #177).
  await page.goto(`${BASE}/exam/${ids[key]}/scan`); // NOSONAR: UI steps run in order in one browser
  await page.waitForTimeout(8000); // NOSONAR: UI steps run in order in one browser
  const subs = await page.locator('tr:has(td[title^="Abgabe-ID: "])').evaluateAll((trs) => trs.map((tr) => { // NOSONAR: UI steps run in order in one browser
    const td = [...tr.querySelectorAll('td')];
    return [td[0].title.replace('Abgabe-ID: ', ''), td[2].innerText.trim()];
  }));
  const n = subs.length;
  for (const [subId, code] of subs) {
    const entry = byCode[code];
    if (!entry) throw new Error(`booklet ${code}: not in plan`);
    await page.goto(`${BASE}/exam/${ids[key]}/grade?submissionId=${subId}`); // NOSONAR: UI steps run in order in one browser
    await page.waitForTimeout(6000); // NOSONAR: UI steps run in order in one browser
    for (const [q, v] of Object.entries(entry.scores)) {
      // An exercise with parts is graded part by part; its own field follows from the parts.
      const parts = entry.parts?.[q];
      const cells = parts ? Object.entries(parts).map(([l, p]) => [`Teilaufgabe ${l})`, p]) : [[LABEL[q], v]];
      for (const [label, value] of cells) {
        const inp = row(label);
        await inp.click(); // NOSONAR: UI steps run in order in one browser
        await inp.fill(String(value)); // NOSONAR: UI steps run in order in one browser
        await inp.press('Tab'); // NOSONAR: UI steps run in order in one browser
      }
    }
    await page.waitForTimeout(400); // NOSONAR: UI steps run in order in one browser
    await page.getByRole('button', { name: /Note & Anmerkungen speichern/ }).click(); // NOSONAR: UI steps run in order in one browser
    await page.waitForTimeout(1500); // NOSONAR: UI steps run in order in one browser
  }
  console.log('graded', key, n);
  done[`graded-${key}`] = true;
  writeState('progress.json', done);
}

if (!done.annotated) {
  // Showcase booklet F7A9BG (plan Q2 parts 1.5 + 1, Q3 2.5, Q4 1): stamps on its Q2 answers (page 1, below the MC group) that add up to the plan.
  const show = Object.values(JSON.parse(fs.readFileSync(path.join(STATE, 'plan-10b.json'), 'utf8'))).find((p) => p.code === 'F7A9BG');
  await openBooklet(page, ids['10b'], 'F7A9BG');
  const tool = async (n) => { await page.getByRole('button', { name: n }).first().click(); await page.waitForTimeout(300); };
  const at = async (x, y) => { await page.mouse.click(x, y); await page.waitForTimeout(400); };
  await pick('Teilaufgabe a)');
  await tool(/^(\+1\.0|\+1,0)/); await at(520, 598);
  await tool(/^(\+0\.5|\+0,5|½)/); await at(470, 617);
  await pick('Teilaufgabe b)');
  await tool(/^(\+1\.0|\+1,0)/); await at(515, 712);
  await tool(/Fehlt/); await at(440, 731);
  // Stamps rewrite the scores they touch; type the planned ones again.
  const planned = { 'Teilaufgabe a)': show.parts.q1.a, 'Teilaufgabe b)': show.parts.q1.b, Q3: show.scores.q2, Q4: show.scores.q3 };
  for (const [q, v] of Object.entries(planned)) { const inp = row(q); await inp.fill(String(v)); await inp.press('Tab'); } // NOSONAR: UI steps run in order in one browser
  await pick('Teilaufgabe a)');
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
