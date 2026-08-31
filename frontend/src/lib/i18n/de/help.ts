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
        storageLocal:
            'Alles bleibt verschlüsselt im Browser dieses Geräts. Kein Byte erreicht einen Server — dafür gibt es auch keine Synchronisierung und kein Backup außer dem .bgproj-Archiv.',
        storageServer:
            'Alle Daten werden synchronisiert, aber ausschließlich als Chiffrat. Der Schlüssel bleibt im Browser, der Server kann die Inhalte nicht lesen.',
        storageHybrid:
            'Aufgaben und Klausurvorlagen liegen auf dem Server (gut für ein Fachschafts-Repertoire), Schülerdaten und Korrekturen bleiben ausschließlich lokal.',
        latexLocal:
            'Die Klausur wird direkt im Browser gesetzt (WebAssembly-XeLaTeX). Der LaTeX-Quelltext verlässt das Gerät nicht, der erste Lauf dauert dafür länger.',
        latexServer:
            'Der Server setzt die Klausur. Schneller auf schwacher Hardware, dafür wird der LaTeX-Quelltext übertragen.',
        variantKey:
            'Varianten sind unterschiedliche Fassungen derselben Aufgabe (Gruppe A/B/C). Sie teilen sich Auswertung und Statistik, verhindern aber das Abschreiben.',
        mcPenalty:
            'Punktabzug für falsch angekreuzte Optionen. 0 bedeutet: keine Minuspunkte. Die Gesamtpunktzahl einer Aufgabe wird nie negativ.',
        blindGrading:
            'Während der Korrektur wird nur das Pseudonym angezeigt, nie der Name. Erst nach dem Korrekturgang werden Ergebnis und Person wieder verknüpft.',
        pseudonymQr:
            'Jeder Bogen trägt einen QR-Code für Klausur, Variante und Schülerplatz. Beim Scannen wird der Stapel daran automatisch getrennt und zugeordnet.',
        gradingKey:
            'Der Notenschlüssel bestimmt, ab welcher Punktzahl welche Note gilt — linear, Oberstufen-gewichtet oder mit eigenen Grenzen.',
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
                h: 'Arbeitsbereich sichern',
                p1: 'Im lokalen Modus liegen alle Daten nur in diesem Browser. Sichern Sie den Arbeitsbereich regelmäßig als passwortgeschütztes .bgproj-Archiv — darüber lässt er sich auch auf ein anderes Gerät übertragen.',
            },
        },
        storageModes: {
            title: 'Speicherorte & Verschlüsselung',
            summary: 'Wo Ihre Daten liegen — lokal, auf dem Server oder gemischt.',
            s1: {
                h: 'Die drei Speicherstrategien',
                l1: 'Nur lokal (Voreinstellung): Klausuren, Aufgaben, Schülerdaten und Scans bleiben verschlüsselt im Browser. Es erreicht kein Byte einen Server.',
                l2: 'Nur Server: Alles wird synchronisiert, aber ausschließlich als AES-256-GCM-Chiffrat. Der Server speichert die Blobs, lesen kann er sie nicht.',
                l3: 'Hybrid: Aufgabenbibliothek und Klausurvorlagen liegen auf dem Server, Schülerdaten und Korrekturergebnisse bleiben lokal.',
            },
            s2: {
                h: 'Was verschlüsselt wird',
                p1: 'Verschlüsselt sind die Inhalte: Aufgabentexte, Klausurtexte, Schülerdaten, Scans, Annotationen und Punkte. Unverschlüsselt bleiben nur technische Verknüpfungsfelder wie IDs und Reihenfolgen.',
                p2: 'Ohne das Passwort sind die gespeicherten Daten nicht wiederherstellbar — auch nicht durch die Serverbetreiber. Ein vergessenes Passwort bedeutet den Verlust des lokalen Arbeitsbereichs.',
            },
            s3: {
                h: 'Strategie wechseln',
                p1: 'Die Speicherstrategie lässt sich jederzeit in den Einstellungen ändern. Bereits vorhandene Daten werden dabei in den neuen Modus übernommen.',
            },
        },
        exercises: {
            title: 'Aufgabenbibliothek',
            summary: 'Aufgaben anlegen, verschlagworten, in Varianten und Versionen pflegen.',
            s1: {
                h: 'Sammeln statt kopieren',
                p1: 'Aufgaben liegen in einer gemeinsamen Bibliothek und werden nach Jahrgang, Fach und Thema verschlagwortet. Jede Aufgabe ist ein LaTeX-Fragment mit Live-Vorschau; die Punktzahl wird automatisch aus dem Quelltext gelesen.',
                p2: 'Über die Filter oben lassen sich Aufgaben nach Jahrgang, Fach und Thema eingrenzen und für eine neue Klausur wiederverwenden.',
            },
            s2: {
                h: 'Varianten und Versionen',
                p1: 'Varianten sind gleichwertige Fassungen derselben Aufgabe, etwa für die Gruppen A und B. Sie werden gemeinsam ausgewertet, erschweren aber das Abschreiben.',
                p2: 'Versionen halten die Korrekturgeschichte fest: Eine überarbeitete Aufgabe ersetzt die alte, ohne dass die Auswertung vergangener Klausuren verloren geht.',
            },
            s3: {
                h: 'Multiple Choice',
                p1: 'Aufgaben können Freitext, Single Choice oder Multiple Choice sein. Für Ankreuzaufgaben werden Optionen, richtige Antworten und ein optionaler Punktabzug hinterlegt.',
                p2: 'Mehrere Ankreuzaufgaben lassen sich zu einer MC-Gruppe zusammenfassen. Das ist reine Layout-Information für den Druck — bewertet und ausgewertet wird weiterhin jede Frage einzeln.',
            },
            s4: {
                h: 'Bilder und Dateien',
                p1: 'Zu jeder Aufgabe lassen sich Dateien hochladen, die der LaTeX-Quelltext einbindet, etwa Abbildungen über \\includegraphics. SVG wird nicht unterstützt — bitte vorher in PDF umwandeln.',
                p2: 'Fehlt eine Grafik, bricht der Satz nicht ab: Die Klausur wird trotzdem gesetzt, die fehlende Datei aber gemeldet. Prüfen Sie die Vorschau, bevor Sie drucken.',
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
                p1: 'Beim Setzen entsteht ein druckfertiges PDF mit QR-Code — je Klausur, Variante und Schülerplatz ein eigener Code. Im lokalen Modus läuft der Satz vollständig im Browser.',
                p2: 'Drucken Sie die Bögen so aus, wie sie gesetzt wurden. Der QR-Code muss lesbar bleiben, sonst kann der Scan später nicht automatisch zugeordnet werden.',
            },
        },
        scanning: {
            title: 'Scannen & Zuordnen',
            summary: 'Vom Papierstapel zum zugeordneten, verschlüsselten Bogen.',
            s1: {
                h: 'Stapel einlesen',
                p1: 'Scannen Sie den kompletten Stapel am Schulkopierer in ein einziges PDF und laden Sie es hier hoch. Examance trennt es anhand der QR-Codes in einzelne Abgaben.',
                p2: 'Jede Seite wird sofort im Browser verschlüsselt. Im lokalen Modus verlässt der Scan das Gerät nicht.',
            },
            s2: {
                h: 'Pseudonyme statt Namen',
                p1: 'Der QR-Code verweist auf ein Pseudonym, nicht auf einen Namen. Die Verknüpfung zwischen Person und Abgabe wird getrennt gespeichert und erst nach der Korrektur wieder hergestellt.',
            },
            s3: {
                h: 'Wenn die Zuordnung nicht klappt',
                p1: 'Unlesbare oder fehlende QR-Codes landen in der Prüfansicht. Dort lassen sich Seiten von Hand der richtigen Abgabe zuweisen oder über den Ersatzcode auf dem Bogen nachtragen.',
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
                p1: 'Korrekturzeichen entstehen auf einer Ebene über dem Scan. Das Original bleibt unverändert und lässt sich jederzeit wieder ohne Anmerkungen anzeigen.',
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
                h: 'Verteilung',
                p1: 'Die Auswertung zeigt Notenverteilung, Durchschnitt und Streuung der Klausur sowie die Punkteverteilung über alle Abgaben.',
            },
            s2: {
                h: 'Aufgabenanalyse',
                p1: 'Pro Aufgabe sehen Sie die durchschnittlich erreichte Punktzahl. Auffällig schwache Werte zeigen entweder eine Wissenslücke oder eine missverständlich gestellte Aufgabe.',
            },
            s3: {
                h: 'Export',
                p1: 'Ergebnisse lassen sich als CSV oder XLSX exportieren, etwa zur Übernahme in die Notenverwaltung der Schule. Der Export enthält Klarnamen — behandeln Sie die Datei entsprechend.',
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
            summary: 'Speicherstrategie, LaTeX-Kompilierung, Sprache und Datenlöschung.',
            s1: {
                h: 'Speicherstrategie',
                p1: 'Legt fest, wo Aufgaben, Klausuren und Schülerdaten liegen. Die Voreinstellung ist der rein lokale Modus.',
            },
            s2: {
                h: 'LaTeX-Kompilierung',
                p1: 'Unabhängig davon lässt sich wählen, wo die Klausur gesetzt wird: im Browser (nichts verlässt das Gerät, dafür langsamer beim ersten Lauf) oder auf dem Server (schneller auf schwacher Hardware).',
                p2: 'Der erste Satz im Browser lädt die LaTeX-Umgebung nach. Schlägt er mit einer Meldung über eine fehlende .sty-Datei fehl, hilft ein zweiter Versuch, sobald der Download abgeschlossen ist.',
            },
            s3: {
                h: 'Sprache',
                p1: 'Die Oberfläche gibt es auf Deutsch und Englisch, umschaltbar hier oder über die Statusleiste. Die gedruckte Klausur bleibt davon unberührt — sie ist immer auf Deutsch.',
            },
            s4: {
                h: 'Sitzung und Löschung',
                p1: 'Die Sitzung sperrt sich nach Inaktivität von selbst; danach sind alle Inhalte wieder nur mit dem Passwort erreichbar.',
                p2: 'Über die Datenlöschung lassen sich einzelne Schülerdaten (Auskunfts- und Löschansprüche nach DSGVO) oder der gesamte Arbeitsbereich entfernen. Das Löschen ist endgültig und kann nicht rückgängig gemacht werden.',
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
            summary: 'Wann ein Konto nötig ist, welche Rollen es gibt, wie Passwörter zurückgesetzt werden.',
            s1: {
                h: 'Braucht es ein Konto?',
                p1: 'Im rein lokalen Modus nicht: Der Arbeitsbereich wird nur mit einem Passwort geschützt. Ein Konto ist erst nötig, wenn Daten über einen Server synchronisiert werden sollen.',
            },
            s2: {
                h: 'Rollen',
                p1: 'Lehrkräfte sehen ausschließlich ihre eigenen Klausuren. Administratorinnen und Administratoren verwalten zusätzlich die Konten der Schule — sie erhalten dadurch keinen Zugriff auf fremde Klausurinhalte, denn diese sind clientseitig verschlüsselt.',
            },
            s6: {
                h: 'Zwei Anmeldefaktoren',
                p1: 'Jede Anmeldung verlangt zwei von drei Faktoren: Passwort, Authenticator-App und Passkey. Damit nützt ein erratenes Passwort allein nichts.',
                p2: 'Richten Sie nach Möglichkeit alle drei ein — dann ist der Verlust eines einzelnen Faktors nur lästig. Mit genau zwei bedeutet der Verlust eines Faktors, dass nur die Administration wieder Zugang verschaffen kann, und zwar nur zum Konto, nicht zu den verschlüsselten Daten. Backup-Codes ersetzen die Authenticator-App und funktionieren je einmal.',
            },
            s7: {
                h: 'Passkeys',
                p1: 'Ein Passkey meldet Sie mit Fingerabdruck, Gesicht oder Geräte-PIN an — ohne Passwort. Er zählt als einer der zwei nötigen Faktoren, nicht als Ersatz für beide.',
                p2: 'Ob ein Passkey auch Ihre verschlüsselten Daten öffnen kann, hängt vom Gerät ab. Die Einstellungen zeigen das je Passkey an. Wo es nicht möglich ist, bleiben Passwort und Wiederherstellungscode dafür zuständig.',
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
                p1: 'Es gibt keine Hintertür und keine Wiederherstellung. Verlieren Sie das Passwort zu einem lokalen Arbeitsbereich, sind dessen Inhalte endgültig verloren — sichern Sie deshalb regelmäßig ein .bgproj-Archiv.',
            },
        },
    },
} as const;
