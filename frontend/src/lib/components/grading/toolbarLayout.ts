/** Stamps of the grading toolbox and how they fold into drawers when room runs out (issue #330): the toolbox never scrolls. */

import type { ToolType } from '#lib/grading/gradingStore';

export type StampGroup = 'plus' | 'minus' | 'other';

export interface StampDef {
  tool: ToolType;
  group: StampGroup;
  /** i18n key suffix under `grading.toolbar.` for the label (`…Title` for the tooltip). */
  key: 'checkFull' | 'checkHalf' | 'checkQuarter' | 'minusFull' | 'minusHalf' | 'minusQuarter' | 'wrong' | 'missing' | 'wf' | 'ff';
  /** Older tools that count as this one being selected. */
  aliases?: ToolType[];
}

export const STAMPS: StampDef[] = [
  { tool: 'check_full', group: 'plus', key: 'checkFull', aliases: ['check'] },
  { tool: 'check_half', group: 'plus', key: 'checkHalf' },
  { tool: 'check_quarter', group: 'plus', key: 'checkQuarter' },
  { tool: 'minus_full', group: 'minus', key: 'minusFull' },
  { tool: 'minus_half', group: 'minus', key: 'minusHalf' },
  { tool: 'minus_quarter', group: 'minus', key: 'minusQuarter' },
  { tool: 'wrong', group: 'other', key: 'wrong', aliases: ['cross'] },
  { tool: 'missing', group: 'other', key: 'missing' },
  { tool: 'wf', group: 'other', key: 'wf' },
  { tool: 'ff', group: 'other', key: 'ff' },
];

/** 1: every stamp shown; 2: drawers "+", "−", "other"; 3: drawers "scores", "other"; 4: one "stamps" drawer. */
export type ToolbarStep = 1 | 2 | 3 | 4;

/** A run of the toolbox: single stamps, or a drawer holding several. */
export type ToolbarSection = { kind: 'stamps'; stamps: StampDef[] } | { kind: 'drawer'; id: 'plus' | 'minus' | 'other' | 'scores' | 'stamps'; stamps: StampDef[] };

const BUTTON = 48; // h-12 / w-12
const GAP = 4; // gap-1
const SEPARATOR = 1;
const FRAME = 10; // p-1 on both ends plus the border
const FIXED_BUTTONS = 4; // pen, line, eraser, clear

const of = (...groups: StampGroup[]) => STAMPS.filter((s) => groups.includes(s.group));

/** The stamp sections of each step, between the drawing tools and Clear (a separator between sections). */
export function toolbarSections(step: ToolbarStep): ToolbarSection[] {
  switch (step) {
    case 1:
      return [{ kind: 'stamps', stamps: of('plus') }, { kind: 'stamps', stamps: of('minus') }, { kind: 'stamps', stamps: of('other') }];
    case 2:
      return [{ kind: 'drawer', id: 'plus', stamps: of('plus') }, { kind: 'drawer', id: 'minus', stamps: of('minus') }, { kind: 'drawer', id: 'other', stamps: of('other') }];
    case 3:
      return [{ kind: 'drawer', id: 'scores', stamps: of('plus', 'minus') }, { kind: 'drawer', id: 'other', stamps: of('other') }];
    case 4:
      return [{ kind: 'drawer', id: 'stamps', stamps: STAMPS }];
  }
}

/** Length of the toolbox along its main axis at `step`. Steps 2–4 keep their drawers in one run between two separators. */
export function toolbarLength(step: ToolbarStep): number {
  const sections = toolbarSections(step);
  const buttons = FIXED_BUTTONS + sections.reduce((n, s) => n + (s.kind === 'drawer' ? 1 : s.stamps.length), 0);
  const separators = step === 1 ? sections.length + 1 : 2;
  const items = buttons + separators;
  return buttons * BUTTON + separators * SEPARATOR + (items - 1) * GAP + FRAME;
}

/** The fullest step that fits in `available` pixels; step 4 when even that does not fit. */
export function toolbarStep(available: number): ToolbarStep {
  for (const step of [1, 2, 3] as const) if (toolbarLength(step) <= available) return step;
  return 4;
}
