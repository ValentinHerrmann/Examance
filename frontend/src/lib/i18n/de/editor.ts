export const editor = {
    /** Quick-insert palette category headings. */
    categories: {
        solutions: 'Lösungen',
        scoring: 'Punkte',
        formatting: 'Formatierung',
        generic: 'Allgemein',
    },

    /**
     * Button text and tooltip for each quick-insert macro, keyed by the macro's
     * `id` in `$lib/latex/quickInsertMacros.ts`. The LaTeX itself lives there;
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
        'loesung-form': { label: 'Ausfüllbares Feld', description: 'Ein ausfüllbares PDF-Formularfeld.' },
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
    },

    /** Generic unsaved-changes dialog (ConfirmDialog defaults). */
    confirmDialog: {
        title: 'Ungespeicherte Änderungen',
        message:
            'Es gibt ungespeicherte Änderungen, die verloren gehen. Möchten Sie wirklich beenden, ohne zu speichern?',
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
} as const;
