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
 * non-empty it is wrapped into the macro's selectionArgIndex argument
 * (default 0); remaining arguments (and all arguments, if nothing was
 * selected) are filled with placeholder text. The returned selection spans
 * the next placeholder still left to fill, so the user can type-to-replace
 * it immediately.
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
  const selectionArgIndex = macro.selectionArgIndex ?? 0;
  const args = macro.args.map((a, i) =>
    hasSelection && i === selectionArgIndex ? selectedText : a.placeholder
  );

  const { text, argOffsets } = macro.buildTemplate(args);

  const placeholderIndex = hasSelection ? args.findIndex((_, i) => i !== selectionArgIndex) : 0;
  const offset = placeholderIndex >= 0 ? argOffsets[placeholderIndex] : undefined;

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
