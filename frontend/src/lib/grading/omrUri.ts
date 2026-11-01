import type { OmrScoreBoxKind } from "#lib/db/schema";

/** One `omr://` link of a compiled exam sheet (Loesung.sty, Schulaufgabe.sty). */
export type OmrUri =
  | { kind: "fiducial"; corner: 0 | 1 | 2 | 3 }
  | { kind: "bubble"; exerciseId: string; optionIndex: number; redo: boolean }
  | { kind: "box"; box: OmrScoreBoxKind; position?: number; part?: string };

// Score boxes never have a bare number as second segment, so frontends from before issue #187 skip them instead of reading bubbles.
const BOX_RE = /^omr:\/\/__box__\/(?:(task|cell)\/(\d+)|part\/(\d+)\/([a-z]+)|(sum|grade))$/;
const BUBBLE_RE = /^omr:\/\/([^/]+)\/(\d+)(\/redo)?$/;

/** Parses an `omr://` link URI; null for anything else. */
export function parseOmrUri(uri: string): OmrUri | null {
  const box = BOX_RE.exec(uri);
  if (box) {
    const [, numbered, numberedPos, partPos, part, single] = box;
    if (numbered) return { kind: "box", box: numbered as OmrScoreBoxKind, position: Number(numberedPos) };
    if (part) return { kind: "box", box: "part", position: Number(partPos), part };
    return { kind: "box", box: single as OmrScoreBoxKind };
  }
  const m = BUBBLE_RE.exec(uri);
  if (!m) return null;
  const [, token, idxStr, redo] = m;
  if (token === "__box__") return null;
  if (token === "__fid__") {
    const corner = Number(idxStr);
    return corner === 0 || corner === 1 || corner === 2 || corner === 3 ? { kind: "fiducial", corner } : null;
  }
  return { kind: "bubble", exerciseId: token, optionIndex: Number(idxStr), redo: Boolean(redo) };
}

/** Key of a score box, shared by the template and the value map (`task/2`, `part/2/b`, `cell/2`, `sum`, `grade`). */
export function scoreBoxKey(b: { box: OmrScoreBoxKind; position?: number; part?: string }): string {
  if (b.box === "part") return `part/${b.position}/${b.part}`;
  if (b.box === "task" || b.box === "cell") return `${b.box}/${b.position}`;
  return b.box;
}
