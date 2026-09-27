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
        on: 'an',
        off: 'aus',
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
            algorithm: {
                label: 'Erkennungsverfahren',
                hint: 'v4 = Standard (Strichform, lokaler Kontrast). v2 = älteres Verfahren (Füllgrad), als Rückfalloption. Das jeweils andere Verfahren läuft immer mit; die MC-Prüfansicht vergleicht beide an Ihren geprüften Kästchen.',
                v2: 'v2 — älteres Verfahren (Füllgrad)',
                v4: 'v4 — Standard (Strichform)',
            },
            inkMinFill: {
                label: 'v4: Tinte ab (Füllgrad)',
                hint: 'Darunter — und ohne erkennbaren Strich — gilt ein Kästchen als leer.',
            },
            tickSpanMin: {
                label: 'v4: Kreuz ab Strichlänge',
                hint: 'Ein sauberer Strich, der mindestens diesen Anteil des Kästchens überspannt, gilt sicher als Kreuz — unabhängig vom Füllgrad.',
            },
            ambiguousLow: {
                label: 'v2: Leer unter (Füllgrad)',
                hint: 'Kästchen mit weniger Anteil dunkler Pixel gelten als leer. Höher = Schmutz/Staub wird eher ignoriert, zarte Kreuze aber eher übersehen.',
            },
            markedHigh: {
                label: 'v2: Sicher angekreuzt ab (Füllgrad)',
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
            shapeAnalysis: {
                label: 'Formanalyse der Markierung',
                hint: 'Prüft zusätzlich, wie die Tinte im Kästchen verteilt ist: Gleichmäßig ausgefüllte Kästchen gelten als zurückgenommen, Markierungen weit über das Kästchen hinaus oder sehr blasse Markierungen werden zur Prüfung vorgelegt.',
            },
            solidFillMin: {
                label: 'Ausgefüllt: minimaler Füllgrad',
                hint: 'Ab diesem Füllgrad wird geprüft, ob das Kästchen gleichmäßig ausgefüllt (statt angekreuzt) ist.',
            },
            solidCellMin: {
                label: 'Ausgefüllt: minimale Abdeckung je Feld',
                hint: 'Das Kästchen wird in 3 × 3 Felder geteilt. Nur wenn jedes Feld mindestens so stark bedeckt ist, gilt es als ausgefüllt — ein Kreuz oder Haken lässt immer Felder frei.',
            },
            solidEvennessMin: {
                label: 'Ausgefüllt: minimale Gleichmäßigkeit',
                hint: 'Schwächstes ÷ stärkstes Feld. Ein kräftiges Kreuz bedeckt Ecken und Mitte deutlich stärker als die Randmitten und gilt daher nicht als ausgefüllt.',
            },
            ringFraction: {
                label: 'Umgebung: Breite des Messrings',
                hint: 'Wie weit um das Kästchen herum (Anteil der Kästchengröße) nach Tinte gesucht wird.',
            },
            spillExcessMax: {
                label: 'Umgebung: maximale Mehr-Tinte',
                hint: 'Liegt um ein Kästchen um so viel mehr Tinte als um die übrigen Kästchen der Aufgabe, wird die Markierung zur Prüfung vorgelegt.',
            },
            faintContrastMin: {
                label: 'Blasse Markierung: minimaler Kontrast',
                hint: '0 = kaum dunkler als der Hintergrund, 1 = so dunkel wie der Druck. Blassere Markierungen werden zur Prüfung vorgelegt.',
            },
            localContrastFrac: {
                label: 'Tinte: lokale Kontrastschwelle',
                hint: 'Ein Pixel zählt als Tinte, wenn es um diesen Anteil der Spanne zwischen Papier und Druckschwarz dunkler als das umgebende Papier ist. Kleiner = empfindlicher.',
            },
            snapMaxFraction: {
                label: 'Kästchen: maximale Nachführung',
                hint: 'Wie weit (Anteil der Kästchengröße) das Messfenster auf den tatsächlich gedruckten Rahmen verschoben werden darf.',
            },
            strokeSpanMin: {
                label: 'Dünner Strich: minimale Länge',
                hint: 'Ein sonst leeres Kästchen mit einem Strich, der mindestens diesen Anteil der Kästchengröße überspannt, wird zur Prüfung vorgelegt.',
            },
            scanScale: {
                label: 'Rasterauflösung (Skalierung)',
                hint: 'Auflösung, mit der Scans für die Erkennung gerendert werden. Nicht einstellbar, wird aber zu jedem Lauf gespeichert.',
            },
        },
    },
    donation: {
        heading: '5. MC-Erkennung verbessern (freiwillig)',
        description:
            'Helfen Sie, die automatische Erkennung von Ankreuzfeldern für alle Lehrkräfte zu verbessern, indem Sie anonymisierte Ausschnitte bereits geprüfter Kästchen spenden.',
        whatIsSent:
            'Gesendet wird je geprüftem Kästchen: ein kleiner Graustufen-Ausschnitt (nur das Kästchen und das Korrekturfeld daneben, kein Aufgabentext), Ihre geprüfte Entscheidung (angekreuzt / nicht angekreuzt) und die Messwerte der Erkennung.',
        whatIsNotSent:
            'Nicht gesendet werden: Namen, Pseudonyme, Prüfungs-, Abgabe- oder Aufgabenkennungen, Ihr Konto oder Zeitstempel. Die Anfrage wird ohne Anmelde-Cookie gestellt.',
        whenSent: 'Nur Fragen, die Sie in der MC-Prüfansicht bestätigt oder korrigiert haben, und nur solange diese Option aktiviert ist.',
        optIn: 'Ich möchte anonymisierte Ausschnitte geprüfter Ankreuzfelder an den Betreiber dieses Examance-Servers senden.',
        privacyNote: 'Details in der Datenschutzerklärung:',
        privacyLink: 'Datenschutz',
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
