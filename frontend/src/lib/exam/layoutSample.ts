/** The Layout step's sample exam (issue #272): a fixed exam with no teacher content, compiled once with as few layout features as possible; every layout option is drawn over its pages (`components/exam/sketch`). */

import type { ExamRecord } from '#lib/db/schema';
import { compileWithCache } from '#lib/latex/compileCache';
import type { CompileResult } from '#lib/latex/compiler';
import { formatExerciseLatex } from '#lib/latex/scoreParser';
import { buildMcOptionsLatex } from '#lib/latex/mcOptions';
import { effectiveLatexCompilation } from '#lib/stores/capabilities';
import { buildExamLatex } from '#lib/exam/examPreview';
import { examBaseMinutes, printedExtension, type TimeExtension } from '#lib/students/timeExtension';

/** Link URIs only the sample sets: where the last page's writing space starts, where the MC question's text starts (its correction hint sits right above), and the room of the info text, which the preview fills with the exam's own. */
export const SAMPLE_REST_URI = 'omr://__sample__/rest';
export const SAMPLE_MC_URI = 'omr://__sample__/mc';
export const SAMPLE_INFO_START_URI = 'omr://__sample__/info-start';
export const SAMPLE_INFO_END_URI = 'omr://__sample__/info-end';

// Ends with a line break, so the following text never glues onto `\par` (a `\parLorem` broke the compile).
const marker = (uri: string) => String.raw`\noindent\href{${uri}}{\rule{0pt}{1pt}\hspace{\linewidth}}\par` + '\n';

/** The base the overlays start from: no scan aids (their room is kept), the QR sticker box and the name line printed, the MC hint on; the overlays mask what an exam leaves out. */
const SAMPLE_EXAM: ExamRecord = {
  id: 'layout-sample',
  title: 'Musterarbeit',
  testart: 'Kurzarbeit',
  fach: 'Fach',
  klasse: '10a',
  lehrernachname: 'Muster',
  datum: '01.01.2027',
  // The header prints "01.01.2027 (30 Minuten + 5 Minuten Einlesezeit)" (`printedDatum`).
  durationMinutes: 30,
  readingMinutes: 5,
  nr: '1',
  // Only the room: the preview draws the exam's own info text into it.
  infoText: marker(SAMPLE_INFO_START_URI) + String.raw`\rule{0pt}{2cm}\par` + '\n' + marker(SAMPLE_INFO_END_URI),
  digitalGrading: false,
  resultsQrBox: true,
  cutCorner: false,
  foldStrip: false,
  nameLine: true,
  pageCodes: false,
  printLayout: 'duplex',
  printMode: 'stickers',
  stickerSpots: 'cover',
  paperStyle: 'empty',
  extraPages: 0,
  mcCorrectionHint: true,
  extraNotes: null,
} as ExamRecord;

/** The sample student (issue #272): class-list number 7 with a 20 % time extension. */
const SAMPLE_EXTENSION: TimeExtension = { value: 20, unit: '%' };

/** The sample student's printed label as stickers and copies print it: "07  Mustermann, Max  +20 % (+7 Min)" (`labelParts` in qr/stickerSheet.ts, kept out of this chunk because it pulls in pdf-lib; a test keeps both equal). */
export const SAMPLE_LABEL = `07  Mustermann, Max  ${printedExtension(SAMPLE_EXTENSION, examBaseMinutes(SAMPLE_EXAM))}`;
/** What the student writes on the name line. */
export const SAMPLE_HANDWRITTEN = 'Max Mustermann';

const LOREM = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.';

/** Three exercises that fill three pages: free text, multiple choice and a longer one with answer lines. */
function sampleExercises(): string {
  const text = formatExerciseLatex(String.raw`${LOREM}

\LoesungLine{${LOREM}}{6}
\BE \BE \BE`, 'Aufgabe 1');
  const mc = formatExerciseLatex(
    marker(SAMPLE_MC_URI) + buildMcOptionsLatex(`${LOREM.slice(0, 120)}?`, [
      { text: 'Antwort A', correct: true },
      { text: 'Antwort B', correct: false },
      { text: 'Antwort C', correct: false },
      { text: 'Antwort D', correct: false },
    ]) + String.raw`
\BE \BE`,
    'Aufgabe 2',
    undefined,
    undefined,
    true,
  );
  const long = formatExerciseLatex(String.raw`${LOREM} ${LOREM}

\LoesungKaro{${LOREM}}{8}
\BE \BE \BE \BE`, 'Aufgabe 3');
  const last = formatExerciseLatex(String.raw`${LOREM}

\LoesungLine{${LOREM}}{4}
\BE \BE`, 'Aufgabe 4');
  return [text, mc, long, String.raw`\newpage`, last].join('\n\n');
}

/** The sample's full source; the rest marker follows the points table, where the last page's writing space begins. */
export function layoutSampleTex(): string {
  const tex = buildExamLatex(SAMPLE_EXAM, sampleExercises(), 'sans,punkte', [], { fill: false });
  return tex.replace(String.raw`\end{document}`, `\\par\n${marker(SAMPLE_REST_URI)}\\end{document}`);
}

/** Compiles the sample once per session and engine; every exam's Layout step reuses it. */
export function compileLayoutSample(onStatus?: (status: string) => void): Promise<CompileResult> {
  const useLocal = effectiveLatexCompilation() === 'local';
  return compileWithCache({ kind: 'layout-sample', id: 'v2', variant: 'angabe' }, layoutSampleTex(), useLocal, onStatus, false, {});
}
