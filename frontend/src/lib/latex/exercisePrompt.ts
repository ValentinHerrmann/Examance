/**
 * A prompt for an external AI chat that writes or changes an exercise (issue #168). Clipboard only; a later BYOK
 * integration builds on it. Token-lean: no logs or definitions, comma lists, an example only for new exercises.
 */
import { code, cs, documentSetup, fence, LANGUAGES, section, templateCommandsSection } from './llmContext';
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
    templateCommandsSection(),
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
  const lines = ['Examance is a web app teachers use to typeset school exams with LaTeX.', `This exercise: ${meta.join(', ')}.`];
  if (input.resourceNames.length > 0) {
    lines.push(`Attached files (for ${cs('includegraphics')} or ${cs('input')}): ${input.resourceNames.map(code).join(', ')}.`);
  }
  return lines.join('\n');
}

/** Requirements only; what the frame and the commands do is in the sections after it. */
function outputRules(questionType: ExercisePromptInput['questionType'], hasFiles: boolean, language: string): string {
  return [
    '- Answer with the complete new exercise body in exactly one `latex` code block.',
    questionType === 'mc'
      ? `- Multiple choice: the question text, then exactly one ${cs('LoesungMulti')} block and no other solution commands.`
      : '- Give every question a solution command with its points (see the template commands).',
    '- Write the exercise text in the language of the current exercise (or of the task if there is none); keep the LaTeX simple.',
    hasFiles
      ? '- Use only the attached files as images; draw anything else with TikZ, or say which image the teacher should upload.'
      : '- No files are attached: draw figures with TikZ, or say which image the teacher should upload.',
    `- After the code block, add at most three short notes in ${language} (what changed, what to check).`,
  ].join('\n');
}

function packages(input: ExercisePromptInput): string {
  const lines: string[] = [];
  if (input.preloaded.length > 0) lines.push(`Preloaded: ${input.preloaded.map(code).join(', ')}.`);
  const own = input.accountPackages
    .filter((p) => !p.disabled)
    .map((p) => code((p.kind === 'package' ? '' : `${p.kind} `) + p.name + (p.options ? `[${p.options}]` : '')));
  lines.push(own.length > 0 ? `Added in the teacher's settings: ${own.join(', ')}.` : "No extra packages in the teacher's settings.");
  return lines.join('\n');
}
