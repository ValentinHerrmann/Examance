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
    omr: {
        heading: '4. Fine-tune MC detection (OMR)',
        description:
            'Thresholds used to detect ticked boxes on scanned answer sheets. The defaults suit most scanners.',
        futureOnly:
            'Changes apply only to future detection runs (new scans or "Re-run MC detection"). Existing and especially already verified results are not changed.',
        localOnly: 'Stored in this browser only and not synced to other devices.',
        basicGroup: 'Box fill level',
        advancedGroup: 'Advanced: fiducials & alignment',
        fixedGroup: 'Fixed',
        defaultValue: 'Default: {value}',
        save: 'Save',
        reset: 'Reset to defaults',
        saved: 'MC detection settings saved. They apply from the next detection run.',
        resetDone: 'MC detection settings reset to defaults.',
        profile: 'Active: {source} · revision {revision}',
        source: {
            default: 'Defaults',
            user: 'Custom settings',
            learned: 'Learned settings',
        },
        errors: {
            range: '{label}: allowed range is {min} to {max}.',
            fillOrder: 'Required: "Blank below" < "Confidently ticked from" < "Completely filled from".',
            areaOrder: 'The minimum fiducial area must be smaller than the maximum.',
        },
        params: {
            ambiguousLow: {
                label: 'Blank below (fill level)',
                hint: 'Boxes with a smaller share of dark pixels count as blank. Higher = dust/specks are ignored more, but faint ticks are missed more easily.',
            },
            markedHigh: {
                label: 'Confidently ticked from (fill level)',
                hint: 'From this share a box counts as confidently ticked. In between, it is flagged as uncertain for review.',
            },
            filledHigh: {
                label: 'Completely filled from (fill level)',
                hint: 'An almost fully blackened box counts as a withdrawn tick (only on sheets with a correction field).',
            },
            redoMarkedHigh: {
                label: 'Correction field ticked from (fill level)',
                hint: 'If the correction field next to a filled box is marked at least this much, the box counts as ticked again.',
            },
            sampleInsetFraction: {
                label: 'Edge inset when measuring',
                hint: 'Share of each box side ignored when counting, so the printed border does not count.',
            },
            quadrantFraction: {
                label: 'Fiducial search area',
                hint: 'Share of each page edge searched for the corner fiducials.',
            },
            fiducialAreaMinRatio: {
                label: 'Fiducial: minimum area (× expected)',
                hint: 'Smaller dark specks are not accepted as a fiducial.',
            },
            fiducialAreaMaxRatio: {
                label: 'Fiducial: maximum area (× expected)',
                hint: 'Larger dark areas (e.g. scanner shadows) are not accepted as a fiducial.',
            },
            fiducialMaxAspectRatio: {
                label: 'Fiducial: maximum aspect ratio',
                hint: 'Fiducials are square; more elongated shapes (lines, text) are rejected.',
            },
            fiducialMaxDistFraction: {
                label: 'Fiducial: maximum offset',
                hint: 'How far (share of the shorter page side) a fiducial may be from its expected position.',
            },
            alignResidualFraction: {
                label: 'Alignment: fourth-corner tolerance',
                hint: 'Deviation of the fourth fiducial (share of scan width) above which alignment counts as uncertain.',
            },
            alignRatioTolerance: {
                label: 'Alignment: aspect-ratio tolerance',
                hint: 'Relative aspect-ratio distortion above which alignment counts as uncertain.',
            },
            alignAngleToleranceDeg: {
                label: 'Alignment: corner-angle tolerance (°)',
                hint: 'Allowed deviation of the page corners from 90° before alignment counts as uncertain.',
            },
            scanScale: {
                label: 'Raster resolution (scale)',
                hint: 'Resolution scans are rendered at for detection. Not adjustable, but recorded with every run.',
            },
        },
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
