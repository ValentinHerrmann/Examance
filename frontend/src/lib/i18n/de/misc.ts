export const misc = {
    /**
     * The quick-configuration modal reachable from the navbar storage button. It overlaps
     * with the settings page but keeps its own, shorter wording.
     */
    storageModal: {
        heading: 'Speicher- & Serverkonfiguration',
        storageHeading: '1. Speicherstrategie',
        storageDescription: 'Legen Sie fest, wo Prüfungsdaten und Noten gespeichert werden:',
        allServerTitle: '️ Alles auf dem Server',
        allServerText: 'Alle Daten werden mit dem sicheren BlindGrade-Server synchronisiert und dort gespeichert.',
        hybridTitle: '️ Hybrid-Modus',
        hybridText: 'Aufgabenbibliothek und Prüfungsvorlagen liegen auf dem Server, Schüleridentitäten bleiben zu 100 % lokal.',
        latexHeading: '2. LaTeX-Kompilierung',
        latexDescription: 'Wählen Sie die Engine für das Rendern der Prüfungsdokumente als PDF:',
        latexLocalTitle: 'Lokal im Browser (WASM BusyTeX)',
        latexLocalText: 'Kompiliert im Browser, ohne den Quelltext an einen Server zu senden.',
        latexServerTitle: 'Server (Tectonic)',
        latexServerText: 'Schnelle serverseitige Kompilierung. Erfordert ein authentifiziertes Konto.',
        backendHeading: '3. Serveradresse',
        backendDescription: 'Eigene API-Serveradresse konfigurieren (z. B. lokaler Backend-Server):',
        backendPlaceholder: 'localhost:8000',
        backendEmpty: 'Bitte geben Sie eine Serveradresse ein.',
        backendInvalid: 'Diese Serveradresse ist nicht gültig.',
        backendUpdated: 'Serveradresse aktualisiert auf: {url}',
        fullSettingsLink: 'Alle Einstellungen & DSGVO-Löschung',
    },

    compiler: {
        localFailedTryServer: 'Die lokale LaTeX-Kompilierung ist fehlgeschlagen. Möchten Sie stattdessen auf dem Server kompilieren?',
    },

    rejectedWrites: {
        heading: 'Änderungen vom Server abgelehnt',
        body: '{count} offline gespeicherte Änderung(en) hat der Server beim Nachsenden abgelehnt; sie wurden verworfen. ' +
            'Bitte prüfen Sie die betroffenen Daten und geben Sie sie bei Bedarf erneut ein. Letzter Fehler: {message}',
    },
    vaultIntegrity: {
        heading: 'Achtung: Daten konnten nicht entschlüsselt werden',
        body: '{count} Datensatz/Datensätze ({kinds}) konnten mit dem aktuellen Schlüssel nicht gelesen werden.' +
            'Sie werden hier leer angezeigt — das sind nicht Ihre Daten. Speichern ist für diese Datensätze gesperrt, ' +
            'damit die Originale nicht überschrieben werden.',
        action: 'Sitzung sperren und mit dem richtigen Schlüssel neu entsperren.',
        dismiss: 'Hinweis ausblenden',
    },
} as const;
