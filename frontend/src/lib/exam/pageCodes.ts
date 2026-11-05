/** Page codes (issue #220, docs/dev/multi_sheet_exams.md): the QR code on every page of an exam with page codes. Plain sheets carry `EXM1:<exam tag>:<page>`; personalised copies append `:<sticker ID>` (never the name), which the scan maps to the student through the exam's list. Level Q keeps them readable through pen marks; a short ID keeps them at QR version 2, readable from 200 ppi at 14 mm. */

import QRCode from 'qrcode';

const PREFIX = 'EXM1';
/** Error correction of page codes: Q (25 %) survives a pen stroke across the code. */
export const PAGE_CODE_EC = 'Q';
/** Pages that get a code; later pages of a longer exam are matched by position, as before. */
export const MAX_PAGE_CODES = 40;

export interface PageCode {
  /** The exam's tag (`examTag`): pages of another exam are told apart. */
  tag: string;
  /** 1-based page of the printed exam. */
  page: number;
  /** The student's sticker ID on personalised copies (`parseStudentQr(...).studentNumber`), absent on plain sheets. */
  id?: string;
}

/** Eight upper-case hex characters of the exam id: upper case keeps the plain code in QR alphanumeric mode (the smallest symbol). */
export function examTag(examId: string): string {
  return examId.replace(/[^0-9a-f]/gi, '').slice(0, 8).toUpperCase();
}

export function pageCodeText(code: PageCode): string {
  const base = `${PREFIX}:${code.tag}:${code.page}`;
  return code.id ? `${base}:${code.id}` : base;
}

/** The page code in a decoded QR text, or null for any other code (a name sticker). */
export function parsePageCode(text: string): PageCode | null {
  const m = /^EXM1:([0-9A-F]{1,16}):(\d{1,4})(?::([\s\S]+))?$/.exec(text.trim());
  if (!m) return null;
  const page = Number(m[2]);
  if (page < 1) return null;
  return m[3] ? { tag: m[1], page, id: m[3] } : { tag: m[1], page };
}

/** Dark-module runs of *text*'s QR code as `x/y/w` from the lower left, one quiet module around; `grid` counts the quiet zone. */
export function qrRuns(text: string): { grid: number; runs: string } {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: PAGE_CODE_EC });
  const n = modules.size;
  const runs: string[] = [];
  for (let row = 0; row < n; row++) {
    let col = 0;
    while (col < n) {
      if (!modules.get(row, col)) {
        col++;
        continue;
      }
      const start = col;
      while (col < n && modules.get(row, col)) col++;
      runs.push(`${start + 1}/${n - row}/${col - start}`);
    }
  }
  return { grid: n + 2, runs: runs.join(',') };
}

/** The `\Seitencode` definitions of an exam's student sheet (Schulaufgabe.sty section 11), one per page up to `MAX_PAGE_CODES`. */
export function pageCodesLatex(examId: string, pages = MAX_PAGE_CODES): string {
  const tag = examTag(examId);
  const lines: string[] = [];
  for (let page = 1; page <= pages; page++) {
    const { grid, runs } = qrRuns(pageCodeText({ tag, page }));
    lines.push(`\\Seitencode{${page}}{${grid}}{${runs}}`);
  }
  return lines.join('\n');
}
