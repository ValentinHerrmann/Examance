/** LaTeX syntax highlighter for static/read-only code displays. Tokenizes LaTeX string and outputs HTML with syntax-highlighted <span> tags. */

export interface LatexToken {
  type: 'comment' | 'keyword' | 'macro' | 'bracket' | 'string' | 'number' | 'plain';
  text: string;
}

export function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

// Ordered rules: the first match at the cursor wins (keyword before macro, so `\begin` is a keyword).
const TOKEN_RULES: [LatexToken['type'], RegExp][] = [
  ['comment', /^%.*/],
  ['keyword', /^\\(?:begin|end)\b/],
  ['macro', /^\\(?:[a-zA-Z]+|.)/],
  ['bracket', /^[{}[\]]/],
  ['string', /^\$+/], // math ($...$ or $$...$$)
  ['number', /^\d+(?:\.\d+)?/],
  ['plain', /^[^%\\{}[\]$\d]+/]
];

export function tokenizeLatex(code: string): LatexToken[] {
  const tokens: LatexToken[] = [];
  let pos = 0;

  while (pos < code.length) {
    const sub = code.slice(pos);
    let text = code[pos];
    let type: LatexToken['type'] = 'plain';
    for (const [ruleType, re] of TOKEN_RULES) {
      const m = re.exec(sub);
      if (m) {
        type = ruleType;
        text = m[0];
        break;
      }
    }
    tokens.push({ type, text });
    pos += text.length;
  }

  return tokens;
}

export function highlightLatexToHtml(code: string): string {
  const tokens = tokenizeLatex(code);
  return tokens
    .map((t) => {
      const escaped = escapeHtml(t.text);
      if (t.type === 'plain') return escaped;
      return `<span class="token-${t.type}">${escaped}</span>`;
    })
    .join('');
}
