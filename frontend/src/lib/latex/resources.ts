/**
 * Rules for teacher-uploaded LaTeX resource files.
 *
 * A resource is any file an exercise references from its LaTeX source —
 * `\includegraphics{figure.png}`, `\input{data.tex}`, a CSV for pgfplots, a
 * font. Resources are placed *flat* next to `main.tex` in the compile working
 * directory, so the filename in the source is the filename on disk, in both
 * engines.
 *
 * These rules are mirrored by `backend/app/services/latex_resources.py`: a file
 * the browser accepts is a file the server accepts.
 */

/** Hard cap for a single file. */
export const MAX_RESOURCE_BYTES = 5 * 1024 * 1024;
/** Hard cap for the sum of one exercise's resources. */
export const MAX_EXERCISE_RESOURCE_BYTES = 25 * 1024 * 1024;
/** Hard cap for the resources sent along with one compile request. */
export const MAX_COMPILE_RESOURCE_BYTES = 20 * 1024 * 1024;
/** Hard cap for the number of resources sent along with one compile request. */
export const MAX_COMPILE_RESOURCE_COUNT = 30;

const MAX_FILENAME_CHARS = 100;

/**
 * SVG is refused on purpose: LaTeX cannot include it directly, and the usual
 * workarounds (dvisvgm/inkscape shell-escape) do not exist in either of our
 * sandboxed engines. Converting to PDF keeps the graphic vector.
 */
export const SVG_REJECTION_MESSAGE =
  'SVG is not supported because it renders unreliably in LaTeX. ' +
  'Convert it to PDF first — it stays a vector graphic ' +
  '(Inkscape: File → Save As → PDF, or `rsvg-convert -f pdf in.svg > out.pdf`).';

export interface LatexResourceFile {
  /** Flat, sanitized name — how the LaTeX source refers to the file. */
  filename: string;
  content: Uint8Array;
  /** Optional label of the owning exercise, used in collision messages. */
  owner?: string;
}

export class ResourceError extends Error {}

/**
 * Names a user file must not take: `main.tex` and friends, plus every bundled
 * LaTeX asset. The worker flattens `sty/x.sty` to `x.sty`, so basenames count
 * too. Loaded from the generated asset index; the fetch is cached and failure
 * degrades to the static base list rather than blocking an upload.
 */
const BASE_RESERVED_NAMES = ['main.tex', 'main.log', 'main.aux', 'main.pdf', 'index.json'];
let reservedNamesCache: Set<string> | null = null;

export async function getReservedNames(): Promise<Set<string>> {
  if (reservedNamesCache) return reservedNamesCache;
  const names = new Set(BASE_RESERVED_NAMES);
  try {
    const res = await fetch('/latex-assets/index.json');
    if (res.ok) {
      const paths: string[] = await res.json();
      for (const path of paths) {
        names.add(path);
        names.add(path.split('/').pop() ?? path);
      }
    }
  } catch {
    // Offline or asset index missing — the server re-checks on compile anyway.
  }
  reservedNamesCache = names;
  return names;
}

/** Reduce a picked file's name to a flat, LaTeX-friendly filename. */
export function sanitizeResourceName(rawName: string): string {
  let name = rawName.trim().replace(/\\/g, '/').split('/').pop() ?? '';
  name = name.replace(/[^A-Za-z0-9._-]/g, '_').replace(/\.{2,}/g, '.').replace(/^[._-]+|[._-]+$/g, '');

  if (!name) throw new ResourceError('File name is empty after sanitising.');

  if (name.length > MAX_FILENAME_CHARS) {
    const dot = name.lastIndexOf('.');
    const ext = dot > 0 ? name.slice(dot + 1) : '';
    name =
      ext && ext.length < 20
        ? `${name.slice(0, MAX_FILENAME_CHARS - ext.length - 1)}.${ext}`
        : name.slice(0, MAX_FILENAME_CHARS);
  }
  return name;
}

/** Sanitize and refuse SVG plus names reserved by bundled assets. */
export async function validateResourceName(rawName: string): Promise<string> {
  const name = sanitizeResourceName(rawName);

  if (name.toLowerCase().endsWith('.svg')) throw new ResourceError(SVG_REJECTION_MESSAGE);

  const reserved = await getReservedNames();
  if (reserved.has(name)) {
    throw new ResourceError(`"${name}" is reserved by a bundled LaTeX asset. Please rename the file.`);
  }
  return name;
}

/**
 * Validate one picked file. Returns its sanitized name.
 *
 * @param usedBytes bytes already attached to this exercise, for the 25 MB cap.
 */
export async function validateResource(file: File, usedBytes = 0): Promise<string> {
  const name = await validateResourceName(file.name);

  if (file.size === 0) throw new ResourceError(`"${name}" is empty.`);
  if (file.size > MAX_RESOURCE_BYTES) {
    throw new ResourceError(
      `"${name}" is ${formatBytes(file.size)}; the limit is ${formatBytes(MAX_RESOURCE_BYTES)} per file.`
    );
  }
  if (usedBytes + file.size > MAX_EXERCISE_RESOURCE_BYTES) {
    throw new ResourceError(
      `This exercise's files would exceed the ${formatBytes(MAX_EXERCISE_RESOURCE_BYTES)} limit.`
    );
  }
  return name;
}

/**
 * Flatten resources from several exercises into the map the compiler gets.
 *
 * Two exercises may both own `figure.png`. Identical bytes are written once;
 * different bytes are a real conflict the teacher has to resolve by renaming,
 * because the filename is what the LaTeX source says.
 */
export function mergeResources(files: LatexResourceFile[]): LatexResourceFile[] {
  const merged = new Map<string, LatexResourceFile>();

  for (const file of files) {
    const existing = merged.get(file.filename);
    if (!existing) {
      merged.set(file.filename, file);
    } else if (!bytesEqual(existing.content, file.content)) {
      throw new ResourceError(
        `Two exercises use different files named "${file.filename}" ` +
          `(${existing.owner ?? '?'} and ${file.owner ?? '?'}). Rename one of them.`
      );
    }
  }

  const result = [...merged.values()];
  const total = result.reduce((sum, f) => sum + f.content.length, 0);
  if (total > MAX_COMPILE_RESOURCE_BYTES) {
    throw new ResourceError(
      `The resource files total ${formatBytes(total)}; the limit is ` +
        `${formatBytes(MAX_COMPILE_RESOURCE_BYTES)} per compilation.`
    );
  }
  if (result.length > MAX_COMPILE_RESOURCE_COUNT) {
    throw new ResourceError(`At most ${MAX_COMPILE_RESOURCE_COUNT} resource files per compilation.`);
  }
  return result;
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Guess a MIME type when the browser does not supply one. */
export function guessMimeType(filename: string, provided?: string): string {
  if (provided) return provided;
  const ext = filename.toLowerCase().split('.').pop() ?? '';
  const map: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    pdf: 'application/pdf',
    csv: 'text/csv',
    txt: 'text/plain',
    tex: 'text/x-tex',
  };
  return map[ext] ?? 'application/octet-stream';
}

/** The LaTeX snippet the editor inserts for a given resource. */
export function insertSnippetFor(filename: string): string {
  const ext = filename.toLowerCase().split('.').pop() ?? '';
  if (['png', 'jpg', 'jpeg', 'pdf'].includes(ext)) {
    return `\\includegraphics[width=0.8\\linewidth]{${filename}}`;
  }
  if (ext === 'tex') return `\\input{${filename}}`;
  return filename;
}
