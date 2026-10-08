// In-app help: panel chrome, the manual topics and the short tooltip texts.
// German is the source of truth; `en/help.ts` must mirror this key structure.
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
        contextTopic: 'Passend zu dieser Seite',
        moreInfo: 'Mehr dazu',
        showTip: 'Erklärung anzeigen',
        onboardingLink: 'Handbuch öffnen',
        onboardingCta: 'Neu hier? So funktioniert Examance',
        onboardingHint: 'Ein kurzer Überblick über Speicherorte, Aufgaben, Scannen und Korrigieren.',
        unlockLink: 'Neu hier? So funktioniert Examance',
    },
    tips: {
        storageServer: 'Klausuren, Aufgaben und Ergebnisse liegen auf dem Server, aber verschlüsselt: Der Schlüssel bleibt im Browser, der Server kann die Inhalte nicht lesen. Unverschlüsselt sind nur der LaTeX-Quelltext von Aufgaben und Klausuren sowie die Gesamtpunktzahl.',
        storageHybrid: 'Aufgaben und Klausuren liegen auf dem Server (gut für ein Fachschafts-Repertoire). Schülerdaten, Scans und Punkte bleiben nur in diesem Browser, verschlüsselt, und sind auf anderen Geräten nicht sichtbar.',
        latexLocal: 'Die Klausur wird direkt im Browser gesetzt (WebAssembly-XeLaTeX). Der LaTeX-Quelltext verlässt das Gerät nicht, der erste Lauf dauert dafür länger.',
        latexServer: 'Der Server setzt die Klausur. Schneller auf schwacher Hardware, dafür wird der LaTeX-Quelltext übertragen.',
        variantKey: 'Varianten sind unterschiedliche Fassungen derselben Aufgabe (Gruppe A/B/C). Sie teilen sich Auswertung und Statistik, verhindern aber das Abschreiben.',
        mcPenalty: 'Punktabzug für falsch angekreuzte Optionen. 0 bedeutet: keine Minuspunkte. Die Gesamtpunktzahl einer Aufgabe wird nie negativ.',
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
            },
            s2: {
                h: 'Der typische Ablauf',
                l1: 'Aufgaben in der Bibliothek anlegen oder wiederverwenden.',
                l2: 'Eine Klausur zusammenstellen, Notenschlüssel festlegen und als PDF setzen.',
                l3: 'Die ausgedruckten, QR-codierten Bögen schreiben lassen und anschließend als ein PDF scannen.',
                l4: 'Den Scan einlesen — Examance trennt und ordnet die Bögen anhand der QR-Codes zu.',
                l5: 'Anonym korrigieren und die Ergebnisse auswerten oder exportieren.',
            },
            s3: {
                h: 'Arbeitsbereich sichern und Ergebnisse teilen',
                p1: 'Im Menü des Arbeitsbereichs erzeugen Sie ein passwortgeschütztes .bgproj-Archiv (Argon2id + AES-GCM) mit Klausuren, Schülerdaten, Scans, Annotationen und Punkten. Das ist die wichtigste Sicherung für Ergebnisse, die im Hybrid-Modus nur in diesem Browser liegen, und das Archiv lässt sich auch in einem anderen Konto einlesen. Jede Klausur nimmt ihr Logo mit, sodass sie nach dem Import denselben Kopf trägt. Mit „Ergebnisse teilen (ohne Aufgabentexte)“ exportieren Sie dasselbe, aber ohne LaTeX-Code und Ressourcendateien; enthalten bleiben Aufgabennamen, Punktzahlen und MC-Lösungsschlüssel. Wer ein solches Archiv einliest, kann die Klausuren korrigieren und auswerten; sie tragen den Hinweis „Nur Ergebnisse“, und Kompilieren, Bearbeiten sowie das Erstellen von MC-Antwortbogen-Vorlagen sind für diese Aufgaben gesperrt. In der Aufgabenbibliothek erscheinen sie nicht. Ist eine Aufgabe auf dem Server für Sie bereits verfügbar, wird sie verknüpft statt kopiert. Nach jedem Export und Import zeigt ein Bericht, was enthalten bzw. übernommen wurde, was bewusst fehlt und welche verknüpften Aufgaben nicht verfügbar waren. Geben Sie das Archiv und sein Passwort getrennt weiter, denn es enthält Schülerdaten.',
            },
        },
        storageModes: {
            title: 'Speicherorte & Verschlüsselung',
            summary: 'Wo Ihre Daten liegen — komplett auf dem Server oder mit den Ergebnissen nur im Browser.',
            s1: {
                h: 'Die zwei Speicherorte',
                l1: 'Alles auf dem Server: Klausuren, Aufgaben und Ergebnisse (Schülerdaten, Abgaben mit Scans, Punkte) liegen auf dem Server und sind in jedem Browser Ihres Kontos verfügbar. Sie sind clientseitig mit AES-256-GCM verschlüsselt; der Server speichert nur Chiffrat und kann es nicht lesen. Unverschlüsselt bleiben der LaTeX-Quelltext von Aufgaben und Klausuren sowie die Gesamtpunktzahl.',
                l2: 'Hybrid: Aufgaben und Klausuren liegen auf dem Server. Schülerdaten, Abgaben mit Scans und Punkte liegen nur in dem Browser, in dem sie erfasst wurden, verschlüsselt in dessen lokaler Datenbank. Auf anderen Geräten sind sie nicht sichtbar — sichern Sie sie mit einem .bgproj-Archiv.',
                l3: 'Der Speicherort gehört zu Ihrem Konto, nicht zum Browser: Sie wählen ihn beim ersten Anmelden in einem Dialog (es gibt keine Voreinstellung), und er gilt dann in allen Browsern Ihres Kontos. Einen rein lokalen Modus ohne Konto gibt es nicht mehr.',
            },
            s2: {
                h: 'Was verschlüsselt wird',
                p1: 'Verschlüsselt sind die Inhalte: Schülerdaten, Namen, Scans, Annotationen und Punkte. Unverschlüsselt bleiben technische Verknüpfungsfelder wie IDs und Reihenfolgen sowie der LaTeX-Quelltext von Aufgaben und Klausuren und die Gesamtpunktzahl.',
                p2: 'Der Schlüssel wird aus Ihrem Passwort abgeleitet. Ohne Passwort und Wiederherstellungscode sind die verschlüsselten Daten nicht wiederherstellbar — auch nicht durch die Serverbetreiber. Im Hybrid-Modus gilt das auch für die Ergebnisse, die nur in diesem Browser liegen.',
            },
            s3: {
                h: 'Speicherort wechseln',
                p1: 'Den Speicherort ändern Sie in den Einstellungen. Beim Wechsel werden die Ergebnisse direkt verschoben, je Klausur vom Server in den Browser oder umgekehrt; Examance prüft, dass alle Datensätze angekommen sind. Erst danach wechselt der Speicherort Ihres Kontos, und die Seite lädt neu. Ein Export und Wiedereinlesen ist dafür nicht nötig; auf Wunsch legen Sie vorher eine .bgproj-Sicherung an.',
                p2: 'Danach fragt Examance jedes Mal, ob die alte Kopie behalten oder gelöscht werden soll. Beim Wechsel zu „Hybrid“ wird die Kopie auf dem Server zum Löschen vorgemerkt (mit 7 Tagen Frist), beim Wechsel zu „Alles auf dem Server“ wird die lokale Kopie in diesem Browser geleert. Noch nicht gesendete Änderungen müssen vorher gesendet werden („Jetzt senden“), sonst wird der Wechsel abgelehnt. Andere geöffnete Tabs sind währenddessen gesperrt und laden danach neu.',
                p3: 'Hat ein Browser im Modus „Alles auf dem Server“ noch lokale Ergebnisse, etwa aus früherer Hybrid-Nutzung, bietet ein Hinweis an, sie auf den Server hochzuladen. Im Hybrid-Modus zeigt ein Browser ohne Ergebnisse einen Hinweis: Die Ergebnisse liegen nur in dem Browser, in dem sie erfasst wurden.',
                p4: 'Der Browser-Speicher gehört immer genau einem Konto auf einem Server: Daten, die zu einem anderen Konto gehören, werden nicht geöffnet; ein Hinweis erklärt, wie Sie sich mit dem passenden Zugang anmelden oder den Speicher zurücksetzen. Browser mit Daten aus dem früheren rein lokalen Modus (ohne Konto) zeigen stattdessen einen Hinweis, dass sich diese Daten nicht mehr öffnen lassen. Sie können sie löschen und weiterarbeiten; eine Übernahme gibt es nicht.',
            },
        },
        exercises: {
            title: 'Aufgabenbibliothek',
            summary: 'Aufgaben anlegen, verschlagworten, in Varianten und Versionen pflegen und mit anderen teilen.',
            s1: {
                h: 'Sammeln statt kopieren',
                p1: 'Aufgaben liegen in einer gemeinsamen Bibliothek und werden nach Jahrgang, Fach und Thema verschlagwortet. Jede Aufgabe ist ein LaTeX-Fragment mit Live-Vorschau; die Punktzahl wird automatisch aus dem Quelltext gelesen.',
                p2: 'Über die Filter oben lassen sich Aufgaben nach Jahrgang, Fach und Thema eingrenzen und für eine neue Klausur wiederverwenden.',
                p3: 'Im aufgeklappten Eintrag sehen Sie je Variante, in welchen Klausuren die Aufgabe verwendet wird (Klick öffnet die Klausur). „Vorschau“ zeigt das zuletzt kompilierte PDF; gibt es noch keines, fragt Examance, ob es jetzt kompiliert werden soll.',
            },
            s2: {
                h: 'Varianten und Versionen',
                p1: 'Varianten sind gleichwertige Fassungen derselben Aufgabe, etwa für die Gruppen A und B. Sie werden gemeinsam ausgewertet, erschweren aber das Abschreiben.',
                p2: 'Versionen halten die Korrekturgeschichte fest: Eine überarbeitete Aufgabe ersetzt die alte, ohne dass die Auswertung vergangener Klausuren verloren geht.',
            },
            s3: {
                h: 'Multiple Choice',
                p1: 'Aufgaben können Freitext, Single Choice oder Multiple Choice sein. Für Ankreuzaufgaben werden bis zu 26 Optionen, richtige Antworten und ein optionaler Punktabzug hinterlegt. Unter „Spalten der Antwortoptionen“ legen Sie fest, in wie vielen Spalten (1–10) die Optionen gedruckt werden.',
                p2: 'Mehrere Ankreuzaufgaben lassen sich zu einer MC-Gruppe zusammenfassen — schon beim Erstellen der Prüfung im Tab „MC-Gruppen“ oder später auf der Prüfungsseite. Eine Prüfung kann beliebig viele Gruppen beliebiger Größe enthalten; jede Frage gehört zu höchstens einer Gruppe. Das ist reine Layout-Information für den Druck — bewertet und ausgewertet wird weiterhin jede Frage einzeln.',
            },
            s4: {
                h: 'Bilder und Dateien',
                p1: 'Zu jeder Aufgabe lassen sich Dateien hochladen, die der LaTeX-Quelltext einbindet, etwa Abbildungen über \\includegraphics. SVG wird nicht unterstützt — bitte vorher in PDF umwandeln.',
                p2: 'Fehlt eine Grafik, bricht der Satz nicht ab: Die Klausur wird trotzdem gesetzt, die fehlende Datei aber gemeldet. Prüfen Sie die Vorschau, bevor Sie drucken.',
            },
            s5: {
                h: 'Aufgaben teilen und übernehmen',
                p1: '„Teilen…“ macht eine Aufgabengruppe mit allen aktuellen Varianten und Dateien für alle Konten dieser Installation sichtbar, zusammen mit Ihrer E-Mail-Adresse. Andere können sie ansehen und übernehmen, aber nicht ändern. Teilen Sie nur Aufgaben ohne personenbezogene Daten von Schülerinnen und Schülern und nur, was Sie weitergeben dürfen.',
                p2: 'Unter „Von anderen geteilt“ übernehmen Sie eine Aufgabe in Ihre Bibliothek. Sie erhalten eine eigene Kopie, die Sie frei bearbeiten und in Prüfungen verwenden; Änderungen oder das Löschen durch die Person, die geteilt hat, wirken sich nie auf Ihre Prüfungen aus.',
                p3: 'Ändert sich die Quelle, zeigt die Kopie „Aktualisierung verfügbar“. „Aktualisieren…“ zeigt die Unterschiede und übernimmt sie als neue Version; Ihre bisherige Version und die Prüfungen, die sie verwenden, bleiben unverändert. Wird die Quelle nicht mehr geteilt, bleibt Ihre Kopie bestehen. Ob Ihr Konto teilen darf, legt die Administration fest.',
                p4: 'Sie können eine Aufgabe auch direkt im Editor („Mit allen Konten teilen“, mit derselben Bestätigung wie im Teilen-Dialog) oder über das Menü „Teilen“ alle auf einmal teilen oder nicht mehr teilen. „Teilen pausieren“ blendet alles Geteilte vorübergehend aus, ohne Ihre Auswahl zu vergessen. Von anderen übernommene Aufgaben werden nie als Ihre eigenen geteilt. Beim Aktualisieren wählen Sie, welche Varianten Sie übernehmen, und können das Ergebnis direkt im Dialog bearbeiten.',
            },
            s6: {
                h: 'Änderungen dem Original vorschlagen',
                p1: 'Haben Sie Ihre Kopie verbessert oder eine Variante ergänzt, schlägt „Dem Original vorschlagen…“ das der Person vor, die die Aufgabe teilt. Geänderte Varianten werden als neue Version vorgeschlagen, ergänzte als neue Variante. Ihre E-Mail-Adresse wird dabei angezeigt.',
                p2: 'Die Person sieht Vorschläge unter „Vorschläge“ und erhält eine kurze E-Mail-Benachrichtigung ohne Inhalt. Sie vergleicht den Vorschlag mit ihrer aktuellen Version, kann ihn bearbeiten und übernimmt oder lehnt ihn ab. Übernommen wird immer als neue Version oder neue Variante; bestehende Versionen und Prüfungen bleiben unverändert. Eine PDF-Vorschau gibt es erst nach dem Übernehmen.',
                p3: 'Nach der Entscheidung wird der Inhalt des Vorschlags gelöscht, der Eintrag selbst nach 30 Tagen; offene Vorschläge nach 180 Tagen. Sie können einen offenen Vorschlag jederzeit zurückziehen. Übernommene Änderungen erreichen Ihre Kopie über „Aktualisieren…“. Wurde Ihr Vorschlag unverändert übernommen, ist Ihre Kopie automatisch wieder auf dem Stand des Originals; nur bei einer bearbeiteten Übernahme erscheint „Aktualisierung verfügbar“. Aufgaben mit offenem Vorschlag tragen in der Bibliothek ein Schild, das direkt zu den Vorschlägen führt; von dort öffnet „In der Bibliothek öffnen“ die Aufgabe.',
            },
        },
        examCreation: {
            title: 'Klausur erstellen',
            summary: 'Kopfdaten, Aufgabenauswahl, Notenschlüssel und der Satz als PDF.',
            s1: {
                h: 'Kopfdaten',
                p1: 'Fach, Klasse, Testart, Datum und Nummer erscheinen auf dem Deckblatt der Klausur. Diese Angaben sind Prüfungsinhalt und werden deshalb immer auf Deutsch gedruckt, unabhängig von der Sprache der Oberfläche.',
            },
            s2: {
                h: 'Aufgaben zusammenstellen',
                p1: 'Aufgaben werden aus der Bibliothek übernommen oder als Einzelstück direkt in der Klausur angelegt. Die Reihenfolge lässt sich per Drag-and-drop ändern, die Gesamtpunktzahl wird laufend mitgerechnet.',
            },
            s3: {
                h: 'Notenschlüssel',
                p1: 'Der Notenschlüssel legt fest, ab welcher Punktzahl welche Note gilt: linear, nach Oberstufenpunkten gewichtet oder mit frei gesetzten Grenzen für die Noten 1 bis 6.',
            },
            s4: {
                h: 'Setzen und drucken',
                p1: 'Beim Setzen entsteht ein druckfertiges PDF mit QR-Code — je Klausur, Variante und Schülerplatz ein eigener Code. Setzen Sie im Browser, läuft der Satz vollständig auf dem Gerät.',
                p2: 'Drucken Sie die Bögen so aus, wie sie gesetzt wurden. Der QR-Code muss lesbar bleiben, sonst kann der Scan später nicht automatisch zugeordnet werden.',
                p3: 'In der Prüfungsübersicht öffnet „Vorschau“ im aufgeklappten Eintrag das zuletzt kompilierte PDF. Gibt es noch keines, werden Sie gefragt und die Prüfung wird direkt im Fenster kompiliert und angezeigt. Die Vorschau bleibt nur bis zum Neuladen der Seite erhalten.',
            },
        },
        scanning: {
            title: 'Scannen & Zuordnen',
            summary: 'Vom Papierstapel zum zugeordneten, verschlüsselten Bogen.',
            s1: {
                h: 'Stapel einlesen',
                p1: 'Scannen Sie den kompletten Stapel am Schulkopierer in ein einziges PDF und laden Sie es hier hoch. Examance trennt es anhand der QR-Codes in einzelne Abgaben.',
                p2: 'Jede Seite wird sofort im Browser verschlüsselt. Im Hybrid-Modus verlässt der Scan das Gerät nicht, im Server-Modus wird er nur als Chiffrat übertragen — abgesehen von den optional gespendeten, anonymisierten Bildausschnitten einzelner Kästchen.',
            },
            s2: {
                h: 'Pseudonyme statt Namen',
                p1: 'Der QR-Code verweist auf ein Pseudonym, nicht auf einen Namen. Die Verknüpfung zwischen Person und Abgabe wird getrennt gespeichert und erst nach der Korrektur wieder hergestellt.',
            },
            s3: {
                h: 'Wenn die Zuordnung nicht klappt',
                p1: 'Unlesbare oder fehlende QR-Codes landen in der Prüfansicht. Dort lassen sich Seiten von Hand der richtigen Abgabe zuweisen oder über den Ersatzcode auf dem Bogen nachtragen.',
            },
            s4: {
                h: 'MC-Erkennung prüfen und erneut ausführen',
                p1: 'Angekreuzte Kästchen werden beim Einlesen automatisch erkannt. In der MC-Prüfansicht bestätigen oder korrigieren Sie unsichere Erkennungen; jede bestätigte oder korrigierte Frage gilt als geprüft.',
                p2: '„MC-Erkennung erneut ausführen“ wertet alle Scans mit den aktuellen Einstellungen neu aus. Noch nicht geprüfte Fragen übernehmen das neue Ergebnis; bei geprüften Fragen bleiben Ihre Antwort und Punktzahl immer unverändert, nur ihre Erkennung wird zum Vergleich neu berechnet. Von Hand eingetragene Punktzahlen bleiben unberührt. Vorher zeigt ein Dialog, was sich ändert und ob die Einstellungen vom letzten Lauf abweichen; der Bereich „Erkennungseinstellungen“ vergleicht die Werte des letzten Laufs mit den aktuell gültigen.',
                p3: 'Neben dem Füllgrad prüft die Erkennung auch die Form der Markierung: Ein gleichmäßig ausgefülltes Kästchen gilt als zurückgenommen, eine Markierung weit über das Kästchen hinaus oder eine sehr blasse Markierung wird als unsicher vorgelegt. Der Grund steht in der Prüfansicht direkt bei der Antwortoption. Beim Verfahren v2 lässt sich die Formanalyse in den Einstellungen abschalten. Unter Einstellungen → MC-Erkennung wählen Sie das Erkennungsverfahren: v4 (Standard, Strichform) oder v2 (älteres Verfahren, Füllgrad). Das jeweils andere läuft immer mit; der Bereich „Erkennungseinstellungen“ der Prüfansicht zeigt, wie viele Ihrer geprüften Kästchen jedes Verfahren richtig erkannt hätte. Unsichere Kästchen bleiben gelb umrahmt, bis die Frage geprüft ist.',
                p4: 'Bis zur Prüfung zählt ein unsicheres Kästchen vorläufig als das Ergebnis, dem die Messwerte näher liegen — angekreuzt oder nicht angekreuzt; die Prüfansicht zeigt dazu „Vorläufig als angekreuzt / nicht angekreuzt gewertet“. Der Button „🎲 Stichprobe prüfen“ öffnet eine zufällige, noch nicht geprüfte, aber sichere Erkennung — so lassen sich auch unauffällige Fragen stichprobenhaft kontrollieren.',
            },
        },
        grading: {
            title: 'Korrigieren',
            summary: 'Anonym auf dem Scan annotieren, Punkte vergeben, MC automatisch auswerten.',
            s1: {
                h: 'Anonym korrigieren',
                p1: 'Während des Korrekturgangs sehen Sie die Handschrift und die Antwort, aber nicht den Namen. Das ist der Kern des Verfahrens: Die Bewertung entsteht ohne Kenntnis der Person.',
            },
            s2: {
                h: 'Annotieren',
                p1: 'Korrekturzeichen entstehen auf einer Ebene über dem Scan. Das Original bleibt unverändert und lässt sich jederzeit wieder ohne Anmerkungen anzeigen. Alle Seiten einer Abgabe stehen untereinander: Mit Mausrad oder Scrollleiste blättern Sie durch, auf Touchgeräten mit zwei Fingern (ein Finger zeichnet). Strg + Mausrad oder Zwei-Finger-Zoom vergrößert.',
                p2: 'Punkte werden pro Aufgabe vergeben. Note und Gesamtpunktzahl ergeben sich laufend aus dem hinterlegten Notenschlüssel.',
            },
            s3: {
                h: 'Ankreuzaufgaben',
                p1: 'Bei Single- und Multiple-Choice erkennt eine automatische Auswertung die angekreuzten Kästchen und wendet den hinterlegten Punktabzug an. Das Ergebnis lässt sich vor dem Speichern prüfen und korrigieren.',
            },
            s4: {
                h: 'Zwischenstand',
                p1: 'Der Korrekturstand wird laufend gespeichert. Das Verlassen der Seite mit ungesicherten Annotationen wird abgefangen — bestätigen Sie den Hinweis nur, wenn Sie den Stand wirklich verwerfen wollen.',
            },
        },
        stats: {
            title: 'Klausur-Auswertung',
            summary: 'Notenverteilung, Aufgabenanalyse und Export für eine einzelne Klausur.',
            s1: {
                h: 'Notenverteilung',
                p1: 'Die Notenverteilung zeigt immer die volle Skala von 1 bis 6, auch wenn eine Note gar nicht vorkommt — eine Note, die niemand erreicht hat, ist ebenfalls eine Aussage. Die Prozentverteilung zeigt entsprechend alle Prozentbereiche, in gleich breiten Schritten von höchstens 5 %. Die Schrittweite richtet sich nach dem Bewertungsmaßstab: Sie ist so gewählt, dass jede Notengrenze auf einer Balkengrenze liegt und kein Balken zwei Noten mischt — beim linearen 50-%-Schlüssel mit Grenzen wie 62,5 % also 2,5 %. Alle Diagramme lesen sich von der besten Leistung links zur schlechtesten rechts und färben die Balken nach Note (1 dunkelgrün bis 6 dunkelrot); das dritte Diagramm legt die Prozentbalken vor die Notenbalken und beschriftet jeden Notenbalken oben mit Note, Bezeichnung, Anzahl und Anteil; ein Streifen darüber markiert Durchschnitt (●) und Median (◇) und zeigt als beschriftete Klammer den Bereich Durchschnitt ± Standardabweichung; eine feine Kurve hinter den Balken zeigt zum Vergleich die Normalverteilung mit diesen Werten. Feste Beschriftungen (Noten, Bezeichnungen, Prozentbereiche) stehen in Grau, Werte, die sich beim Weiterkorrigieren ändern (Anzahlen, Anteile), in Weiß. Prozentbereiche nennen immer zuerst die obere Grenze (z. B. 100–85 %), passend zur Achse, die links bei 100 % beginnt. Stehen die Balken zu eng für jede Beschriftung, bleibt an jeder Notengrenze eine stehen; die übrigen zeigt der Tooltip. Über die Schaltflächen SVG, PDF und PNG lässt sich jedes Diagramm mit transparentem Hintergrund und dunkler Schrift für helle Seiten herunterladen: SVG und PDF als Vektorgrafik, PNG in 8K-Auflösung (7680 × 4320). In der Notenverteilung sind Grenzfälle dunkler abgesetzt: oben im Balken „+“ (knapp unter der besseren Note), unten „−“ (knapp über der schlechteren); die Höhe des Abschnitts zeigt die Anzahl.',
                p2: 'Die Kennzahlen darüber nennen Notendurchschnitt, Bestehensquote, durchschnittliche Punktzahl sowie Mittelwert, Median und Standardabweichung der Prozentwerte; das ⓘ an jeder Kachel erklärt die Kennzahl kurz. Notendurchschnitt, Ø Punkte, Ø Prozent und Median sind in der Farbe der Note eingefärbt, der sie entsprechen — wie die Balken in den Diagrammen. Die Kachel „Grenzfälle“ zählt die knappen Fälle (+ / −), und unter dem kombinierten Diagramm listet eine Tabelle alle Abgaben knapp an einer Notengrenze: Plus heißt höchstens 0,75 Punkte unter der nächstbesseren Note, Minus höchstens 0,5 Punkte über der Untergrenze der eigenen Note (genau auf der Grenze zählt als Minus). Jede Zeile nennt erreichte Punkte, die Notengrenze in Punkten und den Abstand dazu; ein Klick öffnet die Abgabe in der Korrektur, als anonymer Schüler mit derselben Nummer wie dort. Bei teilweise korrigierten Abgaben zählen die Punkte der bereits korrigierten Aufgaben.',
            },
            s2: {
                h: 'Teilweise korrigierte Abgaben',
                p1: 'Abgaben, bei denen noch nicht alle Aufgaben korrigiert sind, fließen mit ihrem vorläufigen Prozentwert ein — berechnet nur über die bereits korrigierten Aufgaben. Diese Anteile sind in den Diagrammen heller dargestellt, damit eine halb korrigierte Klasse nicht wie ein fertiges Ergebnis aussieht.',
            },
            s3: {
                h: 'Export',
                p1: 'Ergebnisse lassen sich als CSV exportieren, etwa zur Übernahme in die Notenverwaltung der Schule. Die Datei enthält Pseudonym, Ersatzcode, Name, Punkte, Maximalpunktzahl, Prozentwert und Note. Der Export enthält Klarnamen — behandeln Sie die Datei entsprechend.',
            },
        },
        analytics: {
            title: 'Übergreifende Analysen',
            summary: 'Themen-Heatmaps, Aufgabenqualität und Variantenfairness über mehrere Klausuren.',
            s1: {
                h: 'Über Klausuren hinweg',
                p1: 'Die Analyse fasst mehrere Klausuren zusammen und zeigt, wie sich Ergebnisse über Zeit, Jahrgänge und Fächer entwickeln.',
            },
            s2: {
                h: 'Themen und Wissenslücken',
                p1: 'Die Themen-Heatmap zeigt, in welchen Themengebieten wiederholt Punkte verloren gehen — unabhängig von der einzelnen Klausur.',
            },
            s3: {
                h: 'Variantenfairness',
                p1: 'Für Aufgaben mit Varianten wird verglichen, ob eine Fassung systematisch schwerer war als die andere. Das ist die Grundlage, um eine unfaire Variante zu überarbeiten.',
            },
        },
        settings: {
            title: 'Einstellungen',
            summary: 'Speicherstrategie, LaTeX-Kompilierung, Klausur-Logo, Sprache, MC-Erkennung und Datenlöschung.',
            s1: {
                h: 'Speicherstrategie',
                p1: 'Legt fest, wo die Ergebnisse (Schülerdaten, Abgaben, Punkte) liegen: komplett auf dem Server oder nur in diesem Browser (Hybrid). Die Einstellung gehört zu Ihrem Konto und gilt in allen Browsern. Beim ersten Anmelden müssen Sie wählen, es gibt keine Voreinstellung. Welche Optionen Ihr Konto nutzen darf, legt der Server fest.',
            },
            s2: {
                h: 'LaTeX-Kompilierung',
                p1: 'Unabhängig davon lässt sich wählen, wo die Klausur gesetzt wird: im Browser (nichts verlässt das Gerät, dafür langsamer beim ersten Lauf) oder auf dem Server (schneller auf schwacher Hardware). Die Wahl gilt je Browser; das Setzen auf dem Server ist nur verfügbar, wenn Ihr Konto es erlaubt.',
                p2: 'Der erste Satz im Browser lädt die LaTeX-Umgebung nach. Schlägt er mit einer Meldung über eine fehlende .sty-Datei fehl, hilft ein zweiter Versuch, sobald der Download abgeschlossen ist.',
            },
            s3: {
                h: 'Sprache',
                p1: 'Die Oberfläche gibt es auf Deutsch und Englisch, umschaltbar hier oder über die Navigationsleiste oben. Die gedruckte Klausur bleibt davon unberührt — sie ist immer auf Deutsch.',
                p2: 'Das Farbschema (Hell, Dunkel oder passend zum System) lässt sich in der Navigationsleiste und hier in den Einstellungen wählen. Es betrifft nur die Oberfläche, nicht die gedruckte Klausur.',
            },
            s4: {
                h: 'Sitzung und Löschung',
                p1: 'Die Sitzung sperrt sich nach Inaktivität von selbst; danach sind alle Inhalte wieder nur mit dem Passwort erreichbar.',
                p2: 'Über die Datenlöschung lassen sich einzelne Schülerdaten (Auskunfts- und Löschansprüche nach DSGVO) oder der gesamte Arbeitsbereich entfernen. Das Löschen ist endgültig und kann nicht rückgängig gemacht werden.',
                p3: 'Unter „Konto löschen“ können Sie Ihr eigenes Konto löschen. Sie erhalten eine E-Mail mit einem Link; gelöscht wird erst, wenn Sie ihn öffnen und bestätigen. Dabei wird alles entfernt, was dazu auf dem Server gespeichert ist (Prüfungen, Ergebnisse, Anmeldefaktoren), und der Browser, in dem Sie bestätigen, wird geleert (andere Browser behalten ihre lokale Kopie, die ohne das Konto nicht mehr lesbar ist). Ihre Aufgaben können auf Wunsch ohne Ihren Namen auf dem Server bleiben, damit sie später geteilt werden können. Admins können in der Kontenverwaltung auch andere Konten löschen, mit derselben Option.',
            },
            s5: {
                h: 'MC-Erkennung feinjustieren',
                p1: 'Die Schwellenwerte für die Erkennung angekreuzter Kästchen lassen sich anpassen, etwa wenn ein Scanner sehr hell oder dunkel scannt. Die Einstellungen gelten nur für künftige Erkennungsläufe; bereits erkannte und geprüfte Ergebnisse ändern sich nicht. Jeder Lauf speichert die verwendeten Werte mit.',
                p2: 'Die Einstellungen liegen nur in diesem Browser und werden nicht mit anderen Geräten synchronisiert. „Auf Standardwerte zurücksetzen“ stellt die mitgelieferten Werte wieder her.',
            },
            s6: {
                h: 'MC-Erkennung verbessern (freiwillig)',
                p1: 'Ist diese Option aktiviert und sind Sie mit einem Server-Konto angemeldet, sammelt der Browser für jede geprüfte oder korrigierte Ankreuzfrage einen kleinen Bildausschnitt je Kästchen (80×48 Pixel, Graustufen, ohne Aufgabentext) mit der bestätigten Wertung, der ursprünglichen Erkennung und ein paar Messwerten und sendet sie gebündelt an den Server dieser Installation. Namen, Pseudonyme, Klausur-, Abgabe- oder Fragen-IDs und Zeitstempel werden nicht mitgeschickt; je Kästchen nur eine zufällige Kennung, damit eine spätere Korrektur die frühere Wertung ersetzt. Die Anmeldung dient nur dem Missbrauchsschutz — das Konto wird nicht mit den Ausschnitten gespeichert.',
                p2: 'Ziel ist ein gemeinsamer, besserer Klassifikator, von dem auch neue Installationen von Anfang an profitieren. Die Einstellung ist standardmäßig aus, gilt nur für diesen Browser und lässt sich jederzeit wieder abschalten.',
            },
            s7: {
                h: 'Logo auf der Klausur',
                p1: 'Oben links auf der ersten Seite jeder Klausur steht ein Logo, voreingestellt das MTG-Logo. Unter „Logo für Klausuren“ laden Sie ein eigenes hoch (PNG, JPEG oder PDF, höchstens 2 MB), wählen „Kein Logo“ oder setzen auf das Standardlogo zurück. Ohne Logo bleibt die Stelle frei; das Seitenlayout und die Lage der Ankreuzkästchen ändern sich dadurch nicht. In der Klausurübersicht zeigt jede aufgeklappte Klausur, welches Logo sie druckt.',
                p2: 'In den Klausurdaten einer Klausur lässt sich das Logo überschreiben: das Logo aus den Einstellungen, kein Logo oder ein eigenes Logo nur für diese Klausur. Das Logo wird wie die Aufgaben auf dem Server gespeichert.',
            },
        },
        security: {
            title: 'Anmeldung & Sicherheit',
            summary: 'Faktoren prüfen und ändern, Passwort wechseln, Codes ersetzen.',
            s1: {
                h: 'Was diese Seite zeigt',
                p1: 'Für jeden Faktor steht dort, ob er eingerichtet ist, wann er zuletzt verwendet wurde und ob er auch Ihre verschlüsselten Daten öffnen kann. Die Authenticator-App kann das nicht: Ihr Geheimnis liegt auf dem Server, und sechs Ziffern reichen nicht, um daraus einen Schlüssel abzuleiten.',
            },
            s2: {
                h: 'Passwort ändern',
                p1: 'Das Passwort lässt sich hier direkt wechseln, ohne den Weg über „Passwort vergessen“. Ihr Datenschlüssel wird dabei im Browser neu verpackt und zusammen mit dem neuen Passwort gespeichert — es wird nichts neu verschlüsselt, und Sie bleiben angemeldet.',
                p2: 'Andere Geräte werden dabei abgemeldet. Ihre Passkeys und Ihr Wiederherstellungscode bleiben gültig.',
            },
            s3: {
                h: 'Backup-Codes und Wiederherstellungscode',
                p1: 'Backup-Codes ersetzen die Authenticator-App, wenn Sie Ihr Telefon nicht zur Hand haben. Jeder funktioniert genau einmal; erzeugen Sie neue, solange Sie angemeldet sind.',
                p2: 'Der Wiederherstellungscode ist etwas anderes: Er öffnet Ihre verschlüsselten Daten, wenn Sie Ihr Passwort vergessen. Sie können ihn hier ersetzen — der bisherige wird dabei ungültig.',
            },
            s4: {
                h: 'Faktor entfernen',
                p1: 'Ein Faktor lässt sich nur entfernen, solange danach noch zwei übrig bleiben und mindestens einer davon Ihre Daten öffnen kann. Wird das Entfernen abgelehnt, steht in der Meldung, welche der beiden Regeln greift.',
            },
        },
        accounts: {
            title: 'Konten & Rollen',
            summary: 'Konto beantragen, Freigabe und Funktionen, Rollen, Passwort zurücksetzen.',
            s1: {
                h: 'Braucht es ein Konto?',
                p1: 'Ja. Jede Nutzung von Examance setzt ein Server-Konto voraus; den früheren lokalen Modus mit Passphrase und ohne Konto gibt es nicht mehr. Welche Speicherorte und Funktionen Ihr Konto nutzen darf, legt die Administration fest.',
            },
            s2: {
                h: 'Rollen',
                p1: 'Lehrkräfte arbeiten mit Prüfungen, Aufgaben und Ergebnissen und sehen ausschließlich ihre eigenen. Administratorinnen und Administratoren verwalten nur Konten und Server: Sie können keine Prüfungen oder Aufgaben anlegen oder öffnen, und die App zeigt ihnen nur Benutzerverwaltung, Einstellungen und Hilfe. Wer verwaltet und selbst unterrichtet, nutzt zwei Konten.',
                p2: 'Auch die Administration erhält keinen Zugriff auf fremde Klausurinhalte, denn diese sind clientseitig verschlüsselt.',
            },
            s6: {
                h: 'Zwei Anmeldefaktoren',
                p1: 'Eine Anmeldung gelingt mit einem Passkey allein oder mit zwei von drei Faktoren: Passwort, Authenticator-App und Passkey. Passwort und Authenticator-App reichen nie allein — ein erratenes Passwort nützt also nichts.',
                p2: 'Richten Sie nach Möglichkeit alle drei ein — dann ist der Verlust eines einzelnen Faktors nur lästig. Mit genau zwei bedeutet der Verlust eines Faktors, dass nur die Administration wieder Zugang verschaffen kann, und zwar nur zum Konto, nicht zu den verschlüsselten Daten. Backup-Codes ersetzen die Authenticator-App und funktionieren je einmal.',
            },
            s7: {
                h: 'Passkeys',
                p1: 'Ein Passkey meldet Sie mit Fingerabdruck, Gesicht oder Geräte-PIN an — ohne Passwort. Weil das Gerät dabei Fingerabdruck, Gesicht oder PIN prüft, genügt er allein. Nach einer Anmeldung mit Passwort öffnet sich die Passkey-Abfrage automatisch als zweiter Faktor; brechen Sie sie ab, um stattdessen die Authenticator-App zu verwenden.',
                p2: 'Ob ein Passkey auch Ihre verschlüsselten Daten öffnen kann, hängt vom Gerät ab. Die Einstellungen zeigen das je Passkey an; mit „Datenzugriff aktivieren“ richten Sie es dort ohne Passwort ein. In Bitwarden gespeicherte Passkeys können das derzeit nicht. Wo es nicht möglich ist, bleiben Passwort und Wiederherstellungscode dafür zuständig.',
            },
            s3: {
                h: 'Passwort zurücksetzen',
                p1: 'Ein Serverkonto lässt sich über „Passwort vergessen“ zurücksetzen. Sie bestätigen dabei mit einem zweiten Faktor und geben einmalig Ihren Wiederherstellungscode ein — damit werden Ihre bestehenden verschlüsselten Daten wieder lesbar, ohne dass etwas neu verschlüsselt wird.',
            },
            s4: {
                h: 'Wiederherstellungscode',
                p1: 'Der Code wird genau einmal angezeigt: wenn Ihr Schlüssel erstmals hinterlegt wird, und erneut nach jedem Zurücksetzen. Bewahren Sie ihn außerhalb des Browsers auf — auf Papier oder in einem Passwortmanager.',
                p2: 'Ohne diesen Code und ohne Ihr altes Passwort bleiben bereits verschlüsselte Klausuren, Schülerdaten und Korrekturen dauerhaft unlesbar. Auch die Schuladministration kann sie nicht wiederherstellen, weil der Server den Schlüssel nie kennt. Daten, die Sie danach anlegen, sind davon nicht betroffen.',
            },
            s5: {
                h: 'Zu viele Fehlversuche',
                p1: 'Nach mehreren falschen Passwörtern wird das Konto kurzzeitig gesperrt; die Wartezeit verlängert sich mit jedem weiteren Fehlversuch und endet von selbst. Wenn Sie das sehen, ohne es selbst ausgelöst zu haben, versucht jemand anderes, sich bei Ihrem Konto anzumelden.',
            },
            s8: {
                h: 'Konto beantragen',
                p1: 'Über „Konto beantragen“ auf der Anmeldeseite geben Sie Ihre E-Mail-Adresse an und erhalten einen Bestätigungslink. Über diesen Link legen Sie Ihr Passwort fest; erst dann entsteht das Konto. Ob es für eine Adresse bereits ein Konto gibt, verrät die Seite bewusst nicht.',
                p2: 'Stammt Ihre Adresse von einer Domain, die die Administration freigeschaltet hat, ist das Konto sofort aktiv. Andernfalls wartet es auf Freigabe; bis dahin meldet die Anmeldung nur „wartet auf Freigabe“, und Sie erhalten eine E-Mail, sobald es freigeschaltet ist. Den zweiten Anmeldefaktor richten Sie bei der ersten Anmeldung ein.',
            },
            s9: {
                h: 'Freigabe und Funktionen',
                p1: 'Die Administration gibt jedes Konto frei und legt fest, was es nutzen darf: Schülerdaten und Ergebnisse auf dem Server (sonst bleiben sie in diesem Browser) und LaTeX-Kompilierung auf dem Server (sonst kompiliert der Browser). Prüfungen und Aufgaben liegen immer auf dem Server. Nicht freigeschaltete Optionen zeigt die App als „nicht freigeschaltet“ an.',
                p2: 'Wird „Schülerdaten auf dem Server“ später abgeschaltet, bittet die App beim nächsten Öffnen darum, die Ergebnisse in den Browser zu verschieben. Dabei geht nichts verloren.',
            },
            s10: {
                h: 'Für Administratoren: Einladungen und erlaubte Domains',
                p1: 'Unter Benutzerverwaltung laden Sie Personen per E-Mail ein; das Konto ist sofort freigegeben, und die Person legt über den Link ihr Passwort fest. Offene Registrierungen geben Sie dort frei oder lehnen sie ab; eine Ablehnung löscht die Registrierung.',
                p2: 'Registrierungen von „immer erlaubten“ Domains werden nach der E-Mail-Bestätigung automatisch freigegeben. Tragen Sie nur Domains ein, deren Postfächer Ihre Einrichtung selbst vergibt, nie öffentliche Anbieter.',
            },
        },
        privacy: {
            title: 'Datenschutz & Sicherheit',
            summary: 'Was verschlüsselt ist, was die Sitzung schützt, wie lange Daten bleiben.',
            s1: {
                h: 'Zero Knowledge',
                p1: 'Der Schlüssel wird im Browser aus Ihrem Passwort abgeleitet (Argon2id, HKDF-SHA-256) und niemals übertragen. Verschlüsselt wird mit AES-256-GCM, bevor etwas geschrieben oder gesendet wird.',
                p2: 'Ein Server sieht daher immer nur Chiffrat. Auch bei einem Einbruch in die Serverdatenbank bleiben Klausur- und Schülerdaten unlesbar.',
            },
            s2: {
                h: 'Sitzungshygiene',
                p1: 'Sperren Sie die Sitzung, wenn Sie den Rechner verlassen — danach liegen keine entschlüsselten Daten mehr im Speicher. Nach längerer Inaktivität geschieht das automatisch.',
            },
            s3: {
                h: 'Aufbewahrung',
                p1: 'Klausuren tragen eine Aufbewahrungsfrist, nach deren Ablauf sie entfernt werden können. Schülerbezogene Daten lassen sich einzeln löschen, ohne die Statistik der Klausur zu verlieren.',
            },
            s4: {
                h: 'Kein Passwort, keine Daten',
                p1: 'Es gibt keine Hintertür und keine Wiederherstellung durch die Serverbetreiber. Verlieren Sie Passwort und Wiederherstellungscode, sind die verschlüsselten Inhalte Ihres Kontos endgültig verloren — im Hybrid-Modus auch die Ergebnisse, die nur in diesem Browser liegen. Sichern Sie diese deshalb regelmäßig als .bgproj-Archiv.',
            },
        },
    },
} as const;
