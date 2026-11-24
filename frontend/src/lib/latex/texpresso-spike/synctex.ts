/** Minimal SyncTeX reader for the spike: uncompressed output of `-synctex=-1`, PDF-to-source lookup only. */

/** One box or point record, in PDF points from the page's top-left corner. */
export interface SyncRecord {
  kind: 'hbox' | 'vbox' | 'void' | 'point';
  tag: number;
  line: number;
  x: number;
  y: number;
  w: number;
  h: number;
  d: number;
  depth: number;
}

export interface SyncData {
  inputs: Map<number, string>;
  pages: Map<number, SyncRecord[]>;
}

/** sp to PDF points (big points): unit/65536 pt, 72/72.27 bp per pt. */
const SP_TO_BP = 72 / 72.27 / 65536;

export function parseSynctex(text: string): SyncData {
  const inputs = new Map<number, string>();
  const pages = new Map<number, SyncRecord[]>();
  let unit = 1;
  // XDV output carries the 1 in TeX origin as "X Offset"/"Y Offset" (sp); records are relative to it.
  let dx = 0;
  let dy = 0;
  let page: SyncRecord[] | null = null;
  let depth = 0;
  const scale = () => unit * SP_TO_BP;
  for (const line of text.split('\n')) {
    if (line.startsWith('Input:')) {
      const m = /^Input:(\d+):(.*)$/.exec(line);
      if (m) inputs.set(Number(m[1]), m[2]);
      continue;
    }
    if (line.startsWith('Unit:')) {
      unit = Number(line.slice(5)) || 1;
      continue;
    }
    if (line.startsWith('X Offset:')) {
      dx = Number(line.slice(9)) || 0;
      continue;
    }
    if (line.startsWith('Y Offset:')) {
      dy = Number(line.slice(9)) || 0;
      continue;
    }
    const c = line[0];
    if (c === '{') {
      page = [];
      pages.set(Number(line.slice(1)), page);
      depth = 0;
      continue;
    }
    if (c === '}') {
      page = null;
      continue;
    }
    if (!page) continue;
    if (c === ']' || c === ')') {
      depth--;
      continue;
    }
    const rec = parseRecord(line, scale(), dx * SP_TO_BP, dy * SP_TO_BP);
    if (!rec) continue;
    rec.depth = depth;
    page.push(rec);
    if (c === '[' || c === '(') depth++;
  }
  return { inputs, pages };
}

const RECORD = /^([[(vhxkg$])(\d+),(\d+)(?:,-?\d+)?:(-?\d+),(-?\d+)(?::(-?\d+)(?:,(-?\d+),(-?\d+))?)?/;

function parseRecord(line: string, s: number, ox: number, oy: number): SyncRecord | null {
  const m = RECORD.exec(line);
  if (!m) return null;
  const kind: SyncRecord['kind'] = m[1] === '(' ? 'hbox' : m[1] === '[' ? 'vbox' : m[1] === 'v' || m[1] === 'h' ? 'void' : 'point';
  return {
    kind,
    tag: Number(m[2]),
    line: Number(m[3]),
    x: Number(m[4]) * s + ox,
    y: Number(m[5]) * s + oy,
    w: Number(m[6] ?? 0) * s,
    h: Number(m[7] ?? 0) * s,
    d: Number(m[8] ?? 0) * s,
    depth: 0,
  };
}

export interface SourceHit {
  file: string;
  line: number;
  /** The deepest box around the point; its line is the fallback when no point record is on the same text line. */
  box: SyncRecord;
}

/** The source position under (x, y) on `page` (1-based), PDF points from the top-left: the deepest enclosing hbox, then its nearest point record to the left. */
export function sourceAt(data: SyncData, page: number, x: number, y: number): SourceHit | null {
  const recs = data.pages.get(page);
  if (!recs) return null;
  let box: SyncRecord | null = null;
  for (const r of recs) {
    if (r.kind !== 'hbox') continue;
    const inside = x >= r.x && x <= r.x + r.w && y >= r.y - r.h && y <= r.y + r.d;
    if (inside && (!box || r.depth >= box.depth)) box = r;
  }
  if (!box) return nearestPoint(data, recs, x, y);
  let best: SyncRecord | null = null;
  for (const r of recs) {
    if (r.kind !== 'point' || Math.abs(r.y - box.y) > 0.5 || r.x > x + 0.5 || r.x < box.x - 0.5) continue;
    if (!best || r.x > best.x) best = r;
  }
  const hit = best ?? box;
  const file = data.inputs.get(hit.tag);
  return file ? { file, line: hit.line, box } : null;
}

/** Fallback when no hbox encloses the point (list labels, some boxes TeX records without size): the closest point record within 12 pt. */
function nearestPoint(data: SyncData, recs: SyncRecord[], x: number, y: number): SourceHit | null {
  let best: SyncRecord | null = null;
  let dist = 12;
  for (const r of recs) {
    if (r.kind !== 'point') continue;
    const d = Math.hypot(r.x - x, (r.y - y) * 2);
    if (d < dist) {
      dist = d;
      best = r;
    }
  }
  const file = best && data.inputs.get(best.tag);
  return best && file ? { file, line: best.line, box: best } : null;
}

/** Column of `word` in `sourceLine` (0-based), or -1: XeTeX's SyncTeX carries no columns, so the clicked word decides. */
export function columnOf(sourceLine: string, word: string): number {
  const w = word.trim();
  if (!w) return -1;
  const at = sourceLine.indexOf(w);
  if (at >= 0) return at;
  // Words split by hyphenation or ligatures: try the longest prefix that still matches.
  for (let n = w.length - 1; n >= 3; n--) {
    const i = sourceLine.indexOf(w.slice(0, n));
    if (i >= 0) return i;
  }
  return -1;
}

/** Where `line` of the input ending in `file` was typeset: its first point record (page 1-based, PDF points), for the provisional overlay. */
export function positionOf(data: SyncData, file: string, line: number): { page: number; x: number; y: number } | null {
  const tags = [...data.inputs].filter(([, path]) => path.endsWith(file)).map(([tag]) => tag);
  for (const [page, recs] of [...data.pages].sort((a, b) => a[0] - b[0])) {
    const hit = recs.find((r) => r.kind === 'point' && r.line === line && tags.includes(r.tag));
    if (hit) return { page, x: hit.x, y: hit.y };
  }
  return null;
}
