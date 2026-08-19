import type { Translations } from '../types';

export const statusBar: Translations['statusBar'] = {
    storageSettingsHint: 'Click to change storage & privacy settings',
    lockedHint: 'Session locked — Click to unlock',
    backendConfigureHint: 'Click to configure backend server address',
    backendCurrent: 'Current Backend Server',
    noServer: 'No Server Configured',
    languageHint: 'Switch language ({language})',
    versionMatch: 'App and server both run v{version}',
    versionMismatch: 'App v{version} — versions differ but stay compatible',
    versionIncompatible: 'App v{version} — incompatible major version',
    versionUnknown: 'App v{version} — server version unavailable',
    versionNoServer: 'App v{version} — no server configured',
    linkPullRequest: 'open pull request on GitHub',
    linkCommit: 'open build commit on GitHub',
    linkRelease: 'open release on GitHub',
};
