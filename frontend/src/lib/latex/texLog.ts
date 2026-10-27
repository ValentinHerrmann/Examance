// Pure TeX log helpers, shared by the compile worker and the main thread (no DOM, no i18n).

/** TeX "!" errors, each through its `l.<n>` context line and the line after it. */
export function extractTexErrors(text: string | undefined | null, maxBlocks = 5): string[] {
  if (!text) return [];
  const lines = text.split('\n');
  const blocks: string[] = [];
  for (let i = 0; i < lines.length && blocks.length < maxBlocks; i++) {
    if (!lines[i].startsWith('!')) continue;
    const limit = Math.min(lines.length, i + 12);
    let j = i + 1;
    while (j < limit && !/^l\.\d+/.test(lines[j])) j++;
    const stop = j < limit ? j + 2 : limit;
    blocks.push(
      lines
        .slice(i, stop)
        .map((line) => line.trimEnd())
        .filter(Boolean)
        .join('\n')
    );
    i = stop - 1;
  }
  return blocks;
}
