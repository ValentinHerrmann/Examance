// Seed the exercise libraries: the colleague's shared exercises, then the demo teacher's own
// (incl. a second variant), a copy of a shared exercise and a change proposed back to it.
import fs from 'node:fs';
import { open, login, shot, BASE, setCodeMirror, readState, writeState } from './lib.mjs';

const LIB = JSON.parse(fs.readFileSync(new URL('./data/library.json', import.meta.url), 'utf8'));
const done = readState('progress.json', {});

async function createExercises(page, list) {
  await page.goto(BASE + '/exercises');
  await page.waitForTimeout(3000);
  for (const ex of list) {
    if (ex.variantOf) continue;
    if (await page.getByRole('heading', { name: ex.name, level: 3 }).count()) continue;
    await page.getByRole('button', { name: /Neue Aufgabe erstellen/ }).first().click();
    const ed = page.getByRole('dialog').last();
    await ed.waitFor();
    await ed.getByLabel(/^Name \*$/).fill(ex.name);
    await ed.getByLabel(/^Thema \*$/).fill(ex.topic);
    await ed.getByLabel(/^Klasse$/).fill(ex.grade);
    await ed.getByLabel(/^Fach$/).fill(ex.subject);
    if (ex.variantKey) await ed.getByPlaceholder(/z\. B\. Moebel/).first().fill(ex.variantKey);
    if (ex.mc) {
      await ed.getByRole('button', { name: /Multiple Choice/ }).click();
      await setCodeMirror(page, ed, ex.mc.question, 0);
      const inputs = ed.getByPlaceholder(/Text für Option/);
      const add = ed.getByRole('button', { name: /Option hinzufügen/ });
      while ((await inputs.count()) < ex.mc.options.length) await add.click();
      const boxes = ed.getByRole('checkbox', { name: /Option als korrekt markieren/ });
      for (let i = 0; i < ex.mc.options.length; i++) {
        await inputs.nth(i).fill(ex.mc.options[i][0]);
        if ((await boxes.nth(i).isChecked()) !== ex.mc.options[i][1]) await boxes.nth(i).click();
      }
    } else await setCodeMirror(page, ed, ex.latex, 0);
    if (ex.share) {
      await ed.getByLabel(/Mit allen Konten teilen/).check();
      await ed.getByLabel(/keine personenbezogenen Daten/).check();
    }
    await page.waitForTimeout(400);
    await ed.getByRole('button', { name: /Aufgabe speichern/ }).click();
    await ed.waitFor({ state: 'hidden', timeout: 30000 });
    await page.waitForTimeout(800);
    console.log('created', ex.name);
  }
  for (const ex of list.filter((e) => e.variantOf)) {
    const head = page.getByRole('heading', { name: ex.variantOf, level: 3 });
    if (await page.getByText(/2 Varianten/).count()) continue;
    await head.click();
    await page.waitForTimeout(800);
    await page.getByRole('button', { name: /\+ Variante|Parallele Variante erstellen/ }).first().click();
    const ed = page.getByRole('dialog').last();
    await ed.waitFor();
    await ed.getByPlaceholder(/z\. B\. Moebel/).first().fill(ex.variantKey);
    await setCodeMirror(page, ed, ex.latex, 0);
    await page.waitForTimeout(400);
    await ed.getByRole('button', { name: /speichern/ }).last().click();
    await ed.waitFor({ state: 'hidden', timeout: 30000 });
    console.log('variant', ex.variantOf, ex.variantKey);
  }
}

{
  const { ctx, page } = await open({ profile: 'yilmaz' });
  await login(page, 'yilmaz', { mode: 'all-server' });
  await createExercises(page, LIB.yilmaz);
  await ctx.close();
}
{
  const { ctx, page } = await open({ profile: 'berger' });
  await login(page, 'berger', { mode: 'all-server' });
  await createExercises(page, LIB.berger);
  if (!done.copied) {
    // Take over a colleague's exercise, improve it, and propose the change back.
    await page.goto(BASE + '/exercises');
    await page.waitForTimeout(2500);
    await page.getByRole('button', { name: /Von anderen geteilt/ }).or(page.getByRole('tab', { name: /Von anderen geteilt/ })).first().click();
    await page.waitForTimeout(2500);
    await shot(page, 'seed-shared-tab');
    await page.getByRole('heading', { name: 'Tabellen normalisieren', level: 3 }).click();
    await page.waitForTimeout(800);
    await page.getByRole('button', { name: /In meine Bibliothek übernehmen/ }).first().click();
    await page.waitForTimeout(3000);
    done.copied = true;
    writeState('progress.json', done);
  }
  if (!done.proposed) {
    await page.goto(BASE + '/exercises');
    await page.waitForTimeout(2500);
    await page.getByRole('heading', { name: 'Tabellen normalisieren', level: 3 }).click();
    await page.waitForTimeout(1000);
    await page.getByRole('button', { name: /^\+ Version$/ }).first().click();
    const ed = page.getByRole('dialog').last();
    await ed.waitFor();
    const improved = LIB.yilmaz.find((e) => e.name === 'Tabellen normalisieren').latex.replace(
      'an. \\BE',
      'an. Unterstreiche die Primärschlüssel und kennzeichne Fremdschlüssel mit einem Pfeil. \\BE');
    await setCodeMirror(page, ed, improved, 0);
    await page.waitForTimeout(400);
    await ed.getByRole('button', { name: /speichern/ }).last().click();
    await ed.waitFor({ state: 'hidden', timeout: 30000 });
    await page.waitForTimeout(1000);
    await page.getByRole('button', { name: /Weitere Aktionen/ }).first().click();
    await page.getByText(/Dem Original vorschlagen/).first().click();
    const modal = page.getByRole('dialog').last();
    await modal.waitFor();
    await page.waitForTimeout(1000);
    await shot(page, 'seed-propose');
    const note = modal.locator('textarea');
    if (await note.count()) await note.first().fill('Ich habe einen Hinweis zur Darstellung der Schlüssel ergänzt – in meiner 10a gab es dazu viele Rückfragen.');
    await modal.getByRole('button', { name: /Vorschlag senden/ }).click();
    await page.waitForTimeout(2500);
    done.proposed = true;
    writeState('progress.json', done);
  }
  await ctx.close();
}
