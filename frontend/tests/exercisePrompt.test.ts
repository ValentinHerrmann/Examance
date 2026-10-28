import { describe, expect, it } from 'vitest';
import { buildExercisePrompt, type ExercisePromptInput } from '#lib/latex/exercisePrompt';

const base: ExercisePromptInput = {
  task: 'Create a variant with other numbers.',
  latexBody: 'Berechne $1+1$.\n\\Loesung{$2$ \\BE}',
  includeCode: true,
  meta: { name: 'Addition', subject: 'Mathematik', grade: '5', topic: '_General' },
  questionType: 'free_text',
  resourceNames: [],
  accountPackages: [{ kind: 'package', name: 'siunitx', options: 'locale=DE' }],
  preloaded: ['amsmath', 'tikz'],
  engine: 'local',
  locale: 'en',
};

describe('buildExercisePrompt', () => {
  it('puts the task first and includes the current code', () => {
    const prompt = buildExercisePrompt(base);
    expect(prompt.indexOf('## Task')).toBeLessThan(prompt.indexOf('## Context'));
    expect(prompt).toContain('Create a variant with other numbers.');
    expect(prompt).toContain('```latex\nBerechne $1+1$.');
    expect(prompt).not.toContain('Example of a well-formed exercise body');
    expect(prompt).toContain('siunitx[locale=DE]');
    expect(prompt).toContain('Preloaded: `amsmath`, `tikz`.');
    expect(prompt).not.toContain('topic _General');
    expect(prompt).toContain('Change only what the task asks for.');
  });

  it('leaves the code out when not ticked and then shows the example', () => {
    const prompt = buildExercisePrompt({ ...base, includeCode: false });
    expect(prompt).not.toContain('Berechne $1+1$');
    expect(prompt).toContain('New exercise, no code yet.');
    expect(prompt).not.toContain('Change only what the task asks for.');
    expect(prompt).toContain('Example of a well-formed exercise body');
  });

  it('switches the solution rule for multiple choice and lists attached files', () => {
    const prompt = buildExercisePrompt({ ...base, questionType: 'mc', resourceNames: ['graph.png'] });
    expect(prompt).toContain('- Multiple choice:');
    expect(prompt).not.toContain('Give every question a solution');
    expect(prompt).toContain('`graph.png`');
  });
});
