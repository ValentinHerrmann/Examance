/** Layout regression suite, run on every device project: asserts geometry, not behaviour (no document scroll, no horizontal overflow, one h1, 44px touch targets, breakpoints, dialog widths). Soft assertions in the per-route loops list every offending route. */
import type { Locator, Page } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { test, expect } from './helpers/guards';
import { label } from './helpers/i18n';
import { chooseTheme, header, openHelp, openWorkspaceMenu, settleLayout } from './helpers/nav';
import { exerciseEditor, signInFirstTime, unfoldEditorDetails } from './helpers/flows';
import { THEMES, mainRoutes, pinTheme, seedWorkspace, visit } from './helpers/seed';

const projectName = () => test.info().project.name;
/** Desktop heights with the browser bar subtracted, where a page must fit or scroll by at least `SLIVER_MIN` px. */
const SLIVER_CHECKED = ['desktop', 'laptop-166'];
const SLIVER_MIN = 120;
const isTouch = () => Boolean(test.info().project.use.hasTouch);
const viewportWidth = (page: Page) => page.viewportSize()!.width;

/* -------------------------------------------------------------------------- */
/* Every route, both themes                                                    */
/* -------------------------------------------------------------------------- */

for (const theme of THEMES) {
  test(`[layout] routes do not scroll the document or overflow (${theme})`, async ({ page }) => {
    await pinTheme(page, theme);
    const examId = await seedWorkspace(page);

    for (const route of mainRoutes(examId)) {
      await visit(page, route.path);
      const where = `${route.name} (${route.path})`;

      const m = await page.evaluate(() => {
        const doc = document.scrollingElement!;
        const main = document.querySelector('.app-main');
        // Horizontal overflow of .app-main is acceptable only when it comes from inside a TableScroller region (role=region); an element that sticks out of the viewport beyond such a region is a defect.
        const regions = [...document.querySelectorAll('[role=region]')];
        const outside = main
          ? [...main.querySelectorAll('*')].filter((el) => {
              const r = el.getBoundingClientRect();
              if (r.width === 0 || r.height === 0) return false;
              if (regions.some((g) => g !== el && g.contains(el))) return false;
              const cs = getComputedStyle(el);
              if (cs.position === 'fixed' || cs.visibility === 'hidden') return false;
              // Clipped by an ancestor that scrolls on its own.
              for (let p = el.parentElement; p && p !== main; p = p.parentElement) {
                const o = getComputedStyle(p).overflowX;
                if (o === 'auto' || o === 'scroll' || o === 'hidden' || o === 'clip') return false;
              }
              return r.right > document.documentElement.clientWidth + 1;
            })
              .slice(0, 3)
              .map((el) => `${el.tagName.toLowerCase()} "${(el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 40)}"`)
          : [];
        return {
          docV: doc.scrollHeight - doc.clientHeight,
          docH: doc.scrollWidth - doc.clientWidth,
          mainH: main ? main.scrollWidth - main.clientWidth : 0,
          mainV: main ? main.scrollHeight - main.clientHeight : 0,
          outside,
          h1: document.querySelectorAll('h1').length,
          theme: document.documentElement.dataset.theme,
        };
      });

      expect.soft(m.docV, `${where}: document scrolls vertically`).toBeLessThanOrEqual(0);
      expect.soft(m.docH, `${where}: document scrolls horizontally`).toBeLessThanOrEqual(0);
      expect.soft(m.mainH, `${where}: .app-main overflows horizontally ${m.outside.join(' | ')}`).toBeLessThanOrEqual(1);
      expect.soft(m.outside, `${where}: elements stick out of the viewport`).toEqual([]);
      expect.soft(m.h1, `${where}: number of h1`).toBe(1);
      expect.soft(m.theme, `${where}: <html data-theme>`).toBe(theme);
      // No sliver scrolling (frontend/CLAUDE.md): a page fits or scrolls by real content.
      if (SLIVER_CHECKED.includes(projectName())) {
        expect.soft(m.mainV === 0 || m.mainV >= SLIVER_MIN, `${where}: .app-main scrolls by only ${m.mainV}px`).toBe(true);
      }
    }
  });
}

