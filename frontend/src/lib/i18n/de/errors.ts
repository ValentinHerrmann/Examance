export const errors = {
    /** Client-side fallbacks — no backend response to translate. */
    unknown: 'Unbekannter Fehler',
    network: 'Server nicht erreichbar',
    unauthorized: 'Nicht autorisiert',
    httpFallback: 'HTTP-Fehler',

    /**
     * Keyed by the machine-readable `code` the backend sends alongside its
     * English `detail`, so error text can be localized without touching the API.
     */
    code: {
        ERR_INVALID_TOKEN: 'Ungültiger oder abgelaufener Link zum Zurücksetzen des Passworts.',
        ERR_PASSWORD_NOT_SET: 'Für dieses Konto wurde noch kein Passwort gesetzt. Bitte nutzen Sie den per E-Mail zugesandten Link.',
        ERR_INVALID_CREDENTIALS: 'Ungültige Anmeldedaten.',
        ERR_ACCOUNT_LOCKED: 'Zu viele fehlgeschlagene Versuche. Bitte warten Sie einen Moment und versuchen Sie es erneut.',
        ERR_TRAINING_QUOTA: 'Tageskontingent für gespendete Trainingsdaten erreicht.',
        ERR_COMPILE_TIMEOUT: 'Zeitüberschreitung bei der Kompilierung.',
        ERR_PAYLOAD_TOO_LARGE: 'Die Anfrage ist zu groß.',
        ERR_BAD_REQUEST: 'Ungültige Anfrage.',
        ERR_ORIGIN_REJECTED: 'Herkunft nicht erlaubt.',
        ERR_UNAUTHORIZED: 'Nicht autorisiert.',
        ERR_NETWORK: 'Server nicht erreichbar.',
                // Fallbacks. Beim Entfernen eines Faktors nennt `detail`, welche Regel greift (unter zwei
                // Faktoren oder unter den letzten Daten-Faktor); das ist hilfreicher als ein pauschaler
                // Satz, daher zeigt die Oberfläche den Servertext.
        ERR_LAST_FACTOR_PROTECTED: 'Dieser Faktor kann nicht entfernt werden, ohne den Zugang zum Konto oder zu den Daten zu verlieren.',
        ERR_MFA_REQUIRED: 'Für diese Aktion ist eine vollständige Anmeldung erforderlich.',
        ERR_STEP_EXPIRED: 'Dieser Anmeldeschritt ist abgelaufen. Bitte melden Sie sich erneut an.',
        ERR_INVALID_REGISTRATION_TOKEN: 'Dieser Bestätigungslink ist ungültig oder abgelaufen. Bitte registrieren Sie sich erneut.',
        ERR_FEATURE_NOT_ALLOWED: 'Diese Funktion ist für Ihr Konto nicht freigeschaltet.',
        ERR_TEACHER_ROLE_REQUIRED: 'Administrationskonten verwalten Benutzer und Server. Für Prüfungen und Aufgaben brauchen Sie ein Lehrkraft-Konto.',
        ERR_SHARE_SOURCE_CHANGED: 'Die Quelle hat sich inzwischen geändert. Bitte prüfen Sie die Änderungen erneut.',
        ERR_SHARE_SOURCE_UNAVAILABLE: 'Die Quelle dieser Aufgabe wird nicht mehr geteilt.',
        ERR_SHARE_COPY: 'Von anderen übernommene Aufgaben können nicht geteilt werden. Schlagen Sie Änderungen stattdessen dem Original vor.',
        ERR_NOT_CONTRIBUTABLE: 'Für diese Variante gibt es nichts vorzuschlagen.',
        ERR_CONTRIBUTION_LIMIT: 'Sie haben zu viele offene Vorschläge. Warten Sie auf Entscheidungen.',
        ERR_CONTRIBUTION_DECIDED: 'Über diesen Vorschlag wurde bereits entschieden.',
        ERR_CONTRIBUTION_TARGET_GONE: 'Die Variante gibt es nicht mehr; übernehmen Sie den Vorschlag als neue Variante.',
        ERR_VARIANT_KEY_TAKEN: 'Diesen Variantenschlüssel gibt es in der Aufgabe schon. Bitte einen anderen wählen.',
        ERR_ACCOUNT_PENDING: 'Für diese Adresse wartet eine Registrierung auf Freigabe. Geben Sie sie frei oder lehnen Sie sie ab.',
        ERR_ACCOUNT_EXISTS: 'Ein Konto mit dieser E-Mail-Adresse existiert bereits.',
        ERR_ALREADY_APPROVED: 'Dieses Konto ist bereits freigegeben.',
        ERR_LAST_ADMIN: 'Das letzte Admin-Konto kann nicht gelöscht werden. Machen Sie zuerst ein anderes Konto zum Admin.',
        ERR_INVALID_DELETION_TOKEN: 'Dieser Löschlink ist ungültig oder abgelaufen. Fordern Sie in den Einstellungen einen neuen an.',
        ERR_DELETE_SELF: 'Ihr eigenes Konto löschen Sie in den Einstellungen.',
        ERR_INVALID_DOMAIN: 'Bitte geben Sie eine Domain wie schule.example ein.',
        ERR_DOMAIN_EXISTS: 'Diese Domain steht bereits auf der Liste.',
    },

    /** HTTP status titles for the generic error modal. */
    http: {
        400: 'Ungültige Anfrage',
        401: 'Nicht autorisiert',
        403: 'Zugriff verweigert',
        404: 'Nicht gefunden',
        408: 'Zeitüberschreitung der Anfrage',
        409: 'Konflikt',
        418: 'Ich bin eine Teekanne',
        422: 'Nicht verarbeitbare Anfrage',
        429: 'Zu viele Anfragen',
        500: 'Interner Serverfehler',
        502: 'Ungültiges Gateway',
        503: 'Dienst nicht verfügbar',
        504: 'Gateway-Zeitüberschreitung',
    },
} as const;
