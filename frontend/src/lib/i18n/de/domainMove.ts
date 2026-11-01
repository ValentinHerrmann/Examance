// Domain move (issue #198): the notice on the old address, its checklist and the passkey hints. Placeholders: {from} old host, {host} new host, {date} deadline.
export const domainMove = {
    title: 'Examance zieht um nach {host}',
    body: 'Ab dem {date} funktioniert diese Adresse ({from}) nicht mehr. Ziehen Sie jetzt um: Es dauert wenige Minuten, Ihre Prüfungen und Aufgaben liegen schon auf dem Server und sind dort sofort da.',
    howTo: 'So ziehen Sie um',
    openNew: '{host} öffnen',
    guideTitle: 'Umzug nach {host}',
    guideIntro: 'Bis zum {date} funktionieren beide Adressen mit demselben Konto. Gehen Sie diese Schritte einmal durch, am besten auf jedem Gerät, mit dem Sie Examance nutzen.',
    steps: {
        results: {
            title: 'Nur im Hybrid-Modus: Ergebnisse zuerst mitnehmen',
            body: 'Im Hybrid-Modus liegen Ihre Korrekturergebnisse nur im Speicher dieses Browsers für diese Adresse und ziehen nicht von selbst mit. Wechseln Sie vorher unter Einstellungen → Globale Speicherstrategie auf „Alles auf dem Server“ (falls verfügbar) und auf {host} wieder zurück, oder sichern Sie den Arbeitsbereich („Arbeitsbereich sichern oder teilen“ im Arbeitsbereich-Menü) und importieren Sie die Datei auf {host}.',
        },
        signIn: {
            title: 'Auf {host} anmelden',
            body: 'Öffnen Sie {host} und melden Sie sich mit derselben E-Mail-Adresse an. Ihr Passwort-Manager schlägt das Passwort dort eventuell noch nicht vor: Es ist unter {from} gespeichert.',
        },
        passkey: {
            title: 'Mit einem Passkey? „Passkey der alten Adresse“ wählen',
            body: 'Ein Passkey gehört zu seiner Adresse. Auf {host} meldet „Passkey der alten Adresse ({from}) verwenden“ Sie mit Ihrem bisherigen Passkey an (Chrome, Edge, Safari). In Firefox melden Sie sich stattdessen mit Passwort und Authenticator-Code an; fehlt Ihnen einer davon, richten Sie ihn vorher hier unter Einstellungen → Anmeldung & Sicherheit ein.',
        },
        dataAccess: {
            title: 'Auf {host} einen neuen Passkey hinzufügen',
            body: 'Fügen Sie unter Einstellungen → Anmeldung & Sicherheit einen Passkey hinzu, damit er auch Ihre verschlüsselten Daten öffnet. Bis zum {date} funktioniert der alte Passkey weiterhin auf {from}.',
        },
        bookmarks: {
            title: 'Lesezeichen und installierte App erneuern',
            body: 'Ersetzen Sie Lesezeichen durch {host} und installieren Sie die App von dort neu. Einstellungen, die nur dieser Browser kennt (z. B. Design oder zuletzt verwendete Server), stellen Sie auf {host} einmal neu ein.',
        },
        cleanup: {
            title: 'Nach dem {date}: aufräumen',
            body: 'Entfernen Sie die mit „alte Adresse“ markierten Passkeys unter Einstellungen → Anmeldung & Sicherheit und den Eintrag für {from} in Ihrem Passwort-Manager.',
        },
    },
    docs: 'Ausführliche Anleitung',
    close: 'Schließen',
    newPasskeyTitle: 'Neuen Passkey für {host} hinzufügen',
    newPasskeyBody: 'Ihre Passkeys gehören zur alten Adresse {from} und funktionieren nach dem {date} nicht mehr. Fügen Sie jetzt einen Passkey für {host} hinzu.',
    toSecurity: 'Zu Anmeldung & Sicherheit',
    legacyPasskey: 'Passkey der alten Adresse ({from}) verwenden',
    legacyUnsupported: 'Dieser Browser kann den Passkey der alten Adresse hier nicht verwenden. Melden Sie sich mit Passwort und Authenticator-Code an, oder einmal in Chrome, Edge oder Safari.',
    passkeyOld: 'Alte Adresse ({from}): funktioniert ab dem {date} nicht mehr.',
    addPasskeyThere: 'Neue Passkeys fügen Sie auf der neuen Adresse {host} hinzu; Passkeys für diese Adresse würden mit ihr wegfallen.',
} as const;
