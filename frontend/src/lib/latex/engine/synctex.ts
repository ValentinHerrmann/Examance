/** Minimal SyncTeX reader (uncompressed `-synctex=-1` output, PDF-to-source lookup only); kept for click-to-source, issue #347, which wires it up. */

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

interface Header {
  inputs: Map<number, string>;
  unit: number;
  /** XDV output carries the 1 in TeX origin as "X Offset"/"Y Offset" (sp); records are relative to it. */
  dx: number;
  dy: number;
}

/** Reads one preamble line into `hdr`; false when the line is not a header line. */
function readHeader(line: string, hdr: Header): boolean {
  const colon = line.indexOf(':');
  if (colon < 0) return false;
  const key = line.slice(0, colon);
  const value = line.slice(colon + 1);
  if (key === 'Input') {
    const sep = value.indexOf(':');
    hdr.inputs.set(Number(value.slice(0, sep)), value.slice(sep + 1));
  } else if (key === 'Unit') hdr.unit = Number(value) || 1;
  else if (key === 'X Offset') hdr.dx = Number(value) || 0;
  else if (key === 'Y Offset') hdr.dy = Number(value) || 0;
  else return false;
  return true;
}

export function parseSynctex(text: string): SyncData {
  const hdr: Header = { inputs: new Map(), unit: 1, dx: 0, dy: 0 };
  const pages = new Map<number, SyncRecord[]>();
  let page: SyncRecord[] | null = null;
  let depth = 0;
  for (const line of text.split('\n')) {
    const c = line[0];
    if (c === '{') {
      page = [];
      pages.set(Number(line.slice(1)), page);
      depth = 0;
    } else if (c === '}') page = null;
    else if (!page) readHeader(line, hdr);
    else if (c === ']' || c === ')') depth--;
    else {
      const rec = parseRecord(line, hdr, depth);
      if (rec) page.push(rec);
      if (rec && (c === '[' || c === '(')) depth++;
    }
  }
  return { inputs: hdr.inputs, pages };
}

const KIND: Record<string, SyncRecord['kind']> = { '(': 'hbox', '[': 'vbox', v: 'void', h: 'void', x: 'point', k: 'point', g: 'point', $: 'point' };

/** `<kind><tag>,<line>[,<column>]:<x>,<y>[:<W>[,<H>,<D>]]`, coordinates in sp. */
function parseRecord(line: string, hdr: Header, depth: number): SyncRecord | null {
  const kind = KIND[line[0]];
  if (!kind) return null;
  const [where, pos, size] = line.slice(1).split(':');
  if (!pos) return null;
  const [tag, ln] = where.split(',').map(Number);
  const [x, y] = pos.split(',').map(Number);
  const [w = 0, h = 0, d = 0] = size ? size.split(',').map(Number) : [];
  if (![tag, ln, x, y].every(Number.isFinite)) return null;
  const s = hdr.unit * SP_TO_BP;
  return { kind, tag, line: ln, x: x * s + hdr.dx * SP_TO_BP, y: y * s + hdr.dy * SP_TO_BP, w: w * s, h: h * s, d: d * s, depth };
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

/** Where `line` of the input ending in `file` was typeset: its first point record (page 1-based, PDF points), for the provisional overlay. */
export function positionOf(data: SyncData, file: string, line: number): { page: number; x: number; y: number } | null {
  const tags = new Set([...data.inputs].filter(([, path]) => path.endsWith(file)).map(([tag]) => tag));
  for (const [page, recs] of [...data.pages].sort((a, b) => a[0] - b[0])) {
    const hit = recs.find((r) => r.kind === 'point' && r.line === line && tags.has(r.tag));
    if (hit) return { page, x: hit.x, y: hit.y };
  }
  return null;
}
