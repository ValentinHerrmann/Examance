import type { ExportOption } from '#lib/components/export/ExportOptionsModal.svelte';

/** The parts of an exam's raw export (modal and Archive tab); `tr` is the reactive `$t` of the caller, so a language switch updates the labels. */
export function examExportOptions(withheld: boolean, tr: (key: any) => string): ExportOption[] {
    return [
        { key: 'graded', label: tr('export.exam.options.graded'), hint: tr('export.exam.options.gradedHint') },
        { key: 'gradedCombined', label: tr('export.exam.options.gradedCombined'), hint: tr('export.exam.options.gradedCombinedHint') },
        {
            key: 'latex',
            label: tr('export.exam.options.latex'),
            hint: withheld ? tr('export.exam.options.withheld') : tr('export.exam.options.latexHint'),
            disabled: withheld,
        },
        {
            key: 'pdf',
            label: tr('export.exam.options.pdf'),
            hint: withheld ? tr('export.exam.options.withheld') : tr('export.exam.options.pdfHint'),
            disabled: withheld,
        },
        { key: 'summary', label: tr('export.exam.options.summary'), hint: tr('export.exam.options.summaryHint') },
        { key: 'csv', label: tr('export.exam.options.csv'), hint: tr('export.exam.options.csvHint') },
    ];
}