test('[layout] the unlock page fits when locked', async ({ page }) => {
  await page.goto('/unlock');
  await expect(page.getByLabel(label('auth.unlock.cloud.email'))).toBeVisible();
  await settleLayout(page);
  const m = await page.evaluate(() => {
    const doc = document.scrollingElement!;
    const main = document.querySelector('.app-main');
    return {
      docV: doc.scrollHeight - doc.clientHeight,
      docH: doc.scrollWidth - doc.clientWidth,
      mainH: main ? main.scrollWidth - main.clientWidth : 0,
      h1: document.querySelectorAll('h1').length,
    };
  });
  expect.soft(m.docV, 'unlock: document scrolls vertically').toBeLessThanOrEqual(0);
  expect.soft(m.docH, 'unlock: document scrolls horizontally').toBeLessThanOrEqual(0);
  expect.soft(m.mainH, 'unlock: .app-main overflows horizontally').toBeLessThanOrEqual(1);
  expect.soft(m.h1, 'unlock: number of h1').toBe(1);
});

test('[layout] a shared result fills the screen with its PDF (issue #210)', async ({ page, backend }) => {
  const doc = await PDFDocument.create();
  doc.addPage([595, 842]);
  const pdf = Array.from(await doc.save());

  // Sealed in the page with the app's own share crypto (served by Vite), so the test never re-implements it.
  await page.goto('/unlock');
  const share = await page.evaluate(async (bytes) => {
    // Module URLs as variables: they exist only on the Vite server, never for TypeScript here.
    const shareModule = '/src/lib/sharing/shareCrypto.ts';
    const aesModule = '/src/lib/crypto/aesGcm.ts';
    const sc = await import(/* @vite-ignore */ shareModule);
    const { uint8ArrayToBase64 } = await import(/* @vite-ignore */ aesModule);
    const link = sc.newShareLink();
    const body = new Uint8Array(bytes);
    const sealed = await sc.sealShare(link, 'none', null, { filename: 'graded.pdf', examTitle: 'Layout check' }, { graded: body, solution: body });
    return {
      id: link.shareId,
      path: sc.shareUrl('', link),
      lookupB64: uint8ArrayToBase64(await sc.lookupSecret(link)),
      ivB64: uint8ArrayToBase64(sealed.iv),
      ciphertextB64: uint8ArrayToBase64(sealed.ciphertext),
    };
  }, pdf);
  backend.state.resultShares.set(share.id, {
    lookupB64: share.lookupB64,
    content: { factor: 'none', kdf_salt_b64: null, iv_b64: share.ivB64, ciphertext_b64: share.ciphertextB64, expires_at: '2099-01-01T00:00:00Z' },
  });

  await page.goto(share.path);
  await expect(page.getByRole('heading', { level: 1, name: 'Layout check' })).toBeVisible();
  const viewer = page.locator('.embed-pdf-viewer').first();
  await expect(viewer).toBeVisible();
  await settleLayout(page);

  const m = await page.evaluate(() => {
    const doc = document.scrollingElement!;
    const host = document.querySelector('.embed-pdf-viewer')!.getBoundingClientRect();
    return { viewerH: host.height, viewportH: window.innerHeight, docH: doc.scrollWidth - doc.clientWidth };
  });
  // The bug left the PDF at its 160px minimum inside an 18rem pane on phones.
  expect.soft(m.viewerH / m.viewportH, `PDF height ${m.viewerH}px of ${m.viewportH}px`).toBeGreaterThanOrEqual(0.55);
  expect.soft(m.docH, 'result: document scrolls horizontally').toBeLessThanOrEqual(0);
});

