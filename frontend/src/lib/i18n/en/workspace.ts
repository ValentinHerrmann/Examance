import type { Translations } from '../types';

export const workspace: Translations['workspace'] = {
    menu: {
        open: '📂 Open .bgproj',
        export: '💾 Export .bgproj',
        clear: '❌ Clear Workspace',
    },
    session: {
        cloudMode: '☁️ Cloud Mode',
        localMode: '💻 Local Mode',
        lockSession: 'Lock Session',
        lock: 'Lock',
        connectToCloud: 'Connect to Cloud',
    },
    archive: {
        promptImportPassword: 'Enter password for this .bgproj archive:',
        promptExportPassword: 'Enter password to encrypt .bgproj archive:',
        importFailed: 'Failed to import archive: {message}',
        exportFailed: 'Export failed: {message}',
        clearFailed: 'Failed to clear workspace: {message}',
        cleared: 'Workspace cleared successfully.',
        confirmReplace:
            'Opening a new .bgproj file will replace your current workspace and clear existing local data. Unsaved changes will be lost. Continue?',
        confirmClear:
            'Are you sure you want to close this project and clear all local workspace data? Unsaved changes will be lost.',
        summaryLoaded: 'Loaded {examCount} exam(s) and {studentCount} student(s).',
        summarySuccess: 'Import successful! {loaded}',
        summaryProblems: 'Import finished with {errorCount} problem(s). {loaded}',
        summaryProblemsHeading: 'The following could not be saved to the server:',
    },
    legalNavLabel: 'Legal notices',
};
