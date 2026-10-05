/**
 * Exam header logos (issue #46). The account stores one logo; an exam follows it, prints none, or
 * prints its own. The compile places the logo next to `main.tex` as `examance-logo.<ext>`, and
 * `Schulaufgabe.sty` prints whichever of those files exists, so the LaTeX source never names it.
 *
 * Mirrored by `backend/app/services/logo.py` (limits, accepted types, file names). The server
 * resolves the logo itself for a server compile; the local engine gets the bytes from here.
 */
import { api } from '#lib/api/client';
import { uint8ArrayToBase64 } from '#lib/crypto/aesGcm';
import type { TranslationKey } from '#lib/i18n';
import type { LatexResourceFile } from './resources';

/** Hard cap for a logo file. It is printed 9 mm tall; anything larger is a scan. */
export const MAX_LOGO_BYTES = 2 * 1024 * 1024;

const LOGO_BASENAME = 'examance-logo';

/** Every name a logo can take in the working directory; reserved for resource uploads. */
export const LOGO_FILENAMES = ['pdf', 'png', 'jpg', 'jpeg'].map((ext) => `${LOGO_BASENAME}.${ext}`);

export const LOGO_ACCEPT = 'application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg';

export type LogoMime = 'application/pdf' | 'image/png' | 'image/jpeg';
export type LogoSource = 'account' | 'exam' | 'none';
export type ExamLogoMode = 'account' | 'none' | 'custom';

export interface LogoInfo {
  source: LogoSource;
  mime_type: LogoMime | null;
  byte_size: number;
  updated_at: string | null;
}

export interface ExamLogoInfo extends LogoInfo {
  mode: ExamLogoMode;
}

/** The logo of one compile: what the server resolves (`examId`), or the bytes for the local engine. */
export interface CompileLogo {
  /** Exam whose logo to print; null prints the account logo (an exam the server does not know yet). */
  examId: string | null;
  /** Changes whenever the printed logo does, so cached PDFs with an old logo are not reused. */
  fingerprint: string;
  /** Present for local compiles only. */
  file?: LatexResourceFile;
}

/** An exam's logo choice staged in the metadata editor, applied on save with `setExamLogo`. */
export interface ExamLogoChange {
  mode: ExamLogoMode;
  /** A newly picked file for `custom`; absent keeps the exam's stored file. */
  bytes?: Uint8Array;
}

/** A picked file that is not an acceptable logo; `key` is the message to show. */
export class LogoError extends Error {
  constructor(readonly key: TranslationKey) {
    super(key);
  }
}

const QUIET = { silentError: true };

