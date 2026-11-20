import { get } from 'svelte/store';
import type { ExerciseRecord } from '#lib/db/schema';
import { translate } from '#lib/i18n';
import { compileExercisePreview } from '#lib/latex/exercisePreview';
import { exerciseReportFiles } from '#lib/layout-report/collect';
import { effectiveLatexStore } from '#lib/stores/capabilities';
import { createPreviewFlow } from '#lib/stores/previewFlow';
import { sessionStore } from '#lib/stores/session';

/** The library's preview of a stored exercise (drawer and full view): compiled with the account's engine, with its files attached to a layout report. */
export function createLibraryPreviewFlow() {
  return createPreviewFlow<ExerciseRecord>({
    kind: 'exercise',
    idOf: (ex) => ex.id!,
    titleOf: (ex) => ex.name || translate('exercises.untitled'),
    compile: (ex, onStatus, onAngabe) =>
      compileExercisePreview({
        cacheId: ex.id!,
        name: ex.name ?? '',
        latexBody: ex.latexBody ?? '',
        resourceOwnerId: ex.id!,
        staged: false,
        useLocal: get(effectiveLatexStore) === 'local',
        key: get(sessionStore).sessionKey,
        onStatus,
        onAngabe,
      }),
    reportFiles: (ex, angabeUrl, loesungUrl) =>
      exerciseReportFiles(
        { name: ex.name ?? '', latexBody: ex.latexBody ?? '', resourceOwnerId: ex.id!, staged: false, key: get(sessionStore).sessionKey },
        angabeUrl,
        loesungUrl
      ),
  });
}
