// Swap the MC showcase booklet (mkscans.py, CFG.showcase) into an already seeded instance:
// delete that pupil's scan, re-import the single booklet, re-enter the planned points.
import fs from 'node:fs';
import path from 'node:path';
import { open, login, BASE, STATE, readState, writeState } from './lib.mjs';

const ids = readState('exams.json', {});
const done = readState('progress.json', {});
if (done['showcase-10b']) process.exit(0);
const plan = JSON.parse(fs.readFileSync(path.join(STATE, 'plan-10b.json'), 'utf8'));
const [raw, hashed] = process.argv.slice(2);
const { ctx, page } = await open({ profile: 'berger' });
await login(page, 'berger');

await page.goto(`${BASE}/exam/${ids['10b']}/scan`);
await page.waitForTimeout(8000);
const cell = page.locator(`td[title*="${hashed}"], td[title*="${raw}"]`).first();
if (await cell.count()) {
  await cell.locator('xpath=ancestor::tr[1]').getByRole('button', { name: /^Löschen$/ }).click();
  await page.waitForTimeout(3000);
}
await page.locator('#scanFiles').setInputFiles(path.join(STATE, 'scan-10b-showcase.pdf'));
await page.getByText(/Fertig!/).waitFor({ timeout: 300000 });
await page.waitForTimeout(3000);

const row = (q) => page.getByText(q, { exact: true }).first().locator('xpath=ancestor::*[.//input][1]').locator('input').first();
await page.goto(`${BASE}/exam/${ids['10b']}/grade`);
await page.waitForTimeout(6000);
for (let i = 0; i < 30; i++) {
  const header = (await page.locator('body').innerText()).split('Stift')[0];
  if (header.includes(raw) || header.includes(hashed)) {
    for (const [q, v] of Object.entries(plan[raw].scores)) {
      const inp = row(q.toUpperCase());
      await inp.click(); await inp.fill(String(v)); await inp.press('Tab');
    }
    await page.getByRole('button', { name: /Note & Anmerkungen speichern/ }).click();
    await page.waitForTimeout(2000);
    done['showcase-10b'] = true;
    writeState('progress.json', done);
    console.log('showcase graded');
    break;
  }
  await page.getByRole('button', { name: /Nächster/ }).click();
  await page.waitForTimeout(2000);
}
await ctx.close();
