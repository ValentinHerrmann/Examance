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
    omr: {
        heading: '4. MC-Erkennung (OMR) feinjustieren',
        description:
            'Schwellenwerte, mit denen angekreuzte Kästchen auf eingescannten Bögen erkannt werden. Die Standardwerte passen für die meisten Scanner.',
        futureOnly:
            'Änderungen gelten nur für künftige Erkennungsläufe (neue Scans oder „MC-Erkennung erneut ausführen“). Bereits erkannte und insbesondere bereits geprüfte Ergebnisse bleiben unverändert.',
        localOnly: 'Wird nur in diesem Browser gespeichert und nicht mit anderen Geräten synchronisiert.',
        basicGroup: 'Füllgrad der Kästchen',
        advancedGroup: 'Erweitert: Passermarken & Ausrichtung',
        fixedGroup: 'Fest',
        defaultValue: 'Standard: {value}',
        save: 'Speichern',
        reset: 'Auf Standardwerte zurücksetzen',
        saved: 'MC-Erkennungseinstellungen gespeichert. Sie gelten ab dem nächsten Erkennungslauf.',
        resetDone: 'MC-Erkennungseinstellungen auf Standardwerte zurückgesetzt.',
        profile: 'Aktiv: {source} · Revision {revision}',
        source: {
            default: 'Standardwerte',
            user: 'Eigene Einstellungen',
            learned: 'Gelernte Einstellungen',
        },
        errors: {
            range: '{label}: erlaubt sind {min} bis {max}.',
            fillOrder: 'Es muss gelten: „Leer unter“ < „Sicher angekreuzt ab“ < „Vollständig ausgefüllt ab“.',
            areaOrder: 'Die minimale Passermarken-Fläche muss kleiner als die maximale sein.',
        },
        params: {
            ambiguousLow: {
                label: 'Leer unter (Füllgrad)',
                hint: 'Kästchen mit weniger Anteil dunkler Pixel gelten als leer. Höher = Schmutz/Staub wird eher ignoriert, zarte Kreuze aber eher übersehen.',
            },
            markedHigh: {
                label: 'Sicher angekreuzt ab (Füllgrad)',
                hint: 'Ab diesem Anteil gilt ein Kästchen sicher als angekreuzt. Dazwischen wird es als unsicher zur Prüfung markiert.',
            },
            filledHigh: {
                label: 'Vollständig ausgefüllt ab (Füllgrad)',
                hint: 'Ein fast vollständig geschwärztes Kästchen gilt als zurückgenommenes Kreuz (nur bei Bögen mit Korrekturfeld).',
            },
            redoMarkedHigh: {
                label: 'Korrekturfeld angekreuzt ab (Füllgrad)',
                hint: 'Ist ein ausgefülltes Kästchen im Korrekturfeld daneben mindestens so stark markiert, gilt es erneut als angekreuzt.',
            },
            sampleInsetFraction: {
                label: 'Randabzug beim Messen',
                hint: 'Anteil jeder Kästchenseite, der beim Zählen ignoriert wird, damit der gedruckte Rahmen nicht mitzählt.',
            },
            quadrantFraction: {
                label: 'Suchbereich für Passermarken',
                hint: 'Anteil jeder Seitenkante, in dem nach den Eck-Passermarken gesucht wird.',
            },
            fiducialAreaMinRatio: {
                label: 'Passermarke: minimale Fläche (× erwartet)',
                hint: 'Kleinere dunkle Flecken werden nicht als Passermarke akzeptiert.',
            },
            fiducialAreaMaxRatio: {
                label: 'Passermarke: maximale Fläche (× erwartet)',
                hint: 'Größere dunkle Flächen (z. B. Scannerschatten) werden nicht als Passermarke akzeptiert.',
            },
            fiducialMaxAspectRatio: {
                label: 'Passermarke: maximales Seitenverhältnis',
                hint: 'Passermarken sind quadratisch; länglichere Formen (Linien, Text) werden verworfen.',
            },
            fiducialMaxDistFraction: {
                label: 'Passermarke: maximale Verschiebung',
                hint: 'Wie weit (Anteil der kürzeren Seitenlänge) eine Passermarke von ihrer erwarteten Position entfernt sein darf.',
            },
            alignResidualFraction: {
                label: 'Ausrichtung: Toleranz vierte Ecke',
                hint: 'Abweichung der vierten Passermarke (Anteil der Scanbreite), ab der die Ausrichtung als unsicher gilt.',
            },
            alignRatioTolerance: {
                label: 'Ausrichtung: Toleranz Seitenverhältnis',
                hint: 'Relative Verzerrung des Seitenverhältnisses, ab der die Ausrichtung als unsicher gilt.',
            },
            alignAngleToleranceDeg: {
                label: 'Ausrichtung: Toleranz Eckwinkel (°)',
                hint: 'Erlaubte Abweichung der Seitenecken von 90°, bevor die Ausrichtung als unsicher gilt.',
            },
            scanScale: {
                label: 'Rasterauflösung (Skalierung)',
                hint: 'Auflösung, mit der Scans für die Erkennung gerendert werden. Nicht einstellbar, wird aber zu jedem Lauf gespeichert.',
            },
        },
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
