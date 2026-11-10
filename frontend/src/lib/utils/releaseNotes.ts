/** Minimal, dependency-free renderer model for GitHub release notes: tokens, never HTML, so nothing needs sanitising. */
export type Inline =
    | { kind: 'text'; text: string }
    | { kind: 'bold' | 'code'; text: string }
    | { kind: 'link'; text: string; href: string };

export type Block =
    | { kind: 'heading'; level: 1 | 2 | 3; inlines: Inline[] }
    | { kind: 'paragraph'; inlines: Inline[] }
    | { kind: 'list'; items: Inline[][] };

type InlineMatch = { inline: Inline; end: number };

const LINE_TERMINATOR = /[\n\r\u2028\u2029]/;
const URL_SCHEMES = ['https://', 'http://'];
const URL_TAIL = /[^\s)]+/y;
const MENTION_RUN = /[A-Za-z0-9-]+/y;
const MENTION_BLOCKER = /[\w/]/;

/** `https?://` plus a non-empty run without whitespace or `)` at `i`, or null. */
function urlAt(src: string, i: number): string | null {
    const scheme = URL_SCHEMES.find((prefix) => src.startsWith(prefix, i));
    if (!scheme) return null;
    URL_TAIL.lastIndex = i + scheme.length;
    const tail = URL_TAIL.exec(src);
    return tail ? src.slice(i, URL_TAIL.lastIndex) : null;
}

/** `**text**` (lazy, never across a line break, like `.+?`). */
function boldAt(src: string, i: number): InlineMatch | null {
    if (!src.startsWith('**', i)) return null;
    const close = src.indexOf('**', i + 3);
    if (close < 0) return null;
    const text = src.slice(i + 2, close);
    return LINE_TERMINATOR.test(text) ? null : { inline: { kind: 'bold', text }, end: close + 2 };
}

function codeAt(src: string, i: number): InlineMatch | null {
    if (src[i] !== '`') return null;
    const close = src.indexOf('`', i + 1);
    return close > i + 1 ? { inline: { kind: 'code', text: src.slice(i + 1, close) }, end: close + 1 } : null;
}

function linkAt(src: string, i: number): InlineMatch | null {
    if (src[i] !== '[') return null;
    const close = src.indexOf(']', i + 1);
    if (close <= i + 1 || src[close + 1] !== '(') return null;
    const href = urlAt(src, close + 2);
    const end = href === null ? -1 : close + 2 + href.length;
    if (href === null || src[end] !== ')') return null;
    return { inline: { kind: 'link', text: src.slice(i + 1, close), href }, end: end + 1 };
}

function bareUrlAt(src: string, i: number): InlineMatch | null {
    const href = urlAt(src, i);
    if (href === null) return null;
    const pr = /\/(?:pull|issues)\/(\d+)$/.exec(href);
    return { inline: { kind: 'link', text: pr ? `#${pr[1]}` : href, href }, end: i + href.length };
}

/** `@name`: not after a word character or `/`, starts and ends with a letter or digit. */
function mentionAt(src: string, i: number, origin: string): InlineMatch | null {
    if (src[i] !== '@' || (i > 0 && MENTION_BLOCKER.test(src[i - 1]))) return null;
    MENTION_RUN.lastIndex = i + 1;
    const run = MENTION_RUN.exec(src)?.[0] ?? '';
    let len = run.length;
    while (len > 0 && run[len - 1] === '-') len--;
    if (!len || run[0] === '-') return null;
    const name = run.slice(0, len);
    return { inline: { kind: 'link', text: `@${name}`, href: `${origin}/${name}` }, end: i + 1 + len };
}

/** The first inline construct starting at `i`, tried in priority order (bold, code, link, URL, mention). */
function inlineAt(src: string, i: number, origin: string): InlineMatch | null {
    return boldAt(src, i) ?? codeAt(src, i) ?? linkAt(src, i) ?? bareUrlAt(src, i) ?? mentionAt(src, i, origin);
}

/** `origin` is the repository host, used for @mentions; passed in so no host literal lives in src/. Linear scan: the former single alternation regex backtracked on long unclosed `**` runs. */
export function parseInline(src: string, origin: string): Inline[] {
    const out: Inline[] = [];
    let last = 0;
    let i = 0;
    while (i < src.length) {
        const m = inlineAt(src, i, origin);
        if (!m) {
            i++;
            continue;
        }
        if (i > last) out.push({ kind: 'text', text: src.slice(last, i) });
        out.push(m.inline);
        last = i = m.end;
    }
    if (last < src.length) out.push({ kind: 'text', text: src.slice(last) });
    return out;
}

export function parseReleaseNotes(md: string, origin: string): Block[] {
    const blocks: Block[] = [];
    let para: string[] = [];
    let list: Inline[][] | null = null;
    const flush = () => {
        if (para.length) blocks.push({ kind: 'paragraph', inlines: parseInline(para.join(' '), origin) });
        if (list) blocks.push({ kind: 'list', items: list });
        para = [];
        list = null;
    };
    for (const raw of md.replaceAll(/\r\n?/g, '\n').split('\n')) {
        const line = raw.trim();
        const heading = /^(#{1,6})\s+(\S.*)$/.exec(line);
        const item = /^[*-]\s+(\S.*)$/.exec(line);
        if (!line) flush();
        else if (heading) {
            flush();
            const level = Math.min(heading[1].length, 3) as 1 | 2 | 3;
            blocks.push({ kind: 'heading', level, inlines: parseInline(heading[2], origin) });
        } else if (item) {
            if (para.length) flush();
            list ??= [];
            list.push(parseInline(item[1], origin));
        } else {
            if (list) flush();
            para.push(line);
        }
    }
    flush();
    return blocks;
}
