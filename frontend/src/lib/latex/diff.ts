/** Pure LaTeX side-by-side diff engine; depends only on the decoration types from LatexEditor (no Svelte, DOM or stores). */
import { diffWords } from "diff";
import type {
  DiffDecorationConfig,
  DiffLineDecoration,
  DiffLinePaddingDecoration,
  DiffWordDecoration,
  DiffGapDecoration,
} from "#lib/components/LatexEditor.svelte";

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

type DiffOp = { op: "MATCH" | "MODIFY" | "DELETE" | "INSERT"; i: number; j: number };
type DiffStep = "DIAG" | "UP" | "LEFT";

const GAP_PENALTY = -0.4;

function splitDiffText(text: string): string[] {
  const lines = (text || "").replaceAll("\r\n", "\n").replace(/\n$/, "").split("\n");
  if (lines.length === 1 && lines[0] === "") lines.pop();
  return lines;
}

const matchScoreOf = (sim: number): number => {
  if (sim === 1.0) return 2.0;
  return sim >= 0.35 ? 2.0 * sim : -0.8;
};

/** Where each cell's best score came from, recorded in the forward pass so the backtrace never re-derives it by comparing floats. */
function alignmentSteps(simMatrix: number[][], N: number, M: number): DiffStep[][] {
  const dp: number[][] = Array.from({ length: N + 1 }, () =>
    new Array(M + 1).fill(0),
  );
  const steps: DiffStep[][] = Array.from({ length: N + 1 }, () =>
    new Array<DiffStep>(M + 1).fill("LEFT"),
  );

  for (let i = 0; i <= N; i++) {
    dp[i][0] = i * GAP_PENALTY;
    steps[i][0] = "UP";
  }
  for (let j = 0; j <= M; j++) dp[0][j] = j * GAP_PENALTY;

  for (let i = 1; i <= N; i++) {
    for (let j = 1; j <= M; j++) {
      const sim = simMatrix[i - 1][j - 1];
      const scoreDiag = dp[i - 1][j - 1] + matchScoreOf(sim);
      const scoreUp = dp[i - 1][j] + GAP_PENALTY;
      const scoreLeft = dp[i][j - 1] + GAP_PENALTY;

      dp[i][j] = Math.max(scoreDiag, scoreUp, scoreLeft);
      // Ties prefer the diagonal, then up, then left; a winning diagonal below the similarity threshold is a deletion.
      if (scoreDiag >= scoreUp && scoreDiag >= scoreLeft && sim >= 0.35) {
        steps[i][j] = "DIAG";
      } else if (scoreUp >= scoreDiag && scoreUp >= scoreLeft) {
        steps[i][j] = "UP";
      } else if (scoreLeft >= scoreDiag && scoreLeft >= scoreUp) {
        steps[i][j] = "LEFT";
      } else {
        steps[i][j] = "UP";
      }
    }
  }
  return steps;
}

function backtraceOps(steps: DiffStep[][], simMatrix: number[][], N: number, M: number): DiffOp[] {
  const ops: DiffOp[] = [];
  let i = N;
  let j = M;

  while (i > 0 || j > 0) {
    const step = steps[i][j];
    if (step === "DIAG") {
      ops.push({ op: simMatrix[i - 1][j - 1] === 1.0 ? "MATCH" : "MODIFY", i: i - 1, j: j - 1 });
      i--;
      j--;
    } else if (step === "UP") {
      ops.push({ op: "DELETE", i: i - 1, j: -1 });
      i--;
    } else {
      ops.push({ op: "INSERT", i: -1, j: j - 1 });
      j--;
    }
  }

  return ops.reverse();
}

