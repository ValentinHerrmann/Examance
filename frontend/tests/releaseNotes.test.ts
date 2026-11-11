import { describe, it, expect } from 'vitest';
import { parseInline, parseReleaseNotes, type Inline } from '#lib/utils/releaseNotes';
import { randomStrings, timeMs } from './helpers/randomStrings';

const ORIGIN = 'https://example.test';

describe('parseReleaseNotes', () => {
    it('renders GitHub auto-generated notes as headings, lists and short PR links', () => {
        const blocks = parseReleaseNotes(
            "## What's Changed\n* Add thing by @bob in https://example.test/r/pull/3\n\n**Full Changelog**: https://example.test/r/commits/0.2.1",
            ORIGIN
        );
        expect(blocks.map((b) => b.kind)).toEqual(['heading', 'list', 'paragraph']);
        const list = blocks[1];
        if (list.kind !== 'list') throw new Error('expected list');
        expect(list.items[0]).toContainEqual({ kind: 'link', text: '@bob', href: `${ORIGIN}/bob` });
        expect(list.items[0]).toContainEqual({ kind: 'link', text: '#3', href: 'https://example.test/r/pull/3' });
    });

    it('never emits HTML or non-http links', () => {
        const [p] = parseReleaseNotes('<script>x</script> [a](javascript:alert(1))', ORIGIN);
        if (p.kind !== 'paragraph') throw new Error('expected paragraph');
        expect(p.inlines.every((i) => i.kind === 'text')).toBe(true);
    });
});

// The single alternation regex parseInline used before the linear scanner (SonarCloud S8786/S5843), kept as the oracle.
const LEGACY_INLINE =
    /\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/[^\s)]+)|(?<![\w/])@([A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)/g; // NOSONAR: the old regex is the oracle

function legacyParseInline(src: string, origin: string): Inline[] {
    const out: Inline[] = [];
    let last = 0;
    for (const m of src.matchAll(LEGACY_INLINE)) {
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

describe('parseInline matches the former regex', () => {
    const pieces = ['**', '*', '`', '[', ']', '(', ')', 'https://', 'http://', 'a', 'b-', '-', '@', '/', ' ', '\n', ' ', 'pull/', '7', 'x_'];

    it('on random input', () => {
        for (const s of randomStrings(pieces, 4000, 14, 7)) {
            expect(parseInline(s, ORIGIN)).toEqual(legacyParseInline(s, ORIGIN));
        }
    });

    it('on edge cases', () => {
        for (const s of ['****', '**a**b**', '** a **', '`a`b`', '[x](https://y)', '[x](https://y z)', 'mail a@b, @-x, @a-, @a--b', '/@x', 'https://e.t/r/issues/12)']) {
            expect(parseInline(s, ORIGIN)).toEqual(legacyParseInline(s, ORIGIN));
        }
    });

    it('stays linear on long unclosed markers', () => {
        expect(timeMs(() => parseInline('**'.repeat(50_000) + 'x', ORIGIN))).toBeLessThan(500);
        expect(timeMs(() => parseInline('** a'.repeat(50_000), ORIGIN))).toBeLessThan(500);
    });

    it('keeps headings and items whose text follows several spaces', () => {
        const blocks = parseReleaseNotes('##   Title\n-   item', ORIGIN);
        expect(blocks).toEqual([
            { kind: 'heading', level: 2, inlines: [{ kind: 'text', text: 'Title' }] },
            { kind: 'list', items: [[{ kind: 'text', text: 'item' }]] },
        ]);
    });
});
