import { getLatestForSlot, type CompileKind } from "#lib/latex/compileCache";

export function pdfBytesToUrl(bytes: Uint8Array): string {
  return URL.createObjectURL(new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" }));
}

/** Object URLs for the last compile of this exam/exercise (in-memory cache only). */
export function getCachedPreview(
  kind: Extract<CompileKind, "exam" | "exercise">,
  id: string
): { angabe: string | null; loesung: string | null } {
  const a = getLatestForSlot({ kind, id, variant: "angabe" });
  const l = getLatestForSlot({ kind, id, variant: "loesung" });
  return {
    angabe: a ? pdfBytesToUrl(a.pdfBytes) : null,
    loesung: l ? pdfBytesToUrl(l.pdfBytes) : null,
  };
}
