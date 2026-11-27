/** The MC editor's state inside the exercise editor: question, options and columns parsed from the body's LaTeX, and the body rebuilt from them. */
import { buildMcOptionsLatex, parseMcOptions, type McOption } from '#lib/latex/mcOptions';
import { parseExerciseStructure, setCompetencies, setRequirementLevel } from '#lib/latex/exerciseStructure';
import { withoutMetaTags } from './exerciseEditorSave';

export class McDraft {
  questionText = $state('');
  /** LaTeX after the \LoesungMulti block; kept as is when the MC editor rebuilds the body. */
  trailingText = $state('');
  /** The composed LaTeX has an unclosed \LoesungMulti block: the MC editor must not rebuild from it. */
  malformed = $state(false);
  options: McOption[] = $state.raw([]);
  /** Column layout of the options: "auto" (one per option) or an explicit count, as a <select> value. */
  columns = $state('auto');

  /** Typing in the composed LaTeX updates the MC editor (also in free-text mode, for a later switch), so its next change rebuilds from this text. */
  syncFrom(latex: string): void {
    const parsed = parseMcOptions(withoutMetaTags(latex));
    this.questionText = parsed.questionText;
    this.trailingText = parsed.trailingText;
    this.malformed = parsed.malformed;
    this.options = parsed.options;
    this.columns = parsed.columns === null ? 'auto' : String(parsed.columns);
  }

  /** The body rebuilt from the MC fields, keeping `body`'s AFB level and competencies; null while the block is malformed. */
  rebuild(body: string): string | null {
    if (this.malformed) return null;
    const meta = parseExerciseStructure(body);
    const built = buildMcOptionsLatex(this.questionText, this.options, this.columns === 'auto' ? null : Number(this.columns), this.trailingText);
    return setCompetencies(setRequirementLevel(built, meta.levels[0] ?? null), meta.competencies);
  }

  /** A switch to MC with no options yet starts with a question and two empty options; true when it did. */
  start(): boolean {
    if (this.options.length > 0) return false;
    this.questionText = this.questionText.trim() || 'Frage hier eingeben...';
    this.options = [
      { text: '', correct: false },
      { text: '', correct: false },
    ];
    return true;
  }
}