/** The logo's type from its magic bytes (never from the file name), or null. */
export function sniffLogoMime(bytes: Uint8Array): LogoMime | null {
  const starts = (sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (starts([0x25, 0x50, 0x44, 0x46, 0x2d])) return 'application/pdf';
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (starts([0xff, 0xd8, 0xff])) return 'image/jpeg';
  return null;
}

export function logoFilename(mime: string | null): string {
  const ext = mime === 'image/png' ? 'png' : mime === 'image/jpeg' ? 'jpg' : 'pdf';
  return `${LOGO_BASENAME}.${ext}`;
}

/** Reads and checks a picked logo file. */
export async function readLogoFile(file: File): Promise<{ bytes: Uint8Array; mime: LogoMime }> {
  if (file.size === 0) throw new LogoError('logo.errors.empty');
  if (file.size > MAX_LOGO_BYTES) throw new LogoError('logo.errors.tooLarge');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniffLogoMime(bytes);
  if (!mime) throw new LogoError('logo.errors.type');
  return { bytes, mime };
}

// --- account logo ------------------------------------------------------------------------------

export function getAccountLogoInfo(): Promise<LogoInfo> {
  return api.get<LogoInfo>('/user/logo', QUIET);
}

export async function fetchAccountLogo(): Promise<Uint8Array> {
  return new Uint8Array(await api.getBinary('/user/logo/file', QUIET));
}

export function uploadAccountLogo(bytes: Uint8Array): Promise<LogoInfo> {
  return api.put<LogoInfo>('/user/logo', { content_b64: uint8ArrayToBase64(bytes) }, QUIET);
}

export async function deleteAccountLogo(): Promise<void> {
  await api.delete('/user/logo', QUIET);
}

// --- exam logo ---------------------------------------------------------------------------------

export function getExamLogoInfo(examId: string): Promise<ExamLogoInfo> {
  return api.get<ExamLogoInfo>(`/exams/${examId}/logo`, QUIET);
}

/** The logo the exam prints (its own or the account's). */
export async function fetchExamLogo(examId: string): Promise<Uint8Array> {
  return new Uint8Array(await api.getBinary(`/exams/${examId}/logo/file`, QUIET));
}

/** `custom` without bytes keeps the exam's stored file. */
export function setExamLogo(examId: string, mode: ExamLogoMode, bytes?: Uint8Array): Promise<ExamLogoInfo> {
  return api.put<ExamLogoInfo>(
    `/exams/${examId}/logo`,
    { mode, ...(bytes ? { content_b64: uint8ArrayToBase64(bytes) } : {}) },
    QUIET
  );
}

// --- compile -----------------------------------------------------------------------------------

const bytesCache = new Map<string, Uint8Array>();

/**
 * The logo for compiling an exam (`examId`) or a draft the server does not know yet (null).
 * Never fails a compile: when the logo cannot be loaded the exam is compiled without one.
 */
export async function resolveCompileLogo(
  examId: string | null,
  useLocal: boolean
): Promise<CompileLogo | undefined> {
  try {
    const info = examId ? await getExamLogoInfo(examId) : await getAccountLogoInfo();
    if (info.source === 'none') return undefined;
    const fingerprint = `${info.source}:${info.mime_type}:${info.byte_size}:${info.updated_at}`;
    if (!useLocal) return { examId, fingerprint };

    const cacheKey = `${examId ?? 'account'}|${fingerprint}`;
    let content = bytesCache.get(cacheKey);
    if (!content) {
      content = examId ? await fetchExamLogo(examId) : await fetchAccountLogo();
      bytesCache.set(cacheKey, content);
    }
    return { examId, fingerprint, file: { filename: logoFilename(info.mime_type), content } };
  } catch (err) {
    console.warn('[logo] Could not load the exam logo; compiling without it.', err);
    return undefined;
  }
}

/** Drops downloaded logo bytes (e.g. on lock). */
export function clearLogoCache(): void {
  bytesCache.clear();
}

// --- archives (.bgproj) ------------------------------------------------------------------------

/**
 * An exam's logo as it travels in a `.bgproj` archive: the exam's setting plus the bytes it
 * printed (its own file, or the account logo it followed), so an importer gets the same header
 * whatever their own account logo is.
 */
export interface ArchivedExamLogo {
  examId: string;
  mode: ExamLogoMode;
  mimeType?: LogoMime | null;
  /** Absent when the exam printed no logo. */
  bytes?: Uint8Array;
}

/** Reads an exam's logo for an archive. Throws when the server cannot be asked. */
export async function exportExamLogo(examId: string): Promise<ArchivedExamLogo> {
  const info = await getExamLogoInfo(examId);
  if (info.source === 'none') return { examId, mode: info.mode };
  return { examId, mode: info.mode, mimeType: info.mime_type, bytes: await fetchExamLogo(examId) };
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/**
 * Gives an imported exam (`examId`, already created on the server) the header it was exported
 * with. An exam that followed the exporter's account logo keeps following the importer's account
 * only when that prints the same thing; otherwise it gets the archived file (or no logo) as its own.
 * `accountLogo` is the importer's account logo (null: none). Returns whether anything was written.
 */
export async function restoreExamLogo(
  examId: string,
  archived: ArchivedExamLogo,
  accountLogo: Uint8Array | null
): Promise<boolean> {
  const bytes = archived.bytes && archived.bytes.length > 0 ? archived.bytes : null;
  if (archived.mode === 'none' || (!bytes && accountLogo)) {
    await setExamLogo(examId, 'none');
    return true;
  }
  if (!bytes) return false; // Printed no logo, and the importer's account has none either.
  if (archived.mode === 'account' && accountLogo && sameBytes(bytes, accountLogo)) return false;
  await setExamLogo(examId, 'custom', bytes);
  return true;
}

/** The importer's account logo bytes, or null when there is none. */
export async function loadAccountLogoBytes(): Promise<Uint8Array | null> {
  const info = await getAccountLogoInfo();
  return info.source === 'none' ? null : fetchAccountLogo();
}
