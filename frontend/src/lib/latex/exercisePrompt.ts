/**
 * A prompt for an external AI chat that writes or changes an exercise (issue #168). Clipboard only; a later BYOK
 * integration builds on it. Token-lean: no logs or definitions, comma lists, an example only for new exercises.
 */
import { documentSetup, fence, LANGUAGES, section, TEMPLATE_COMMANDS } from './llmContext';
import type { LatexPackageEntry } from './packages';

export interface ExercisePromptInput {
  /** What the teacher wants; placed first. */
  task: string;
  latexBody: string;
  includeCode: boolean;
  meta: { name: string; subject: string; grade: string; topic: string };
  questionType: 'free_text' | 'mc';
  /** Files attached to the exercise (names only). */
  resourceNames: readonly string[];
  accountPackages: readonly LatexPackageEntry[];
  /** Names `packages.sty` preloads (`preloadedPackages`), if the assets could be loaded. */
  preloaded: readonly string[];
  engine: 'local' | 'server' | null;
  locale: string;
}

const EXAMPLE = String.raw`Gegeben ist die Funktion $f(x) = x^2 - 4$.
\begin{Teilaufgabe}{Nullstellen}
Bestimme die Nullstellen von $f$.
\LoesungKaro{$x^2 - 4 = 0 \Rightarrow x = \pm 2$ \BE\BE}{6}
\end{Teilaufgabe}
\begin{Teilaufgabe}{Skizze}
Skizziere den Graphen von $f$.
\LoesungLeer{Parabel, Scheitel $(0|-4)$ \BE}{4cm}
\end{Teilaufgabe}`;

export function buildExercisePrompt(input: ExercisePromptInput): string {
  const language = LANGUAGES[input.locale] ?? 'English';
  const code = input.includeCode ? input.latexBody.trim() : '';
  return [
    '# Write LaTeX for an exam exercise',
    section('Task', input.task.trim() || '(describe the task here)'),
    section('Context', context(input)),
    section('Output rules', outputRules(input.questionType, input.resourceNames.length > 0, language)),
    section('How the document is built', documentSetup(input.engine)),
    section('Template commands (Schulaufgabe.sty, Loesung.sty)', TEMPLATE_COMMANDS.map((c) => `- ${c.usage}`).join('\n')),
    section('Packages', packages(input)),
    section('Current exercise', code ? fence(code, 'latex') : 'New exercise, no code yet.'),
    code ? '' : section('Example of a well-formed exercise body', fence(EXAMPLE, 'latex')),
  ]
    .filter(Boolean)
    .join('\n\n') + '\n';
}

function context(input: ExercisePromptInput): string {
  const { name, subject, grade, topic } = input.meta;
  const meta = [
    name && `name "${name}"`,
    subject && `subject ${subject}`,
    grade && `grade ${grade}`,
    topic && topic !== '_General' && `topic ${topic}`,
    input.questionType === 'mc' ? 'multiple choice' : 'free-text exercise',
  ].filter(Boolean);
  const lines = [
    'Examance is a web app teachers use to typeset school exams with LaTeX. The teacher writes the body of one exercise; ' +
      'the app adds the title (the exercise name) and the surrounding document.',
    `This exercise: ${meta.join(', ')}.`,
  ];
  if (input.resourceNames.length > 0) lines.push(String.raw`Attached files (usable in \includegraphics or \input): ${input.resourceNames.join(', ')}.`);
  return lines.join('\n');
}

function outputRules(questionType: ExercisePromptInput['questionType'], hasFiles: boolean, language: string): string {
  return [
    String.raw`- Answer with the complete new exercise body in exactly one latex code block: no \documentclass, no \begin{document}, no \begin{Aufgabe} (the app adds it).`,
    questionType === 'mc'
      ? String.raw`- This is a multiple-choice question: the question text, then exactly one \LoesungMulti block with one \multi{…} (wrong) or \Lmulti{…} (correct) per option. No \BE and no other solution commands: each correct option counts one point.`
      : String.raw`- Every question gets a solution through the \Loesung… commands, which also reserve the answer space on the student sheet. Award points with \BE, \hBE, \qBE inside the solutions.`,
    '- Write the exercise text in the language of the current exercise (or of the task if there is none). Keep the LaTeX simple and compilable with the packages listed below.',
    String.raw`- A missing package goes on its own line \usepackage{name} at the top of the body.`,
    hasFiles
      ? '- Use only the attached files as images; draw anything else with TikZ, or say which image the teacher should upload.'
      : '- No image files are attached: draw figures with TikZ, or say which image the teacher should upload.',
    `- After the code block, add at most three short notes in ${language} (what changed, what to check).`,
  ].join('\n');
}

function packages(input: ExercisePromptInput): string {
  const lines: string[] = [];
  if (input.preloaded.length > 0) lines.push(`Preloaded: ${input.preloaded.join(', ')}.`);
  const own = input.accountPackages
    .filter((p) => !p.disabled)
    .map((p) => (p.kind === 'package' ? '' : `${p.kind} `) + p.name + (p.options ? `[${p.options}]` : ''));
  lines.push(own.length > 0 ? `Added in the teacher's settings: ${own.join(', ')}.` : "No extra packages in the teacher's settings.");
  return lines.join('\n');
}
