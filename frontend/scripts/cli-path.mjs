// Command-line path arguments of the build scripts, confined to the frontend directory so a wrong or crafted argument can never read, overwrite or delete files elsewhere.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const FRONTEND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * `arg` resolved against `base`; throws unless the result is `base` itself or lies inside it.
 * @param {string} base
 * @param {string} arg
 * @returns {string}
 */
export function resolveInside(base, arg) {
  const root = path.resolve(base);
  const resolved = path.resolve(root, arg);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error(`Path ${JSON.stringify(arg)} lies outside ${root}`);
  }
  return resolved;
}

/**
 * Build-script directory argument at `process.argv[index]` (or `fallback`), inside the frontend directory.
 * @param {number} index
 * @param {string} fallback
 * @returns {string}
 */
export const frontendPathArg = (index, fallback) => resolveInside(FRONTEND_DIR, process.argv[index] ?? fallback);
