export const security = {
    recovery: {
        title: 'Wiederherstellungscode',
        intro:
            'Dieser Code ist die einzige Möglichkeit, wieder an Ihre verschlüsselten Daten zu kommen, wenn Sie Ihr Passwort vergessen. Er wird genau einmal angezeigt und ist danach nicht mehr abrufbar.',
        warning:
            'Ohne diesen Code und ohne Ihr Passwort sind Ihre Klausuren, Schülerdaten und Korrekturen dauerhaft nicht mehr lesbar. Auch die Administration kann sie dann nicht wiederherstellen.',
        copy: 'Code kopieren',
        copied: 'Kopiert',
        download: 'Als Datei speichern',
        confirmLabel: 'Ich habe den Code sicher notiert.',
        confirm: 'Weiter',
        regenerate: 'Neuen Wiederherstellungscode erstellen',
        regenerateHint:
            'Der bisherige Code wird dabei ungültig. Nutzen Sie das, wenn Sie den alten Code verlegt haben.',
        fileName: 'examance-wiederherstellungscode.txt',
    },
    unlock: {
        title: 'Zugriff auf verschlüsselte Daten wiederherstellen',
        intro:
            'Ihr Passwort wurde zurückgesetzt. Damit Ihre bestehenden Klausuren und Schülerdaten wieder lesbar werden, brauchen wir einmalig Ihren Wiederherstellungscode.',
        label: 'Wiederherstellungscode',
        placeholder: 'XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX',
        submit: 'Zugriff wiederherstellen',
        working: 'Wird geprüft …',
        wrong: 'Dieser Wiederherstellungscode passt nicht zu diesem Konto.',
        skip: 'Ohne Wiederherstellung fortfahren',
        skipWarning:
            'Ohne den Code bleiben Ihre bisherigen verschlüsselten Daten unlesbar. Neue Daten sind davon nicht betroffen.',
    },
    envelope: {
        changedTitle: 'Schlüssel-Hinterlegung hat sich geändert',
        changedBody:
            'Die auf dem Server hinterlegte Schlüsselkopie unterscheidet sich von der, die dieser Browser kennt. Das passiert normalerweise nach einem Passwort-Zurücksetzen auf einem anderen Gerät. Wenn Sie das nicht selbst veranlasst haben, melden Sie sich nicht an und wenden Sie sich an die Administration.',
        changedAccept: 'Ich habe das Passwort selbst zurückgesetzt — fortfahren',
        missingPassword:
            'Für dieses Konto ist keine gültige Passwort-Kopie des Schlüssels hinterlegt. Bitte stellen Sie den Zugriff mit Ihrem Wiederherstellungscode wieder her.',
        migrating: 'Schlüssel wird einmalig hinterlegt …',
    },
} as const;
