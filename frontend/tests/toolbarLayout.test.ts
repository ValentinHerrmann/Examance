import { describe, expect, it } from 'vitest';
import { STAMPS, toolbarLength, toolbarSections, toolbarStep } from '../src/lib/components/grading/toolbarLayout';
import { exerciseTag } from '../src/lib/grading/scoreEdits';
import type { ExerciseRecord } from '../src/lib/db/schema';
import { compareCodeUnits } from '../src/lib/utils/compare';

describe('toolbarStep (issue #330)', () => {
  it('gets shorter with every step', () => {
    expect(toolbarLength(1)).toBeGreaterThan(toolbarLength(2));
    expect(toolbarLength(2)).toBeGreaterThan(toolbarLength(3));
    expect(toolbarLength(3)).toBeGreaterThan(toolbarLength(4));
  });

  it('picks the fullest step that fits and never goes past 4', () => {
    expect(toolbarStep(2000)).toBe(1);
    expect(toolbarStep(toolbarLength(1))).toBe(1);
    expect(toolbarStep(toolbarLength(1) - 1)).toBe(2);
    expect(toolbarStep(toolbarLength(2) - 1)).toBe(3);
    expect(toolbarStep(toolbarLength(3) - 1)).toBe(4);
    expect(toolbarStep(0)).toBe(4);
  });

  it('keeps every stamp reachable at every step', () => {
    for (const step of [1, 2, 3, 4] as const) {
      const tools = toolbarSections(step).flatMap((s) => s.stamps.map((st) => st.tool));
      expect([...tools].sort(compareCodeUnits)).toEqual(STAMPS.map((s) => s.tool).sort(compareCodeUnits));
    }
  });
});

describe('exerciseTag', () => {
  it('names a row without the Q', () => {
    expect(exerciseTag({ orderIndex: 2 } as ExerciseRecord)).toBe('2');
    expect(exerciseTag({ orderIndex: 2, subIndex: 1 } as ExerciseRecord)).toBe('2 a)');
  });
});
