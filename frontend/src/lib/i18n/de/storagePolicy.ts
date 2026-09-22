export const storagePolicy = {
    allLocal: 'Alles lokal',
    allServer: 'Alles auf dem Server',
    hybrid: 'Hybrid (Aufgaben Server, Schüler lokal)',
    hybridShort: 'Hybrid-Modus',
    latexServer: 'LaTeX Server',
    latexLocal: 'LaTeX lokal',
    allLocalTitle: 'Alles lokal im Browser (IndexedDB) gespeichert',
    allServerTitle: 'Alles wird auf dem Backend-Server gespeichert und synchronisiert',
    hybridTitle: 'Aufgaben & Prüfungen auf dem Server, Schülerdaten & Abgaben lokal',

    /**
     * The gated mode-switch wizard. Switching storage modes moves nothing on
     * its own — the archive is the only bridge — so the wording has to make the
     * export feel like part of the switch rather than a chore before it.
     */
    switch: {
        title: 'Speicherort wechseln',
        stepExplain: 'Überblick',
        stepExport: 'Sichern',
        stepSwitch: 'Wechseln',
        stepImport: 'Einlesen',
        introHeading: 'Von "{from}" zu "{to}" wechseln',
        introBody:
            'Beim Wechsel des Speicherorts werden keine Daten automatisch übertragen. Der bisherige Arbeitsbereich wird lokal geleert, und der neue Speicherort startet leer.',
        bridgeNote:
            'Die verschlüsselte Archivdatei (.bgproj) ist die einzige Brücke zwischen den Speicherorten: zuerst exportieren, dann wechseln, dann im neuen Modus wieder einlesen.',
        serverKeptNote:
            'Auf dem Server gespeicherte Prüfungen werden dabei nicht gelöscht — geleert wird nur der lokale Speicher dieses Browsers.',
        understandCheckbox: 'Ich habe verstanden, dass keine Daten automatisch übertragen werden.',
        exportHeading: 'Arbeitsbereich sichern',
        exportBody:
            'Vergeben Sie ein Passwort für das Archiv. Ohne dieses Passwort lässt sich die Datei nicht wiederherstellen — bewahren Sie es sicher auf.',
        exportPasswordLabel: 'Archiv-Passwort',
        exportButton: 'Archiv herunterladen',
        exportRunning: 'Archiv wird erstellt…',
        exportDone: 'Archiv gespeichert: {filename}',
        exportFailed: 'Export fehlgeschlagen: {message}',
        exportRequired: 'Der Wechsel ist erst nach dem Export möglich.',
        skipExportEmpty: 'Der Arbeitsbereich ist leer — ohne Export fortfahren',
        skipExportHaveArchive: 'Ich habe bereits ein aktuelles Archiv',
        wipeHeading: 'Lokalen Speicher leeren und wechseln',
        wipeWarning:
            'Dieser Schritt löscht den lokalen Arbeitsbereich unwiderruflich und stellt den Speicherort auf "{to}" um.',
        wipeButton: 'Jetzt wechseln',
        switching: 'Wird gewechselt…',
        importHeading: 'Archiv im neuen Speicherort einlesen',
        importBody:
            'Lesen Sie das eben erstellte Archiv jetzt ein, damit Ihre Prüfungen im neuen Speicherort zur Verfügung stehen.',
        importChooseFile: 'Archivdatei wählen',
        importPasswordLabel: 'Archiv-Passwort',
        importButton: 'Archiv einlesen',
        importRunning: 'Archiv wird eingelesen…',
        importSkip: 'Später einlesen',
        doneHeading: 'Wechsel abgeschlossen',
        doneBody: 'Der Speicherort ist jetzt "{to}".',
        resumeBanner: 'Ein Speicherort-Wechsel ist noch nicht abgeschlossen.',
        resumeBody:
            'Der Arbeitsbereich wurde geleert und auf "{to}" umgestellt. Lesen Sie Ihr Archiv ein, um weiterzuarbeiten.',
        resumeContinue: 'Fortsetzen',
        resumeDismiss: 'Später',
        needsAuth: 'Für server-gestützte Speicherorte ist eine Anmeldung erforderlich.',
        cancel: 'Abbrechen',
        cannotAbortAfterWipe:
            'Der lokale Speicher wurde bereits geleert — der Wechsel lässt sich nicht mehr zurücknehmen.',
    },

    /**
     * Import conflict resolution. Shown one record at a time with both versions
     * side by side, because the teacher is the only one who can tell which copy
     * is the one they want to keep.
     */
    conflict: {
        title: 'Unterschiede beim Import',
        subtitle:
            'Diese Datensätze sind bereits vorhanden. Bitte entscheiden Sie für jeden, welche Fassung gelten soll.',
        counter: '{decided} von {total} entschieden',
        columnExisting: 'Vorhanden',
        columnImported: 'Aus dem Archiv',
        choiceKeepExisting: 'Vorhandene behalten',
        choiceTakeImported: 'Archivfassung übernehmen',
        choiceImportAsCopy: 'Als Kopie importieren',
        copyNotAllowed:
            'Für Schülerdaten und Abgaben ist keine Kopie möglich — doppelte Pseudonyme sind datenschutzrechtlich nicht zulässig.',
        applyToAll: 'Für alle übernehmen',
        applyToAllInGroup: 'Für alle in dieser Kategorie übernehmen',
        apply: 'Import starten',
        cancel: 'Import abbrechen',
        cancelConfirm: 'Import abbrechen? Es wurde noch nichts geschrieben.',
        identicalSkipped: '{count} identische Datensätze werden übersprungen.',
        noValue: '—',
        yes: 'ja',
        no: 'nein',
        textDiffHeading: 'Inhalt',
        kind: {
            exam: 'Prüfung',
            exercise: 'Aufgabe',
            mcGroup: 'MC-Gruppe',
            student: 'Schüler',
            submission: 'Abgabe',
            resource: 'Datei',
        },
        field: {
            title: 'Titel',
            testart: 'Testart',
            fach: 'Fach',
            grade: 'Jahrgangsstufe',
            klasse: 'Klasse',
            datum: 'Datum',
            nr: 'Nummer',
            numVersions: 'Anzahl Varianten',
            retentionUntil: 'Aufbewahrung bis',
            gradingKey: 'Bewertungsmaßstab',
            name: 'Name',
            version: 'Version',
            variantKey: 'Variante',
            maxPoints: 'Maximalpunkte',
            questionType: 'Fragetyp',
            penalty: 'Minuspunkte',
            options: 'Antwortoptionen',
            correctAnswers: 'Richtige Antworten',
            scoringText: 'Bewertungstext',
            studentName: 'Name',
            studentNumber: 'Schülernummer',
            fallbackCode: 'Ersatzcode',
            totalScore: 'Gesamtpunkte',
            createdAt: 'Erstellt am',
            hasScan: 'Scan vorhanden',
            hasAnnotations: 'Korrekturen vorhanden',
            byteSize: 'Dateigröße',
        },
    },
} as const;
