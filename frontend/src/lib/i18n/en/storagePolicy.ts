import type { Translations } from '../types';

export const storagePolicy: Translations['storagePolicy'] = {
    allLocal: 'All Local',
    allServer: 'All Server',
    hybrid: 'Hybrid (Exercises Server, Students Local)',
    hybridShort: 'Hybrid Mode',
    latexServer: 'LaTeX Server',
    latexLocal: 'LaTeX Local',
    allLocalTitle: 'Everything stored locally in browser IndexedDB',
    allServerTitle: 'Everything stored and synced with backend server',
    hybridTitle: 'Exercises & Exams on server, Student identity & submissions local',
};
