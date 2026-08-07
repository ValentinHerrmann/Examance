/**
 * Pure LaTeX side-by-side diff engine, extracted from the exercise library
 * route so it can be reused (and unit tested) independently of any component.
 *
 * No Svelte, DOM, or store dependencies here — only the decoration types
 * imported from LatexEditor (which owns the CodeMirror decoration shapes).
 */
import { diffWords } from "diff";
import type {
  DiffDecorationConfig,
  DiffLineDecoration,
  DiffLinePaddingDecoration,
  DiffWordDecoration,
  DiffGapDecoration,
} from "$lib/components/LatexEditor.svelte";

export interface DiffToken {
  text: string;
  type: "added" | "removed" | "unchanged";
}

export interface DiffLine {
  lineNumber?: number;
  text?: string;
  type: "added" | "removed" | "unchanged" | "empty" | "modified";
  tokens?: DiffToken[];
}

export function buildWordTokens(
  leftStr: string,
  rightStr: string,
): { leftTokens: DiffToken[]; rightTokens: DiffToken[] } {
  const wordDiff = diffWords(leftStr, rightStr);
  const leftTokens: DiffToken[] = [];
  const rightTokens: DiffToken[] = [];

  for (const part of wordDiff) {
    if (part.removed) {
      leftTokens.push({ text: part.value, type: "removed" });
    } else if (part.added) {
      rightTokens.push({ text: part.value, type: "added" });
    } else {
      leftTokens.push({ text: part.value, type: "unchanged" });
      rightTokens.push({ text: part.value, type: "unchanged" });
    }
  }

  return { leftTokens, rightTokens };
}

export function stringSimilarity(str1: string, str2: string): number {
  if (str1 === str2) return 1.0;
  if (!str1 || !str2) return 0.0;

  const s1 = str1.trim();
  const s2 = str2.trim();
  if (s1 === s2) return 0.98;

  const len1 = s1.length;
  const len2 = s2.length;
  const maxLen = Math.max(len1, len2);
  if (maxLen === 0) return 1.0;

  const matrix: number[] = new Array(len2 + 1);
  for (let j = 0; j <= len2; j++) matrix[j] = j;

  for (let i = 1; i <= len1; i++) {
    let prev = i;
    for (let j = 1; j <= len2; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      const current = Math.min(
        matrix[j] + 1,
        prev + 1,
        matrix[j - 1] + cost,
      );
      matrix[j - 1] = prev;
      prev = current;
    }
    matrix[len2] = prev;
  }

  return 1.0 - matrix[len2] / maxLen;
}