/** Regression (issue #226): with objections enabled the page crashed into the error page after decrypting, because a field bound an undefined text. */
test('[layout] a shared result with objections shows one field per item', async ({ page, backend }) => {
  const doc = await PDFDocument.create();
  doc.addPage([595, 842]);
  const pdf = Array.from(await doc.save());

  await page.goto('/unlock');
  const share = await page.evaluate(async (bytes) => {
    const shareModule = '/src/lib/sharing/shareCrypto.ts';
    const aesModule = '/src/lib/crypto/aesGcm.ts';
    const sc = await import(/* @vite-ignore */ shareModule);
    const { uint8ArrayToBase64 } = await import(/* @vite-ignore */ aesModule);
    const link = sc.newShareLink();
    const items = [
      { key: 'ex-1', label: '1', max: 4, points: 3 },
      { key: 'ex-2#a', label: '2a', max: 2, points: null },
    ];
    const sealed = await sc.sealShare(link, 'none', null, { filename: 'graded.pdf', examTitle: 'Objections', items }, { graded: new Uint8Array(bytes) });
    return {
      id: link.shareId,
      path: sc.shareUrl('', link),
      lookupB64: uint8ArrayToBase64(await sc.lookupSecret(link)),
      ivB64: uint8ArrayToBase64(sealed.iv),
      ciphertextB64: uint8ArrayToBase64(sealed.ciphertext),
    };
  }, pdf);
  backend.state.resultShares.set(share.id, {
    lookupB64: share.lookupB64,
    content: {
      factor: 'none',
      kdf_salt_b64: null,
      iv_b64: share.ivB64,
      ciphertext_b64: share.ciphertextB64,
      expires_at: '2099-01-01T00:00:00Z',
      review_until: '2098-01-01T00:00:00Z',
      review: null,
    },
  });

  await page.goto(share.path);
  await expect(page.getByRole('heading', { level: 1, name: 'Objections' })).toBeVisible();
  await expect(page.locator('textarea')).toHaveCount(2);
  await settleLayout(page);

  // Submit, withdraw and type again: a withdrawn form keeps a (blank) field per item, so it stays editable (issue #226).
  const first = page.locator('textarea').first();
  await first.fill('Please check the sum');
  await page.getByRole('button', { name: label('review.form.submit') }).click();
  await expect(page.getByRole('button', { name: label('review.form.withdraw') })).toBeVisible();
  await page.getByRole('button', { name: label('review.form.withdraw') }).click();
  await expect(page.getByRole('button', { name: label('review.form.submit') })).toBeDisabled();
  await expect(page.locator('textarea')).toHaveCount(2);
  await expect(first).toHaveValue('');
  await first.fill('Second try');
  await expect(page.getByRole('button', { name: label('review.form.submit') })).toBeEnabled();
});

/** Regression (issue #226): confirming the print options of a paper with an objection closed the dialog and downloaded nothing. */
test('[layout] the scan page downloads the graded PDF of a paper with an objection', async ({ page }) => {
  const examId = await seedWorkspace(page);
  const scan = await PDFDocument.create();
  scan.addPage([595, 842]);
  const scanBytes = Array.from(await scan.save());

  // Seeded through the app's own repositories (served by Vite), so the test never re-implements sealing.
  await page.evaluate(
    async ({ exam, bytes }) => {
      const modules = ['/src/lib/stores/session.ts', '/src/lib/db/dbEncryption.ts', '/src/lib/repositories/submissionRepository.ts', '/src/lib/repositories/reviewRepository.ts'];
      const [session, sealing, submissions, reviews] = await Promise.all(modules.map((m) => import(/* @vite-ignore */ m)));
      let key: CryptoKey | null = null;
      session.sessionStore.subscribe((s: { sessionKey: CryptoKey | null }) => (key = s.sessionKey))();
      const submissionId = crypto.randomUUID();
      const sealed = await sealing.sealScan(submissionId, new Uint8Array(bytes), key);
      await submissions.submissionRepository.save(
        { id: submissionId, examId: exam, pseudonymHmac: 'e2e-pseudonym', pseudonymVersion: 2, scanCt: sealed.ct, scanIv: sealed.iv, createdAt: new Date().toISOString() },
        key
      );
      const item = { key: 'ex-1', label: '1', objection: 'Too few points', reply: 'Checked, 4 points', pointsBefore: 3, pointsAfter: 4 };
      await reviews.reviewRepository.save(exam, { id: crypto.randomUUID(), submissionId, items: [item], submittedAt: new Date().toISOString(), repliedAt: new Date().toISOString() }, key);
    },
    { exam: examId, bytes: scanBytes }
  );

  await visit(page, `/exam/${examId}/scan`);
  await page.getByRole('button', { name: label('scanning.submissionsTable.exportPdf') }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: label('export.review.download.confirm') }).click();
  expect((await download).suggestedFilename()).toMatch(/_graded\.pdf$/);
});

