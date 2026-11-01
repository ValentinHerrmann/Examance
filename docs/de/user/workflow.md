---
editLink: false
---

# Von der Aufgabe zur Auswertung

Der übliche Weg einer Prüfung durch Examance in sechs Schritten. Jeder Schritt verweist auf seine ausführliche Seite.

## 1. Aufgaben in der Bibliothek sammeln {#library}

Aufgaben liegen in Ihrer Bibliothek, verschlagwortet nach Jahrgang, Fach und Thema, sodass Sie sie wiederverwenden statt zu kopieren. Jede Aufgabe ist ein LaTeX-Fragment mit Live-Vorschau; ihre Punktzahl wird automatisch aus dem Quelltext gezählt.

- **Varianten** sind gleichwertige Fassungen derselben Aufgabe (zum Beispiel Gruppe A und B); sie werden gemeinsam ausgewertet.
- **Versionen** halten die Korrekturgeschichte fest: Eine überarbeitete Aufgabe entwertet die Auswertung vergangener Prüfungen nicht.
- **Multiple Choice**: Single- und Multiple-Choice-Aufgaben speichern ihre Optionen und den Lösungsschlüssel und werden auf den Scans automatisch erkannt.
- **Teilen** (sofern Ihre Installation es erlaubt): Teilen Sie eine Aufgabe mit allen Konten der Installation, übernehmen Sie Aufgaben, die andere geteilt haben, und schlagen Sie dem Original Verbesserungen vor.

Mehr: [Aufgabenbibliothek](./exercises), [Aufgaben teilen](./sharing).

![Aufgabenbibliothek](../../screenshots/pitch/02-library.jpg)

## 2. Prüfung zusammenstellen und setzen {#exam}

**Neue Prüfung** fragt die Kopfdaten ab (Fach, Klasse, Testart, Datum) und öffnet dann die Prüfungsseite. Dort wählen Sie Aufgaben aus der Bibliothek, ordnen sie, fassen Multiple-Choice-Fragen zu Gruppen zusammen und legen den Notenschlüssel fest. Beim Setzen entsteht ein druckfertiges PDF mit QR-Codes, je einer pro Prüfung, Variante und Schülerplatz, in Ihrem Browser oder auf dem Server.

**Duplizieren** legt eine neue Prüfung mit denselben Aufgaben und Einstellungen an, zum Beispiel für eine Parallelklasse; Schülerdaten und Ergebnisse werden nie mitkopiert.

Mehr: [Prüfung erstellen](./exams).

![Prüfungseditor](../../screenshots/pitch/04-exam-builder.jpg)

## 3. Drucken, schreiben, scannen {#print}

Drucken Sie die Bögen genau so, wie sie gesetzt wurden (ohne Skalierung); die QR-Codes müssen lesbar bleiben. Scannen Sie nach der Prüfung den ganzen Stapel am Schulkopierer in ein einziges PDF.

Mehr: [Drucken](./exams#print), [Stapel scannen](./scanning#scan).

## 4. Scan einlesen {#scan}

Laden Sie das PDF im Schritt **Scans** der Prüfung hoch. Examance trennt es anhand der QR-Codes in Abgaben und verschlüsselt jede Seite sofort im Browser. Der QR-Code verweist auf ein Pseudonym, nicht auf einen Namen. Seiten mit unlesbaren Codes ordnen Sie zu, indem Sie den auf dem Bogen aufgedruckten Ersatzcode eingeben.

Angekreuzte Multiple-Choice-Kästchen werden beim Einlesen erkannt. Ein Kreuz nehmen Schülerinnen und Schüler zurück, indem sie das Kästchen ganz ausmalen; ein ausgemaltes Kästchen wählen sie wieder, indem sie links daneben kreuzen. Die Prüfungsoption „Bei jeder Multiple-Choice-Aufgabe zeigen, wie man ein Kreuz korrigiert“ druckt das als kurze Zeile zu jeder Ankreuzaufgabe. In der MC-Prüfansicht bestätigen oder korrigieren Sie unsichere Erkennungen.

Mehr: [Scannen und Zuordnen](./scanning).

![Scan-Import](../../screenshots/pitch/05-scan-import.jpg)

## 5. Anonym korrigieren {#grade}

Beim Korrigieren sehen Sie die Handschrift und die Antworten, aber nicht den Namen. Korrekturzeichen entstehen auf einer Ebene über dem Scan (das Original bleibt unverändert), Punkte werden pro Aufgabe oder pro Teilaufgabe (a), b), …) vergeben, und Summe und Note ergeben sich aus dem Notenschlüssel. Die auf der Prüfung gedruckten Punktekästchen neben jeder Aufgabe und Teilaufgabe und in der Tabelle am Ende füllen sich auf dem Scan und im korrigierten PDF automatisch. Auf Papier korrigierte Arbeiten tragen Sie in einem Punkteraster ein oder fügen sie aus Excel ein.

Mehr: [Korrigieren](./grading).

![Korrektur](../../screenshots/pitch/06-grading.jpg)

## 6. Ergebnisse, Auswertung und Export {#results}

- **Prüfungsstatistik**: Noten- und Prozentverteilung, Durchschnitt, Bestehensquote, Grenzfälle, Analyse je Aufgabe und Variantenvergleich.
- **Auswertung über mehrere Prüfungen**: Themen-Heatmaps, Aufgabenqualität und Variantenfairness im Zeitverlauf, Noten und Fächer.
- **Export**: CSV für die Notenverwaltung der Schule (enthält Klarnamen) oder ein lesbares ZIP mit den korrigierten Abgaben als PDF mit eingezeichneten Korrekturen, dem LaTeX-Quelltext und einer statistischen Zusammenfassung.
- **Sicherung**: Ein passwortgeschütztes `.examance`-Archiv sichert oder verschiebt einen ganzen Arbeitsbereich.

Mehr: [Ergebnisse und Auswertung](./results), [Sicherung und Übertragung](./backup).

![Ergebnisse](../../screenshots/pitch/08-results.jpg)
