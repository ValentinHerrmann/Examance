import type { Translations } from '../types';

export const logo: Translations['logo'] = {
    upload: 'Upload logo',
    replace: 'Replace logo',
    remove: 'Remove logo',
    noLogo: 'No logo',
    pdfLogo: 'PDF logo ({size} KB)',
    previewAlt: 'Logo preview',
    formats: 'PNG, JPEG or PDF, at most 2 MB. It is printed 9 mm tall at the top left of the first page; a PDF stays sharp.',
    account: {
        heading: 'Exam logo',
        description: 'This logo is printed at the top left of every exam, e.g. your school’s logo. Individual exams can use their own logo or none in their exam details.',
        removeConfirm: 'Remove the logo? Exams that use the account logo will then be typeset without a logo.',
    },
    exam: {
        heading: 'Logo',
        account: 'Use the logo from the settings',
        none: 'No logo',
        custom: 'Own logo for this exam',
        noAccountLogo: 'No logo is set in the settings.',
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
