/** Synthetic sample documents for engine measurements (node-run.mts, docs/dev/latex_performance.md), assembled by the production builders; no real data. */
import type { ExamRecord, ExerciseRecord } from '#lib/db/schema';
import { buildExamLatex, buildExerciseInputs } from '#lib/exam/examPreview';
import { buildExerciseDocument } from '#lib/latex/exercisePreview';
import { formatExerciseLatex } from '#lib/latex/scoreParser';

export interface SampleExercise {
  name: string;
  body: string;
}

export interface Sample {
  id: string;
  title: string;
  exercises: SampleExercise[];
  /** The marked document (strip with `extractSourceMap` before compiling). */
  build(exercises: SampleExercise[]): string;
}

const TEXT = String.raw`Ein Fahrradkurier fährt die Strecke von $A$ nach $B$ mit einer mittleren Geschwindigkeit von
$18\,\frac{\mathrm{km}}{\mathrm{h}}$ und zurück mit $24\,\frac{\mathrm{km}}{\mathrm{h}}$. Berechne die mittlere
Geschwindigkeit der gesamten Fahrt und begründe, warum sie nicht $21\,\frac{\mathrm{km}}{\mathrm{h}}$ beträgt. \BE \BE
\Loesung{$\bar v = \frac{2 v_1 v_2}{v_1 + v_2} \approx 20{,}6\,\frac{\mathrm{km}}{\mathrm{h}}$}`;

const MATH = String.raw`Bestimme alle Lösungen der Gleichung und gib die Lösungsmenge an. \BE \BE \hBE
\[ x^2 - 5x + 6 = 0 \qquad \text{und} \qquad \sum_{k=1}^{n} k^2 = \frac{n(n+1)(2n+1)}{6} \]
\Loesung{$\mathbb{L} = \{2;\,3\}$}`;

const TABLE = String.raw`Ergänze die Wertetabelle der Funktion $f(x) = 2x - 1$. \BE \BE
\begin{center}
\begin{tabular}{|c|c|c|c|c|}\hline
$x$ & $-1$ & $0$ & $1$ & $2$ \\ \hline
$f(x)$ & & & & \\ \hline
\end{tabular}
\end{center}
\Loesung{$-3,\ -1,\ 1,\ 3$}`;

const TIKZ = String.raw`Beschrifte die Ecken des Dreiecks und miss den Winkel bei $C$. \BE
\begin{center}
\begin{tikzpicture}
  \draw (0,0) node[below left] {$A$} -- (4,0) node[below right] {$B$} -- (1.5,2.5) node[above] {$C$} -- cycle;
  \draw (1.5,2.5) ++(-120:0.6) arc (-120:-60:0.6);
\end{tikzpicture}
\end{center}
\Loesung{$\gamma \approx 76^\circ$}`;

const PARTS = String.raw`\AFB{II}
\begin{Teilaufgabe}{Begriffe}
Erkläre den Unterschied zwischen Wetter und Klima. \BE \BE
\Loesung{Wetter: kurzfristig; Klima: langjähriges Mittel.}
\end{Teilaufgabe}
\begin{Teilaufgabe}{Anwendung}
\FestePunkte{3}
Nenne drei Klimazonen Europas.
\LoesungLeer{gemäßigt, subtropisch, subpolar}{2cm}
\end{Teilaufgabe}`;

const LIST = String.raw`Ordne die folgenden Schritte des Experiments in die richtige Reihenfolge. \BE \BE \BE
\begin{enumerate}
  \item Messwerte notieren
  \item Hypothese aufstellen
  \item Versuch aufbauen
  \item Ergebnis deuten
\end{enumerate}
\Loesung{2, 3, 1, 4}`;

const MC = String.raw`Welche Aussagen über Primzahlen sind richtig?
\LoesungMulti[2]{
  \Lmulti Jede Primzahl größer 2 ist ungerade.
  \multi Die Zahl 1 ist eine Primzahl.
  \Lmulti Es gibt unendlich viele Primzahlen.
  \multi 91 ist eine Primzahl.
}`;

const LONG = String.raw`Lies den folgenden Text und fasse ihn in eigenen Worten zusammen. \BE \BE \BE \BE
\begin{quote}
Die Stadtbibliothek verlängert ab dem kommenden Monat ihre Öffnungszeiten. An Werktagen ist sie künftig bis
20 Uhr geöffnet, samstags bis 16 Uhr. Gleichzeitig werden neue Arbeitsplätze mit Steckdosen eingerichtet,
die online reserviert werden können. Die Leitung reagiert damit auf Wünsche aus einer Umfrage unter
Schülerinnen und Schülern, die vor allem längere Lernzeiten am Abend gefordert hatten.
\end{quote}
\LoesungLeer{Längere Öffnungszeiten und reservierbare Arbeitsplätze als Antwort auf eine Umfrage.}{4cm}`;

const FILL = String.raw`Vervollständige den Satz. \BE \BE
Die Photosynthese wandelt \underline{\hspace{3cm}} in \underline{\hspace{3cm}} um.
\Loesung{Lichtenergie; chemische Energie}`;

const UNITS = String.raw`Rechne in die angegebene Einheit um. \hBE \hBE \hBE \hBE
\begin{tabularx}{\linewidth}{XXXX}
$3{,}5\,\mathrm{km} = \underline{\hspace{1.5cm}}\,\mathrm{m}$ &
$250\,\mathrm{g} = \underline{\hspace{1.5cm}}\,\mathrm{kg}$ &
$90\,\mathrm{min} = \underline{\hspace{1.5cm}}\,\mathrm{h}$ &
$2\,\mathrm{l} = \underline{\hspace{1.5cm}}\,\mathrm{cm^3}$
\end{tabularx}
\Loesung{3500; 0,25; 1,5; 2000}`;

