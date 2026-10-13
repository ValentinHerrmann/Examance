import type { Translations } from '../types';

export const exportNs: Translations['export'] = {
    button: 'Export (ZIP)',
    dialog: {
        chooseParts: 'What should the download contain?',
        download: 'Download ZIP',
        packing: 'Packing ZIP …',
        doneWithWarnings: 'The download was created, but not everything could be exported:',
    },
    latexReadme:
        'LaTeX project exported from Examance\n' +
        '====================================\n\n' +
        'Compile with XeLaTeX (the template uses fontspec).\n\n' +
        'Overleaf: import the ZIP via "New project > Upload project", then pick XeLaTeX under "Menu > Compiler".\n' +
        'Locally: run latexmk in the folder (the bundled latexmkrc selects XeLaTeX) or run "xelatex <file>.tex" twice.\n\n' +
        'The sty/ and img/ folders hold the bundled packages and images; the .sty files are also copied flat into the folder because some are loaded by bare name.\n',
    exam: {
        title: 'Export exam (ZIP)',
        notice:
            'The download contains unencrypted personal data (names, grades, scans). Store it only in safe places and delete it after use. An immutable audit-log entry is created.',
        options: {
            graded: 'Graded scans (PDF)',
            gradedHint: 'With annotations burned in, including partly graded submissions (file name with _partial, ungraded ones with _ungraded).',
            latex: 'LaTeX source',
            latexHint: 'A separate ZIP with the exam (main.tex) and solution (solution.tex), their files and logo: upload it to Overleaf as is (compiler XeLaTeX).',
            pdf: 'Compiled exam and solution (PDF)',
            pdfHint: 'Compiling may take a while.',
            summary: 'Summary (PDF)',
            summaryHint: 'Key facts, grading key, statistics, chart and student table.',
            csv: 'Grades (CSV)',
            csvHint: 'Excel-compatible grade list.',
            withheld: 'Not available: the exercises were imported without their code (results only).',
        },
        steps: {
            loading: 'Loading exam …',
            results: 'Loading results …',
            latex: 'Packing LaTeX source …',
            compiling: 'Compiling exam and solution …',
            summary: 'Creating summary …',
            graded: 'Creating graded scans …',
        },
        warnings: {
            failed: '{part} could not be exported: {error}',
            gradedOne: 'The scan of {name} could not be exported: {error}',
            noScan: 'There is no scan for {name}.',
            missingGraphics: 'Missing graphics in the compiled PDF: {files}',
        },
        summary: {
            title: 'Summary',
            exportedAt: 'Exported on {date}',
            metadata: 'Exam',
            testart: 'Type',
            course: 'Class',
            subject: 'Subject',
            date: 'Date',
            teacher: 'Teacher',
            nr: 'Number',
            maxPoints: 'Max. points',
            results: 'Results',
            complete: 'Fully graded',
            partial: 'Partly graded',
            ungraded: 'Not graded',
            gradingKey: 'Grading key',
            grade: 'Grade',
            gradeLabel: 'Label',
            minPercent: 'From percent',
            minPoints: 'From points',
            students: 'Students',
            student: 'Name',
            points: 'Points',
            percent: 'Percent',
            status: 'Status',
        },
    },
    exercises: {
        groupTitle: 'Export exercise group: {name}',
        libraryTitle: 'Export exercise library',
        libraryNotice: 'All groups with variants, image files and the bundled LaTeX packages. PDFs are not included.',
        globalAssets: 'Include bundled LaTeX files',
        globalAssetsHint: 'Packages and images (sty/, img/) so the group document compiles as it is.',
        pdfs: 'Include compiled PDFs',
        pdfsHint: 'Angabe and Lösung per exercise. Compiling may take a while.',
        exporting: 'Exporting "{name}" …',
        compiling: 'Compiling "{name}" …',
        pdfFailed: 'PDFs of "{name}" could not be created: {error}',
        missingGraphics: 'Missing graphics in "{name}": {files}',
    },
};