export function computeSideBySideDiff(
  leftText: string,
  rightText: string,
): { leftLines: DiffLine[]; rightLines: DiffLine[] } {
  const a = (leftText || "")
    .replace(/\r\n/g, "\n")
    .replace(/\n$/, "")
    .split("\n");
  const b = (rightText || "")
    .replace(/\r\n/g, "\n")
    .replace(/\n$/, "")
    .split("\n");

  if (a.length === 1 && a[0] === "") a.pop();
  if (b.length === 1 && b[0] === "") b.pop();

  const N = a.length;
  const M = b.length;

  if (N === 0 && M === 0) {
    return { leftLines: [], rightLines: [] };
  }

  if (N === 0) {
    const rightLines = b.map((line, idx) => ({
      lineNumber: idx + 1,
      text: line,
      type: "added" as const,
      tokens: [{ text: line, type: "added" as const }],
    }));
    const leftLines = b.map(() => ({ text: "", type: "empty" as const }));
    return { leftLines, rightLines };
  }

  if (M === 0) {
    const leftLines = a.map((line, idx) => ({
      lineNumber: idx + 1,
      text: line,
      type: "removed" as const,
      tokens: [{ text: line, type: "removed" as const }],
    }));
    const rightLines = a.map(() => ({ text: "", type: "empty" as const }));
    return { leftLines, rightLines };
  }

  const simMatrix: number[][] = Array.from({ length: N }, () =>
    new Array(M).fill(0),
  );
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < M; j++) {
      simMatrix[i][j] = stringSimilarity(a[i], b[j]);
    }
  }

  const GAP_PENALTY = -0.4;
  const dp: number[][] = Array.from({ length: N + 1 }, () =>
    new Array(M + 1).fill(0),
  );

  for (let i = 0; i <= N; i++) dp[i][0] = i * GAP_PENALTY;
  for (let j = 0; j <= M; j++) dp[0][j] = j * GAP_PENALTY;

  for (let i = 1; i <= N; i++) {
    for (let j = 1; j <= M; j++) {
      const sim = simMatrix[i - 1][j - 1];
      let matchScore: number;
      if (sim === 1.0) {
        matchScore = 2.0;
      } else if (sim >= 0.35) {
        matchScore = 2.0 * sim;
      } else {
        matchScore = -0.8;
      }

      const scoreDiag = dp[i - 1][j - 1] + matchScore;
      const scoreUp = dp[i - 1][j] + GAP_PENALTY;
      const scoreLeft = dp[i][j - 1] + GAP_PENALTY;

      dp[i][j] = Math.max(scoreDiag, scoreUp, scoreLeft);
    }
  }

  const ops: Array<{
    op: "MATCH" | "MODIFY" | "DELETE" | "INSERT";
    i: number;
    j: number;
  }> = [];
  let i = N;
  let j = M;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0) {
      const sim = simMatrix[i - 1][j - 1];
      let matchScore: number;
      if (sim === 1.0) {
        matchScore = 2.0;
      } else if (sim >= 0.35) {
        matchScore = 2.0 * sim;
      } else {
        matchScore = -0.8;
      }

      if (dp[i][j] === dp[i - 1][j - 1] + matchScore) {
        const opType =
          sim === 1.0 ? "MATCH" : sim >= 0.35 ? "MODIFY" : "DELETE";
        if (opType !== "DELETE") {
          ops.push({ op: opType, i: i - 1, j: j - 1 });
          i--;
          j--;
          continue;
        }
      }
    }

    if (i > 0 && dp[i][j] === dp[i - 1][j] + GAP_PENALTY) {
      ops.push({ op: "DELETE", i: i - 1, j: -1 });
      i--;
    } else if (j > 0 && dp[i][j] === dp[i][j - 1] + GAP_PENALTY) {
      ops.push({ op: "INSERT", i: -1, j: j - 1 });
      j--;
    } else {
      if (i > 0) {
        ops.push({ op: "DELETE", i: i - 1, j: -1 });
        i--;
      } else {
        ops.push({ op: "INSERT", i: -1, j: j - 1 });
        j--;
      }
    }
  }

  ops.reverse();

  const leftLines: DiffLine[] = [];
  const rightLines: DiffLine[] = [];
  let leftLineNum = 1;
  let rightLineNum = 1;

  for (const op of ops) {
    if (op.op === "MATCH") {
      leftLines.push({
        lineNumber: leftLineNum++,
        text: a[op.i],
        type: "unchanged",
        tokens: [{ text: a[op.i], type: "unchanged" }],
      });
      rightLines.push({
        lineNumber: rightLineNum++,
        text: b[op.j],
        type: "unchanged",
        tokens: [{ text: b[op.j], type: "unchanged" }],
      });
    } else if (op.op === "MODIFY") {
      const { leftTokens, rightTokens } = buildWordTokens(a[op.i], b[op.j]);
      leftLines.push({
        lineNumber: leftLineNum++,
        text: a[op.i],
        type: "modified",
        tokens: leftTokens,
      });
      rightLines.push({
        lineNumber: rightLineNum++,
        text: b[op.j],
        type: "modified",
        tokens: rightTokens,
      });
    } else if (op.op === "DELETE") {
      leftLines.push({
        lineNumber: leftLineNum++,
        text: a[op.i],
        type: "removed",
        tokens: [{ text: a[op.i], type: "removed" }],
      });
      rightLines.push({ text: "", type: "empty" });
    } else if (op.op === "INSERT") {
      leftLines.push({ text: "", type: "empty" });
      rightLines.push({
        lineNumber: rightLineNum++,
        text: b[op.j],
        type: "added",
        tokens: [{ text: b[op.j], type: "added" }],
      });
    }
  }

  return { leftLines, rightLines };
}

