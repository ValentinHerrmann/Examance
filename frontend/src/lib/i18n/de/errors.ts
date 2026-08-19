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
        ERR_PASSWORD_NOT_SET:
            'Für dieses Konto wurde noch kein Passwort gesetzt. Bitte nutzen Sie den per E-Mail zugesandten Link.',
        ERR_INVALID_CREDENTIALS: 'Ungültige Anmeldedaten.',
        ERR_COMPILE_TIMEOUT: 'Zeitüberschreitung bei der Kompilierung.',
        ERR_PAYLOAD_TOO_LARGE: 'Die Anfrage ist zu groß.',
        ERR_BAD_REQUEST: 'Ungültige Anfrage.',
        ERR_ORIGIN_REJECTED: 'Herkunft nicht erlaubt.',
        ERR_UNAUTHORIZED: 'Nicht autorisiert.',
        ERR_NETWORK: 'Server nicht erreichbar.',
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
