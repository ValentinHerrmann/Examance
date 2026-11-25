/** A format per preamble, as the server dumps it (backend/app/services/texrunner.py, issue #344): keep the split, the wrapper and the flags identical to it. */
import { sha256Hex } from '#lib/crypto/hex';

/** The format ends right after the template load: everything before it is the same for every exam with the same layout options and packages. */
const TEMPLATE_NAME = '{sty/Schulaufgabe}';
/** XeTeX cannot dump OpenType fonts and the kernel loads one as soon as a font is selected: the dump runs in OT1 without Libertine (packages.sty), the document switches back after \endofdump. */
export const BEFORE_DUMP = '\\def\\ExamanceDeferFonts{}\\def\\encodingdefault{OT1}\\fontencoding{OT1}\n';
export const AFTER_DUMP = '\n\\csname endofdump\\endcsname\n\\def\\encodingdefault{TU}\\fontencoding{TU}\\RequirePackage{libertine}\\selectfont\n';
/** The server's TeX flags (texrunner `_TEX_FLAGS`). */
export const TEX_FLAGS = ['-no-shell-escape', '-no-parse-first-line', '-interaction=nonstopmode', '-halt-on-error'];

/** The document as [part up to and including the template load, rest], or null when it does not load the template. Plain string searches, no regex: documents are untrusted. */
export function splitPreamble(mainTex: string): [string, string] | null {
  const nameAt = mainTex.indexOf(TEMPLATE_NAME);
  const classAt = mainTex.indexOf('\\documentclass');
  if (nameAt < 0 || classAt < 0 || classAt > nameAt) return null;
  let head = mainTex.slice(0, nameAt);
  if (head.endsWith(']')) head = head.includes('[') ? head.slice(0, head.lastIndexOf('[')) : '';
  if (!head.endsWith('\\usepackage')) return null;
  const end = nameAt + TEMPLATE_NAME.length;
  return [mainTex.slice(0, end), mainTex.slice(end)];
}

/** What the document is compiled as once its format exists: the rest after \endofdump is all TeX reads past the format. */
export function withFormat(preamble: string, rest: string): string {
  return BEFORE_DUMP + preamble + AFTER_DUMP + rest;
}

/** The dump's input file (fmt.tex). */
export function dumpSource(preamble: string): string {
  return BEFORE_DUMP + preamble + AFTER_DUMP;
}

/** The format's name: tree version, assets, the wrapper and the preamble, like the server's `format_key`. */
export async function formatKey(treeVersion: string, assetsDigest: string, preamble: string): Promise<string> {
  const hex = await sha256Hex(new TextEncoder().encode(`${treeVersion}\0${assetsDigest}\0${BEFORE_DUMP}${AFTER_DUMP}\0${preamble}`));
  return `p${hex.slice(0, 39)}`;
}
