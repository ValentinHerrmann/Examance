/** The Layout step's sample exam (issue #272): a fixed exam with no teacher content, compiled once with as few layout features as possible; every layout option is drawn over its pages (`components/exam/sketch`). */

import type { ExamRecord } from '#lib/db/schema';
import { compileWithCache } from '#lib/latex/compileCache';
import type { CompileResult } from '#lib/latex/compiler';
import { formatExerciseLatex } from '#lib/latex/scoreParser';
import { buildMcOptionsLatex } from '#lib/latex/mcOptions';
import { effectiveLatexCompilation } from '#lib/stores/capabilities';
import { buildExamLatex } from '#lib/exam/examPreview';

/** Link URIs only the sample sets: where the last page's writing space starts, and where the MC question's text starts (its correction hint sits right above). */
export const SAMPLE_REST_URI = 'omr://__sample__/rest';
export const SAMPLE_MC_URI = 'omr://__sample__/mc';

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
  nr: '1',
  infoText: String.raw`\begin{itemize}
  \item Hilfsmittel: keine
  \item Bearbeitungszeit: 45 Minuten
\end{itemize}`,
  digitalGrading: false,
  resultsQrBox: true,
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
  return compileWithCache({ kind: 'layout-sample', id: 'v1', variant: 'angabe' }, layoutSampleTex(), useLocal, onStatus, false, {});
}
