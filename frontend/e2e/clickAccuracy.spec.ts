/** PDF → editor clicks in the real exercise editor (issue #347), with the real browser engine: every word of a multi-line, hyphenating body is clicked where the code editor's caret shows its middle character, and the code cursor must land exactly there, also after recompiles and right after typing (the PDF on screen is then older than the text); a recompile shows the new pages only once they are sharp; a click in the PDF flashes the code cursor, a click in the code editor pulses the page caret. Needs a local TeX Live (`tests/helpers/fakeTexTree.ts`). */
import type { Locator, Page } from '@playwright/test';
import { test, expect } from './helpers/guards';
import { exerciseEditor, setCodeMirror, showExactPdf, signInFirstTime, t } from './helpers/flows';
import { gotoExerciseLibrary } from './helpers/nav';
import { hasLocalTexTree } from '../tests/helpers/fakeTexTree';

/** Source line breaks mid-paragraph, long German words that hyphenate, a macro, umlauts, ligatures, a dash and inline math. */
const BODY = [
  'Bestimme die Durchschnittsgeschwindigkeit eines Fahrradfahrers, der',
  'eine Strecke von \\textbf{zwölf} Kilometern in einer halben Stunde zurücklegt',
  'und anschließend -- nach einer kurzen Pause -- die Rückfahrt antritt.',
  'Begründe deine Überlegungen ausführlich mit $v = s/t$ und vergleiche die',
  'Geschwindigkeitsunterschiede zwischen Hinfahrt und Rückfahrt sowie die',
  'Verkehrsinfrastrukturfinanzierungsgesellschaft offiziell.',
].join('\n');
/** More pages, so the pages scroll and the viewer shows a scroll bar. */
const FILLER = '\n\n\\newpage\nZwei.\n\\newpage\nDrei.';

interface Pos {
  line: number;
  column: number;
}

/** Every word of three or more letters (not a macro name) with the position of its middle character. */
function targets(): Pos[] {
  const out: Pos[] = [];
  BODY.split('\n').forEach((text, i) => {
    for (const m of text.matchAll(/(?<![\\\p{L}])\p{L}{3,}/gu)) out.push({ line: i + 1, column: m.index + Math.floor(m[0].length / 2) });
  });
  return out;
}

/** Runs `body` with CodeMirror's view (`view`) and `arg` in the page. */
function cm<T>(page: Page, body: string, arg?: unknown): Promise<T> {
  return page.evaluate(
    ([fn, a]) => {
      const view = (document.querySelector('.cm-content') as unknown as { cmTile: { root: { view: unknown } } }).cmTile.root.view;
      return new Function('view', 'arg', fn)(view, a);
    },
    [body, arg] as const,
  ) as Promise<T>;
}

const getCursor = (page: Page) => cm<Pos>(page, 'const h = view.state.selection.main.head; const l = view.state.doc.lineAt(h); return { line: l.number, column: h - l.from };');
const putCursor = (page: Page, p: Pos) => cm<void>(page, 'const l = view.state.doc.line(arg.line); view.dispatch({ selection: { anchor: l.from + arg.column } });', p);

async function caret(editor: Locator) {
  const c = editor.getByTestId('pdf-caret').first();
  return (await c.count()) ? await c.boundingBox() : null;
}

/** Clicks every target where the caret showed it; returns the misses. */
async function misses(page: Page, editor: Locator, label: string): Promise<string[]> {
  const out: string[] = [];
  for (const want of targets()) {
    await putCursor(page, want);
    await expect.poll(async () => (await caret(editor)) !== null).toBe(true);
    const at = await caret(editor);
    // Moves the cursor away, so the click has to place it.
    await putCursor(page, { line: 1, column: 0 });
    if (!at) continue;
    await page.mouse.click(at.x + 1.5, at.y + at.height / 2);
    await expect.poll(async () => JSON.stringify(await getCursor(page))).not.toBe(JSON.stringify({ line: 1, column: 0 }));
    const got = await getCursor(page);
    if (got.line !== want.line || got.column !== want.column) out.push(`${label}: want ${want.line}:${want.column} got ${got.line}:${got.column}`);
  }
  return out;
}

