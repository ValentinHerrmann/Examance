import { downloadBlob } from '#lib/components/stats/chartExport';
import { translate } from '#lib/i18n';
import type { ExportProgress, ExportResult } from './progress';

/** Runs a raw export, packs and downloads its ZIP, and returns the non-fatal warnings; the modal and the Archive tab both go through it. */
export async function runZipExport(
    run: (selected: Set<string>, progress: ExportProgress) => Promise<ExportResult>,
    selected: Set<string>,
    progress: ExportProgress,
): Promise<string[]> {
    const result = await run(selected, progress);
    progress(translate('export.dialog.packing'));
    downloadBlob(result.zip.toBlob(), result.fileName);
    return result.warnings;
}
