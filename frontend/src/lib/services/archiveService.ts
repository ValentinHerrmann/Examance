import { get } from "svelte/store";
import { clearAllTables } from "$lib/db/db";
import { projectStore } from "$lib/stores/project";
import { sessionStore } from "$lib/stores/session";
import { packProject } from "$lib/archive/packer";
import { applyArchive, decryptArchive, type ImportResult } from "$lib/archive/unpacker";
import {
  applyResolutions,
  detectConflicts,
  type ArchiveConflict,
  type DecisionMap,
} from "$lib/archive/conflicts";
import { translate } from "$lib/i18n";

export interface OpenArchiveOptions {
  /**
   * `merge` (the default) keeps what is already there and asks about every
   * collision. `replace` wipes the workspace first — but only once the archive
   * has been decrypted, never before.
   */
  mode?: "merge" | "replace";
  /**
   * Called with the collisions found before anything is written. Returning a
   * decision map lets the import proceed; throwing cancels it with nothing
   * written. Required in merge mode when conflicts exist — an importer that
   * cannot ask must not guess.
   */
  resolve?: (conflicts: ArchiveConflict[], identicalCount: number) => Promise<DecisionMap>;
}

/**
 * Opens a .bgproj archive into the current workspace.
 *
 * Order matters and used to be wrong: this called `clearAllTables()` *before*
 * the password had been checked, so a typo, a truncated file or the wrong file
 * destroyed the workspace and imported nothing. Decryption comes first now,
 * then conflict resolution, and only then any write.
 *
 * @throws Error if the password is rejected, the session is locked, the
 *   importer cannot resolve conflicts, or the teacher cancels.
 */
export async function openBgprojArchive(
  file: File,
  password: string,
  options: OpenArchiveOptions = {}
): Promise<ImportResult & { identicalCount: number }> {
  const buffer = new Uint8Array(await file.arrayBuffer());

  // 1. Decrypt. Touches nothing — a wrong password costs nothing.
  const payload = await decryptArchive(buffer, password);

  // 2. The live key must exist before we start writing, not halfway through.
  if (!get(sessionStore).sessionKey) {
    throw new Error(translate("workspace.archive.lockedCannotImport"));
  }

  // 3. Find collisions against what the target store already holds.
  const { conflicts, identicalCount } = await detectConflicts(payload, get(sessionStore).sessionKey);

  let decisions: DecisionMap = new Map();
  if (conflicts.length > 0) {
    if (!options.resolve) {
      throw new Error(
        `Archive collides with ${conflicts.length} existing record(s) and this importer ` +
          `cannot ask which version to keep.`
      );
    }
    decisions = await options.resolve(conflicts, identicalCount);
  }

  const resolved = applyResolutions(payload, decisions);

  // 4. Only now is anything destroyed, and only when explicitly asked.
  if (options.mode === "replace") {
    await clearAllTables();
    projectStore.clear();
  }

  const result = await applyArchive(resolved.payload);
  return { ...result, identicalCount };
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
  // Revoking synchronously after click() can cancel the download before the
  // browser has finished reading the blob. One turn of the event loop is
  // enough, and leaking the URL until then costs nothing.
  setTimeout(() => URL.revokeObjectURL(url), 0);
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