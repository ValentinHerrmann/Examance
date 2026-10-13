/** Plain (unencrypted) ZIP assembly for the raw exports (issue #82). Built synchronously:
 *  fflate's async mode spawns blob workers, which the CSP does not allow. */
import { zipSync, strToU8, type Zippable } from 'fflate';

// Already-compressed formats are stored, everything else is deflated.
const STORED = /\.(pdf|png|jpe?g|gif|webp|zip|gz)$/i;

const TRANSLIT: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', Ä: 'Ae', Ö: 'Oe', Ü: 'Ue', ß: 'ss' };

/** ASCII-only path segment: LaTeX `\input`/`\graphicspath` and every unzip tool can handle it. */
export function slug(name: string, fallback = 'unnamed'): string {
  const ascii = name
    .replaceAll(/[äöüÄÖÜß]/g, (c) => TRANSLIT[c])
    .normalize('NFKD')
    .replaceAll(/[\u0300-\u036f]/g, '');
  const cleaned = trimSeparators(ascii.replaceAll(/[^A-Za-z0-9._-]+/g, '_'));
  return cleaned.slice(0, 80) || fallback;
}

// Index scan instead of an anchored `_+$` regex, which is prone to backtracking.
function trimSeparators(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && (value[start] === '.' || value[start] === '_')) start++;
  while (end > start && value[end - 1] === '_') end--;
  return value.slice(start, end);
}

/** First of `path`, `path_2`, `path_3`, … (suffix inserted at `extStart`) that is not taken. */
export function firstFree(path: string, isTaken: (p: string) => boolean, extStart = path.length): string {
  let candidate = path;
  let n = 1;
  while (isTaken(candidate)) {
    n++;
    candidate = `${path.slice(0, extStart)}_${n}${path.slice(extStart)}`;
  }
  return candidate;
}

export class ZipBuilder {
  private readonly files = new Map<string, Uint8Array>();

  /** Adds a file; a taken path gets a numeric suffix. Returns the path actually used. */
  add(path: string, content: Uint8Array | string): string {
    const dot = path.lastIndexOf('.');
    const extStart = dot > path.lastIndexOf('/') ? dot : path.length;
    const unique = firstFree(path, (p) => this.files.has(p), extStart);
    this.files.set(unique, typeof content === 'string' ? strToU8(content) : content);
    return unique;
  }

  toBytes(): Uint8Array {
    const tree: Zippable = {};
    for (const [path, data] of this.files) tree[path] = [data, { level: STORED.test(path) ? 0 : 6 }];
    return zipSync(tree);
  }

  toBlob(): Blob {
    return new Blob([this.toBytes() as BlobPart], { type: 'application/zip' });
  }
}

/** `YYYY-MM-DD` for export file names. */
export function exportDateStamp(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}
