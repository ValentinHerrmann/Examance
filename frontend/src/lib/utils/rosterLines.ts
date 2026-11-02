/** Pasted roster lists, one student per line: the cells of each non-empty line, trimmed. Callers pick the separators (a sticker list keeps "Lastname, Firstname" whole, so it splits on tab and `;` only). */
export function parseRosterLines(text: string, separators: RegExp = /[\t;,]/): string[][] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(separators).map((cell) => cell.trim()));
}
