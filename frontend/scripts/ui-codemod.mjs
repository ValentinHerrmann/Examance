#!/usr/bin/env node
/**
 * One-off migration for the Artemis design-system overhaul: rewrites raw
 * Tailwind palette utilities (`bg-slate-800`, `text-sky-400`, …), retired token
 * names (`bg-accent-strong`, `text-subtle`), arbitrary text sizes and off-scale
 * radii onto the semantic tokens in src/app.css.
 *
 * Usage:  node scripts/ui-codemod.mjs [--dry-run] [--report <file>]
 *
 * Anything it cannot map with confidence is listed in the report and left
 * untouched for a human (arbitrary hex classes, gradients, shadows, fill/stroke).
 * Run from a clean, committed tree; the result is reviewed as one diff.
 * Delete this script once the migration is merged.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const reportIdx = args.indexOf('--report');
const REPORT = reportIdx >= 0 ? args[reportIdx + 1] : null;

const ROOT = new URL('..', import.meta.url).pathname;

const EXCLUDE = [
    /^src\/lib\/components\/ui\//,
    /^src\/lib\/components\/layout\//,
    /^src\/routes\/\+layout/,
    /^src\/app\.css$/,
    /^src\/lib\/i18n\//,
    /^src\/lib\/pdf\//,
    /^src\/lib\/grading\//,
    /^src\/lib\/components\/LatexEditor\.ts$/,
    /ColumnChart\.svelte$/,
];

const files = execFileSync('git', ['ls-files', 'src'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)
    .filter(
        (f) =>
            f.endsWith('.svelte') ||
            (f.endsWith('.ts') && (f.startsWith('src/lib/components/') || f.startsWith('src/routes/'))),
    )
    .filter((f) => !EXCLUDE.some((re) => re.test(f)));

const NEUTRAL = new Set(['slate', 'gray', 'zinc', 'neutral', 'stone']);
const BLUE = new Set(['sky', 'blue', 'cyan']);
const RED = new Set(['red', 'rose', 'pink']);
const AMBER = new Set(['amber', 'yellow', 'orange']);
const GREEN = new Set(['emerald', 'green', 'teal', 'lime']);
const VIOLET = new Set(['indigo', 'violet', 'purple', 'fuchsia']);

function family(palette) {
    if (NEUTRAL.has(palette)) return 'neutral';
    if (BLUE.has(palette)) return 'blue';
    if (RED.has(palette)) return 'danger';
    if (AMBER.has(palette)) return 'warning';
    if (GREEN.has(palette)) return 'success';
    if (VIOLET.has(palette)) return 'info';
    return null;
}

/** Returns the new utility (without variant prefix) or null to report. */
function mapPalette(prop, side, palette, shade, alpha, line) {
    const fam = family(palette);
    const n = Number(shade);
    const a = alpha ? Number(alpha.slice(1)) : null;
    if (!fam) return null;

    if (prop === 'text') {
        if (fam === 'neutral') return n >= 400 && n <= 600 ? 'text-muted' : 'text-content';
        if (fam === 'blue') return 'text-accent';
        return `text-${fam}-fg`;
    }

    if (prop === 'bg') {
        if (fam === 'neutral') {
            if (n >= 900) {
                if (a !== null && a >= 60) return 'bg-backdrop';
                const control = /<(input|select|textarea)\b/.test(line);
                return (control ? 'bg-control' : 'bg-surface-sunken') + (alpha ?? '');
            }
            if (n === 800) return 'bg-surface-raised' + (alpha ?? '');
            if (n >= 600) return 'bg-surface-inset' + (alpha ?? '');
            if (n >= 400) return 'bg-line-strong' + (alpha ?? '');
            return 'bg-surface-inset';
        }
        if (fam === 'blue') {
            if (a !== null && a <= 30) return 'bg-highlight';
            if (n >= 800) return 'bg-highlight';
            return 'bg-primary' + (alpha ?? '');
        }
        if (n >= 800) return `bg-${fam}${alpha ?? '/10'}`;
        return `bg-${fam}${alpha ?? ''}`;
    }

    if (prop === 'border') {
        const s = side ? `border-${side}` : 'border';
        if (fam === 'neutral') {
            if (n >= 700) return `${s}-line`;
            if (n >= 500) return `${s}-line-strong`;
            return `${s}-line-hover`;
        }
        if (fam === 'blue') return `${s}-primary${alpha ?? ''}`;
        return `${s}-${fam}${alpha ?? ''}`;
    }

    if (prop === 'ring' || prop === 'outline') {
        if (fam === 'neutral') return `${prop}-line-strong`;
        if (fam === 'blue') return `${prop}-focus`;
        return `${prop}-${fam}`;
    }

    if (prop === 'divide') {
        if (fam === 'neutral') return 'divide-line';
        return null;
    }

    if (prop === 'accent' || prop === 'caret') {
        if (fam === 'blue') return `${prop}-primary`;
        return null;
    }

    return null; // fill, stroke, from/via/to, shadow, decoration, placeholder
}

