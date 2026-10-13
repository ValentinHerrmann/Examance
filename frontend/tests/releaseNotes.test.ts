import { describe, it, expect } from 'vitest';
import { parseReleaseNotes } from '#lib/utils/releaseNotes';

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
