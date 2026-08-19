export const misc = {
    /**
     * The quick-configuration modal reachable from the status bar. It overlaps
     * with the settings page but keeps its own, shorter wording.
     */
    storageModal: {
        heading: 'Speicher- & Serverkonfiguration',
        storageHeading: '1. Speicherstrategie',
        storageDescription: 'Legen Sie fest, wo Prüfungsdaten und Noten gespeichert werden:',
        allLocalTitle: '🔒 Alles lokal (ohne Cloud)',
        allLocalText:
            'Alle Daten bleiben verschlüsselt in der IndexedDB dieses Geräts. Kein Server erforderlich.',
        allServerTitle: '☁️ Alles auf dem Server',
        allServerText: 'Alle Daten werden mit dem sicheren BlindGrade-Server synchronisiert und dort gespeichert.',
        hybridTitle: '⚖️ Hybrid-Modus',
        hybridText:
            'Aufgabenbibliothek und Prüfungsvorlagen liegen auf dem Server, Schüleridentitäten bleiben zu 100 % lokal.',
        latexHeading: '2. LaTeX-Kompilierung',
        latexDescription: 'Wählen Sie die Engine für das Rendern der Prüfungsdokumente als PDF:',
        latexLocalTitle: '⚡ Lokal im Browser (WASM BusyTeX)',
        latexLocalText: 'Kompiliert im Browser, ohne den Quelltext an einen Server zu senden.',
        latexServerTitle: '⚡ Server (Tectonic)',
        latexServerText: 'Schnelle serverseitige Kompilierung. Erfordert ein authentifiziertes Konto.',
        backendHeading: '3. Serveradresse',
        backendDescription: 'Eigene API-Serveradresse konfigurieren (z. B. lokaler Backend-Server):',
        backendPlaceholder: 'z. B. http://localhost:8000',
        backendEmpty: 'Bitte geben Sie eine Serveradresse ein.',
        backendInvalid: 'Diese Serveradresse ist nicht gültig.',
        backendUpdated: 'Serveradresse aktualisiert auf: {url}',
        fullSettingsLink: 'Alle Einstellungen & DSGVO-Löschung ↗',
    },

    compiler: {
        localFailedTryServer:
            'Die lokale LaTeX-Kompilierung ist fehlgeschlagen. Möchten Sie stattdessen auf dem Server kompilieren?',
    },
} as const;