function opsToLines(ops: DiffOp[], a: string[], b: string[]): { leftLines: DiffLine[]; rightLines: DiffLine[] } {
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

export function computeSideBySideDiff(
  leftText: string,
  rightText: string,
): { leftLines: DiffLine[]; rightLines: DiffLine[] } {
  const a = splitDiffText(leftText);
  const b = splitDiffText(rightText);

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

  const steps = alignmentSteps(simMatrix, N, M);
  return opsToLines(backtraceOps(steps, simMatrix, N, M), a, b);
}

const DEFAULT_LINE_HEIGHT_PX = 24;

/** Running state for one editor side while walking the aligned lines. */
interface DecorationSide {
  docLine: number;
  pendingGapPx: number;
  lines: DiffLineDecoration[];
  paddings: DiffLinePaddingDecoration[];
  gaps: DiffGapDecoration[];
}

const newDecorationSide = (): DecorationSide => ({ docLine: 0, pendingGapPx: 0, lines: [], paddings: [], gaps: [] });

function sideHeight(item: DiffLine | undefined, isEmpty: boolean, heights: Map<number, number>): number {
  if (isEmpty || !item || item.lineNumber === undefined) return 0;
  return heights.get(item.lineNumber) ?? DEFAULT_LINE_HEIGHT_PX;
}

function wordDecorations(item: DiffLine): DiffWordDecoration[] {
  const words: DiffWordDecoration[] = [];
  if (!item.tokens || item.type !== "modified") return words;
  let col = 0;
  for (const token of item.tokens) {
    const tokenLen = token.text.length;
    if (token.type !== "unchanged") {
      words.push({ startCol: col, endCol: col + tokenLen, type: token.type });
    }
    col += tokenLen;
  }
  return words;
}

function addDecorationLine(side: DecorationSide, item: DiffLine | undefined, isEmpty: boolean, hSelf: number, hTarget: number): void {
  if (isEmpty || !item) {
    side.pendingGapPx += hTarget;
    return;
  }
  if (side.pendingGapPx > 0) {
    side.gaps.push({ afterLineNumber: side.docLine, gapPx: side.pendingGapPx });
    side.pendingGapPx = 0;
  }
  side.docLine++;
  const lineNumber = item.lineNumber ?? side.docLine;
  const words = wordDecorations(item);

  if (item.type !== "empty") {
    side.lines.push({
      lineNumber,
      type: item.type,
      words: words.length > 0 ? words : undefined,
    });
  }

  if (hTarget > hSelf + 0.5) {
    side.paddings.push({ lineNumber, paddingPx: hTarget - hSelf });
  }
}

export function buildAlignedDiffDecorations(
  sideBySide: { leftLines: DiffLine[]; rightLines: DiffLine[] },
  leftHeights: Map<number, number>,
  rightHeights: Map<number, number>,
): { leftConfig: DiffDecorationConfig; rightConfig: DiffDecorationConfig } {
  const left = newDecorationSide();
  const right = newDecorationSide();

  const N = Math.max(sideBySide.leftLines.length, sideBySide.rightLines.length);

  for (let i = 0; i < N; i++) {
    const leftItem = sideBySide.leftLines[i];
    const rightItem = sideBySide.rightLines[i];

    const isLeftEmpty = !leftItem || leftItem.type === "empty";
    const isRightEmpty = !rightItem || rightItem.type === "empty";

    const hLeft = sideHeight(leftItem, isLeftEmpty, leftHeights);
    const hRight = sideHeight(rightItem, isRightEmpty, rightHeights);
    const hTarget = Math.max(hLeft, hRight, DEFAULT_LINE_HEIGHT_PX);

    addDecorationLine(left, leftItem, isLeftEmpty, hLeft, hTarget);
    addDecorationLine(right, rightItem, isRightEmpty, hRight, hTarget);
  }

  for (const side of [left, right]) {
    if (side.pendingGapPx > 0) {
      side.gaps.push({ afterLineNumber: side.docLine, gapPx: side.pendingGapPx });
    }
  }

  return {
    leftConfig: { lines: left.lines, paddings: left.paddings, gaps: left.gaps },
    rightConfig: { lines: right.lines, paddings: right.paddings, gaps: right.gaps },
  };
}
