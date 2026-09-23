import { get } from "svelte/store";
import { clearAllTables } from "$lib/db/db";
import { projectStore } from "$lib/stores/project";
import { sessionStore } from "$lib/stores/session";
import { askAboutConflicts } from "$lib/stores/conflictPrompt";
import { packProject } from "$lib/archive/packer";
import { applyArchive, decryptArchive, type ImportResult } from "$lib/archive/unpacker";
import {
  applyResolutions,
  detectConflicts,
  type ArchiveConflict,
  type DecisionMap,
} from "$lib/archive/conflicts";
import { translate } from "$lib/i18n";

type ConflictResolver = (conflicts: ArchiveConflict[], identicalCount: number) => Promise<DecisionMap>;

/**
 * Imports a .bgproj archive into the current workspace, merging with what is
 * already there. Order is the point: decrypt (touches nothing), then ask about
 * every collision, and only then write — under the live session key.
 *
 * @throws if the password is rejected, the session is locked, or the teacher
 *   cancels the conflict dialog. Nothing is written in any of those cases.
 */
export async function openBgprojArchive(
  file: File,
  password: string,
  resolve: ConflictResolver = askAboutConflicts
): Promise<ImportResult> {
  const payload = await decryptArchive(new Uint8Array(await file.arrayBuffer()), password);

  const key = get(sessionStore).sessionKey;
  if (!key) throw new Error(translate("workspace.archive.lockedCannotImport"));

  const { conflicts, identicalCount } = await detectConflicts(payload, key);
  const decisions = conflicts.length > 0 ? await resolve(conflicts, identicalCount) : new Map();

  return applyArchive(applyResolutions(payload, decisions).payload);
}

/**
 * The whole interactive import: password prompt, import, summary or error
 * alert. Shared by the workspace menu and the dashboard.
 *
 * @returns true when something was imported.
 */
export async function importArchiveInteractively(file: File): Promise<boolean> {
  const password = promptArchivePassword(translate("workspace.archive.promptImportPassword"));
  if (!password) return false;
  try {
    alert(formatImportSummary(await openBgprojArchive(file, password)));
    return true;
  } catch (err: any) {
    alert(translate("workspace.archive.importFailed", { message: err.message }));
    return false;
  }
}

/** User-facing import summary; lists every record the server rejected. */
export function formatImportSummary(result: {
  examCount: number;
  studentCount: number;
  errors: string[];
}): string {
  const loaded = translate("workspace.archive.summaryLoaded", {
    examCount: result.examCount,
    studentCount: result.studentCount,
  });
  if (result.errors.length === 0) {
    return translate("workspace.archive.summarySuccess", { loaded });
  }
  return (
    translate("workspace.archive.summaryProblems", {
      errorCount: result.errors.length,
      loaded,
    }) +
    `\n\n${translate("workspace.archive.summaryProblemsHeading")}\n` +
    result.errors.map((e) => `• ${e}`).join('\n')
  );
}

/**
 * Exports the current workspace as an encrypted .bgproj archive.
 * Triggers a browser file download.
 *
 * @param password - Password to encrypt the archive with
 * @param filename - Optional custom filename (default: "workspace.bgproj")
 * @throws Error if export fails
 */
export async function exportBgprojArchive(password: string, filename = "workspace.bgproj"): Promise<void> {
  const blob = await packProject(password);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  // Revoking synchronously after click() can cancel the download.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * The whole interactive export: password prompt, download, error alert.
 * Shared by the workspace menu, the exam page and the mode-switch wizard.
 *
 * @returns true when the archive was written.
 */
export async function exportArchiveInteractively(filename = "workspace.bgproj"): Promise<boolean> {
  const password = promptArchivePassword(translate("workspace.archive.promptExportPassword"));
  if (!password) return false;
  try {
    await exportBgprojArchive(password, filename);
    return true;
  } catch (err: any) {
    alert(translate("workspace.archive.exportFailed", { message: err.message }));
    return false;
  }
}

/**
 * Clears the entire local workspace (all tables + project state).
 * @throws Error if clearing fails
 */
export async function clearWorkspace(): Promise<void> {
  await clearAllTables();
  projectStore.clear();
}

/**
 * Shows a confirmation dialog for clearing the workspace.
 * @returns true if user confirmed
 */
export function confirmWorkspaceClear(): boolean {
  return confirm(translate("workspace.archive.confirmClear"));
}

/**
 * Prompts the user for a password (for import or export).
 * @param message - The prompt message
 * @returns The password string or null if cancelled
 */
export function promptArchivePassword(message: string): string | null {
  return prompt(message);
}