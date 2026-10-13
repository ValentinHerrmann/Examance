/** Raw exercise-library export (issue #82): one folder per exercise plus a compilable document per group. */
import { get } from 'svelte/store';
import type { ExerciseRecord } from '#lib/db/schema';
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

interface ExportContext {
  zip: ZipBuilder;
  warnings: string[];
  taken: Set<string>;
  useLocal: boolean;
  key: CryptoKey | null;
  pdfs: boolean;
  progress: ExportProgress;
  total: number;
  done: number;
}

type GroupMember = ExerciseGroup['allMembers'][number];
interface DocumentPart {
  body: string;
  name: string;
  dir: string;
}

/** Variant folder below the group; single-variant groups stay flat. */
function variantDirFor(groupDir: string, variantKey: string, variantCount: number): string {
  if (variantCount <= 1) return groupDir;
  return `${groupDir}/${slug(variantKey === '_General' ? 'general' : variantKey)}`;
}

/** Adds Angabe/Lösung PDFs to the ZIP; a failed compile becomes a warning, not an abort. */
async function compileExercisePdfs(ctx: ExportContext, ex: ExerciseRecord, name: string, body: string, dir: string): Promise<string[]> {
  const { zip, warnings, useLocal, key } = ctx;
  ctx.progress(translate('export.exercises.compiling', { name }), ctx.done, ctx.total);
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
    if (result.missingGraphics.length)
      warnings.push(translate('export.exercises.missingGraphics', { name, files: [...new Set(result.missingGraphics)].join(', ') }));
    return [zip.add(`${dir}/angabe.pdf`, result.angabe.pdfBytes), zip.add(`${dir}/loesung.pdf`, result.loesung.pdfBytes)];
  } catch (err) {
    warnings.push(translate('export.exercises.pdfFailed', { name, error: err instanceof Error ? err.message : String(err) }));
    return [];
  }
}

function manifestEntry(ex: ExerciseRecord, body: string, version: GroupMember['version'], dir: string, name: string, resources: string[], pdfFiles: string[]) {
  return {
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
  };
}

async function exportExercise(ctx: ExportContext, { ex, version }: GroupMember, variantDir: string) {
  const { zip } = ctx;
  const name = ex.name || translate('exercises.untitled');
  const body = ex.latexBody ?? '';
  const dir = claim(ctx.taken, `${variantDir}/${slug(name)}`);
  ctx.progress(translate('export.exercises.exporting', { name }), ctx.done, ctx.total);

  zip.add(`${dir}/exercise.tex`, body);
  const { inline } = await exerciseResourceRepository.collectForCompile([{ id: ex.id, label: name }], ctx.key, true);
  const resources = inline.map((file) => zip.add(`${dir}/${file.filename}`, file.content).slice(dir.length + 1));
  const pdfFiles = ctx.pdfs ? await compileExercisePdfs(ctx, ex, name, body, dir) : [];

  ctx.done++;
  return { part: { body, name, dir } satisfies DocumentPart, entry: manifestEntry(ex, body, version, dir, name, resources, pdfFiles) };
}

/** Writes `<group>.tex`, which inputs every exercise of the group; returns its path. */
function addGroupDocument(zip: ZipBuilder, groupDir: string, parts: DocumentPart[]): string {
  const texFile = `${groupDir}.tex`;
  const content = parts
    .map((part) => wrapExerciseReference(part.body, part.name, `\\input{${part.dir}/exercise.tex}`))
    .join('\n\n');
  const dirs = parts.map((part) => `{${part.dir}/}`).join('');
  zip.add(texFile, buildExerciseDocument(content, { solution: false, extraPreamble: `\\graphicspath{${dirs}}` }));
  return texFile;
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
  const ctx: ExportContext = {
    zip: new ZipBuilder(),
    warnings: [],
    taken: new Set(RESERVED_DIRS),
    useLocal: effectiveLatexCompilation() === 'local',
    key: get(sessionStore).sessionKey,
    pdfs,
    progress,
    total: groups.reduce((n, g) => n + g.allMembers.length, 0),
    done: 0,
  };
  const manifestGroups = [];

  for (const group of groups) {
    const groupDir = claim(ctx.taken, slug(group.name));
    const parts: DocumentPart[] = [];
    const manifestVariants = [];

    for (const [variantKey, members] of group.variants) {
      const variantDir = variantDirFor(groupDir, variantKey, group.variants.size);
      const exercises = [];
      for (const member of members) {
        const { part, entry } = await exportExercise(ctx, member, variantDir);
        parts.push(part);
        exercises.push(entry);
      }
      manifestVariants.push({ key: variantKey, exercises });
    }

    const texFile = addGroupDocument(ctx.zip, groupDir, parts);
    manifestGroups.push({ name: group.name, path: groupDir, texFile, variants: manifestVariants });
  }

  if (globalAssets) await addLatexProjectFiles(ctx.zip, '');
  ctx.zip.add('manifest.json', JSON.stringify({ generator: 'Examance', exportedAt: new Date().toISOString(), groups: manifestGroups }, null, 2));

  const base = groups.length === 1 ? slug(groups[0].name) : 'exercise-library';
  return { zip: ctx.zip, fileName: `${base}_${exportDateStamp()}.zip`, warnings: ctx.warnings };
}
