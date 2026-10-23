import type { Translations } from '../types';

export const about: Translations['about'] = {
    title: 'Discover Examance',
    subtitle: 'Two posters show what Examance does, what the interface looks like and how your data is protected.',
    tabsLabel: 'Posters',
    posters: {
        info: {
            title: 'Features and privacy',
            description: 'What Examance does, why the server only stores results encrypted, and what a school should settle before using it.',
        },
        ui: {
            title: 'Tour of the interface',
            description: 'Creating exercises, building exams, grading and analysing results, shown in screenshots of a demo instance.',
        },
    },
    germanOnly: 'The posters are available in German only.',
    openPdf: 'Open in new tab',
    downloadPdf: 'Download PDF',
    backToSignIn: 'Back to sign-in',
    headerLink: 'Posters: features & privacy',
};
