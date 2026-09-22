export const workspace = {
    menu: {
        open: '📂 .bgproj öffnen',
        export: '💾 .bgproj exportieren',
        clear: '❌ Arbeitsbereich leeren',
    },
    session: {
        cloudMode: '☁️ Cloud-Modus',
        localMode: '💻 Lokaler Modus',
        lockSession: 'Sitzung sperren',
        lock: 'Sperren',
        connectToCloud: 'Mit Cloud verbinden',
    },
    archive: {
        promptImportPassword: 'Passwort für dieses .bgproj-Archiv eingeben:',
        promptExportPassword: 'Passwort zum Verschlüsseln des .bgproj-Archivs eingeben:',
        importFailed: 'Import des Archivs fehlgeschlagen: {message}',
        exportFailed: 'Export fehlgeschlagen: {message}',
        clearFailed: 'Arbeitsbereich konnte nicht geleert werden: {message}',
        cleared: 'Arbeitsbereich erfolgreich geleert.',
        confirmReplace:
            'Das Öffnen einer neuen .bgproj-Datei ersetzt den aktuellen Arbeitsbereich und löscht die vorhandenen lokalen Daten. Nicht gespeicherte Änderungen gehen verloren. Fortfahren?',
        confirmClear:
            'Möchten Sie dieses Projekt wirklich schließen und alle lokalen Arbeitsbereichsdaten löschen? Nicht gespeicherte Änderungen gehen verloren.',
        summaryLoaded: '{examCount} Prüfung(en) und {studentCount} Schüler geladen.',
        summarySuccess: 'Import erfolgreich! {loaded}',
        summaryProblems: 'Import mit {errorCount} Problem(en) abgeschlossen. {loaded}',
        summaryProblemsHeading: 'Folgendes konnte nicht auf dem Server gespeichert werden:',
        lockedCannotImport: 'Bitte entsperren Sie zuerst die Sitzung — ein Import schreibt in Ihren verschlüsselten Arbeitsbereich.',
        importMode: 'Wie soll importiert werden?',
        importModeMerge: 'Zusammenführen (vorhandene Daten bleiben erhalten)',
        importModeReplace: 'Ersetzen (Arbeitsbereich vorher leeren)',
        replaceWarning:
            'Beim Ersetzen wird der gesamte lokale Arbeitsbereich gelöscht, sobald das Archiv erfolgreich entschlüsselt wurde.',
        mergeExplainer:
            'Beim Zusammenführen werden Sie bei jedem bereits vorhandenen Datensatz gefragt, welche Fassung gelten soll.',
        summarySkippedIdentical: '{count} identische Datensätze wurden übersprungen.',
        importCancelled: 'Import abgebrochen — es wurde nichts geändert.',
        passwordLabel: 'Archiv-Passwort',
    },
} as const;