const VARIANTS = String.raw`((?:(?:[\w-]+|\[[^\]\s]+\]|@[\w-]+):)*)`;
const PALETTE_RE = new RegExp(
    String.raw`(?<![\w-])` +
        VARIANTS +
        String.raw`(bg|text|border(?:-([trblxyse]))?|ring|outline|divide|fill|stroke|from|via|to|shadow|accent|caret|decoration|placeholder)-` +
        String.raw`(slate|gray|zinc|neutral|stone|sky|blue|cyan|red|rose|pink|amber|yellow|orange|emerald|green|teal|lime|indigo|violet|purple|fuchsia)-(\d{2,3})(\/\d+)?(?![\w-])`,
    'g',
);

const TOKEN_RENAMES = [
    // [regex for the utility without variants, replacement]
    [/^bg-accent-strong(\/\d+)?$/, (m) => 'bg-primary' + (m[1] ?? '')],
    [/^bg-accent-hover(\/\d+)?$/, () => 'bg-primary/90'],
    [/^text-accent-strong$/, () => 'text-accent'],
    [/^text-accent-hover$/, () => 'text-accent'],
    [/^border-accent-strong$/, () => 'border-primary'],
    [/^border-accent-hover$/, () => 'border-primary'],
    [/^bg-accent\/(\d+)$/, () => 'bg-highlight'],
    [/^bg-accent$/, () => 'bg-primary'],
    [/^text-subtle$/, () => 'text-muted'],
    [/^bg-white$/, () => 'bg-surface-raised'],
    [/^bg-black\/(\d+)$/, (m) => (Number(m[1]) >= 30 ? 'bg-backdrop' : null)],
];

const TEXT_SCALE = [
    ['xs', 0.75],
    ['sm', 0.875],
    ['base', 1],
    ['lg', 1.125],
    ['xl', 1.25],
    ['2xl', 1.5],
    ['3xl', 1.875],
    ['4xl', 2.25],
    ['5xl', 3],
];

function nearestText(value, unit) {
    const rem = unit === 'px' ? value / 16 : value;
    let best = TEXT_SCALE[0];
    for (const entry of TEXT_SCALE) {
        if (Math.abs(entry[1] - rem) < Math.abs(best[1] - rem) - 1e-9) best = entry;
    }
    return `text-${best[0]}`;
}

function mapRadius(raw) {
    // raw: e.g. "rounded-lg", "rounded-t-2xl", "rounded-[10px]", "rounded"
    const m = /^rounded(?:-([trblse]{1,2}))?(?:-(.+))?$/.exec(raw);
    if (!m) return null;
    const side = m[1] ? `-${m[1]}` : '';
    const size = m[2];
    if (size === undefined) return `rounded${side}-sm`;
    if (size === 'lg') return `rounded${side}-md`;
    if (size === '2xl' || size === '3xl') return `rounded${side}-xl`;
    const arb = /^\[([\d.]+)(px|rem)\]$/.exec(size);
    if (arb) {
        const px = arb[2] === 'rem' ? Number(arb[1]) * 16 : Number(arb[1]);
        if (px <= 3) return `rounded${side}-sm`;
        if (px <= 8) return `rounded${side}-md`;
        return `rounded${side}-xl`;
    }
    return undefined; // already fine
}

const report = [];
const summary = [];
let totalChanges = 0;

