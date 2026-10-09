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
import {
  applyResolutions,
  detectConflicts,
  type ArchiveConflict,
  type ConflictKind,
  type DecisionMap,
} from "#lib/archive/conflicts";
import { translate } from "#lib/i18n";

type ConflictResolver = (conflicts: ArchiveConflict[], identicalCount: number) => Promise<DecisionMap>;

const KIND_TO_REPORT: Record<ConflictKind, ReportKind> = {
  exam: "exams",
  exercise: "exercises",
  mcGroup: "mcGroups",
  student: "students",
  submission: "submissions",
  resource: "resources",
};

/** HTTP errors a batch run collected instead of showing, as report details. */
function describeHttpErrors(errors: CollectedHttpError[]): string[] {
  return errors.map((e) => `HTTP ${e.status}${e.code ? ` ${e.code}` : ""}: ${e.message}`);
}

/**
 * Imports a .bgproj archive, merging with the workspace: decrypt (touches nothing), ask about every collision, then write
 * under the live session key. Every outcome goes into the returned report; no request raises the global HTTP error modal.
 * @throws on rejected password, locked session, or cancelled conflict dialog; nothing is written then.
 */
export async function openBgprojArchive(
  file: File,
  password: string,
  resolve: ConflictResolver = askAboutConflicts
): Promise<ImportResult> {
  const payload = await decryptArchive(new Uint8Array(await file.arrayBuffer()), password);

  const key = get(sessionStore).sessionKey;
  if (!key) throw new Error(translate("workspace.archive.lockedCannotImport"));

  const report = newReport("import", file.name);
  const { result, errors } = await collectHttpErrors(async () => {
    const scan = await detectConflicts(payload, key);
    const decisions = scan.conflicts.length > 0 ? await resolve(scan.conflicts, scan.identicalCount) : new Map();

    // The teacher's decisions and the identical records, as report counts.
    for (const r of scan.identical) bump(report, KIND_TO_REPORT[r.kind], "alreadyPresent");
    const takeImportedIds = new Set<string>();
    for (const d of (decisions as DecisionMap).values()) {
      const kind = KIND_TO_REPORT[d.kind];
      if (d.choice === "keep-existing") bump(report, kind, "keptExisting");
      if (d.choice === "import-as-copy") bump(report, kind, "copied");
      if (d.choice === "take-imported") {
        bump(report, kind, "replaced");
        takeImportedIds.add(d.id);
      }
    }

    const resolved = applyResolutions(payload, decisions, scan.identical).payload;
    return applyArchive(resolved, undefined, { report, ownExamIds: scan.ownExamIds, takeImportedIds });
  });
  report.problems.push(...describeHttpErrors(errors));
  return result;
}

/** The whole interactive import (password prompt, import, report modal), shared by workspace menu and dashboard. Returns true when something was imported. */
export async function importArchiveInteractively(file: File): Promise<boolean> {
  const password = promptArchivePassword(translate("workspace.archive.promptImportPassword"));
  if (!password) return false;
  let result: ImportResult;
  try {
    result = await openBgprojArchive(file, password);
  } catch (err: any) {
    alert(translate("workspace.archive.importFailed", { message: err.message }));
    return false;
  }
  await showArchiveReport(result.report);
  return true;
}

/** Exports the workspace as an encrypted .bgproj archive (browser download; default filename "workspace.bgproj"). @throws Error if export fails. */
export async function exportBgprojArchive(
  password: string,
  filename = "workspace.bgproj",
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
  filename = "workspace.bgproj",
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