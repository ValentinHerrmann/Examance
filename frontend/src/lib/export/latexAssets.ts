/** Makes an exported folder a self-contained LaTeX project (bundled sty/img files, XeLaTeX config). */
import { loadLatexAssets } from '#lib/latex/assets';
import { translate } from '#lib/i18n';
import type { ZipBuilder } from './zip';

/** Writes the bundled assets, `latexmkrc` and a README under `dir` ('' = ZIP root). */
export async function addLatexProjectFiles(zip: ZipBuilder, dir: string): Promise<void> {
  const prefix = dir ? `${dir}/` : '';
  for (const asset of await loadLatexAssets()) {
    zip.add(prefix + asset.path, asset.content);
    // Some packages are loaded by bare name (bbding, pifont); the browser engine flattens them the same way.
    const flat = /^sty\/([^/]+\.sty)$/.exec(asset.path);
    if (flat) zip.add(prefix + flat[1], asset.content);
  }
  // fontspec needs XeLaTeX; latexmk and Overleaf both read this file.
  zip.add(`${prefix}latexmkrc`, '$pdf_mode = 5;\n');
  zip.add(`${prefix}README.txt`, translate('export.latexReadme'));
}