for (const file of files) {
    const path = join(ROOT, file);
    const original = readFileSync(path, 'utf8');
    const lines = original.split('\n');
    let changes = 0;
    let inStyle = false;

    const out = lines.map((line, i) => {
        if (/<style[\s>]/.test(line)) inStyle = true;
        if (inStyle) {
            if (/<\/style>/.test(line)) inStyle = false;
            if (/#[0-9a-fA-F]{3,8}\b/.test(line)) report.push(`${file}:${i + 1}: hex in <style>: ${line.trim()}`);
            return line;
        }

        let next = line.replace(PALETTE_RE, (match, variants, prop, side, palette, shade, alpha) => {
            const baseProp = prop.startsWith('border') ? 'border' : prop;
            const mapped = mapPalette(baseProp, side, palette, shade, alpha, line);
            if (!mapped) {
                report.push(`${file}:${i + 1}: unmapped ${match}`);
                return match;
            }
            changes++;
            let v = variants;
            let target = mapped;
            if (/(^|:)focus(-visible|-within)?:$/.test(v) && (mapped.startsWith('border-primary') || mapped.startsWith('ring-'))) {
                target = mapped.replace(/^border-primary(\/\d+)?$/, 'border-focus').replace(/^ring-primary$/, 'ring-focus');
            }
            return v + target;
        });

        // Retired token names and a few raw keywords.
        next = next.replace(
            /(?<![\w-])((?:(?:[\w-]+|\[[^\]\s]+\]|@[\w-]+):)*)((?:bg|text|border)-(?:accent-strong|accent-hover|accent|subtle|white|black)(?:\/\d+)?)(?![\w-])/g,
            (match, variants, util) => {
                for (const [re, fn] of TOKEN_RENAMES) {
                    const m = re.exec(util);
                    if (m) {
                        const r = fn(m);
                        if (r === null) {
                            report.push(`${file}:${i + 1}: unmapped ${match}`);
                            return match;
                        }
                        changes++;
                        let v = variants;
                        let target = r;
                        if (/(^|:)focus(-visible|-within)?:$/.test(v) && target === 'border-primary') target = 'border-focus';
                        return v + target;
                    }
                }
                return match;
            },
        );
        next = next.replace(/(?<![\w-])((?:[\w-]+:)*)focus:border-accent(?![\w-])/g, (m, v) => {
            changes++;
            return `${v}focus:border-focus`;
        });
        next = next.replace(/(?<![\w-])((?:[\w-]+:)*)(ring|outline)-accent(?![\w-])/g, (m, v, p) => {
            changes++;
            return `${v}${p}-focus`;
        });

        // Arbitrary text sizes.
        next = next.replace(/(?<![\w-])((?:[\w-]+:)*)text-\[([\d.]+)(rem|px)\](?![\w-])/g, (m, v, value, unit) => {
            changes++;
            return v + nearestText(Number(value), unit);
        });

        // Radii.
        next = next.replace(/(?<![\w-])((?:[\w-]+:)*)(rounded(?:-[trblse]{1,2})?(?:-(?:lg|2xl|3xl|\[[\d.]+(?:px|rem)\]))?)(?![\w-])/g, (m, v, raw) => {
            const r = mapRadius(raw);
            if (r === undefined || r === null || r === raw) return m;
            changes++;
            return v + r;
        });

        // Glass effects are not part of the language.
        next = next.replace(/\s?(?<![\w-])(?:[\w-]+:)*backdrop-blur(?:-(?:none|xs|sm|md|lg|xl|2xl|3xl))?(?![\w-])/g, () => {
            changes++;
            return '';
        });

        // White text on a filled state background reads its contrast token.
        const fill = /(?<![\w/-])bg-(primary|danger|success|warning|info)(?![\w/-])/.exec(next);
        if (fill && /(?<![\w-])text-white(?![\w-])/.test(next)) {
            next = next.replace(/(?<![\w-])((?:[\w-]+:)*)text-white(?![\w-])/g, (m, v) => {
                changes++;
                return `${v}text-${fill[1]}-contrast`;
            });
        }

        // Everywhere else white text was the dark theme's "strongest text";
        // on the light default it would vanish. `class:` toggles are left for
        // a human — their background sits in another directive.
        if (!/class:[^=\s]*text-white/.test(next) && !/(?<![\w-])bg-backdrop(?![\w-])/.test(next)) {
            next = next.replace(/(?<![\w-])((?:[\w-]+:)*)text-white(?![\w-])/g, (m, v) => {
                changes++;
                return `${v}text-content`;
            });
        }

        for (const re of [/-\[#[0-9a-fA-F]{3,8}\]/, /shadow-(lg|xl|2xl)/, /\buppercase\b.*tracking-|tracking-.*\buppercase\b/, /(?<![\w-])text-white(?![\w-])/, /\[[0-9.]+vh\]/]) {
            if (re.test(next)) report.push(`${file}:${i + 1}: review ${re.source}: ${next.trim().slice(0, 160)}`);
        }
        return next;
    });

    if (changes > 0) {
        totalChanges += changes;
        summary.push(`${String(changes).padStart(4)}  ${file}`);
        if (!DRY) writeFileSync(path, out.join('\n'));
    }
}

const text =
    `${DRY ? '[dry-run] ' : ''}${totalChanges} replacements in ${summary.length} files\n\n` +
    summary.join('\n') +
    `\n\n--- Needs a human (${report.length}) ---\n` +
    report.join('\n') +
    '\n';
if (REPORT) writeFileSync(REPORT, text);
process.stdout.write(text.split('\n').slice(0, 3).join('\n') + '\n');
