export const settings = {
    pageTitle: 'Einstellungen & Datenschutz',
    language: {
        heading: '3. Sprache',
        description: 'Sprache der Benutzeroberfläche auswählen:',
        hint: 'Betrifft nur die Oberfläche — erzeugte Prüfungs-PDFs bleiben unverändert.',
    },
    storage: {
        heading: '1. Globale Speicherstrategie',
        description:
            'Legen Sie fest, wo Prüfungen, Aufgaben, Schüleridentitäten und Ergebnisse gespeichert werden:',
        allLocalTitle: 'Alles lokal (Datenschutz zuerst)',
        allLocalText:
            'Prüfungen, Aufgabenbibliothek, Schüleridentitäten und Scans werden zu 100 % lokal in der IndexedDB Ihres Browsers gespeichert.',
        allServerTitle: 'Alles auf dem Server',
        allServerText: 'Alle Daten werden mit dem sicheren BlindGrade-Server synchronisiert und dort gespeichert.',
        hybridTitle: 'Hybrid-Modus (Bibliothek auf dem Server, Ergebnisse lokal)',
        hybridText:
            'Aufgabenbibliothek und Prüfungsvorlagen liegen auf dem Server, Schüleridentitäten und Notenabgaben bleiben zu 100 % auf Ihrem Gerät.',
    },
    latex: {
        heading: '2. LaTeX-Kompilierung',
        description: 'Legen Sie fest, wo LaTeX-Dateien kompiliert werden (unabhängig von der Speicherstrategie):',
        localTitle: 'Lokaler Client (WebAssembly)',
        localText: 'Kompiliert im Browser, ohne den Quelltext an einen Server zu senden.',
        serverTitle: 'Server (Tectonic)',
        serverText: 'Schnelle serverseitige Kompilierung. Erfordert ein authentifiziertes Konto.',
    },
    hygiene: {
        heading: 'Sitzungsdaten bereinigen',
        description:
            'Alle zwischengespeicherten Prüfungs-, Schüler- und Scandaten dauerhaft aus dem lokalen Browserspeicher löschen.',
        button: 'Alle Sitzungsdaten löschen',
        confirm: 'Alle lokalen Sitzungsdaten aus der IndexedDB löschen?',
    },
    status: {
        latexSet: 'LaTeX-Kompilierung auf {mode} gesetzt.',
        storageModeSet: 'Globaler Speichermodus auf {mode} geändert. Sitzung gelöscht.',
        languageSet: 'Sprache auf {language} gesetzt.',
        studentErased: 'Schüler {id} erfolgreich gelöscht.',
        exportDownloaded: 'Auskunftsexport heruntergeladen.',
        exportFailed: 'Export fehlgeschlagen.',
    },
    alerts: {
        serverCompileNeedsAuth:
            'Die Serverkompilierung erfordert eine authentifizierte Sitzung. Bitte melden Sie sich an.',
        serverStorageNeedsAuth:
            'Serverbasierte Speichermodi erfordern eine authentifizierte Sitzung. Bitte melden Sie sich an.',
        storageModeConfirm:
            'Ein Wechsel des Speichermodus setzt den aktuellen Sitzungszustand zurück. Stellen Sie sicher, dass Sie zuvor ein .bgproj-Backup exportiert haben!\n\nMöchten Sie fortfahren und den Speichermodus wechseln?',
        eraseStudentConfirm:
            'Möchten Sie diese Schüleridentität und alle zugehörigen Abgaben wirklich dauerhaft löschen?',
        eraseFailed: 'Löschen fehlgeschlagen: {message}',
    },
} as const;
