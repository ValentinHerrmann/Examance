// In-app help: panel chrome, the manual topics and the short tooltip texts. German is the source of truth; `en/help.ts` must mirror this key structure.
export const help = {
    ui: {
        title: 'Hilfe',
        navLabel: 'Handbuch',
        manualTitle: 'Handbuch',
        manualSubtitle: 'Alles über Examance — von der ersten Aufgabe bis zur Auswertung.',
        contents: 'Themen',
        searchPlaceholder: 'Hilfe durchsuchen …',
        noResults: 'Kein Thema passt zu „{query}“.',
        openManual: 'Vollständiges Handbuch öffnen',
        backToOverview: 'Zurück zur Übersicht',
        openHelpFor: 'Hilfe zu: {topic}',
        openHelp: 'Hilfe öffnen',
        statusBarHint: 'Hilfe öffnen (F1)',
        moreInfo: 'Mehr dazu',
        showTip: 'Erklärung anzeigen',
        onboardingLink: 'Handbuch öffnen',
        onboardingCta: 'Neu hier? So funktioniert Examance',
        onboardingHint: 'Ein kurzer Überblick über Speicherorte, Aufgaben, Scannen und Korrigieren.',
        unlockLink: 'Handbuch',
        docsLink: 'Mehr in der Dokumentation',
        docsTopic: 'Dokumentation zu diesem Thema',
    },
    tips: {
        storageServer: 'Klausuren, Aufgaben und Ergebnisse liegen auf dem Server, aber verschlüsselt: Der Schlüssel bleibt im Browser, der Server kann die Inhalte nicht lesen. Unverschlüsselt sind nur der LaTeX-Quelltext von Aufgaben und Klausuren sowie die Gesamtpunktzahl.',
        storageHybrid: 'Aufgaben und Klausuren liegen auf dem Server (gut für ein Fachschafts-Repertoire). Schülerdaten, Scans und Punkte bleiben nur in diesem Browser, verschlüsselt, und sind auf anderen Geräten nicht sichtbar.',
        latexLocal: 'Die Klausur wird direkt im Browser gesetzt (WebAssembly-XeLaTeX). Der LaTeX-Quelltext verlässt das Gerät nicht. Die Engine wird nach der Anmeldung bzw. beim Umstellen im Hintergrund geladen (einmaliger Download); bis dahin dauert der erste Lauf länger.',
        latexServer: 'Der Server setzt die Klausur. Schneller auf schwacher Hardware, dafür wird der LaTeX-Quelltext übertragen.',
        variantKey: 'Varianten sind unterschiedliche Fassungen derselben Aufgabe (Gruppe A/B/C). Sie teilen sich Auswertung und Statistik, verhindern aber das Abschreiben.',
        mcPenalty: 'Punktabzug für falsch angekreuzte Optionen. 0 bedeutet: keine Minuspunkte. Die Gesamtpunktzahl einer Aufgabe wird nie negativ.',
        exerciseScore: String.raw`Gezählt werden \BE (1 Punkt), \hBE (0,5) und \qBE (0,25) im Quelltext, bei MC jede richtige Option. Eine feste Punktzahl ersetzt die gezählte; Feld leeren, um wieder zu zählen.`,
        requirementLevel: 'Anforderungsbereich I: Wiedergeben, II: Anwenden und Übertragen, III: Reflektieren und Problemlösen. Erscheint nur im Erwartungshorizont.',
        partExercises: 'Teilaufgaben a), b), c) erhalten eine eigene Unterüberschrift und ein eigenes Punktekästchen. Eine leere Punktzahl zählt die Bewertungseinheiten der Teilaufgabe.',
        blindGrading: 'Während der Korrektur wird nur das Pseudonym angezeigt, nie der Name. Erst nach dem Korrekturgang werden Ergebnis und Person wieder verknüpft.',
        pseudonymQr: 'Jeder Bogen trägt einen QR-Code für Klausur, Variante und Schülerplatz. Beim Scannen wird der Stapel daran automatisch getrennt und zugeordnet.',
        gradingKey: 'Der Notenschlüssel bestimmt, ab welcher Punktzahl welche Note gilt — linear, Oberstufen-gewichtet oder mit eigenen Grenzen.',
    },
    topics: {
        gettingStarted: {
            title: 'Erste Schritte',
            summary: 'Der komplette Weg von der ersten Aufgabe bis zur fertigen Auswertung.',
            s1: {
                h: 'Was Examance macht',
                p1: 'Examance begleitet eine Klausur über den gesamten Ablauf: Aufgaben sammeln, Klausur setzen, gescannte Bögen einlesen, anonym korrigieren und auswerten.',
                p2: 'Alle sensiblen Daten werden im Browser verschlüsselt, bevor sie gespeichert werden. Der Schlüssel wird aus dem Passwort abgeleitet und verlässt das Gerät nicht.',
                p3: 'Zum Ausprobieren legt „Beispieldaten hinzufügen“ in der noch leeren Prüfungsübersicht Beispielaufgaben, zwei Beispielprüfungen und korrigierte Bögen erfundener Schülerinnen und Schüler an. Einen schnellen Überblick geben die Poster unter „Poster: Funktionen & Datenschutz“ auf der Anmeldeseite.',
            },
            s2: {
                h: 'Der typische Ablauf',
                l1: 'Aufgaben in der Bibliothek anlegen oder vorhandene wiederverwenden.',
                l2: 'Eine Klausur zusammenstellen, den Notenschlüssel festlegen und als PDF setzen.',
                l3: 'Die gedruckten Bögen mit QR-Code schreiben lassen und den Stapel als ein PDF scannen.',
                l4: 'Den Scan einlesen — Examance trennt und ordnet die Bögen anhand der QR-Codes zu.',
                l5: 'Anonym korrigieren, dann auswerten oder exportieren.',
            },
            s3: {
                h: 'Hilfe und Dokumentation',
                p1: 'Diese Hilfe gibt eine schnelle Orientierung; die ?-Schaltflächen und F1 öffnen sie zur aktuellen Seite. „Mehr in der Dokumentation“ führt zum passenden Abschnitt des Benutzerhandbuchs mit allen Details und Bildschirmfotos.',
                p2: 'Viele Namen sind anklickbar: Aufgaben öffnen sich direkt im Editor, Namen mit ↗ in einem neuen Tab, damit ungespeicherte Arbeit im aktuellen Tab erhalten bleibt.',
            },
            s4: {
                h: 'Arbeitsbereich sichern und Ergebnisse teilen',
                p1: '„Arbeitsbereich sichern oder teilen“ im Arbeitsbereich-Menü erstellt ein passwortgeschütztes .examance-Archiv mit allen Klausuren, Aufgaben und Ergebnissen; „Exportieren“ an einer Klausur sichert nur diese. Im Hybrid-Modus ist das die wichtigste Sicherung. Mit „Ohne Aufgabentexte (zum Teilen der Ergebnisse)“ geben Sie Ergebnisse weiter, ohne Ihre Aufgaben mitzugeben.',
            },
        },
        storageModes: {
            title: 'Speicherorte & Verschlüsselung',
            summary: 'Wo Ihre Daten liegen — komplett auf dem Server oder mit den Ergebnissen nur im Browser.',
            s1: {
                h: 'Die zwei Speicherorte',
                l1: 'Alles auf dem Server: Klausuren, Aufgaben und Ergebnisse liegen auf dem Server und sind in jedem Browser Ihres Kontos verfügbar, clientseitig verschlüsselt.',
                l2: 'Hybrid: Aufgaben und Klausuren liegen auf dem Server, Schülerdaten, Scans und Punkte nur in dem Browser, in dem sie erfasst wurden. Sichern Sie sie mit einem .examance-Archiv.',
                l3: 'Der Speicherort gehört zu Ihrem Konto und gilt in allen Browsern. Sie wählen ihn bei der ersten Anmeldung; es gibt keine Voreinstellung.',
            },
            s2: {
                h: 'Was verschlüsselt wird',
                p1: 'Schülerdaten, Namen, Scans, Anmerkungen und Punkte werden im Browser verschlüsselt; der Server sieht nur Chiffretext. Unverschlüsselt bleiben technische Felder, der LaTeX-Quelltext von Aufgaben und Klausuren sowie die Gesamtpunktzahl. Ohne Passwort und Wiederherstellungscode kann niemand die Daten wiederherstellen.',
            },
            s3: {
                h: 'Speicherort wechseln',
                p1: 'In den Einstellungen (Beschriftung „Daten“ in der Navigationsleiste) wechseln Sie den Speicherort. Examance verschiebt die Ergebnisse Klausur für Klausur, prüft, dass alles angekommen ist, und fragt danach, ob die alte Kopie bleiben oder gelöscht werden soll. Noch nicht gesendete Änderungen müssen vorher gesendet werden („Jetzt senden“).',
            },
            s4: {
                h: 'Hinweise zu lokalen Daten',
                p1: 'Der Browserspeicher gehört immer zu genau einem Konto auf einem Server. Liegen dort Daten eines anderen Kontos, aus früherer Hybrid-Nutzung oder aus dem früheren rein lokalen Modus, erklärt ein Hinweis, was zu tun ist.',
            },
        },
        exercises: {
            title: 'Aufgabenbibliothek',
            summary: 'Aufgaben anlegen, verschlagworten, in Varianten und Versionen pflegen und mit anderen teilen.',
            s1: {
                h: 'Sammeln statt kopieren',
                p1: 'Aufgaben liegen in Ihrer Bibliothek, verschlagwortet nach Jahrgangsstufe, Fach und Thema. Die Filter oben grenzen die Bibliothek ein, „Sortieren nach“ ordnet sie. Ein aufgeklapptes Element zeigt, welche Klausuren die Aufgabe verwenden; „Vorschau“ zeigt das zuletzt kompilierte PDF.',
            },
            s2: {
                h: 'Der Editor',
                p1: 'Jede Aufgabe ist ein LaTeX-Fragment mit Live-Vorschau. „LaTeX-Bausteine einfügen“ über dem Quelltext bietet Bausteine für Lösungen, Punkte und Formatierung, dazu fachspezifische wie Baumdiagramme, Schaltungen oder Strukturformeln. Strg + F sucht, Strg + H ersetzt.',
            },
            s3: {
                h: 'Punkte, Teilaufgaben und Anforderungsbereiche',
                p1: String.raw`Die Punktzahl wird aus dem Quelltext gezählt: \BE ist ein Punkt, \hBE ein halber, \qBE ein viertel, bei MC jede richtige Option einer. „Punkte & Aufbau“ über dem Quelltext zeigt, wie sie zustande kommt, und kann sie fest setzen.`,
                p2: '„Teilaufgabe hinzufügen“ teilt eine Aufgabe in a), b), c). Anforderungsbereich und Kompetenzen erscheinen nur im Erwartungshorizont.',
            },
            s4: {
                h: 'Varianten und Versionen',
                p1: 'Varianten sind gleichwertige Fassungen derselben Aufgabe, etwa für Gruppe A und B; sie werden gemeinsam ausgewertet. Versionen halten die Überarbeitungen fest, ohne die Auswertung früherer Klausuren zu verändern. „Duplizieren“ legt eine eigenständige Kopie der Gruppe an.',
            },
            s5: {
                h: 'Multiple Choice',
                p1: 'Ankreuzaufgaben speichern Optionen, richtige Antworten und einen optionalen Punktabzug. Die Kreuze werden beim Einlesen der Scans automatisch erkannt. Mehrere Ankreuzaufgaben lassen sich in der Klausur zu einer MC-Gruppe zusammenfassen; das betrifft nur das Layout.',
            },
            s6: {
                h: 'Bilder, Dateien und Pakete',
                p1: 'Hängen Sie Dateien an, die der Quelltext einbindet (kein SVG, vorher in PDF umwandeln). Eigene Pakete fügen Sie unter Einstellungen → „LaTeX-Pakete“ für alle Klausuren hinzu oder im Editor unter „Pakete dieser Aufgabe“ nur für diese Aufgabe.',
            },
            s7: {
                h: 'Wenn das Kompilieren scheitert',
                p1: 'Die Fehlermeldung nennt Aufgabe und Zeile und, wo erkannt, die wahrscheinliche Ursache. „Prompt für KI-Chat erstellen“ und „KI-Prompt erstellen“ im Editor bereiten einen Prompt für einen KI-Chat Ihrer Wahl vor; Examance selbst sendet nichts. Sieht ein PDF falsch aus, hilft „LaTeX-Layoutproblem melden“ unter der Vorschau.',
            },
            s8: {
                h: 'Aufgaben teilen und übernehmen',
                p1: '„Teilen“ macht eine Aufgabengruppe für alle Konten dieser Installation sichtbar, zusammen mit Ihrer E-Mail-Adresse. Unter „Von anderen geteilt“ übernehmen Sie Aufgaben als eigene Kopie in Ihre Bibliothek; „Aktualisierung verfügbar“ zeigt Änderungen am Original an.',
            },
            s9: {
                h: 'Änderungen dem Original vorschlagen',
                p1: '„Dem Original vorschlagen…“ schlägt Ihre Verbesserung der Person vor, die die Aufgabe teilt. Sie prüft den Vorschlag unter „Vorschläge“, kann ihn bearbeiten und annehmen oder ablehnen; Annehmen legt immer eine neue Version oder Variante an.',
            },
            s10: {
                h: 'Exportieren (ZIP)',
                p1: '„Exportieren (ZIP)“ an einer Aufgabengruppe und „Bibliothek exportieren“ laden die Aufgaben als lesbares LaTeX mit ihren Dateien herunter, etwa für Overleaf. „Importieren“ liest beide ZIPs wieder ein, auch in eine andere Examance-Installation.',
            },
        },
        examCreation: {
            title: 'Klausur erstellen',
            summary: 'Kopfdaten, Aufgabenauswahl, Notenschlüssel und der Satz als PDF.',
            s1: {
                h: 'Kopfdaten',
                p1: 'Fach, Klasse, Prüfungsart, Datum und Nummer stehen auf dem Deckblatt und werden immer auf Deutsch gedruckt. Das optionale Thema ordnet nur die Übersicht und wird nicht gedruckt.',
            },
            s2: {
                h: 'Aufgaben zusammenstellen',
                p1: '„Neue Prüfung“ fragt die Kopfdaten ab und öffnet die Klausur. Dort wählen Sie Aufgaben aus der Bibliothek oder schreiben mit „Neue Aufgabe“ eine eigene; die Pfeile ändern die Reihenfolge. „Seitenumbruch einfügen“ beginnt eine Aufgabe auf einer neuen Seite.',
                p2: '„Duplizieren“ legt eine neue Klausur mit denselben Aufgaben und Einstellungen an, etwa für eine Parallelklasse. Schüler und Ergebnisse werden nie kopiert.',
            },
            s3: {
                h: 'Notenschlüssel',
                p1: 'Der Notenschlüssel legt fest, ab welchem Prozentsatz welche Note gilt: eine Vorlage oder eigene Grenzen für die Noten 1 bis 6.',
            },
            s4: {
                h: 'Layout-Optionen',
                p1: '„Namenszeile neben dem QR-Code-Feld drucken“ ergänzt eine Namenszeile auf dem Deckblatt. „Platz für weitere Lösungen am Ende“ füllt die letzte Seite mit einem Karobereich. Logo und LaTeX-Pakete einer einzelnen Klausur stellen Sie unter „Prüfung bearbeiten“ ein.',
            },
            s5: {
                h: 'Setzen und drucken',
                p1: 'Der Satzlauf erzeugt ein druckfertiges PDF mit QR-Codes für Klausur, Variante und Schülerplatz. Drucken Sie die Bögen genau so, ohne Skalierung: Der QR-Code muss lesbar bleiben, sonst lässt sich der Scan später nicht automatisch zuordnen.',
            },
        },
        scanning: {
            title: 'Scannen & Zuordnen',
            summary: 'Vom Papierstapel zum zugeordneten, verschlüsselten Bogen.',
            s1: {
                h: 'Stapel einlesen',
                p1: 'Scannen Sie den ganzen Stapel am Kopierer in ein PDF und laden Sie es hier hoch. Examance trennt es anhand der QR-Codes in einzelne Abgaben und verschlüsselt jede Seite sofort im Browser.',
            },
            s2: {
                h: 'Pseudonyme statt Namen',
                p1: 'Der QR-Code verweist auf ein Pseudonym, nicht auf einen Namen. Die Verknüpfung zwischen Person und Abgabe wird getrennt gespeichert und erst nach der Korrektur wiederhergestellt.',
            },
            s3: {
                h: 'Wenn die Zuordnung nicht klappt',
                p1: 'Seiten mit unlesbarem oder fehlendem QR-Code landen in einer eigenen Liste. Ordnen Sie sie mit dem auf dem Bogen gedruckten Ersatzcode zu.',
            },
            s4: {
                h: 'MC-Erkennung prüfen',
                p1: 'Angekreuzte Kästchen werden beim Einlesen automatisch erkannt. In der MC-Prüfung bestätigen oder korrigieren Sie unsichere Erkennungen zuerst; jede bestätigte oder korrigierte Frage gilt als geprüft. „🎲 Stichprobe prüfen“ öffnet eine zufällige sichere Erkennung.',
            },
            s5: {
                h: 'Erkennung erneut ausführen',
                p1: '„MC-Erkennung erneut ausführen“ wertet alle Scans mit den aktuellen Einstellungen neu aus. Geprüfte Fragen und von Hand eingetragene Punkte bleiben unverändert. Das Erkennungsverfahren wählen Sie unter Einstellungen → MC-Erkennung.',
            },
        },
        grading: {
            title: 'Korrigieren',
            summary: 'Anonym auf dem Scan annotieren, Punkte vergeben, MC automatisch auswerten.',
            s1: {
                h: 'Anonym korrigieren',
                p1: 'Während der Korrektur sehen Sie die Handschrift und die Antwort, aber nicht den Namen. Das ist der Kern des Verfahrens: Die Bewertung entsteht, ohne die Person zu kennen.',
            },
            s2: {
                h: 'Annotieren',
                p1: 'Korrekturzeichen und Stempel liegen auf einer eigenen Ebene über dem Scan; das Original bleibt unverändert. Ein Klick auf eine Aufgabe in der Punkteliste macht sie zum Stempelziel. Scrollen blättert durch die Seiten, Strg + Mausrad oder Zwei-Finger-Geste zoomt.',
                p2: 'Punkte werden pro Aufgabe vergeben. Gesamtpunktzahl und Note ergeben sich laufend aus dem Notenschlüssel.',
            },
            s3: {
                h: 'Ankreuzaufgaben',
                p1: 'Bei Single und Multiple Choice werden die erkannten Kreuze samt Punktabzug automatisch übernommen. Sie können das Ergebnis vor dem Speichern prüfen und korrigieren.',
            },
            s4: {
                h: 'Auf Papier korrigierte Klassen',
                p1: 'Unter „Papier & Excel“ tragen Sie Punkte ohne Scans direkt in eine Tabelle ein oder fügen sie aus Excel ein (Strg + V).',
            },
            s5: {
                h: 'Zwischenstand',
                p1: 'Speichern Sie Punkte und Anmerkungen vor dem Wechsel. Verlassen Sie die Seite mit ungespeicherten Anmerkungen, fragt Examance nach — bestätigen Sie nur, wenn Sie sie wirklich verwerfen wollen.',
            },
        },
        stats: {
            title: 'Klausur-Auswertung',
            summary: 'Notenverteilung, Grenzfälle und Export für eine einzelne Klausur.',
            s1: {
                h: 'Notenverteilung',
                p1: 'Drei Diagramme zeigen Noten- und Prozentverteilung, immer vom besten Ergebnis links zum schlechtesten rechts und nach Note eingefärbt. Die Kacheln darüber nennen Durchschnitt, Bestehensquote, Median und Standardabweichung; das ⓘ erklärt jede Kennzahl. SVG, PDF und PNG laden ein Diagramm herunter.',
            },
            s2: {
                h: 'Grenzfälle',
                p1: 'Die Kachel „Grenzfälle“ zählt knappe Ergebnisse: „+“ knapp unter der besseren Note, „−“ knapp über der schlechteren. Die Tabelle darunter listet sie; ein Klick öffnet die Abgabe anonym in der Korrektur.',
            },
            s3: {
                h: 'Teilweise korrigierte Abgaben',
                p1: 'Abgaben, in denen noch nicht jede Aufgabe bewertet ist, gehen mit ihrem vorläufigen Prozentsatz ein und sind heller dargestellt.',
            },
            s4: {
                h: 'Export',
                p1: 'Der CSV-Export liefert die Noten für die Notenverwaltung der Schule. „Exportieren“ mit „Lesbares ZIP“ bündelt korrigierte Abgaben als PDF, LaTeX-Quelltext, Zusammenfassung und Noten. Beide enthalten echte Namen und sind unverschlüsselt.',
            },
        },
        analytics: {
            title: 'Übergreifende Analysen',
            summary: 'Themen-Heatmaps, Aufgabenqualität und Variantenfairness über mehrere Klausuren.',
            s1: {
                h: 'Über Klausuren hinweg',
                p1: 'Die Analysen fassen mehrere Klausuren zusammen und zeigen die Entwicklung über die Zeit, über Jahrgangsstufen und Fächer. Das Histogramm ordnet alle vollständig korrigierten Abgaben nach ihrem Prozentsatz; Farben und Bänder folgen einem gemeinsamen Referenzschlüssel.',
            },
            s2: {
                h: 'Themen und Wissenslücken',
                p1: 'Die Themen-Heatmap zeigt, wo wiederholt Punkte verloren gehen — unabhängig von einer einzelnen Klausur.',
            },
            s3: {
                h: 'Variantenfairness',
                p1: 'Bei Aufgaben mit Varianten vergleicht sie, ob eine Fassung systematisch schwerer war als die andere. Das ist die Grundlage, um eine unfaire Variante zu überarbeiten.',
            },
        },
        settings: {
            title: 'Einstellungen',
            summary: 'Speicherstrategie, LaTeX-Kompilierung, Klausur-Logo, Sprache, MC-Erkennung und Datenlöschung.',
            s1: {
                h: 'Speicherstrategie',
                p1: 'Legt fest, wo die Ergebnisse liegen: komplett auf dem Server oder nur in diesem Browser (Hybrid). Die Einstellung gehört zum Konto und gilt in allen Browsern; welche Optionen Ihr Konto nutzen darf, entscheidet der Server.',
            },
            s2: {
                h: 'LaTeX-Kompilierung',
                p1: 'Im Browser (nichts verlässt das Gerät, der erste Lauf lädt die LaTeX-Umgebung) oder auf dem Server (schneller auf schwacher Hardware). Gilt pro Browser. Meldet der erste Lauf eine fehlende .sty-Datei, versuchen Sie es nach dem Download erneut.',
            },
            s3: {
                h: 'Sprache und Farbschema',
                p1: 'Oberfläche auf Deutsch oder Englisch, hell, dunkel oder wie das System; beides auch in der Navigationsleiste umschaltbar. Die gedruckte Klausur bleibt immer deutsch.',
            },
            s4: {
                h: 'Logo auf der Klausur',
                p1: 'Unter „Logo für Klausuren“ laden Sie ein eigenes Logo hoch (PNG, JPEG oder PDF, höchstens 2 MB), wählen „Kein Logo“ oder setzen auf das Standardlogo zurück. Eine einzelne Klausur kann das Logo überschreiben.',
            },
            s5: {
                h: 'MC-Erkennung feinjustieren',
                p1: 'Erkennungsverfahren und Schwellwerte, etwa für sehr helle oder dunkle Scans. Gilt nur für künftige Erkennungsläufe und nur in diesem Browser; „Auf Standardwerte zurücksetzen“ stellt die Vorgaben wieder her.',
            },
            s6: {
                h: 'MC-Erkennung verbessern (freiwillig)',
                p1: 'Ist die Option an, sendet der Browser für jede geprüfte Ankreuzfrage kleine anonymisierte Ausschnitte der Kästchen (ohne Fragetext, Namen oder Kennungen) an den Server dieser Installation. Standardmäßig aus, gilt nur für diesen Browser.',
            },
            s7: {
                h: 'Sitzung und Löschung',
                p1: 'Die Sitzung sperrt sich nach einer Weile ohne Aktivität. Unter Datenlöschung entfernen Sie einzelne Schülerdatensätze (DSGVO-Anfragen); „Konto löschen“ löscht nach Bestätigung per E-Mail Ihr ganzes Konto. Löschen ist endgültig.',
            },
            s8: {
                h: 'Updates und Wartung',
                p1: 'Vor einem Update oder einer Wartung erinnert Examance zweimal ans Speichern; „Ich habe gespeichert“ meldet das den Administratoren. Lassen Sie den Tab einfach offen: Nicht durchgekommene Änderungen werden danach automatisch gesendet.',
            },
        },
        security: {
            title: 'Anmeldung & Sicherheit',
            summary: 'Faktoren prüfen und ändern, Passwort wechseln, Codes ersetzen.',
            s1: {
                h: 'Was diese Seite zeigt',
                p1: 'Für jeden Faktor: ob er eingerichtet ist, wann er zuletzt benutzt wurde und ob er auch Ihre verschlüsselten Daten öffnen kann. Eine Authenticator-App kann das nicht.',
            },
            s2: {
                h: 'Passwort ändern',
                p1: 'Sie ändern Ihr Passwort hier direkt; nichts wird neu verschlüsselt, und Sie bleiben angemeldet. Andere Geräte werden abgemeldet, Passkeys und Wiederherstellungscode bleiben gültig.',
            },
            s3: {
                h: 'Backup-Codes und Wiederherstellungscode',
                p1: 'Backup-Codes ersetzen die Authenticator-App, jeder funktioniert einmal. Der Wiederherstellungscode öffnet Ihre verschlüsselten Daten, wenn Sie das Passwort vergessen; ein neuer macht den alten ungültig.',
            },
            s4: {
                h: 'Faktor entfernen',
                p1: 'Ein Faktor lässt sich nur entfernen, wenn danach noch zwei bleiben und mindestens einer davon Ihre Daten öffnen kann.',
            },
        },
        accounts: {
            title: 'Konten & Rollen',
            summary: 'Konto beantragen, Freigabe und Funktionen, Rollen, Passwort zurücksetzen.',
            s1: {
                h: 'Konto beantragen',
                p1: 'Jede Nutzung braucht ein Serverkonto. Mit „Konto beantragen“ auf der Anmeldeseite bestätigen Sie Ihre E-Mail-Adresse und wählen ein Passwort. Bei einer erlaubten Domain ist das Konto sofort aktiv, sonst wartet es auf Freigabe durch die Administration.',
            },
            s2: {
                h: 'Freigabe und Funktionen',
                p1: 'Die Administration entscheidet, was Ihr Konto nutzen darf: Ergebnisse auf dem Server, LaTeX auf dem Server, Aufgaben teilen. Nicht erlaubte Optionen erscheinen als „nicht freigeschaltet“.',
            },
            s3: {
                h: 'Zwei Anmeldefaktoren',
                p1: 'Sie melden sich mit einem Passkey allein an oder mit zwei von drei Faktoren: Passwort, Authenticator-App, Passkey. Richten Sie möglichst alle drei ein, dann ist der Verlust eines Faktors nur lästig.',
            },
            s4: {
                h: 'Passkeys',
                p1: 'Ein Passkey meldet Sie mit Fingerabdruck, Gesicht oder Geräte-PIN an und genügt allein. Ob er auch Ihre verschlüsselten Daten öffnen kann, hängt vom Gerät ab; „Datenzugriff aktivieren“ richtet das ein.',
            },
            s5: {
                h: 'Passwort zurücksetzen',
                p1: '„Passwort vergessen“ setzt es zurück: mit einem zweiten Faktor bestätigen, neues Passwort wählen und einmal den Wiederherstellungscode eingeben, damit die vorhandenen Daten lesbar bleiben.',
            },
            s6: {
                h: 'Wiederherstellungscode',
                p1: 'Der Code wird genau einmal angezeigt. Bewahren Sie ihn außerhalb des Browsers auf. Ohne ihn und ohne Ihr altes Passwort bleiben verschlüsselte Daten dauerhaft unlesbar, auch für die Administration.',
            },
            s7: {
                h: 'Zu viele Fehlversuche',
                p1: 'Nach mehreren falschen Passwörtern wird das Konto kurz gesperrt; die Sperre endet von selbst. Haben Sie das nicht ausgelöst, versucht jemand anderes, sich anzumelden.',
            },
            s8: {
                h: 'Rollen',
                p1: 'Lehrkräfte arbeiten mit Klausuren, Aufgaben und Ergebnissen. Administratoren verwalten nur Konten und Server und sehen keine Klausurinhalte. Wer beides tut, nutzt zwei Konten.',
            },
            s9: {
                h: 'Für Administratoren: Konten verwalten',
                p1: 'In der Benutzerverwaltung laden Sie per E-Mail ein, geben Registrierungen frei, legen immer erlaubte Domains fest und schalten Funktionen pro Konto. Tragen Sie nur Domains ein, deren Postfächer Ihre Einrichtung selbst vergibt.',
            },
            s10: {
                h: 'Für Administratoren: Layout-Meldungen',
                p1: 'Meldet eine Lehrkraft ein Layoutproblem, zeigt der Tab „Layout-Meldungen“ den LaTeX-Code, die PDFs und wer gemeldet hat. Veröffentlicht werden darf nur mit Zustimmung; „Als gelöst markieren“ benachrichtigt die Lehrkraft.',
            },
            s11: {
                h: 'Für Administratoren: Wartungsmodus',
                p1: 'Unter Benutzerverwaltung → Wartung kündigen Sie eine Wartung mit Vorlauf und Dauer an. Angemeldete Lehrkräfte werden erinnert, ab der zweiten Erinnerung ist die Anmeldung pausiert; „Jetzt beginnen“ verkürzt den Countdown.',
            },
        },
        privacy: {
            title: 'Datenschutz & Sicherheit',
            summary: 'Was verschlüsselt ist, was die Sitzung schützt, wie lange Daten bleiben.',
            s1: {
                h: 'Zero Knowledge',
                p1: 'Ihr Datenschlüssel wird im Browser mit Passwort, Passkey oder Wiederherstellungscode entsperrt und nie übertragen. Schülerdaten, Scans, Anmerkungen und Punkte erreichen den Server nur verschlüsselt (AES-256-GCM).',
            },
            s2: {
                h: 'Sitzungshygiene',
                p1: 'Sperren Sie die Sitzung, wenn Sie den Rechner verlassen — danach bleiben keine entschlüsselten Daten im Speicher. Nach längerer Inaktivität geschieht das automatisch.',
            },
            s3: {
                h: 'Aufbewahrung',
                p1: 'Klausuren tragen eine Aufbewahrungsfrist, nach der sie entfernt werden können. Schülerbezogene Daten lassen sich einzeln löschen, ohne die Statistik der Klausur zu verlieren.',
            },
            s4: {
                h: 'Kein Passwort, keine Daten',
                p1: 'Es gibt keine Hintertür. Gehen Passwort und Wiederherstellungscode verloren, ist der verschlüsselte Inhalt Ihres Kontos endgültig verloren — im Hybrid-Modus auch die Ergebnisse in diesem Browser. Sichern Sie sie regelmäßig als .examance-Archiv.',
            },
        },
    },
} as const;