/** Issue #226: objections must not squeeze the score list: a badge on the row opens the review dialog at every width (issue #328). */
test('[layout] the grade page keeps the score list roomy with an objection', async ({ page }, testInfo) => {
  const examId = await seedWorkspace(page);
  const scan = await PDFDocument.create();
  scan.addPage([595, 842]);
  const scanBytes = Array.from(await scan.save());

  await page.evaluate(
    async ({ exam, bytes }) => {
      const modules = ['/src/lib/stores/session.ts', '/src/lib/db/dbEncryption.ts', '/src/lib/repositories/submissionRepository.ts', '/src/lib/repositories/reviewRepository.ts', '/src/lib/repositories/exerciseRepository.ts'];
      const [session, sealing, submissions, reviews, exercises] = await Promise.all(modules.map((m) => import(/* @vite-ignore */ m)));
      let key: CryptoKey | null = null;
      session.sessionStore.subscribe((s: { sessionKey: CryptoKey | null }) => (key = s.sessionKey))();
      const [exercise] = await exercises.exerciseRepository.getAll(key);
      const submissionId = crypto.randomUUID();
      const sealed = await sealing.sealScan(submissionId, new Uint8Array(bytes), key);
      await submissions.submissionRepository.save(
        { id: submissionId, examId: exam, pseudonymHmac: 'e2e-pseudonym', pseudonymVersion: 2, scanCt: sealed.ct, scanIv: sealed.iv, createdAt: new Date().toISOString() },
        key
      );
      const item = { key: exercise.id, label: '1', objection: 'I think my answer to the second part deserves more points, because the method is the one from the lecture and only the last step differs.', reply: '', pointsBefore: 3, pointsAfter: null };
      await reviews.reviewRepository.save(exam, { id: crypto.randomUUID(), submissionId, items: [item], submittedAt: new Date().toISOString(), repliedAt: null }, key);
    },
    { exam: examId, bytes: scanBytes }
  );

  await visit(page, `/exam/${examId}/grade`);
  const reply = page.getByRole('textbox', { name: label('review.thread.reply') });
  const viewport = page.viewportSize()!;
  const desktop = viewport.width >= 768;
  const shot = (name: string) => page.screenshot({ path: `${process.env.PW_SHOTS ?? testInfo.outputDir}/grade-objection-${name}.png` });

  // Issue #328: the slim score panel has no inline thread at any width; the badge on the row opens the dialog.
  await expect(reply, 'no inline reply field').toHaveCount(0);
  if (desktop) {
    // From `md` the score card floats in the rail on the left (issue #330), and Fit places the page beside it, so a right hand never covers a control and the card covers no scan.
    const card = page.getByRole('region', { name: label('grading.workspace.scorePanel') });
    const cardBox = (await card.boundingBox())!;
    const pageBox = (await page.locator('[data-page="1"]').boundingBox())!;
    expect(cardBox.x + cardBox.width, 'the score card is left of the page').toBeLessThanOrEqual(pageBox.x);
    expect(cardBox.width, 'the score card stays slim').toBeLessThanOrEqual(220);
  } else {
    await page.getByRole('button', { name: label('grading.workspace.scorePanel') }).click();
  }
  const badge = page.locator('button').filter({ hasText: label('review.thread.objection') });
  await expect(badge, 'the badge sits on the score row').toBeVisible();
  await shot(desktop ? 'desktop' : 'phone');
  if (!desktop) {
    const list = page.locator('[id^=score-]').first().locator('xpath=ancestor::div[contains(@class,"overflow-y-auto")][1]');
    // The objection must not crowd the sheet: the list keeps at least half of it, and Previous/Next stay fully on screen.
    const sheet = list.locator('xpath=ancestor::*[contains(@class,"dvh")][1]');
    expect((await list.boundingBox())!.height, 'the score list keeps half of the score sheet').toBeGreaterThanOrEqual((await sheet.boundingBox())!.height * 0.5);
  }
  const next = page.getByRole('button', { name: label('grading.actions.next') });
  const nextBox = (await next.boundingBox())!;
  expect(nextBox.y + nextBox.height, 'Next student stays on screen').toBeLessThanOrEqual(viewport.height);
  await badge.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('textbox', { name: label('review.thread.reply') })).toBeVisible();
  await shot(desktop ? 'desktop-dialog' : 'phone-dialog');
});

