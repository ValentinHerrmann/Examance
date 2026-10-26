import { get } from "svelte/store";
import { clearAllTables } from "#lib/db/db";
import { projectStore } from "#lib/stores/project";
import { sessionStore } from "#lib/stores/session";
import { askAboutConflicts } from "#lib/stores/conflictPrompt";
import { showArchiveReport } from "#lib/stores/archiveReport";
import { collectHttpErrors, type CollectedHttpError } from "#lib/stores/httpErrorStore";
import { bump, newReport, type ArchiveReport, type ReportKind } from "#lib/archive/report";
import { packProject, type PackOptions } from "#lib/archive/packer";
import { applyArchive, decryptArchive, type ImportResult } from "#lib/archive/unpacker";
import { isZip, readZipExport } from "#lib/archive/zipImport";
import {
  applyResolutions,
  detectConflicts,
  type ArchiveConflict,
  type ConflictKind,
  type DecisionMap,
} from "#lib/archive/conflicts";
import { translate } from "#lib/i18n";
import { WORKSPACE_ARCHIVE_EXT } from "#lib/archive/format";

type ConflictResolver = (conflicts: ArchiveConflict[], identicalCount: number) => Promise<DecisionMap>;

const KIND_TO_REPORT: Record<ConflictKind, ReportKind> = {
  exam: "exams",
  exercise: "exercises",
  mcGroup: "mcGroups",
  student: "students",
  submission: "submissions",
};

/** HTTP errors a batch run collected instead of showing, as report details. */
function describeHttpErrors(errors: CollectedHttpError[]): string[] {
  return errors.map((e) => `HTTP ${e.status}${e.code ? ` ${e.code}` : ""}: ${e.message}`);
}

/**
 * Imports an encrypted archive, merging with the workspace: decrypt (touches nothing), ask about every collision, then write
 * under the live session key. Every outcome goes into the returned report; no request raises the global HTTP error modal.
 * @throws on rejected password, locked session, or cancelled conflict dialog; nothing is written then.
 */
export async function openBgprojArchive(
  file: File,
  password: string,
  resolve: ConflictResolver = askAboutConflicts
): Promise<ImportResult> {
  const payload = await decryptArchive(new Uint8Array(await file.arrayBuffer()), password);
  return importPayload(payload, file.name, resolve);
}

/** Imports an exam or exercise-library ZIP export (no password: ZIP exports are plaintext). @throws like `openBgprojArchive`. */
export async function openZipExport(file: File, resolve: ConflictResolver = askAboutConflicts): Promise<ImportResult> {
  return importPayload(readZipExport(new Uint8Array(await file.arrayBuffer())), file.name, resolve);
}

async function importPayload(payload: Record<string, any>, filename: string, resolve: ConflictResolver): Promise<ImportResult> {
  const key = get(sessionStore).sessionKey;
  if (!key) throw new Error(translate("workspace.archive.lockedCannotImport"));

  const report = newReport("import", filename);
  const { result, errors } = await collectHttpErrors(async () => {
    const scan = await detectConflicts(payload, key);
    const decisions = scan.conflicts.length > 0 ? await resolve(scan.conflicts, scan.identicalCount) : new Map();

    // Identical and kept records are counted here; copies and replacements where they are written, so each counts once.
    for (const r of scan.identical) bump(report, KIND_TO_REPORT[r.kind], "alreadyPresent");
    const { payload: resolved, idMap } = applyResolutions(payload, decisions, scan.identical);
    const decided = new Map<string, "copied" | "replaced">();
    for (const d of (decisions as DecisionMap).values()) {
      if (d.choice === "keep-existing") bump(report, KIND_TO_REPORT[d.kind], "keptExisting");
      if (d.choice === "import-as-copy") decided.set(idMap.get(d.id) ?? d.id, "copied");
      if (d.choice === "take-imported") decided.set(d.id, "replaced");
    }
    return applyArchive(resolved, undefined, { report, ownExamIds: scan.ownExamIds, decided });
  });
  report.problems.push(...describeHttpErrors(errors));
  return result;
}

/**
 * The whole interactive import (password prompt for archives, import, report modal), shared by workspace menu, dashboard
 * and exercise library. Takes `.examance`/`.examance-exam`/`.bgproj` archives and Examance ZIP exports. True when imported.
 */
export async function importArchiveInteractively(file: File): Promise<boolean> {
  let result: ImportResult;
  try {
    if (isZip(new Uint8Array(await file.slice(0, 4).arrayBuffer()))) {
      result = await openZipExport(file);
    } else {
      const password = promptArchivePassword(translate("workspace.archive.promptImportPassword"));
      if (!password) return false;
      result = await openBgprojArchive(file, password);
    }
  } catch (err: any) {
    alert(translate("workspace.archive.importFailed", { message: err.message }));
    return false;
  }
  await showArchiveReport(result.report);
  return true;
}

/** Exports the workspace (or, with `examIds`, single exams) as an encrypted archive download. @throws Error if export fails. */
export async function exportBgprojArchive(
  password: string,
  filename = `examance-${new Date().toISOString().slice(0, 10)}${WORKSPACE_ARCHIVE_EXT}`,
  opts: PackOptions = {}
): Promise<ArchiveReport> {
  const { result, errors } = await collectHttpErrors(() => packProject(password, undefined, opts));
  const { blob, report } = result;
  report.filename = filename;
  report.problems.push(...describeHttpErrors(errors));
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  // Revoking synchronously after click() can cancel the download.
  setTimeout(() => URL.revokeObjectURL(url), 0);
  return report;
}

/** The whole interactive export (password prompt, download, report modal or error alert), shared by workspace menu, exam page and mode-switch wizard. Returns true when written. */
export async function exportArchiveInteractively(
  filename = `examance-${new Date().toISOString().slice(0, 10)}${WORKSPACE_ARCHIVE_EXT}`,
  opts: PackOptions = {}
): Promise<boolean> {
  const password = promptArchivePassword(translate("workspace.archive.promptExportPassword"));
  if (!password) return false;
  let report: ArchiveReport;
  try {
    report = await exportBgprojArchive(password, filename, opts);
  } catch (err: any) {
    alert(translate("workspace.archive.exportFailed", { message: err.message }));
    return false;
  }
  await showArchiveReport(report);
  return true;
}

/** Clears the entire local workspace (all tables + project state). @throws Error if clearing fails. */
export async function clearWorkspace(): Promise<void> {
  await clearAllTables();
  projectStore.clear();
}

/** Shows a confirmation dialog for clearing the workspace; true if confirmed. */
export function confirmWorkspaceClear(): boolean {
  return confirm(translate("workspace.archive.confirmClear"));
}

/** Prompts for an archive password (import or export); null if cancelled. */
export function promptArchivePassword(message: string): string | null {
  return prompt(message);
}