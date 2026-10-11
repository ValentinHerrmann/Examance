// Push the exercise LaTeX from data/library.json into an already seeded instance (Berger's library).
// Usage: node relatex.mjs "<name>[|<variant>]" ...
import fs from 'node:fs';
import { open, login, shot, BASE, setCodeMirror } from './lib.mjs';

const LIB = JSON.parse(fs.readFileSync(new URL('./data/library.json', import.meta.url), 'utf8')).berger;
const { ctx, page } = await open({ profile: 'berger' });
await login(page, 'berger');
for (const arg of process.argv.slice(2)) {
  const [name, variant] = arg.split('|');
  const ex = LIB.find((e) => e.name === name && (!variant || e.variantKey === variant));
  await page.goto(BASE + '/exercises');
  await page.waitForTimeout(4000);
  await page.getByRole('heading', { name, level: 3 }).click();
  await page.waitForTimeout(1500);
  const idx = variant === 'Gruppe B' ? 1 : 0;
  await page.getByRole('button', { name: /^Bearbeiten$/ }).nth(idx).click();
  await page.waitForTimeout(2500);
  const ed = page.getByRole('dialog').last();
  await setCodeMirror(page, ed, ex.latex, 0);
  await page.waitForTimeout(800);
  await ed.getByRole('button', { name: /Aufgabe speichern/ }).click();
  await page.waitForTimeout(3000);
  await shot(page, `relatex-${name.slice(0, 8)}-${idx}`);
  console.log('saved', arg);
}
await ctx.close();
