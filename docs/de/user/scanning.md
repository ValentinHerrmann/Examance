---
editLink: false
---

# Scannen und Zuordnen

Nach der Prüfung wird der ganze Stapel beschriebener Bögen zu einem PDF. Examance trennt es anhand der QR-Codes in eine Abgabe pro Schülerin oder Schüler, verschlüsselt jede Seite in Ihrem Browser und erkennt die angekreuzten Kästchen der Multiple-Choice-Fragen.

## Den Stapel scannen {#scan}

- Scannen Sie den **ganzen Stapel am Schulkopierer in ein einziges PDF**. Mehrere PDFs funktionieren ebenfalls; Sie können sie zusammen oder nacheinander hochladen.
- Die Reihenfolge spielt keine Rolle: Die QR-Codes sagen Examance, welche Seite zu wem gehört.

![Synthetisch gescannte Prüfungsseite](../../screenshots/pitch/17-scanned-sheet.jpg)

## Die Scans einlesen {#import}

Im Schritt **Scans** der Prüfung liest **Scan-Dateien auswählen (nur PDF)** die Dateien ein. Examance

1. liest den QR-Code auf jeder Seite,
2. fasst die Seiten je Schülerplatz zu einer Abgabe („Bogen“) zusammen,
3. **verschlüsselt jede Seite im Browser**, bevor sie gespeichert wird.

