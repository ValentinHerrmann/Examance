import type { Translations } from '../types';

export const editor: Translations['editor'] = {
    categories: {
        solutions: 'Solutions',
        scoring: 'Scoring',
        formatting: 'Formatting',
        generic: 'Generic',
    },

    macros: {
        loesung: { label: 'Solution text', description: 'Shown only in the answer key.' },
        'loesung-replace': {
            label: 'Replace in answer key',
            description: 'Different content in the answer key vs. the student copy.',
        },
        'loesung-leer': { label: 'Blank space', description: 'Solution vs. blank vertical space.' },
        'loesung-img': {
            label: 'Solution image',
            description: 'Different image in the answer key vs. the student copy.',
        },
        'loesung-luecke': {
            label: 'Fill-in blank',
            description: 'Solution vs. a ruled line to fill in.',
        },
        'loesung-karo': { label: 'Graph paper', description: 'Solution vs. rows of graph-paper squares.' },
        'loesung-line': { label: 'Ruled lines', description: 'Solution vs. ruled writing lines.' },
        'loesung-form': { label: 'Fillable field', description: 'A fillable PDF form text field.' },
        kariert: {
            label: 'Graph paper (raw)',
            description: 'Rows of graph-paper squares, without an answer-key toggle.',
        },
        liniert: {
            label: 'Ruled lines (raw)',
            description: 'Ruled writing lines, without an answer-key toggle.',
        },
        be: { label: 'Full point', description: 'Award 1 point.' },
        hbe: { label: 'Half point', description: 'Award 0.5 points.' },
        qbe: { label: 'Quarter point', description: 'Award 0.25 points.' },
        textbf: { label: 'Bold text', description: 'Bold text.' },
        textit: { label: 'Italic text', description: 'Italic text.' },
        textcolor: {
            label: 'Colored text',
            description: 'Colored text — edit the color name or hex code.',
        },
        'fontsize-footnotesize': { label: 'Small text', description: 'Footnote-sized text.' },
        'fontsize-large': { label: 'Slightly larger text', description: 'Slightly larger text.' },
        'fontsize-Large': { label: 'Larger text', description: 'Larger text.' },
        'fontsize-LARGE': { label: 'Large heading text', description: 'Large heading-sized text.' },
        'fontsize-huge': { label: 'Huge text', description: 'Huge text.' },
        includegraphics: { label: 'Image', description: 'Insert an image.' },
        tabular: { label: 'Table', description: 'A simple table.' },
        itemize: { label: 'Bullet list', description: 'A bullet list.' },
        enumerate: { label: 'Numbered list', description: 'A numbered list.' },
        'inline-math': { label: 'Inline math', description: 'Inline math.' },
        center: { label: 'Centered content', description: 'Centered content.' },
    },

    confirmDialog: {
        title: 'Unsaved Changes',
        message:
            'You have unsaved changes that will be lost. Are you sure you want to exit without saving?',
        confirmText: 'Discard Changes',
        cancelText: 'Keep Editing',
    },

    pdfPreview: {
        titleAngabe: 'Exercise',
        titleLoesung: 'Solution',
        placeholder: 'Click compile to render preview',
        collapse: 'Click to collapse {title} PDF',
        expand: 'Click to expand {title} PDF',
        frameTitle: '{title} Preview',
    },

    zoom: {
        zoomOut: 'Zoom Out',
        zoomIn: 'Zoom In',
        resetToFit: 'Reset to Fit',
        fit: 'Fit',
    },
};
