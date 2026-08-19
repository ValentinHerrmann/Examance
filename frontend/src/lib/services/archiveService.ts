import { clearAllTables } from "$lib/db/db";
import { projectStore } from "$lib/stores/project";
import { packProject } from "$lib/archive/packer";
import { unpackProject } from "$lib/archive/unpacker";
import { translate } from "$lib/i18n";

/**
 * Opens a .bgproj archive file by unpacking it into the local workspace.
 * Clears existing data before importing.
 *
 * @param file - The .bgproj file to import
 * @param password - Password to decrypt the archive
 * @returns Import counts plus any per-record failures the caller should surface
 * @throws Error if import fails or password is rejected
 */
export async function openBgprojArchive(
  file: File,
  password: string
): Promise<{ examCount: number; studentCount: number; errors: string[] }> {
  const buffer = new Uint8Array(await file.arrayBuffer());
  await clearAllTables();
  projectStore.clear();
  return unpackProject(buffer, password);
}

/**
 * Builds the user-facing summary for a finished import. Records that the server
 * rejected are listed explicitly — they are silently dropped otherwise, which is
 * what made a failed import look successful.
 */
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
  URL.revokeObjectURL(url);
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
 * Shows a confirmation dialog for destructive archive operations.
 * @returns true if user confirmed
 */
export function confirmWorkspaceReplace(): boolean {
  return confirm(translate("workspace.archive.confirmReplace"));
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