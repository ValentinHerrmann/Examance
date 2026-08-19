import type { Translations } from '../types';

export const misc: Translations['misc'] = {
    storageModal: {
        heading: 'Storage & Server Configuration',
        storageHeading: '1. Storage Policy',
        storageDescription: 'Select where exam data and student grades are stored:',
        allLocalTitle: '🔒 All Local (Zero Cloud)',
        allLocalText: 'All data stays on this device in encrypted IndexedDB. No backend required.',
        allServerTitle: '☁️ All Server',
        allServerText: 'All data synchronized and stored on the secure BlindGrade server.',
        hybridTitle: '⚖️ Hybrid Mode',
        hybridText:
            'Exercise library and exam templates on server, but student identities stay 100% local.',
        latexHeading: '2. LaTeX Compilation Engine',
        latexDescription: 'Select engine for rendering LaTeX exam documents to PDF:',
        latexLocalTitle: '⚡ Browser Local (WASM BusyTeX)',
        latexLocalText: 'Compiles inside browser without sending source to any server.',
        latexServerTitle: '⚡ Server (Tectonic)',
        latexServerText: 'High performance server-side compilation. Requires authenticated account.',
        backendHeading: '3. Backend Server Address',
        backendDescription: 'Configure custom API server address (e.g. local backend server):',
        backendPlaceholder: 'e.g. http://localhost:8000',
        backendEmpty: 'Please enter a backend server address.',
        backendInvalid: 'That backend server address is not valid.',
        backendUpdated: 'Backend server address updated to: {url}',
        fullSettingsLink: 'Full Settings & GDPR Erasure ↗',
    },

    compiler: {
        localFailedTryServer:
            'Local LaTeX compilation failed. Do you want to try compiling on the server?',
    },
};