Im Hybrid-Modus verlassen die Scans Ihr Gerät nie; im Modus „Alles auf dem Server“ erreichen sie den Server nur als Chiffrat. (Die einzige optionale Ausnahme sind anonymisierte Bildausschnitte einzelner Kästchen, wenn Sie [MC-Erkennung verbessern](./settings#donation) eingeschaltet haben.)

Die Liste darunter zeigt jede eingelesene Abgabe. Von dort aus können Sie einen Scan ansehen, als PDF exportieren, einen versehentlich zusammengeführten Bogen **Teilen**, eine Bewertung löschen oder den Scan löschen.

![Scan-Import](../../screenshots/pitch/05-scan-import.jpg)

## Pseudonyme statt Namen {#pseudonyms}

Der QR-Code verweist auf ein **Pseudonym**, nicht auf einen Namen. Die Verknüpfung zwischen Person und Abgabe wird getrennt und verschlüsselt gespeichert und erst nach der Korrektur verwendet (für die Notenliste und den Export). Das macht die [anonyme Korrektur](./grading#blind) möglich.

## Wenn die Zuordnung nicht klappt {#assignment}

Seiten, deren QR-Code unlesbar ist oder fehlt, stehen unter **Nicht zugeordnete Abgaben**. Jedes Deckblatt trägt einen aufgedruckten **Ersatzcode** (etwa `A-X7K2M9`): Geben Sie ihn ein, und **Code verknüpfen** ordnet die Abgabe zu.

Typische Ursachen sind eine geknickte oder gefaltete Ecke, ein von Handschrift verdeckter Code oder eine skaliert gedruckte Seite.

## MC-Erkennungen prüfen {#mc-verification}

Angekreuzte Kästchen werden beim Einlesen automatisch erkannt, auch zurückgenommene Kreuze (ein ganz ausgemaltes Kästchen) und wieder gewählte Kästchen (ein Kreuz links neben einem ausgemalten Kästchen); die Prüfungsoption [Wie man ein Kreuz korrigiert](./exams#mc-hint) druckt diese Regeln zu jeder Ankreuzaufgabe. Der Schritt **MC prüfen** listet jede Erkennung in drei Warteschlangen auf:

- **a) Fehlgeschlagene Erkennungen**: Die Seite konnte nicht ausgerichtet werden; vergeben Sie diese Punkte in der [Korrekturansicht](./grading#multiple-choice).
- **b) Unsichere / mehrdeutige Erkennungen**: Bitte sehen Sie sich jede davon an.
- **c) Alle übrigen Erkennungen**: sichere; kein Handeln nötig.

Öffnen Sie einen Eintrag, sehen Sie den Ausschnitt der Frage auf dem Scan, die Antwortoptionen wie gedruckt und die erkannten Markierungen. Bestätigen Sie die Erkennung oder schalten Sie Kästchen um, um sie zu korrigieren. Jede bestätigte oder korrigierte Frage gilt als **geprüft**.

- Beim Bestätigen bleibt die gespeicherte Punktzahl erhalten, auch eine von Hand eingetragene; erst das Umschalten eines Kästchens berechnet sie neu. Weicht die gespeicherte Punktzahl vom Lösungsschlüssel ab, bietet die Karte **Schlüssel-Punkte übernehmen** an.
- Die Ansicht bewertet mit dem **aktuellen** Lösungsschlüssel der Aufgabe. Passt die Zahl der Kästchen auf dem Scan nicht mehr zur Aufgabe (weil sie nach dem Druck geändert wurde), weist die Ansicht darauf hin und bewertet die Frage nicht; vergeben Sie die Punkte dann in der Korrekturansicht.
- **Stichprobe prüfen** öffnet eine zufällige sichere Erkennung, die noch niemand geprüft hat, sodass Sie auch unauffällige Fragen kontrollieren können.

![MC-Prüfung](../../screenshots/pitch/07-mc-review.jpg)

### Unsichere Markierungen {#unsure}

Neben dem Füllgrad eines Kästchens betrachtet die Erkennung auch die **Form** einer Markierung:

- Ein gleichmäßig ausgefülltes Kästchen gilt als **zurückgenommen** (die übliche Art, ein Kreuz zu streichen);
- eine Markierung, die weit über das Kästchen hinausreicht, oder eine sehr blasse wird als **unsicher** gekennzeichnet. Der Grund steht neben der Option.

Bis zur Prüfung zählt ein unsicheres Kästchen vorläufig als das Ergebnis, dem seine Messwerte näher liegen, angekreuzt oder nicht angekreuzt; die Ansicht zeigt dazu „Vorläufig als angekreuzt / nicht angekreuzt gewertet“. Unsichere Kästchen behalten ihren gelben Rahmen, bis die Frage geprüft ist.

![Eine gescannte Multiple-Choice-Seite](../../screenshots/pitch/18-scanned-sheet-mc.jpg)

## Erkennung erneut ausführen {#rerun}

**MC-Erkennung erneut ausführen** wertet alle Scans mit den aktuellen Einstellungen neu aus:

- **Nicht geprüfte** Fragen übernehmen das neue Ergebnis;
- **geprüfte** Fragen behalten Ihre Antwort und Punktzahl; nur ihre Erkennung wird zum Vergleich neu berechnet;
- von Hand eingetragene Punktzahlen bleiben unberührt.

Ein Dialog zeigt zuerst, was sich ändert und ob die Einstellungen vom letzten Lauf abweichen. **Manuelle Verifikation zurücksetzen** bewirkt das Gegenteil: Jede Frage geht auf ihre ursprüngliche Erkennung zurück, und alle Bestätigungen und Korrekturen gehen verloren.

## Erkennungsverfahren und Einstellungen {#detection-methods}

Unter **Einstellungen → MC-Erkennung** wählen Sie das Verfahren:

- **v4** (Standard) analysiert die Strichform;
- **v2** (älter) misst den Füllgrad; seine Formanalyse lässt sich abschalten.

Das jeweils andere Verfahren läuft immer mit. Der Bereich **Erkennungseinstellungen** der Prüfansicht zeigt, wie viele Ihrer geprüften Kästchen jedes Verfahren richtig erkannt hätte, und vergleicht die Einstellungen des letzten Laufs mit denen, die ein erneuter Lauf verwenden würde. Wie Sie die Schwellenwerte feinjustieren: [MC-Erkennung feinjustieren](./settings#mc-detection).
