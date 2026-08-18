/**
 * Pure insertion logic for the quick-insert toolbar. Kept separate from
 * quickInsertMacros.ts (data) so it can be unit-tested without CodeMirror.
 */

import type { QuickInsertMacro } from "./quickInsertMacros";

export interface QuickInsertResult {
  changes: { from: number; to: number; insert: string };
  selection: { anchor: number; head: number };
}

/**
 * Computes the document change + resulting selection for inserting a macro
 * at [from,to) (the current CodeMirror selection). If selectedText is
 * non-empty it is wrapped as the macro's first argument; remaining
 * arguments (and all arguments, if nothing was selected) are filled with
 * placeholder text. The returned selection spans the first placeholder
 * still left to fill, so the user can type-to-replace it immediately.
 */
export function computeQuickInsert(
  macro: QuickInsertMacro,
  selectedText: string,
  from: number,
  to: number
): QuickInsertResult {
  if (macro.args.length === 0) {
    const { text } = macro.buildTemplate([]);
    return {
      changes: { from, to, insert: text },
      selection: { anchor: from + text.length, head: from + text.length }
    };
  }

  const hasSelection = selectedText.length > 0;
  const args = hasSelection
    ? [selectedText, ...macro.args.slice(1).map((a) => a.placeholder)]
    : macro.args.map((a) => a.placeholder);

  const { text, argOffsets } = macro.buildTemplate(args);

  const placeholderIndex = hasSelection ? 1 : 0;
  const offset = argOffsets[placeholderIndex];

  if (!offset) {
    return {
      changes: { from, to, insert: text },
      selection: { anchor: from + text.length, head: from + text.length }
    };
  }

  return {
    changes: { from, to, insert: text },
    selection: { anchor: from + offset.from, head: from + offset.to }
  };
}