/** Records, every frame for `ms`, whether the shown pages are sharp (each page in view covered by its full-resolution tiles). */
function sharpFrames(page: Page, ms: number): Promise<boolean[]> {
  return page.evaluate(
    (duration) =>
      new Promise<boolean[]>((resolve) => {
        const out: boolean[] = [];
        const end = performance.now() + duration;
        const tick = () => {
          const layer = [...document.querySelectorAll('.embed-pdf-viewer > div')].find((l) => (l as HTMLElement).style.visibility !== 'hidden');
          const root = layer?.querySelector('embedpdf-container')?.shadowRoot;
          const scroller = [...(root?.querySelectorAll('div') ?? [])].find((d) => /(auto|scroll)/.test(getComputedStyle(d).overflowY) && d.scrollHeight > 0);
          let sharp = true;
          const view = scroller?.getBoundingClientRect();
          for (const base of root?.querySelectorAll('img') ?? []) {
            if ((base as HTMLElement).style.position === 'absolute' || !view) continue;
            const b = base.getBoundingClientRect();
            const top = Math.max(b.top, view.top);
            const bottom = Math.min(b.bottom, view.bottom);
            if (bottom <= top || base.naturalWidth >= b.width * devicePixelRatio * 0.9) continue;
            const tiles = [...(base.parentElement?.parentElement?.querySelectorAll('img') ?? [])]
              .filter((tile) => (tile as HTMLElement).style.position === 'absolute' && tile.complete && tile.naturalWidth > 0)
              .map((tile) => tile.getBoundingClientRect());
            // A 9×9 grid over the visible part must lie on loaded tiles (they come in rows and columns).
            for (let i = 0; i < 9 && sharp; i++) {
              for (let j = 0; j < 9 && sharp; j++) {
                const x = b.left + ((b.right - b.left) * (i + 0.5)) / 9;
                const y = top + ((bottom - top) * (j + 0.5)) / 9;
                if (!tiles.some((r) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom)) sharp = false;
              }
            }
          }
          out.push(sharp);
          if (performance.now() < end) requestAnimationFrame(tick);
          else resolve(out);
        };
        tick();
      }),
    ms,
  );
}

