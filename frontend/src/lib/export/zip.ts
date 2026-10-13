/** Plain (unencrypted) ZIP assembly for the raw exports (issue #82). Built synchronously:
 *  fflate's async mode spawns blob workers, which the CSP does not allow. */
import { zipSync, strToU8, type Zippable } from 'fflate';

// Already-compressed formats are stored, everything else is deflated.
const STORED = /\.(pdf|png|jpe?g|gif|webp|zip|gz)$/i;

const TRANSLIT: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', Ä: 'Ae', Ö: 'Oe', Ü: 'Ue', ß: 'ss' };

/** ASCII-only path segment: LaTeX `\input`/`\graphicspath` and every unzip tool can handle it. */
export function slug(name: string, fallback = 'unnamed'): string {
  const ascii = name
    .replace(/[äöüÄÖÜß]/g, (c) => TRANSLIT[c])
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '');
  const cleaned = ascii.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^[._]+|_+$/g, '');
  return cleaned.slice(0, 80) || fallback;
}

export class ZipBuilder {
  private files = new Map<string, Uint8Array>();

  /** Adds a file; a taken path gets a numeric suffix. Returns the path actually used. */
  add(path: string, content: Uint8Array | string): string {
    let unique = path;
    for (let n = 2; this.files.has(unique); n++) unique = path.replace(/(\.[^./]+)?$/, (ext) => `_${n}${ext}`);
    this.files.set(unique, typeof content === 'string' ? strToU8(content) : content);
    return unique;
  }

  get size(): number {
    return this.files.size;
  }

  toBlob(): Blob {
    const tree: Zippable = {};
    for (const [path, data] of this.files) tree[path] = [data, { level: STORED.test(path) ? 0 : 6 }];
    return new Blob([zipSync(tree) as BlobPart], { type: 'application/zip' });
  }
}

/** `YYYY-MM-DD` for export file names. */
export function exportDateStamp(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}