test('[layout] the objections tab lists open and answered objections pseudonymously', async ({ page }, testInfo) => {
  const examId = await seedWorkspace(page);
  await page.evaluate(async (exam) => {
    const modules = ['/src/lib/stores/session.ts', '/src/lib/repositories/submissionRepository.ts', '/src/lib/repositories/reviewRepository.ts', '/src/lib/repositories/studentRepository.ts', '/src/lib/repositories/exerciseRepository.ts'];
    const [session, submissions, reviews, students, exercises] = await Promise.all(modules.map((m) => import(/* @vite-ignore */ m)));
    let key: CryptoKey | null = null;
    session.sessionStore.subscribe((s: { sessionKey: CryptoKey | null }) => (key = s.sessionKey))();
    const [exercise] = await exercises.exerciseRepository.getAll(key);
    const seed = async (pseudonym: string, name: string, reply: string) => {
      const submissionId = crypto.randomUUID();
      await submissions.submissionRepository.save({ id: submissionId, examId: exam, pseudonymHmac: pseudonym, pseudonymVersion: 2, createdAt: new Date().toISOString() }, key);
      await students.studentRepository.save({ id: crypto.randomUUID(), examId: exam, pseudonymHmac: pseudonym, pseudonymVersion: 2, studentName: name }, key);
      const item = { key: exercise.id, label: '1', objection: `Objection of ${name}`, reply, pointsBefore: 3, pointsAfter: reply ? 4 : null };
      await reviews.reviewRepository.save(exam, { id: crypto.randomUUID(), submissionId, items: [item], submittedAt: new Date().toISOString(), repliedAt: reply ? new Date().toISOString() : null }, key);
    };
    await seed('aaaaaaaaaaaaaaaa-open', 'Erika Open', '');
    await seed('bbbbbbbbbbbbbbbb-done', 'Max Answered', 'Agreed, one more point.');
  }, examId);
  const locks: string[] = [];
  page.on('request', (req) => {
    if (req.url().includes('/review/open')) locks.push(req.url());
  });

  await visit(page, `/exam/${examId}/results/reviews`);
  const card = page.getByRole('button', { name: /aaaaaaaaaa/ });
  await expect(card, 'the open objection is listed by pseudonym').toBeVisible();
  await expect(page.getByText('Erika Open'), 'names stay hidden').toHaveCount(0);
  await expect(page.getByRole('button', { name: /bbbbbbbbbb/ }), 'answered ones are filtered out by default').toHaveCount(0);
  await page.getByRole('switch', { name: label('review.overview.showNames') }).click();
  await expect(page.getByRole('button', { name: 'Erika Open' }), 'the switch reveals names').toBeVisible();
  await page.getByRole('button', { name: label('review.overview.answered') }).click();
  await page.getByRole('button', { name: 'Max Answered' }).click();
  await expect(page.getByText('Agreed, one more point.'), 'the conversation shows the reply').toBeVisible();
  await page.screenshot({ path: `${process.env.PW_SHOTS ?? testInfo.outputDir}/objections-${testInfo.project.name}.png`, fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, 'no horizontal scroll').toBeLessThanOrEqual(0);
  expect(locks, 'reading the overview locks nothing').toEqual([]);
});

/* -------------------------------------------------------------------------- */
/* Shell: navbar, sidebar, grade, widths, touch targets, theme                 */
/* -------------------------------------------------------------------------- */

test('[layout] shell: navbar, sidebar, grade page, widths and touch targets', async ({ page }) => {
  const examId = await seedWorkspace(page);
  const width = viewportWidth(page);
  const name = projectName();
  const locale = 'en' as const;

  // Navbar: inline links from xl, burger below.
  await visit(page, '/');
  const inlineNav = page.getByRole('navigation', { name: label('nav.menuLabel', undefined, locale) });
  const burger = header(page).getByRole('button', { name: label('nav.openMenu', undefined, locale) });
  if (width >= 1280) {
    await expect(inlineNav, 'inline main nav visible from 1280').toBeVisible();
    await expect(burger).toBeHidden();
  } else {
    await expect(burger, 'burger visible below 1280').toBeVisible();
    await expect(inlineNav).toBeHidden();
  }

  // Data + LaTeX indicators (links to their settings) sit in the bar from `sm`, icon-only until xl; on phones they live in the drawer.
  const dataPill = header(page).getByRole('link', { name: label('nav.storageMode', undefined, locale) });
  const latexPill = header(page).getByRole('link', { name: label('nav.latexMode', undefined, locale) });
  if (width >= 640) {
    await expect(dataPill).toBeVisible();
    await expect(latexPill).toBeVisible();
  } else {
    await expect(dataPill).toBeHidden();
    await expect(latexPill).toBeHidden();
    await burger.click();
    const drawer = page.getByRole('navigation', { name: label('nav.menuLabel', undefined, locale) });
    await expect(drawer.getByRole('link', { name: label('nav.dataLabel', undefined, locale) })).toBeVisible();
    await expect(drawer.getByRole('link', { name: label('nav.latexLabel', undefined, locale) })).toBeVisible();
    await page.keyboard.press('Escape');
  }

  // Touch targets in navbar and sidebar.
  if (isTouch()) {
    const small = await smallTargets(header(page));
    expect.soft(small, 'navbar touch targets under 44px').toEqual([]);
    await visit(page, `/exam/${examId}`);
    const sidebar = page.locator('aside');
    if (await sidebar.isVisible()) {
      expect.soft(await smallTargets(sidebar), 'sidebar touch targets under 44px').toEqual([]);
    }
    // The workspace menu items too.
    const menu = await openWorkspaceMenu(page);
    expect.soft(await smallTargets(menu), 'workspace menu items under 44px').toEqual([]);
    await page.keyboard.press('Escape');
  }

  // Exam sidebar: rail 64 at 1024-1279 and on grade, 224 from 1280, none on phones.
  const sidebar = page.locator('aside');
  await visit(page, `/exam/${examId}`);
  if (width < 1024) {
    await expect(sidebar, 'no sidebar below 1024').toBeHidden();
  } else {
    await expect(sidebar).toBeVisible();
    const w = (await sidebar.boundingBox())!.width;
    expect(w, `sidebar width on overview at ${width}px`).toBeCloseTo(width >= 1280 ? 224 : 64, -1);
    await visit(page, `/exam/${examId}/grade`);
    if (await sidebar.isVisible()) {
      expect((await sidebar.boundingBox())!.width, 'sidebar is a rail on grade').toBeCloseTo(64, -1);
    }
  }

  // Grade page: .app-main must not scroll vertically on the target devices.
  if (['laptop-150', 'laptop-125', 'desktop', 'ipad-portrait', 'ipad-landscape'].includes(name)) {
    await visit(page, `/exam/${examId}/grade`);
    const v = await page.evaluate(() => {
      const el = document.querySelector('.app-main')!;
      return el.scrollHeight - el.clientHeight;
    });
    expect(v, 'grade: .app-main scrolls vertically').toBeLessThanOrEqual(1);
  }

  // Desktop: workspace content uses the available width.
  if (name === 'desktop') {
    for (const p of ['', '/content', '/layout', '/students', '/print', '/scan', '/verify', '/manual', '/results', '/results/share', '/results/reviews', '/results/archive']) {
      await visit(page, `/exam/${examId}${p}`);
      const ratio = await page.evaluate(() => {
        const main = document.querySelector('.app-main')!;
        const shell = main.querySelector('div.mx-auto.w-full') as HTMLElement | null;
        return shell ? shell.getBoundingClientRect().width / main.clientWidth : 0;
      });
      expect(ratio, `workspace content width ratio on /exam/<id>${p}`).toBeGreaterThanOrEqual(0.85);
    }
  }
});

/** Visible buttons, links and menu items under 44px tall, described for the message. */
async function smallTargets(scope: Locator): Promise<string[]> {
  return scope.evaluate((root) => {
    const out: string[] = [];
    for (const el of root.querySelectorAll('button, a[href], [role=menuitem], [role=menuitemradio], [role=menuitemcheckbox]')) {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (r.width === 0 || r.height === 0 || cs.visibility === 'hidden' || cs.display === 'none') continue;
      if (r.height < 43.5) out.push(`${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30)}" h=${r.height.toFixed(1)}`);
    }
    return out;
  });
}

test('[layout] theme chosen in the navbar persists across a reload', async ({ page }) => {
  await seedWorkspace(page);
  await chooseTheme(page, 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await chooseTheme(page, 'light');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

/* -------------------------------------------------------------------------- */
/* Modals                                                                      */
/* -------------------------------------------------------------------------- */

const REM = 16;
/** Size tokens of ui/Modal (small 32rem, medium 48rem, large 72rem, full 90dvw). */
const SIZE_PX = { small: 32 * REM, medium: 48 * REM, large: 72 * REM, full: -1 };

async function expectDialogFits(page: Page, dialog: Locator, size: keyof typeof SIZE_PX, what: string) {
  const vw = viewportWidth(page);
  const box = (await dialog.boundingBox())!;
  // From sm (640px) the overlay has 1rem padding on each side; phones get a full-width sheet except for small dialogs.
  const expected = size === 'full' ? (vw >= 640 ? vw - 32 : vw) : Math.min(SIZE_PX[size], vw - (vw >= 640 || size === 'small' ? 32 : 0));
  expect.soft(box.width, `${what}: dialog narrower than its size token (${size})`).toBeGreaterThanOrEqual(expected - 2);
  expect.soft(box.x, `${what}: dialog starts off-screen`).toBeGreaterThanOrEqual(-1);
  expect.soft(box.x + box.width, `${what}: dialog ends off-screen`).toBeLessThanOrEqual(vw + 1);

  // No scroller nested inside the modal body that actually scrolls: the body (the dialog's own scroll area) is the only one allowed.
  const nested = await dialog.evaluate((root) => {
    const found: string[] = [];
    const scrollers = [...root.querySelectorAll('*')].filter((el) => {
      const cs = getComputedStyle(el);
      return /auto|scroll/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1;
    });
    // The modal body is the first scroller directly under the panel; skip it.
    for (const el of scrollers) {
      const isBody = el.parentElement === root || el.getAttribute('data-modal-body') !== null;
      if (!isBody) found.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)}`);
    }
    return found;
  });
  expect.soft(nested, `${what}: nested scroller inside the modal body`).toEqual([]);
}

type Box = { x: number; y: number; width: number; height: number };
const intersects = (a: Box, b: Box) =>
  a.x < b.x + b.width - 1 && b.x < a.x + a.width - 1 && a.y < b.y + b.height - 1 && b.y < a.y + a.height - 1;

/** Exercise editor with the palette and both panels open: code area, palette and panels must not paint over each other (issue #188). */
async function expectEditorPanelsApart(page: Page, editor: Locator) {
  const unfold = async (toggle: Locator) => {
    // dispatchEvent: an overlapping code area would swallow a real click, and the geometry asserts below should report that.
    if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.dispatchEvent('click');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  };
  const paletteToggle = editor.getByRole('button', { name: label('editor.quickInsertToggle', undefined, 'en') });
  // The accessible name flips from "Show …" to "Hide …" once open.
  const either = (ns: string) => new RegExp(`${label(`${ns}.show`, undefined, 'en').source}|${label(`${ns}.hide`, undefined, 'en').source}`, 'i');
  const resourcesToggle = editor.getByRole('button', { name: either('editor.resources') });
  const packagesToggle = editor.getByRole('button', { name: either('latexPackages.exercise') });
  await unfold(paletteToggle);
  await unfold(resourcesToggle);
  await unfold(packagesToggle);
  await settleLayout(page);

  const code = (await editor.locator('.cm-editor').first().boundingBox())!;
  const palette = (await paletteToggle.locator('xpath=../following-sibling::div[1]').boundingBox())!;
  for (const [name, toggle] of [['files', resourcesToggle], ['packages', packagesToggle]] as const) {
    const panel = (await toggle.locator('xpath=..').boundingBox())!;
    expect.soft(intersects(code, panel), `exercise editor: code area overlaps the ${name} panel`).toBe(false);
    expect.soft(intersects(palette, panel), `exercise editor: snippet palette overlaps the ${name} panel`).toBe(false);
  }
}

/** No metadata label of the exercise editor may spill out of its column into the next field (issue #188). */
async function expectMetaLabelsFit(editor: Locator) {
  const spilled = await editor.locator('label[for^="editor"]').evaluateAll((els) =>
    els.filter((el) => el.scrollWidth > el.clientWidth + 1).map((el) => el.textContent?.trim()),
  );
  expect.soft(spilled, 'exercise editor: metadata label wider than its column').toEqual([]);
}

test('[layout] main dialogs are as wide as their size token and have no nested scroller', async ({ page }) => {
  const examId = await seedWorkspace(page);

  // Help (large).
  await visit(page, '/');
  const help = await openHelp(page);
  await expectDialogFits(page, help, 'large', 'help');
  await page.keyboard.press('Escape');
  await expect(help).toBeHidden();

  // Exercise editor (full).
  await visit(page, '/exercises');
  await page.getByRole('button', { name: label('exercises.page.createButton', undefined, 'en') }).click();
  const editor = await exerciseEditor(page);
  await expect(editor).toBeVisible();
  await settleLayout(page);
  await expectDialogFits(page, editor, 'full', 'exercise editor');
  await expectEditorPanelsApart(page, editor);
  await expectMetaLabelsFit(editor);
  await page.keyboard.press('Escape');
  await expect(editor).toBeHidden();

  // Exam library (large).
  await visit(page, `/exam/${examId}/content`);
  await page.getByRole('button', { name: label('exam.exerciseList.addExercises', undefined, 'en') }).click();
  const library = page.getByRole('dialog', { name: label('exam.libraryModal.header', undefined, 'en') });
  await expect(library).toBeVisible();
  await expectDialogFits(page, library, 'large', 'exam library');
});

test.describe('German labels', () => {
  test.use({ appLocale: 'de' });

  // German labels are the longest ("Varianten-Schlüssel" ran into "Aufgabentyp:", issue #188).
  test('[layout] exercise editor metadata labels stay in their columns (de)', async ({ page }) => {
    await signInFirstTime(page);
    await visit(page, '/exercises');
    await page.getByRole('button', { name: label('exercises.page.createButton', undefined, 'de') }).click();
    const editor = await exerciseEditor(page);
    await expect(editor).toBeVisible();
    await unfoldEditorDetails(page, editor);
    await expectMetaLabelsFit(editor);
  });
});

/* -------------------------------------------------------------------------- */
/* Account management (admin)                                                   */
/* -------------------------------------------------------------------------- */

test('[layout] account management fits every tab without sideways scrolling', async ({ page, backend }) => {
  backend.state.role = 'admin';
  // Admins land on account management, never on the dashboard (issue #58).
  await signInFirstTime(page, { waitForDashboard: false });
  await visit(page, '/admin/users');

  const tabs = page.getByRole('tablist').getByRole('tab');
  // Pending, accounts, invite, domains, layout reports and maintenance.
  const TAB_COUNT = 6;
  await expect(tabs).toHaveCount(TAB_COUNT);
  for (let i = 0; i < TAB_COUNT; i++) {
    await tabs.nth(i).click();
    await settleLayout(page);
    const where = `admin tab ${i + 1}`;

    const m = await page.evaluate(() => {
      const doc = document.scrollingElement!;
      const main = document.querySelector('.app-main');
      const width = document.documentElement.clientWidth;
      // Every visible switch must sit inside the viewport, reachable without scrolling sideways.
      const switches = [...document.querySelectorAll('[role=switch]')].filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
      const offscreen = switches.filter((el) => {
        const r = el.getBoundingClientRect();
        return r.left < 0 || r.right > width + 1;
      }).length;
      return {
        docH: doc.scrollWidth - doc.clientWidth,
        mainH: main ? main.scrollWidth - main.clientWidth : 0,
        switches: switches.length,
        offscreen,
      };
    });

    expect.soft(m.docH, `${where}: document scrolls horizontally`).toBeLessThanOrEqual(0);
    expect.soft(m.mainH, `${where}: .app-main overflows horizontally`).toBeLessThanOrEqual(1);
    expect.soft(m.offscreen, `${where}: switches outside the viewport`).toBe(0);
  }
});
