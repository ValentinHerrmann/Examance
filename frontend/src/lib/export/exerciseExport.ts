/** Raw exercise-library export (issue #82): one folder per exercise plus a compilable document per group. */
import { get } from 'svelte/store';
import { translate } from '#lib/i18n';
import type { ExerciseGroup } from '#lib/exercise-library/groupExercises';
import { buildExerciseDocument, compileExercisePreview, wrapExerciseReference } from '#lib/latex/exercisePreview';
import { parseExerciseScore } from '#lib/latex/scoreParser';
import { exerciseResourceRepository } from '#lib/repositories/exerciseResourceRepository';
import { effectiveLatexCompilation } from '#lib/stores/capabilities';
import { sessionStore } from '#lib/stores/session';
import { addLatexProjectFiles } from './latexAssets';
import { paceServerCompile, type ExportProgress, type ExportResult } from './progress';
import { ZipBuilder, exportDateStamp, slug } from './zip';

export interface ExerciseExportOptions {
  /** Bundled .sty/img files, so the group documents compile as they are. */
  globalAssets: boolean;
  /** Compile Angabe/Lösung PDFs per exercise (slow: one or two compiles each). */
  pdfs: boolean;
}

/** Folder names the bundled assets occupy at the ZIP root. */
const RESERVED_DIRS = ['sty', 'img'];

/** Claims `path`, appending `_2`, `_3`, … when it is taken. */
function claim(taken: Set<string>, path: string): string {
  let unique = path;
  for (let n = 2; taken.has(unique); n++) unique = `${path}_${n}`;
  taken.add(unique);
  return unique;
}

/**
 * Layout: `<group>/[<variant>/]<exercise>/{exercise.tex, resources, angabe.pdf, loesung.pdf}`, a
 * `<group>.tex` per group and `manifest.json`. The group documents sit at the ZIP root, next to
 * `sty/`, because XeLaTeX resolves `sty/Schulaufgabe` from the working directory.
 */
export async function exportExerciseGroups(
  groups: ExerciseGroup[],
  { globalAssets, pdfs }: ExerciseExportOptions,
  progress: ExportProgress
): Promise<ExportResult> {
  const zip = new ZipBuilder();
  const warnings: string[] = [];
  const taken = new Set(RESERVED_DIRS);
  const useLocal = effectiveLatexCompilation() === 'local';
  const key = get(sessionStore).sessionKey;
  const total = groups.reduce((n, g) => n + g.allMembers.length, 0);
  let done = 0;
  const manifestGroups = [];

  for (const group of groups) {
    const groupDir = claim(taken, slug(group.name));
    const documentParts: { body: string; name: string; dir: string }[] = [];
    const manifestVariants = [];

    for (const [variantKey, members] of group.variants) {
      const variantDir = group.variants.size > 1 ? `${groupDir}/${slug(variantKey === '_General' ? 'general' : variantKey)}` : groupDir;
      const manifestExercises = [];

      for (const { ex, version } of members) {
        const name = ex.name || translate('exercises.untitled');
        const body = ex.latexBody ?? '';
        const dir = claim(taken, `${variantDir}/${slug(name)}`);
        progress(translate('export.exercises.exporting', { name }), done, total);

        zip.add(`${dir}/exercise.tex`, body);
        const { inline } = await exerciseResourceRepository.collectForCompile([{ id: ex.id, label: name }], key, true);
        const resources = inline.map((file) => zip.add(`${dir}/${file.filename}`, file.content).slice(dir.length + 1));

        const pdfFiles: string[] = [];
        if (pdfs) {
          progress(translate('export.exercises.compiling', { name }), done, total);
          try {
            const result = await compileExercisePreview({
              cacheId: ex.id,
              name,
              latexBody: body,
              resourceOwnerId: ex.id,
              staged: false,
              useLocal,
              key,
              beforeCompile: () => paceServerCompile(useLocal),
            });
            pdfFiles.push(
              zip.add(`${dir}/angabe.pdf`, result.angabe.pdfBytes),
              zip.add(`${dir}/loesung.pdf`, result.loesung.pdfBytes)
            );
            if (result.missingGraphics.length)
              warnings.push(translate('export.exercises.missingGraphics', { name, files: [...new Set(result.missingGraphics)].join(', ') }));
          } catch (err) {
            warnings.push(translate('export.exercises.pdfFailed', { name, error: err instanceof Error ? err.message : String(err) }));
          }
        }

        documentParts.push({ body, name, dir });
        manifestExercises.push({
          name,
          topic: ex.topicTag ?? null,
          grade: ex.grade ?? null,
          subject: ex.subject ?? null,
          questionType: ex.questionType,
          options: ex.options ?? [],
          correctAnswers: ex.correctAnswers ?? [],
          penalty: ex.penalty,
          maxPoints: parseExerciseScore(body) || ex.maxPoints || 0,
          version,
          path: dir,
          texFile: `${dir}/exercise.tex`,
          resources,
          pdfs: pdfFiles,
        });
        done++;
      }
      manifestVariants.push({ key: variantKey, exercises: manifestExercises });
    }

    const texFile = `${groupDir}.tex`;
    const content = documentParts
      .map((part) => wrapExerciseReference(part.body, part.name, `\\input{${part.dir}/exercise.tex}`))
      .join('\n\n');
    const graphicsPath = `\\graphicspath{${documentParts.map((part) => `{${part.dir}/}`).join('')}}`;
    zip.add(texFile, buildExerciseDocument(content, { solution: false, extraPreamble: graphicsPath }));
    manifestGroups.push({ name: group.name, path: groupDir, texFile, variants: manifestVariants });
  }

  if (globalAssets) await addLatexProjectFiles(zip, '');
  zip.add('manifest.json', JSON.stringify({ generator: 'Examance', exportedAt: new Date().toISOString(), groups: manifestGroups }, null, 2));

  const base = groups.length === 1 ? slug(groups[0].name) : 'exercise-library';
  return { zip, fileName: `${base}_${exportDateStamp()}.zip`, warnings };
}
