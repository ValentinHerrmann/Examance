import type { Translations } from '../types';

export const settings: Translations['settings'] = {
    pageTitle: 'Settings & Privacy Configuration',
    language: {
        heading: '3. Language',
        description: 'Select the language of the user interface:',
        hint: 'Affects the interface only — generated exam PDFs stay unchanged.',
    },
    storage: {
        heading: '1. Global Data Storage Strategy',
        description: 'Select where your exams, exercises, student identities, and results are stored:',
        allLocalTitle: 'All Local (Privacy First)',
        allLocalText:
            'Exams, exercise library, student identities, and scans stored 100% locally in your browser IndexedDB.',
        allServerTitle: 'All Server',
        allServerText: 'All data synchronized and stored on the secure BlindGrade server.',
        hybridTitle: 'Hybrid Mode (Library on Server, Results Local)',
        hybridText:
            'Exercise library and exam templates on server, but student identities and grade submissions stay 100% on your local device.',
    },
    latex: {
        heading: '2. LaTeX Compilation',
        description: 'Select where LaTeX files are compiled (independent of storage strategy):',
        localTitle: 'Local Client (WebAssembly)',
        localText: 'Compiles inside your browser without sending source to any server.',
        serverTitle: 'Server (Tectonic)',
        serverText: 'High performance server-side compilation. Requires authenticated account.',
    },
    hygiene: {
        heading: 'Session Data Hygiene',
        description:
            'Permanently clear all cached exam, student, and scan data from local browser storage.',
        button: 'Clear All Session Data',
        confirm: 'Wipe all local session data from IndexedDB?',
    },
    status: {
        latexSet: 'LaTeX Compilation set to {mode}.',
        storageModeSet: 'Global Storage Mode updated to {mode}. Session cleared.',
        languageSet: 'Language set to {language}.',
        studentErased: 'Student {id} successfully erased.',
        exportDownloaded: 'Subject access export downloaded.',
        exportFailed: 'Export failed.',
    },
    alerts: {
        serverCompileNeedsAuth: 'Server compilation requires an authenticated session. Please log in.',
        serverStorageNeedsAuth: 'Server storage modes require an authenticated session. Please log in.',
        storageModeConfirm:
            'Changing storage mode requires clearing the current active session state. Please make sure you have exported a .bgproj backup first!\n\nDo you want to proceed and switch storage mode?',
        eraseStudentConfirm:
            'Are you sure you want to permanently erase this student identity and all submissions?',
        eraseFailed: 'Erasure failed: {message}',
    },
};
