import type { Translations } from '../types';

export const logo: Translations['logo'] = {
    upload: 'Upload logo',
    replace: 'Replace logo',
    noLogo: 'No logo',
    pdfLogo: 'PDF logo ({size} KB)',
    previewAlt: 'Logo preview',
    formats: 'PNG, JPEG or PDF, at most 2 MB. It is printed 9 mm tall at the top left of the first page; a PDF stays sharp.',
    account: {
        heading: 'Exam logo',
        description: 'This logo is printed at the top left of every exam. The MTG logo is the default; you can upload your own (e.g. your school’s logo) or print no logo. Individual exams can use their own logo or none in their exam details.',
        useNone: 'No logo',
        reset: 'Reset to default (MTG)',
        noneConfirm: 'Use no logo? Exams that use the logo from the settings will then be typeset without a logo.',
        resetConfirm: 'Reset to the default logo (MTG)? Your own logo will be deleted.',
    },
    mode: {
        default: 'Default logo (MTG)',
        none: 'No logo',
        custom: 'Own logo',
    },
    source: {
        default: 'Default logo (MTG)',
        account: 'Logo from the settings',
        exam: 'This exam’s own logo',
        none: 'No logo',
    },
    overviewLabel: 'Logo',
    exam: {
        heading: 'Logo',
        account: 'Use the logo from the settings',
        none: 'No logo',
        custom: 'Own logo for this exam',
        noAccountLogo: '“No logo” is selected in the settings.',
        toSettings: 'Go to settings',
        needsFile: 'Please choose a file, otherwise the current setting stays.',
        saveFailed: 'The logo could not be saved: {message}',
    },
    errors: {
        empty: 'The file is empty.',
        tooLarge: 'The logo is larger than 2 MB. Please use a smaller image or a PDF.',
        type: 'The logo must be a PNG, JPEG or PDF file.',
        generic: 'The logo could not be loaded.',
    },
};
