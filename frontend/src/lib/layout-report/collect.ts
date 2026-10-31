/** Builds the files of a layout report (issue #134) from the same sources the preview compiled. File names are generic on purpose: the exam/exercise title must not reach the GitHub text. */

import type { LayoutReportFileData } from "#lib/api/layoutReports";
import { prepareExamSources, type ExamPreviewInput } from "#lib/exam/examPreview";
import { prepareExerciseSources } from "#lib/latex/exercisePreview";
import type { LatexResourceFile } from "#lib/latex/resources";
import { stripSourceMarkers } from "#lib/latex/sourceMap";
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

/** Both documents, their resource files and the previewed PDFs, under `<prefix>.tex` / `<prefix>-solution.*`. */
export async function sourceReportFiles(
  src: { prefix: "exam" | "exercise"; angabeTex: string; loesungTex: string; resources: LatexResourceFile[] },
  angabePdfUrl: string | null,
  loesungPdfUrl: string | null
): Promise<LayoutReportFileData[]> {
  return [
    texFile(`${src.prefix}.tex`, stripSourceMarkers(src.angabeTex)),
    texFile(`${src.prefix}-solution.tex`, stripSourceMarkers(src.loesungTex)),
    ...resourceFiles(src.resources),
    ...(await pdfFiles([
      { filename: `${src.prefix}.pdf`, url: angabePdfUrl },
      { filename: `${src.prefix}-solution.pdf`, url: loesungPdfUrl },
    ])),
  ];
}

export async function examReportFiles(
  input: Pick<ExamPreviewInput, "exam" | "exercises" | "libraryExercises" | "mcGroups" | "examItems" | "key">,
  angabePdfUrl: string | null,
  loesungPdfUrl: string | null
): Promise<LayoutReportFileData[]> {
  const src = await prepareExamSources(input, true);
  const resources = src.logo?.file ? [...src.resources, src.logo.file] : src.resources;
  return sourceReportFiles({ prefix: "exam", ...src, resources }, angabePdfUrl, loesungPdfUrl);
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
  return sourceReportFiles({ prefix: "exercise", ...src, resources: collected.inline }, angabePdfUrl, loesungPdfUrl);
}
