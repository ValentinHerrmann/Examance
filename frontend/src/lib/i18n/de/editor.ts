export const editor = {
    /** Button that folds/unfolds the quick-insert palette. */
    quickInsertToggle: 'LaTeX-Bausteine einfügen',
    snippetDemo: 'Demo aller Bausteine',
    /** Select that picks which subject's snippets the palette shows. */
    subjectLabel: 'Fach-Bausteine',
    /** Quick-insert palette category headings; the last three are subjects. */
    categories: {
        solutions: 'Lösungen',
        scoring: 'Punkte',
        formatting: 'Formatierung',
        generic: 'Allgemein',
        math: 'Mathematik',
        cs: 'Informatik',
        physics: 'Physik',
        chemistry: 'Chemie',
        biology: 'Biologie',
        humanities: 'Sprachen & Gesellschaft',
    },

    /**
     * Button text and tooltip for each quick-insert macro, keyed by the macro's
     * `id` in `#lib/latex/quickInsertMacros.ts`. The LaTeX itself lives there;
     * only the human-readable text lives here.
     */
    macros: {
        loesung: { label: 'Lösungstext', description: 'Nur im Erwartungshorizont sichtbar.' },
        'loesung-replace': {
            label: 'Im Erwartungshorizont ersetzen',
            description: 'Unterschiedlicher Inhalt im Erwartungshorizont und in der Schülerfassung.',
        },
        'loesung-leer': { label: 'Leerraum', description: 'Lösung statt vertikalem Leerraum.' },
        'loesung-img': {
            label: 'Lösungsbild',
            description: 'Unterschiedliches Bild im Erwartungshorizont und in der Schülerfassung.',
        },
        'loesung-luecke': {
            label: 'Lücke zum Ausfüllen',
            description: 'Lösung statt einer Linie zum Ausfüllen.',
        },
        'loesung-karo': { label: 'Karopapier', description: 'Lösung statt Reihen von Karokästchen.' },
        'loesung-line': { label: 'Linierte Zeilen', description: 'Lösung statt linierter Schreibzeilen.' },
        'loesung-code': {
            label: 'Lösungscode',
            description:
                'Code-Listing (lstlisting) nur im Erwartungshorizont. \\Loesung{…} kann kein lstlisting enthalten.',
        },
        kariert: {
            label: 'Karopapier (ohne Lösung)',
            description: 'Reihen von Karokästchen, ohne Umschaltung für den Erwartungshorizont.',
        },
        liniert: {
            label: 'Linierte Zeilen (ohne Lösung)',
            description: 'Linierte Schreibzeilen, ohne Umschaltung für den Erwartungshorizont.',
        },
        be: { label: 'Ganzer Punkt', description: '1 Punkt vergeben.' },
        hbe: { label: 'Halber Punkt', description: '0,5 Punkte vergeben.' },
        qbe: { label: 'Viertelpunkt', description: '0,25 Punkte vergeben.' },
        teilaufgabe: {
            label: 'Teilaufgabe',
            description: 'Teilaufgabe a), b), … mit Unterüberschrift und eigenem Punktekästchen.',
        },
        textbf: { label: 'Fetter Text', description: 'Fetter Text.' },
        textit: { label: 'Kursiver Text', description: 'Kursiver Text.' },
        textcolor: {
            label: 'Farbiger Text',
            description: 'Farbiger Text — Farbnamen oder Hex-Code anpassen.',
        },
        'fontsize-footnotesize': { label: 'Kleiner Text', description: 'Text in Fußnotengröße.' },
        'fontsize-large': { label: 'Etwas größerer Text', description: 'Etwas größerer Text.' },
        'fontsize-Large': { label: 'Größerer Text', description: 'Größerer Text.' },
        'fontsize-LARGE': { label: 'Große Überschrift', description: 'Text in Überschriftengröße.' },
        'fontsize-huge': { label: 'Sehr großer Text', description: 'Sehr großer Text.' },
        includegraphics: { label: 'Bild', description: 'Ein Bild einfügen.' },
        tabular: { label: 'Tabelle', description: 'Eine einfache Tabelle.' },
        itemize: { label: 'Aufzählung', description: 'Eine Aufzählung mit Punkten.' },
        enumerate: { label: 'Nummerierte Liste', description: 'Eine nummerierte Liste.' },
        'inline-math': { label: 'Formel im Text', description: 'Mathematische Formel im Fließtext.' },
        center: { label: 'Zentrierter Inhalt', description: 'Zentrierter Inhalt.' },
        seitenumbruch: {
            label: 'Seitenumbruch',
            description: 'Erzwingt hier einen Seitenumbruch (Schülerfassung und Erwartungshorizont).',
        },
    },

    /** Generic unsaved-changes dialog (ConfirmDialog defaults). */
    confirmDialog: {
        title: 'Ungespeicherte Änderungen',
        message: 'Es gibt ungespeicherte Änderungen, die verloren gehen. Möchten Sie wirklich beenden, ohne zu speichern?',
        confirmText: 'Änderungen verwerfen',
        cancelText: 'Weiter bearbeiten',
    },

    /** Side-by-side PDF preview panes. */
    pdfPreview: {
        titleAngabe: 'Angabe',
        titleLoesung: 'Lösung',
        placeholder: 'Auf „Kompilieren“ klicken, um die Vorschau zu erzeugen',
        collapse: '{title}-PDF einklappen',
        expand: '{title}-PDF ausklappen',
        frameTitle: '{title}-Vorschau',
    },

    /** Zoomable image controls. */
    zoom: {
        zoomOut: 'Verkleinern',
        zoomIn: 'Vergrößern',
        resetToFit: 'Auf Fenstergröße zurücksetzen',
        fit: 'Anpassen',
    },
    /** Foldable panel for LaTeX resource files (images, data) in the exercise editor. */
    resources: {
        heading: 'Dateien',
        show: 'Dateien anzeigen',
        hide: 'Dateien ausblenden',
        usedTitle: 'Belegt vom Limit pro Aufgabe',
        storing: 'Dateien werden gespeichert…',
        dropzone: 'Dateien hierher ziehen oder klicken – PNG, JPG, PDF und jede andere Datei, die das Dokument braucht.',
        hintLead: 'Eine Datei wird über ihren Namen eingebunden, z. B.',
        hintTail: 'Die Dateien werden beim Speichern der Aufgabe abgelegt. Keine Dateien mit personenbezogenen Daten von Schülern hochladen.',
        insert: 'Einfügen',
        insertTitle: 'In den LaTeX-Code einfügen',
        rename: 'Umbenennen',
        delete: 'Löschen',
        save: 'Speichern',
        cancel: 'Abbrechen',
        confirmDelete: '„{name}“ löschen? Verweise darauf im LaTeX-Code funktionieren dann nicht mehr.',
        nameTaken: '„{name}“ wird bereits von einer anderen Datei dieser Aufgabe verwendet.',
        loadFailed: 'Die Dateien konnten nicht geladen werden.',
        uploadFailed: 'Hochladen fehlgeschlagen.',
        renameFailed: 'Umbenennen fehlgeschlagen.',
    },
    /** Find/replace panel of the LaTeX editor (Ctrl+F / Ctrl+H); mirrors the phrases CodeMirror's search extension asks for. */
    search: {
        find: 'Suchen',
        replace: 'Ersetzen',
        next: 'Weiter',
        previous: 'Zurück',
        all: 'Alle',
        matchCase: 'Groß-/Kleinschreibung',
        regexp: 'Regulärer Ausdruck',
        byWord: 'Ganzes Wort',
        replaceOne: 'Ersetzen',
        replaceAll: 'Alle ersetzen',
        close: 'Schließen',
        gotoLine: 'Zu Zeile springen',
        go: 'Los',
        currentMatch: 'aktueller Treffer',
        onLine: 'in Zeile',
        replacedMatches: '$ Treffer ersetzt',
        replacedMatchOnLine: 'Treffer in Zeile $ ersetzt',
    },
} as const;