const PLOT = String.raw`Zeichne den Graphen von $g(x) = \frac{1}{2}x + 1$ in das Koordinatensystem. \BE \BE
\begin{center}
\begin{tikzpicture}[scale=0.6]
  \draw[very thin, gray] (-3,-2) grid (5,4);
  \draw[->] (-3,0) -- (5.3,0) node[right] {$x$};
  \draw[->] (0,-2) -- (0,4.3) node[above] {$y$};
  \foreach \x in {-2,...,4} \node[below] at (\x,0) {\scriptsize $\x$};
\end{tikzpicture}
\end{center}
\Loesung{Gerade durch $(0|1)$ und $(2|2)$.}`;

const PROOF = String.raw`Beweise: Die Summe zweier ungerader Zahlen ist gerade. \BE \BE \BE
\Loesung{$(2m+1) + (2n+1) = 2(m+n+1)$}`;

const EXAM_TASKS: SampleExercise[] = [
  { name: 'Mittlere Geschwindigkeit', body: TEXT },
  { name: 'Gleichungen', body: MATH },
  { name: 'Wertetabelle', body: TABLE },
  { name: 'Dreieck', body: TIKZ },
  { name: 'Wetter und Klima', body: PARTS },
  { name: 'Experiment', body: LIST },
  { name: 'Primzahlen', body: MC },
  { name: 'Zusammenfassung', body: LONG },
  { name: 'Lückentext', body: FILL },
  { name: 'Einheiten', body: UNITS },
  { name: 'Graph', body: PLOT },
  { name: 'Beweis', body: PROOF },
];

const SUBJECT_TASKS: SampleExercise[] = [
  { name: 'Chemie', body: String.raw`Gib die Reaktionsgleichung an und zeichne die Strukturformel von Wasser. \BE \BE
\ce{2 H2 + O2 -> 2 H2O}\qquad \chemfig{H-\charge{90=\|}{O}-H}
\Loesung{Knallgasreaktion}` },
  { name: 'Stromkreis', body: String.raw`Berechne den Strom im Stromkreis für $U = 12\,\mathrm{V}$ und $R = 40\,\Omega$. \BE \BE
\begin{center}\begin{circuitikz}\draw (0,0) to[battery1, l=$U$] (0,2) to[R, l=$R$] (3,2) to[lamp] (3,0) -- (0,0);\end{circuitikz}\end{center}
\Loesung{$I = 0{,}3\,\mathrm{A}$}` },
  { name: 'Klassendiagramm', body: String.raw`Ergänze das Klassendiagramm um eine Methode \texttt{ausleihen()}. \BE \BE
\begin{center}\begin{tikzpicture}
\umlclass{Buch}{titel : String \\ isbn : String}{getTitel() : String}
\end{tikzpicture}\end{center}
\Loesung{\texttt{ausleihen() : void} in \texttt{Buch}}` },
  { name: 'Struktogramm', body: String.raw`Beschreibe, was das Struktogramm berechnet. \BE \BE
\begin{struktogramm}(90,40)
\assign{$s \gets 0$}
\while{$i \le n$}
  \assign{$s \gets s + i$}
\whileend
\end{struktogramm}
\Loesung{Die Summe $1 + \dots + n$.}` },
  { name: 'Quelltext', body: String.raw`Was gibt das Programm aus? \BE \BE
\begin{lstlisting}[language=Java]
for (int i = 1; i <= 3; i++) {
    System.out.println(i * i);
}
\end{lstlisting}
\Loesung{1, 4 und 9 in je einer Zeile.}` },
];

const SAMPLE_EXAM = {
  id: 'engine-sample',
  fach: 'Mathematik',
  testart: 'Schulaufgabe',
  nr: '1',
  klasse: '9b',
  datum: '01.01.2026',
  durationMinutes: 60,
  lehrernachname: 'Muster',
  infoText: 'Hilfsmittel: Taschenrechner',
} as unknown as ExamRecord;

function examDoc(exercises: SampleExercise[], solution: boolean): string {
  const records = exercises.map((e, i) => ({ id: `ex${i + 1}`, name: e.name, latexBody: e.body }) as ExerciseRecord);
  const items = records.map((r) => ({ type: 'exercise' as const, id: r.id }));
  const inputs = buildExerciseInputs(items, records, [], [], null);
  return buildExamLatex(SAMPLE_EXAM, inputs, solution ? 'sans,punkte,antworten' : 'sans,punkte', [], { fill: false });
}

function exerciseDoc(exercise: SampleExercise, solution: boolean): string {
  return buildExerciseDocument(formatExerciseLatex(exercise.body, exercise.name, undefined, exercise.name), { solution, accountPackages: [] });
}

export const SAMPLES: Sample[] = [
  { id: 'exam', title: '12-task exam (task sheet)', exercises: EXAM_TASKS, build: (ex) => examDoc(ex, false) },
  { id: 'exam-solution', title: '12-task exam (solution)', exercises: EXAM_TASKS, build: (ex) => examDoc(ex, true) },
  ...SUBJECT_TASKS.map((task) => ({ id: `exercise-${task.name}`, title: `Exercise: ${task.name}`, exercises: [task], build: (ex: SampleExercise[]) => exerciseDoc(ex[0], false) })),
];

