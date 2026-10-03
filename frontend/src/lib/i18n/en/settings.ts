import type { Translations } from '../types';

export const settings: Translations['settings'] = {
    pageTitle: 'Settings & Privacy Configuration',
    language: {
        heading: '3. Language',
        description: 'Select the language of the user interface:',
        hint: 'Affects the interface only — generated exam PDFs stay unchanged.',
    },
    theme: {
        heading: 'Color scheme',
        description: 'Select the color scheme of the user interface:',
        hint: '“Match system” follows your operating system setting and switches along with it.',
    },
    storage: {
        heading: '1. Global Data Storage Strategy',
        description: 'Select where your exams, exercises, student identities, and results are stored:',
        allLocalTitle: 'All Local (Privacy First)',
        allLocalText: 'Exams, exercise library, student identities, and scans stored 100% locally in your browser IndexedDB.',
        allServerTitle: 'All Server',
        allServerText: 'All data synchronized and stored on the secure BlindGrade server.',
        hybridTitle: 'Hybrid Mode (Library on Server, Results Local)',
        hybridText: 'Exercise library and exam templates on server, but student identities and grade submissions stay 100% on your local device.',
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
        description: 'Thresholds used to detect ticked boxes on scanned answer sheets. The defaults suit most scanners.',
        futureOnly:
            'Changes apply only to future detection runs (new scans or "Re-run MC detection"). Existing and especially already verified results are not changed.',
        localOnly: 'Stored in this browser only and not synced to other devices.',
        basicGroup: 'Box fill level',
        advancedGroup: 'Advanced',
        fixedGroup: 'Fixed',
        defaultValue: 'Default: {value}',
        onlyFor: 'Only used by method v{algorithm}.',
        on: 'on',
        off: 'off',
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
            algorithm: {
                label: 'Detection method',
                hint: 'v4 = default (stroke shape, local contrast). v2 = older method (fill level), kept as a fallback. The other method always runs alongside; the MC verification view compares both on your verified boxes.',
                v2: 'v2 — older method (fill level)',
                v4: 'v4 — default (stroke shape)',
            },
            inkMinFill: {
                label: 'v4: ink from (fill level)',
                hint: 'Below this — and without a recognisable stroke — a box counts as blank.',
            },
            tickSpanMin: {
                label: 'v4: cross from stroke length',
                hint: 'A clean stroke spanning at least this share of the box counts as a confident cross, regardless of fill level.',
            },
            ambiguousLow: {
                label: 'v2: Blank below (fill level)',
                hint: 'Boxes with a smaller share of dark pixels count as blank. Higher = dust/specks are ignored more, but faint ticks are missed more easily.',
            },
            markedHigh: {
                label: 'v2: Confidently ticked from (fill level)',
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
            shapeAnalysis: {
                label: 'v2: Mark shape analysis',
                hint: 'Also checks how the ink is spread inside the box: evenly filled boxes count as withdrawn, marks reaching far beyond the box or very faint marks are sent to review.',
            },
            solidFillMin: {
                label: 'v2: Filled: minimum fill level',
                hint: 'From this fill level on, the box is checked for being evenly filled (rather than ticked).',
            },
            solidCellMin: {
                label: 'Filled: minimum coverage per cell',
                hint: 'The box is split into 3 × 3 cells. It only counts as filled if every cell is covered at least this much — a cross or tick always leaves cells empty.',
            },
            solidEvennessMin: {
                label: 'Filled: minimum evenness',
                hint: 'Weakest ÷ strongest cell. A bold cross covers corners and centre much more than the edge middles and therefore does not count as filled.',
            },
            ringFraction: {
                label: 'Surroundings: ring width',
                hint: 'How far around the box (share of the box size) ink is looked for.',
            },
            spillExcessMax: {
                label: 'Surroundings: maximum extra ink',
                hint: 'If there is this much more ink around a box than around the other boxes of the question, the mark is sent to review.',
            },
            faintContrastMin: {
                label: 'Faint mark: minimum contrast',
                hint: '0 = barely darker than the background, 1 = as dark as the print. Fainter marks are sent to review.',
            },
            localContrastFrac: {
                label: 'Ink: local contrast threshold',
                hint: 'A pixel counts as ink when it is darker than the surrounding paper by this share of the range between paper and print black. Lower = more sensitive.',
            },
            snapMaxFraction: {
                label: 'Box: maximum snapping',
                hint: 'How far (share of the box size) the measuring window may be moved onto the actually printed border.',
            },
            strokeSpanMin: {
                label: 'Thin stroke: minimum length',
                hint: 'An otherwise empty box with a stroke spanning at least this share of the box is sent to review.',
            },
            scanScale: {
                label: 'Raster resolution (scale)',
                hint: 'Resolution scans are rendered at for detection. Not adjustable, but recorded with every run.',
            },
        },
    },
    donation: {
        heading: '5. Help improve MC detection (optional)',
        description: 'Help improve automatic checkbox detection for all teachers by donating anonymised crops of boxes you have already verified.',
        whatIsSent:
            "Sent per verified box: a small grayscale crop (only the box and the correction field next to it, no question text), your verified decision (ticked / not ticked) and the detector's measurements.",
        whatIsNotSent: 'Not sent: names, pseudonyms, exam, submission or question identifiers, or timestamps. Each box only carries a random id, so a later correction replaces the earlier label. Donations are sent signed in, so only accounts of this installation can donate; your account is not stored with the crops.',
        whenSent: 'Only questions you confirmed or corrected in the MC verification view, only while you are signed in and this option is enabled. Switching it off stops everything, including crops already prepared.',
        recipient: 'Recipient: {host}',
        unavailable: 'This server does not accept donations at the moment — nothing is sent.',
        signInRequired: 'Donating requires being signed in to a server account.',
        optIn: 'I want to send anonymised crops of verified checkboxes to the operator of this Examance server.',
        privacyNote: 'Details in the privacy policy:',
        privacyLink: 'Privacy',
    },
    hygiene: {
        heading: 'Session Data Hygiene',
        description: 'Permanently clear all cached exam, student, and scan data from local browser storage.',
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
        storageModeConfirm: 'Changing storage mode requires clearing the current active session state. Please make sure you have exported a .bgproj backup first!\n\nDo you want to proceed and switch storage mode?',
        eraseStudentConfirm: 'Are you sure you want to permanently erase this student identity and all submissions?',
        eraseFailed: 'Erasure failed: {message}',
    },
};