test.describe('click accuracy', () => {
  test.skip(!hasLocalTexTree(), 'needs a local TeX Live (backend/latex-texlive/install.sh)'); // NOSONAR: conditional skip, reason given
  test.skip(({ isMobile }) => isMobile, 'desktop layout only'); // NOSONAR: conditional per-device skip, reason given

  test('[editor] page clicks put the code cursor on the clicked character, also after recompiles and right after typing; recompiles swap only sharp pages; both cursors flash', async ({ page }) => {
    test.setTimeout(600_000);
    let swaps = 0;
    const swapMs: number[] = [];
    page.on('console', (m) => {
      if (!m.text().startsWith('[preview] swap')) return;
      swaps++;
      swapMs.push(Number(/(\d+) ms/.exec(m.text())?.[1]));
    });
    await page.addInitScript(() => window.localStorage.setItem('bg_latex_compilation', 'local'));
    await signInFirstTime(page);
    await gotoExerciseLibrary(page);
    await page.getByRole('button', { name: await t(page, 'exercises.page.createButton') }).click();
    const editor = await exerciseEditor(page);
    await setCodeMirror(page, editor, BODY + FILLER, 0);
    await editor.getByRole('button', { name: await t(page, 'exercises.editor.previewButton') }).click();
    await expect(editor.getByRole('img', { name: await t(page, 'common.pdfPage') }).first()).toBeVisible({ timeout: 240_000 });
    await showExactPdf(page, editor);

    const wrong = await misses(page, editor, 'first PDF');

    // Typing in the middle of the text, a key every 80 ms: compiles overlap, the hidden viewer is replaced while it loads, and every frame stays sharp.
    await putCursor(page, { line: 2, column: 12 });
    await editor.locator('.cm-content').first().focus();
    const n = swaps;
    const frames = sharpFrames(page, 6000);
    await page.keyboard.type(' sehr lange und anstrengende', { delay: 80 });
    expect((await frames).filter((sharp) => !sharp)).toEqual([]);
    expect(swaps).toBeGreaterThan(n);
    await cm(page, 'view.dispatch({ changes: { from: view.state.doc.line(2).from + 12, to: view.state.doc.line(2).from + 40 } });');
    await expect.poll(() => swaps).toBeGreaterThan(n + 1);
    // The queued compiles end before the clicks: a swap between reading the caret and clicking would move the text under the mouse.
    let last = swaps;
    let quietSince = Date.now();
    await expect
      .poll(() => {
        if (swaps !== last) [last, quietSince] = [swaps, Date.now()];
        return Date.now() - quietSince;
      }, { intervals: [250] })
      .toBeGreaterThan(1500);
    wrong.push(...(await misses(page, editor, 'after recompiles')));

    // Right after typing, before the new PDF shows: the click lands on the clicked character of the text as it is now.
    const want = targets()[3];
    await putCursor(page, want);
    await expect.poll(async () => (await caret(editor)) !== null).toBe(true);
    const at = await caret(editor);
    await cm(page, 'view.dispatch({ changes: { from: 0, insert: "Neu " } });');
    if (at) await page.mouse.click(at.x + 1.5, at.y + at.height / 2);
    await expect.poll(async () => JSON.stringify(await getCursor(page))).toBe(JSON.stringify(want.line === 1 ? { line: 1, column: want.column + 4 } : want));

    // A click in the PDF flashes the code cursor; a click in the code editor pulses the page caret.
    // The halo is a zero-width anchor at the cursor (its ring is drawn around it), so it is checked for presence.
    await expect(editor.locator('.cm-flash-cursor')).toHaveCount(1);
    await expect(editor.locator('.cm-flash-line').first()).toBeVisible();
    await expect(editor.locator('.cm-flash-cursor')).toHaveCount(0, { timeout: 2000 });
    await editor.locator('.cm-line').nth(1).click();
    await expect(editor.getByTestId('pdf-caret-pulse')).toBeVisible();
    await expect(editor.getByTestId('pdf-caret-pulse')).toHaveCount(0, { timeout: 2000 });

    console.log(`[timing] viewer swaps (ms): ${swapMs.join(', ')}`);
    expect(wrong).toEqual([]);
  });

  test('[editor] zoomed out by hand until the page fits, recompiles swap at once and show the page (no wait for a scroll that cannot happen, no blank viewer at a fixed zoom)', async ({ page }) => {
    test.setTimeout(300_000);
    const swapMs: number[] = [];
    page.on('console', (m) => {
      const ms = /^\[preview\] swap (\d+) ms/.exec(m.text());
      if (ms) swapMs.push(Number(ms[1]));
    });
    await page.addInitScript(() => window.localStorage.setItem('bg_latex_compilation', 'local'));
    await signInFirstTime(page);
    await gotoExerciseLibrary(page);
    await page.getByRole('button', { name: await t(page, 'exercises.page.createButton') }).click();
    const editor = await exerciseEditor(page);
    await setCodeMirror(page, editor, 'Eine kurze Aufgabe.', 0);
    await editor.getByRole('button', { name: await t(page, 'exercises.editor.previewButton') }).click();
    const sheet = editor.getByRole('img', { name: await t(page, 'common.pdfPage') }).first();
    await expect(sheet).toBeVisible({ timeout: 240_000 });
    await showExactPdf(page, editor);
    // Zoomed out with Ctrl+wheel until the one page fits well inside the pane, so nothing can scroll.
    const box = await sheet.boundingBox();
    if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.keyboard.down('Control');
    for (let i = 0; i < 8; i++) await page.mouse.wheel(0, 200);
    await page.keyboard.up('Control');
    await expect.poll(async () => ((await sheet.boundingBox())?.width ?? 999) < (box?.width ?? 0) / 2).toBe(true);
    const n = swapMs.length;
    await cm(page, 'view.dispatch({ changes: { from: view.state.doc.length, insert: " Noch ein Satz." } });');
    await expect.poll(() => swapMs.length, { timeout: 20_000 }).toBeGreaterThan(n);
    // The second edit loads into the viewer shown before (the reused spare), also at the kept fixed zoom.
    await cm(page, 'view.dispatch({ changes: { from: view.state.doc.length, insert: " Und noch einer." } });');
    await expect.poll(() => swapMs.length, { timeout: 20_000 }).toBeGreaterThan(n + 1);
    expect(swapMs.slice(n, n + 2).every((ms) => ms < 2000)).toBe(true);
    // A page shows (EmbedPDF draws nothing at a fixed zoom until it is asked for one).
    await expect(sheet).toBeVisible();
  });
});
