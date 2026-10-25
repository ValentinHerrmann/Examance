/**
 * Builds the files of a layout report (issue #134) from the same sources the preview compiled.
 * File names are generic on purpose: the exam/exercise title must not reach the GitHub text.
 */

import type { LayoutReportFileData } from "#lib/api/layoutReports";
import { prepareExamSources, type ExamPreviewInput } from "#lib/exam/examPreview";
import { prepareExerciseSources } from "#lib/latex/exercisePreview";
import type { LatexResourceFile } from "#lib/latex/resources";
import { exerciseResourceRepository } from "#lib/repositories/exerciseResourceRepository";

const encoder = new TextEncoder();

function texFile(filename: string, source: string): LayoutReportFileData {
  return { filename, mimeType: "text/x-tex", content: encoder.encode(source) };
}

function mimeFor(filename: string): string {
  const ext = filename.toLowerCase().split(".").pop();
  if (ext === "pdf") return "application/pdf";
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  return "application/octet-stream";
}

function resourceFiles(resources: LatexResourceFile[]): LayoutReportFileData[] {
  return resources.map((r) => ({ filename: r.filename, mimeType: mimeFor(r.filename), content: r.content }));
}

/** The previewed PDFs (blob URLs of the last compile); missing ones are skipped. */
async function pdfFiles(pdfs: { filename: string; url: string | null }[]): Promise<LayoutReportFileData[]> {
  const out: LayoutReportFileData[] = [];
  for (const { filename, url } of pdfs) {
    if (!url) continue;
    const content = new Uint8Array(await (await fetch(url)).arrayBuffer());
    out.push({ filename, mimeType: "application/pdf", content });
  }
  return out;
}

export async function examReportFiles(
  input: Pick<ExamPreviewInput, "exam" | "exercises" | "libraryExercises" | "mcGroups" | "examItems" | "key">,
  angabePdfUrl: string | null,
  loesungPdfUrl: string | null
): Promise<LayoutReportFileData[]> {
  const src = await prepareExamSources(input, true);
  const files = [texFile("exam.tex", src.angabeTex), texFile("exam-solution.tex", src.loesungTex)];
  files.push(...resourceFiles(src.resources));
  if (src.logo?.file) files.push(...resourceFiles([src.logo.file]));
  files.push(
    ...(await pdfFiles([
      { filename: "exam.pdf", url: angabePdfUrl },
      { filename: "exam-solution.pdf", url: loesungPdfUrl },
    ]))
  );
  return files;
}

export async function exerciseReportFiles(
  input: { name: string; latexBody: string; resourceOwnerId: string; staged: boolean; key: CryptoKey | null },
  angabePdfUrl: string | null,
  loesungPdfUrl: string | null
): Promise<LayoutReportFileData[]> {
  const src = await prepareExerciseSources(input.name, input.latexBody);
  const collected = await exerciseResourceRepository.collectForCompile(
    [{ id: input.resourceOwnerId, label: src.name, staged: input.staged }],
    input.key,
    true
  );
  return [
    texFile("exercise.tex", src.angabeTex),
    texFile("exercise-solution.tex", src.loesungTex),
    ...resourceFiles(collected.inline),
    ...(await pdfFiles([
      { filename: "exercise.pdf", url: angabePdfUrl },
      { filename: "exercise-solution.pdf", url: loesungPdfUrl },
    ])),
  ];
}
