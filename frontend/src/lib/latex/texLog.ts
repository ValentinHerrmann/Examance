// Pure TeX log helpers, shared by the compile worker and the main thread (no DOM, no i18n).

/** TeX "!" errors, each through its `l.<n>` context line and the line after it. */
export function extractTexErrors(text: string | undefined | null, maxBlocks = 5): string[] {
  if (!text) return [];
  const lines = text.split('\n');
  const blocks: string[] = [];
  let i = 0;
  while (i < lines.length && blocks.length < maxBlocks) {
    if (!lines[i].startsWith('!')) {
      i++;
      continue;
    }
    const limit = Math.min(lines.length, i + 12);
    let j = i + 1;
    while (j < limit && !/^l\.\d+/.test(lines[j])) j++;
    let stop = limit;
    if (j < limit) {
      // The line after `l.<n>` is TeX's continuation, unless the next error starts right there.
      stop = lines[j + 1]?.startsWith('!') ? j + 1 : j + 2;
    }
    blocks.push(
      lines
        .slice(i, stop)
        .map((line) => line.trimEnd())
        .filter(Boolean)
        .join('\n')
    );
    i = stop;
  }
  return blocks;
}
