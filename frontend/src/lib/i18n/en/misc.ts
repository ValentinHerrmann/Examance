import type { Translations } from '../types';

export const misc: Translations['misc'] = {
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
        causesTitle: 'Likely cause',
        cause: {
            undefinedControl: String.raw`A command is unknown{detail}: a typo in the command name, or the package defining it is not loaded (a line of its own \usepackage{…} in the exercise, or the LaTeX package settings).`,
            missingDollar: String.raw`Math symbols (^, _, \alpha …) are used outside a formula: wrap them in $…$, or a $ is not closed.`,
            bodyPackage: String.raw`A \usepackage sits in the middle of the exercise: give packages only as a line of its own \usepackage{…} (Examance moves it into the preamble) or in the LaTeX package settings.`,
            fileNotFound: 'A file or package is missing: attach the image or file to the exercise as a resource and check the file name; a package may be available in only one of the browser and server compilers.',
            fontNotFound: 'A font is not available in the compiler: use a standard font.',
            environmentUndefined: String.raw`An environment (\begin{…}) is unknown: a typo, or its package is not loaded.`,
            beginEnd: String.raw`\begin and \end do not match: an environment is not closed or closed with the wrong name.`,
            braces: 'Curly braces are unbalanced: a { is not closed or there is one } too many; an empty line inside a command argument causes this too.',
            alignmentTab: String.raw`An & is used outside a table or alignment: write \&, or a table has more columns than declared.`,
            missingItem: String.raw`A list (itemize/enumerate) lacks \item, or \item (also \multi, \Lmulti) is used outside a list.`,
            tooDeeplyNested: 'Too many nested lists or environments: reduce the nesting.',
            dimensionTooLarge: 'A length is too large (e.g. graphics or TikZ coordinates): check the values or the scaling.',
            packageError: 'A package reports an error: the message usually names the wrong option or usage.',
            emergencyStop: 'LaTeX stopped without a more specific message: usually a missing file or an error further up in the log.',
        },
        aiButton: 'Create prompt for AI chat',
        aiTitle: 'Prompt for an AI chat: fix the error',
        aiIntro: 'Copy this prompt and paste it into an AI chat of your choice (such as ByLKI, ChatGPT, Claude or Gemini). It tells the chat how Examance builds the document, which template commands exist and what the compiler reported; the chat answers in English.',
        aiIncludeSource: 'Include the code of the affected exercise',
        aiIncludeSourceHint: 'This lets the chat suggest a concrete fix. The prompt then contains the exercise text, never student data.',
        aiNotice: 'Examance sends nothing. Whatever you paste into an AI chat goes to its provider.',
        aiPreview: 'Prompt',
        aiCopy: 'Copy prompt',
        aiCopied: 'Copied',
        aiFailed: 'Could not copy (clipboard access was refused). Select the prompt and copy it by hand.',
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
