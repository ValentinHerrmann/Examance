import type { Translations } from '../types';

export const misc: Translations['misc'] = {
    storageModal: {
        heading: 'Storage & Server Configuration',
        storageHeading: '1. Storage Policy',
        storageDescription: 'Select where exam data and student grades are stored:',
        allServerTitle: '️ All Server',
        allServerText: 'All data synchronized and stored on the secure Examance server.',
        hybridTitle: '️ Hybrid Mode',
        hybridText: 'Exercise library and exam templates on server, but student identities stay 100% local.',
        latexHeading: '2. LaTeX Compilation Engine',
        latexDescription: 'Select engine for rendering LaTeX exam documents to PDF:',
        latexLocalTitle: 'Browser Local (WASM BusyTeX)',
        latexLocalText: 'Compiles inside browser without sending source to any server.',
        latexServerTitle: 'Server (Tectonic)',
        latexServerText: 'High performance server-side compilation. Requires authenticated account.',
        backendHeading: '3. Backend Server Address',
        backendDescription: 'Configure custom API server address (e.g. local backend server):',
        backendPlaceholder: 'localhost:8000',
        backendEmpty: 'Please enter a backend server address.',
        backendInvalid: 'That backend server address is not valid.',
        backendUpdated: 'Backend server address updated to: {url}',
        fullSettingsLink: 'Full Settings & GDPR Erasure',
    },

    compiler: {
        downloadTitle: 'Downloading LaTeX engine',
        downloadHint: 'One-time download; afterwards it stays in the browser cache and exams compile locally.',
        downloadBytes: '{loaded} of {total}',
        prepare: 'Unpacking…',
        prepareStep: 'Unpacking package {step} of {steps}…',
        localFailedTryServer: 'Local LaTeX compilation failed. Do you want to try compiling on the server?',
        locationExercise: 'Exercise “{label}”, line {line}',
        locationGenerated: 'Generated frame (header, preamble), line {line}',
        showLog: 'Full LaTeX log',
        logTitle: 'LaTeX log',
        logHint: 'The complete output of the LaTeX compiler. Line numbers “l.<n>” refer to the internally assembled document; where possible, the exercise and its line in the exercise editor follow in brackets.',
        logCopy: 'Copy',
        logCopied: 'Copied',
        logDownload: 'Download as .log',
        logClose: 'Close',
    },

    rejectedWrites: {
        heading: 'Changes refused by the server',
        body: 'The server refused {count} change(s) saved while offline when they were sent again; they were discarded. ' +
            'Please check the affected data and enter it again if needed. Last error: {message}',
    },
    vaultIntegrity: {
        heading: 'Warning: some data could not be decrypted',
        body: '{count} record(s) ({kinds}) could not be read with the current key.' +
            'They are shown empty here — that is not your data. Saving is blocked for those ' +
            'records so the originals are not overwritten.',
        action: 'Lock the session and unlock again with the correct key.',
        dismiss: 'Dismiss',
    },
};