export function buildAlignedDiffDecorations(
  sideBySide: { leftLines: DiffLine[]; rightLines: DiffLine[] },
  leftHeights: Map<number, number>,
  rightHeights: Map<number, number>,
): { leftConfig: DiffDecorationConfig; rightConfig: DiffDecorationConfig } {
  const DEFAULT_LINE_HEIGHT_PX = 24;

  const leftDecoLines: DiffLineDecoration[] = [];
  const leftPaddings: DiffLinePaddingDecoration[] = [];
  const leftGaps: DiffGapDecoration[] = [];

  const rightDecoLines: DiffLineDecoration[] = [];
  const rightPaddings: DiffLinePaddingDecoration[] = [];
  const rightGaps: DiffGapDecoration[] = [];

  let currentLeftDocLine = 0;
  let currentRightDocLine = 0;

  let pendingLeftGapPx = 0;
  let pendingRightGapPx = 0;

  const N = Math.max(sideBySide.leftLines.length, sideBySide.rightLines.length);

  for (let i = 0; i < N; i++) {
    const leftItem = sideBySide.leftLines[i];
    const rightItem = sideBySide.rightLines[i];

    const isLeftEmpty = !leftItem || leftItem.type === "empty";
    const isRightEmpty = !rightItem || rightItem.type === "empty";

    let hLeft = 0;
    if (!isLeftEmpty && leftItem.lineNumber !== undefined) {
      hLeft = leftHeights.get(leftItem.lineNumber) ?? DEFAULT_LINE_HEIGHT_PX;
    }

    let hRight = 0;
    if (!isRightEmpty && rightItem.lineNumber !== undefined) {
      hRight = rightHeights.get(rightItem.lineNumber) ?? DEFAULT_LINE_HEIGHT_PX;
    }

    const hTarget = Math.max(hLeft, hRight, DEFAULT_LINE_HEIGHT_PX);

    // Handle Left side
    if (isLeftEmpty) {
      pendingLeftGapPx += hTarget;
    } else {
      if (pendingLeftGapPx > 0) {
        leftGaps.push({
          afterLineNumber: currentLeftDocLine,
          gapPx: pendingLeftGapPx,
        });
        pendingLeftGapPx = 0;
      }
      currentLeftDocLine++;
      const lineNumber = leftItem.lineNumber ?? currentLeftDocLine;

      const words: DiffWordDecoration[] = [];
      if (leftItem.tokens && leftItem.type === "modified") {
        let col = 0;
        for (const token of leftItem.tokens) {
          const tokenLen = token.text.length;
          if (token.type !== "unchanged") {
            words.push({
              startCol: col,
              endCol: col + tokenLen,
              type: token.type,
            });
          }
          col += tokenLen;
        }
      }

      if (leftItem.type !== "empty") {
        leftDecoLines.push({
          lineNumber,
          type: leftItem.type,
          words: words.length > 0 ? words : undefined,
        });
      }

      if (hTarget > hLeft + 0.5) {
        leftPaddings.push({
          lineNumber,
          paddingPx: hTarget - hLeft,
        });
      }
    }

    // Handle Right side
    if (isRightEmpty) {
      pendingRightGapPx += hTarget;
    } else {
      if (pendingRightGapPx > 0) {
        rightGaps.push({
          afterLineNumber: currentRightDocLine,
          gapPx: pendingRightGapPx,
        });
        pendingRightGapPx = 0;
      }
      currentRightDocLine++;
      const lineNumber = rightItem.lineNumber ?? currentRightDocLine;

      const words: DiffWordDecoration[] = [];
      if (rightItem.tokens && rightItem.type === "modified") {
        let col = 0;
        for (const token of rightItem.tokens) {
          const tokenLen = token.text.length;
          if (token.type !== "unchanged") {
            words.push({
              startCol: col,
              endCol: col + tokenLen,
              type: token.type,
            });
          }
          col += tokenLen;
        }
      }

      if (rightItem.type !== "empty") {
        rightDecoLines.push({
          lineNumber,
          type: rightItem.type,
          words: words.length > 0 ? words : undefined,
        });
      }

      if (hTarget > hRight + 0.5) {
        rightPaddings.push({
          lineNumber,
          paddingPx: hTarget - hRight,
        });
      }
    }
  }

  if (pendingLeftGapPx > 0) {
    leftGaps.push({
      afterLineNumber: currentLeftDocLine,
      gapPx: pendingLeftGapPx,
    });
  }

  if (pendingRightGapPx > 0) {
    rightGaps.push({
      afterLineNumber: currentRightDocLine,
      gapPx: pendingRightGapPx,
    });
  }

  return {
    leftConfig: { lines: leftDecoLines, paddings: leftPaddings, gaps: leftGaps },
    rightConfig: { lines: rightDecoLines, paddings: rightPaddings, gaps: rightGaps },
  };
}
