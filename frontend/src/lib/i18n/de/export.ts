// Raw exports (issue #82): exam ZIP and exercise-library ZIP.
export const exportNs = {
    button: 'Exportieren (ZIP)',
    dialog: {
        chooseParts: 'Was soll der Download enthalten?',
        download: 'ZIP herunterladen',
        packing: 'ZIP wird gepackt …',
        doneWithWarnings: 'Der Download wurde erstellt, aber nicht alles konnte exportiert werden:',
    },
    latexReadme:
        'LaTeX-Projekt aus Examance\n' +
        '==========================\n\n' +
        'Kompilieren mit XeLaTeX (die Vorlage nutzt fontspec).\n\n' +
        'Overleaf: ZIP über "Neues Projekt > Projekt hochladen" importieren, unter "Menü > Compiler" XeLaTeX wählen.\n' +
        'Lokal: latexmk im Ordner ausführen (die mitgelieferte latexmkrc wählt XeLaTeX) oder "xelatex <datei>.tex" zweimal aufrufen.\n\n' +
        'Die Ordner sty/ und img/ enthalten die mitgelieferten Pakete und Bilder; die .sty-Dateien liegen zusätzlich flach im Ordner, weil einige per Name geladen werden.\n',
    exam: {
        title: 'Prüfung exportieren (ZIP)',
        notice:
            'Der Download enthält unverschlüsselte personenbezogene Daten (Klarnamen, Noten, Scans). Bitte nur an sicheren Orten speichern und nach Gebrauch löschen. Ein unveränderlicher Prüfprotokolleintrag wird erstellt.',
        options: {
            graded: 'Korrigierte Scans (PDF)',
            gradedHint: 'Mit eingebrannten Anmerkungen, auch teilweise korrigierte Abgaben (Dateiname mit _partial, unkorrigierte mit _ungraded).',
            latex: 'LaTeX-Quelltext',
            latexHint: 'Eigene ZIP mit Angabe (main.tex) und Lösung (solution.tex) samt Dateien und Logo: direkt bei Overleaf hochladen (Compiler XeLaTeX).',
            pdf: 'Kompilierte Angabe und Lösung (PDF)',
            pdfHint: 'Das Kompilieren kann etwas dauern.',
            summary: 'Zusammenfassung (PDF)',
            summaryHint: 'Eckdaten, Notenschlüssel, Statistik, Diagramm und Schülertabelle.',
            csv: 'Noten (CSV)',
            csvHint: 'Excel-kompatible Notenliste.',
            withheld: 'Nicht verfügbar: Die Aufgaben wurden ohne Code importiert (nur Ergebnisse).',
        },
        steps: {
            loading: 'Prüfung wird geladen …',
            results: 'Ergebnisse werden geladen …',
            latex: 'LaTeX-Quelltext wird gepackt …',
            compiling: 'Angabe und Lösung werden kompiliert …',
            summary: 'Zusammenfassung wird erstellt …',
            graded: 'Korrigierte Scans werden erstellt …',
        },
        warnings: {
            failed: '{part} konnte nicht exportiert werden: {error}',
            gradedOne: 'Scan von {name} konnte nicht exportiert werden: {error}',
            noScan: 'Für {name} ist kein Scan vorhanden.',
            missingGraphics: 'Fehlende Grafiken im kompilierten PDF: {files}',
        },
        summary: {
            title: 'Zusammenfassung',
            exportedAt: 'Exportiert am {date}',
            metadata: 'Prüfung',
            testart: 'Testart',
            course: 'Klasse',
            subject: 'Fach',
            date: 'Datum',
            teacher: 'Lehrkraft',
            nr: 'Nummer',
            maxPoints: 'Max. Punkte',
            results: 'Ergebnisse',
            complete: 'Vollständig korrigiert',
            partial: 'Teilweise korrigiert',
            ungraded: 'Nicht korrigiert',
            gradingKey: 'Notenschlüssel',
            grade: 'Note',
            gradeLabel: 'Bezeichnung',
            minPercent: 'Ab Prozent',
            minPoints: 'Ab Punkten',
            students: 'Schülerinnen und Schüler',
            student: 'Name',
            points: 'Punkte',
            percent: 'Prozent',
            status: 'Status',
        },
    },
    exercises: {
        groupTitle: 'Aufgabengruppe exportieren: {name}',
        libraryTitle: 'Aufgabenbibliothek exportieren',
        libraryNotice: 'Alle Gruppen mit Varianten, Bilddateien und den mitgelieferten LaTeX-Paketen. PDFs sind nicht enthalten.',
        globalAssets: 'Mitgelieferte LaTeX-Dateien einschließen',
        globalAssetsHint: 'Pakete und Bilder (sty/, img/), damit die Gruppendatei direkt kompiliert.',
        pdfs: 'Kompilierte PDFs einschließen',
        pdfsHint: 'Angabe und Lösung je Aufgabe. Das Kompilieren kann etwas dauern.',
        exporting: 'Exportiere "{name}" …',
        compiling: 'Kompiliere "{name}" …',
        pdfFailed: 'PDFs von "{name}" konnten nicht erstellt werden: {error}',
        missingGraphics: 'Fehlende Grafiken in "{name}": {files}',
        unreadableResources: 'Dateien von „{name}“ konnten nicht gelesen werden und fehlen im ZIP: {files}',
    },
} as const;
