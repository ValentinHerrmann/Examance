// Shared helpers for the demo-instance scripts: browser launch, sign-in (incl. TOTP), screenshots.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '../..');
export const STATE = process.env.DEMO_STATE ?? path.join(HERE, '.state');
export const BASE = process.env.DEMO_FRONTEND ?? 'http://localhost:4173';
export const SHOTS = path.join(STATE, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

const { chromium } = await import(path.join(ROOT, 'frontend/node_modules/playwright/index.mjs'));
export const ACCOUNTS = JSON.parse(fs.readFileSync(path.join(HERE, 'data/accounts.json'), 'utf8'));

export function readState(name, fallback) {
  const f = path.join(STATE, name);
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : fallback;
}
export function writeState(name, value) {
  fs.writeFileSync(path.join(STATE, name), JSON.stringify(value, null, 1));
}

/** Launch a persistent profile per account. Dark theme and German UI unless overridden. */
export async function open({ profile, theme = 'dark', locale = 'de', width = 1600, height = 1000, scale = 2 } = {}) {
  const ctx = await chromium.launchPersistentContext(path.join(STATE, `profile-${profile}`), {
    executablePath: process.env.CHROMIUM_PATH || undefined,
    headless: true,
    viewport: { width, height },
    deviceScaleFactor: scale,
    locale: locale === 'de' ? 'de-DE' : 'en-US',
  });
  await ctx.addInitScript(([t, l]) => {
    try { localStorage.setItem('bg_theme', t); localStorage.setItem('bg_locale', l); } catch {}
    // pdf.js 6 uses Map#getOrInsertComputed, missing in older bundled Chromium builds.
    for (const C of [Map, WeakMap]) {
      if (!C.prototype.getOrInsertComputed) {
        C.prototype.getOrInsertComputed = function (k, f) { if (!this.has(k)) this.set(k, f(k)); return this.get(k); };
        C.prototype.getOrInsert = function (k, v) { if (!this.has(k)) this.set(k, v); return this.get(k); };
      }
    }
  }, [theme, locale]);
  // zxing-wasm fetches its binary from a CDN; serve the bundled copy so offline sandboxes work.
  const wasm = path.join(ROOT, 'frontend/node_modules/zxing-wasm/dist/reader/zxing_reader.wasm');
  await ctx.route('https://*.jsdelivr.net/npm/zxing-wasm@*/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/wasm', headers: { 'access-control-allow-origin': '*' }, body: fs.readFileSync(wasm) }));
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  page.on('dialog', (d) => d.accept());
  page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 200)));
  return { ctx, page };
}

export function totp(secret, step = Math.floor(Date.now() / 30000)) {
  const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of secret.replace(/=+$/, '')) bits += alpha.indexOf(c).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const ctr = Buffer.alloc(8);
  ctr.writeBigUInt64BE(BigInt(step));
  const h = crypto.createHmac('sha1', key).update(ctr).digest();
  const o = h[19] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, '0');
}

/**
 * Sign in on /unlock. Handles first-time TOTP enrollment (secret kept in .state), the TOTP prompt,
 * the one-time setup codes dialog and, if `mode` is given, the first-run storage-mode choice.
 */
export async function login(page, who, { mode, formDone = false } = {}) {
  const acc = ACCOUNTS[who];
  if (!formDone) {
    await page.goto(BASE + '/unlock');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2500);
  }
  if (!formDone && page.url().includes('/unlock')) {
    await page.getByLabel(/^(E-Mail|Email)$/).fill(acc.email);
    await page.getByLabel(/^(Passwort|Password)$/).fill(acc.password);
    await page.getByRole('button', { name: /(Verbinden|Connect)/ }).click();
    await page.waitForTimeout(5000);
  }
  const secrets = readState('totp.json', {});
  for (let i = 0; i < 12; i++) {
    // Enrollment offers a passkey first; the demo accounts use TOTP.
    const useTotp = page.getByRole('button', { name: /Authenticator-App verwenden|authenticator app instead/ });
    if ((await useTotp.count()) && (await useTotp.first().isVisible())) {
      await useTotp.first().click();
      await page.waitForTimeout(2500);
    }
    const secretEl = page.locator('code, .font-mono, [class*=mono]').filter({ hasText: /^[A-Z2-7]{16,}$/ });
    if (await secretEl.count()) { secrets[who] = { ...(secrets[who] ?? {}), secret: (await secretEl.first().innerText()).trim() }; writeState('totp.json', secrets); }
    const code = page.getByPlaceholder('000000');
    if ((await code.count()) && (await code.first().isVisible())) {
      // A code is accepted once; wait for the next 30 s step after the last one used.
      while (Math.floor(Date.now() / 30000) <= (secrets[who]?.lastStep ?? -1)) await page.waitForTimeout(1000);
      const step = Math.floor(Date.now() / 30000);
      secrets[who].lastStep = step; writeState('totp.json', secrets);
      await code.first().fill(totp(secrets[who].secret, step));
      await page.keyboard.press('Enter');
      await page.waitForTimeout(3500);
    } else if (await page.getByText(/Codes .*sicher|codes shown here/).count()) {
      await page.getByRole('checkbox').first().check();
      await page.getByRole('button', { name: /Fertig|Done/ }).click();
      await page.waitForTimeout(3000);
    } else break;
  }
  if (mode && (await page.getByText('Speicherort wählen').count())) {
    await page.getByText(mode === 'hybrid' ? 'Hybrid-Modus' : 'Alles auf dem Server').first().click();
    await page.getByRole('button', { name: /übernehmen/ }).click();
    await page.waitForTimeout(4000);
  }
}

export async function shot(page, name, opts = {}) {
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), ...opts });
  console.log('shot', name);
}

/** Replace a CodeMirror editor's content inside `scope`. */
export async function setCodeMirror(page, scope, value, index = 0) {
  const c = scope.locator('.cm-content').nth(index);
  await c.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.insertText(value);
}

/** Open a booklet on the grade page by its printed fallback code: the scan list shows it, the grade page only the exam-keyed pseudonym (issue #177). */
export async function openBooklet(page, examId, code, wait = 9000) {
  await page.goto(`${BASE}/exam/${examId}/scan`);
  await page.waitForTimeout(8000);
  const row = page.locator('tr').filter({ has: page.getByRole('cell', { name: code, exact: true }) });
  const id = (await row.locator('td[title^="Abgabe-ID: "]').getAttribute('title')).replace('Abgabe-ID: ', '');
  await page.goto(`${BASE}/exam/${examId}/grade?submissionId=${id}`);
  await page.waitForTimeout(wait);
}
