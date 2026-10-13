/** Minimal, dependency-free renderer model for GitHub release notes: tokens, never HTML, so nothing needs sanitising. */
export type Inline =
    | { kind: 'text'; text: string }
    | { kind: 'bold' | 'code'; text: string }
    | { kind: 'link'; text: string; href: string };

export type Block =
    | { kind: 'heading'; level: 1 | 2 | 3; inlines: Inline[] }
    | { kind: 'paragraph'; inlines: Inline[] }
    | { kind: 'list'; items: Inline[][] };

const INLINE =
    /\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/[^\s)]+)|(?<![\w/])@([A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)/g;

/** `origin` is the repository host, used for @mentions; passed in so no host literal lives in src/. */
export function parseInline(src: string, origin: string): Inline[] {
    const out: Inline[] = [];
    let last = 0;
    for (const m of src.matchAll(INLINE)) {
        if (m.index > last) out.push({ kind: 'text', text: src.slice(last, m.index) });
        if (m[1] !== undefined) out.push({ kind: 'bold', text: m[1] });
        else if (m[2] !== undefined) out.push({ kind: 'code', text: m[2] });
        else if (m[3] !== undefined) out.push({ kind: 'link', text: m[3], href: m[4] });
        else if (m[5] !== undefined) {
            const pr = /\/(?:pull|issues)\/(\d+)$/.exec(m[5]);
            out.push({ kind: 'link', text: pr ? `#${pr[1]}` : m[5], href: m[5] });
        } else out.push({ kind: 'link', text: `@${m[6]}`, href: `${origin}/${m[6]}` });
        last = m.index + m[0].length;
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
    for (const raw of md.replace(/\r\n?/g, '\n').split('\n')) {
        const line = raw.trim();
        const heading = /^(#{1,6})\s+(.*)$/.exec(line);
        const item = /^[*-]\s+(.*)$/.exec(line);
        if (!line) flush();
        else if (heading) {
            flush();
            const level = Math.min(heading[1].length, 3) as 1 | 2 | 3;
            blocks.push({ kind: 'heading', level, inlines: parseInline(heading[2], origin) });
        } else if (item) {
            if (para.length) flush();
            (list ??= []).push(parseInline(item[1], origin));
        } else {
            if (list) flush();
            para.push(line);
        }
    }
    flush();
    return blocks;
}
