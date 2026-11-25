---
editLink: false
---

# Einstellungen

Die **Einstellungen** (dorthin führt auch die Angabe **Daten** in der Navigationsleiste) sind in **Allgemein**, **Arbeitsbereich** und **Konto & Datenschutz** gegliedert. Manche Einstellungen gehören zu Ihrem Konto und gelten in jedem Browser; andere werden nur in dem Browser gespeichert, den Sie gerade verwenden. Jeder Abschnitt unten sagt, was zutrifft.

![Speicherort in den Einstellungen](../../screenshots/guide/settings-storage.jpg)

## Speicherort {#storage}

*Gehört zu Ihrem Konto.* Legt fest, wo die **Ergebnisse** (Schülerdaten, Abgaben mit Scans, Punkte) liegen. Aufgaben und Prüfungen liegen immer auf dem Server.

| Modus | Ergebnisse liegen | Geeignet für |
|---|---|---|
| **Alles auf dem Server** | auf dem Server, vorher in Ihrem Browser verschlüsselt; in jedem Browser Ihres Kontos verfügbar | Arbeiten auf mehreren Geräten |
| **Hybrid** | nur in dem Browser, in dem Sie sie erfasst haben, verschlüsselt in dessen lokaler Datenbank | Ergebnisse auf einem Gerät behalten |

Sie wählen bei der ersten Anmeldung; es gibt keine Voreinstellung. Welche Modi Ihr Konto nutzen darf, legt Ihre Administration fest („nicht freigeschaltet“ kennzeichnet einen Modus, den Sie nicht nutzen dürfen).

In beiden Modi kann der Server Ihre Ergebnisse nicht lesen: Sie sind mit einem aus Ihrem Passwort abgeleiteten Schlüssel verschlüsselt. Siehe [Verschlüsselung](./security#encryption).

### Den Modus wechseln {#switching}

Sie können jederzeit wechseln. Der Wechsel **verschiebt die Ergebnisse direkt**, Prüfung für Prüfung, und prüft, dass jeder Datensatz angekommen ist, bevor sich der Modus Ihres Kontos ändert; danach lädt die Seite neu. Es ist kein Export und erneuter Import nötig, aber der Dialog bietet vorher eine `.examance`-Sicherung an.

- **Noch nicht übertragene Änderungen** müssen zuerst gesendet werden (**Jetzt senden**), sonst wird der Wechsel abgelehnt.
- **Andere geöffnete Tabs** sind währenddessen gesperrt und laden danach neu.
- **Die alte Kopie**: Examance fragt, ob Sie sie behalten oder löschen möchten. Beim Wechsel zu Hybrid wird die Kopie auf dem Server zum Löschen vorgemerkt: Sie wird nach 7 Tagen Frist entfernt und lässt sich in der App nicht zurückholen ([Details](#restore)); beim Wechsel zu „Alles auf dem Server“ wird die lokale Kopie für jede vollständig angekommene Prüfung geleert. Eine Prüfung, die nicht verschoben werden konnte, behält ihre lokale Kopie.

Schaltet eine Administratorin oder ein Administrator „Schülerdaten auf dem Server“ für Ihr Konto ab, bittet die App Sie beim nächsten Öffnen, Ihre Ergebnisse in den Browser zu verschieben. Dabei geht nichts verloren.

### Hinweise zu lokalen Daten {#notices}

- Ein Browser im Modus „Alles auf dem Server“, der noch lokale Ergebnisse enthält (zum Beispiel aus früherer Hybrid-Nutzung), bietet an, sie **hochzuladen**.
- Im Hybrid-Modus weist ein Browser ohne Ergebnisse darauf hin: Die Ergebnisse liegen nur in dem Browser, in dem sie erfasst wurden.
- Der lokale Speicher eines Browsers gehört genau **einem Konto auf einem Server**. Daten eines anderen Kontos werden nicht geöffnet; der Hinweis erklärt, wie Sie sich mit dem passenden Konto anmelden oder den Speicher zurücksetzen.
- Daten aus dem früheren rein lokalen Modus (ohne Konto) lassen sich nicht mehr öffnen. Sie können sie löschen und weiterarbeiten; sie werden nicht übernommen.

### Gelöschtes zurückholen {#restore}

Was Sie in der App löschen (Prüfungen, Aufgaben, Dateien, Logos, Schüler:innen, Scans, Punkte und Bewertungen), liegt 7 Tage lang im [Papierkorb](./trash) und lässt sich dort wiederherstellen. Anders ist es mit der **Kopie auf dem Server, die nach einem Wechsel zu Hybrid übrig bleibt**: Sie wird zur Sicherheit ebenfalls 7 Tage aufbewahrt, liegt aber nicht im Papierkorb und lässt sich in der App nicht zurückholen. Ihre Ergebnisse sind nach dem Wechsel in diesem Browser, es geht also nichts verloren.

## LaTeX-Kompilierung {#latex}

*Wird in diesem Browser gespeichert.* Legt unabhängig vom Speicherort fest, wo Prüfungen und Aufgaben gesetzt werden:

- **Im Browser** (empfohlen, voreingestellt): am schnellsten, mit Live-Vorschau beim Tippen; der LaTeX-Quelltext verlässt zum Kompilieren Ihr Gerät nicht. Er verwendet dasselbe TeX Live wie der Server, ein Dokument sieht also auf beiden Wegen gleich aus. Die Engine und die Dateien, die die Prüfungsvorlage braucht (etwa 30 MB), werden nach der Anmeldung (oder beim Umstellen auf diese Option) einmalig im Hintergrund heruntergeladen; bis dahin dauert der erste Lauf länger. Ein Paket, das Ihre Dokumente zum ersten Mal verwenden, wird bei Bedarf von Ihrem Examance-Server geholt und danach im Browser behalten. Kann die Engine auf Ihrem Gerät nicht laufen (zu wenig Arbeitsspeicher, oder sie lädt nicht), kompiliert Examance stattdessen auf dem Server, sofern Ihr Konto das erlaubt, und fragt, ob dieser Browser ab jetzt auf dem Server kompilieren soll. Ein LaTeX-Fehler in Ihrem Dokument wird wie gewohnt angezeigt; er schlüge auch auf dem Server fehl.
- **Server**: langsamer und ohne Live-Vorschau; der LaTeX-Quelltext wird an den Server gesendet. Nur verfügbar, wenn Ihr Konto es erlaubt.

Browser, die bisher auf dem Server kompiliert haben, wurden einmalig auf den Browser umgestellt, mit einem kurzen Hinweis nach der Anmeldung; **Weiter auf dem Server kompilieren** in diesem Hinweis oder diese Einstellung stellt zurück.

## Sprache und Farbschema {#language}

*Wird in diesem Browser gespeichert.* Die Oberfläche gibt es auf Deutsch und Englisch; das Farbschema kann hell, dunkel oder **Wie System** sein. Beides lässt sich auch in der Navigationsleiste umschalten. Keines von beiden betrifft die gedruckte Prüfung, die immer auf Deutsch ist.

## Stifteingabe {#pen-input}

*Wird in diesem Browser gespeichert.* Sobald Sie in der Korrekturansicht einmal einen Stift benutzen, blättern und zoomen Finger dort nur noch und zeichnen nicht mehr, damit eine aufgelegte Handfläche keine Striche macht. Die Karte zeigt, ob auf diesem Gerät ein Stift erkannt wurde. **Stifterkennung zurücksetzen** lässt Finger wieder zeichnen, bis Sie das nächste Mal einen Stift benutzen.

*Gehört zu Ihrem Konto.* **Durch Kritzeln radieren** (standardmäßig an): Ein schnelles Hin-und-her-Kritzeln mit dem Werkzeug **Stift** (per Stift, Maus oder Finger) löscht die Striche und Stempel darunter, auf jedem Gerät, auf dem Sie sich anmelden ([so funktioniert es](grading.md#tools)). **Rückgängig** in der Korrekturansicht holt alles zurück, was es gelöscht hat.

## Anordnung der Korrekturansicht {#grading-layout}

*Gehört zu Ihrem Konto.* Legt fest, auf welcher Seite der Korrekturansicht das Feld **Bewertung**, die Stempel und der Zoom liegen: **Rechtshänder: Bedienelemente links** (Standard) oder **Linkshänder: Bedienelemente rechts**. Gilt auf breiten Bildschirmen (Tablet quer und größer) auf jedem Gerät, auf dem Sie sich anmelden; auf Smartphones und Tablets im Hochformat bleiben die Bedienelemente über und unter dem Scan.

## Logo auf der Prüfung {#logo}

*Gehört zu Ihrem Konto.* Oben links auf der ersten Seite jeder Prüfung wird ein Logo gedruckt. Unter **Logo für Klausuren** laden Sie ein eigenes hoch (PNG, JPEG oder PDF, höchstens 2 MB), wählen **Kein Logo** oder setzen auf das Standardlogo zurück. Ohne Logo bleibt die Stelle frei; das Seitenlayout und die Lage der Antwortkästchen ändern sich dadurch nicht.

Eine einzelne Prüfung kann das Logo im Abschnitt **Deckblatt** des Schritts Layout der Prüfung überschreiben, siehe [Logo](./exams#logo-packages).

## LaTeX-Pakete {#packages}

*Gehört zu Ihrem Konto.* Listet die Pakete auf, die die Vorlage lädt, und lässt Sie Pakete, TikZ-Bibliotheken und Optionen für alle Ihre Prüfungen hinzufügen. Wie Pakete von Konto, Prüfung und Aufgabe zusammenwirken, steht unter [LaTeX-Pakete](./exercises#packages). Jede Änderung wird von selbst gespeichert, sobald die Liste gültig ist; die Überschrift zeigt **Wird gespeichert …** und dann **Gespeichert**.

Der Schalter **Alle Fachpakete immer laden** (wird sofort gespeichert) lässt jedes Dokument die Pakete für Chemie, Schaltkreise, UML, Struktogramme, Quelltext und SVG laden, auch wenn es sie nicht verwendet. Lassen Sie ihn für schnelleres Kompilieren aus; die Liste der Vorlage kennzeichnet diese Pakete als **wird bei Bedarf geladen**.

![LaTeX-Pakete für das ganze Konto](../../screenshots/guide/settings-latex-packages.jpg)

## MC-Erkennung feinjustieren {#mc-detection}

*Wird in diesem Browser gespeichert.* Wählen Sie das Erkennungsverfahren (v4 oder v2, siehe [Erkennungsverfahren](./scanning#detection-methods)) und passen Sie die Schwellenwerte an, zum Beispiel wenn ein Scanner sehr helle oder sehr dunkle Scans erzeugt. Die Standardwerte passen zu den meisten Scannern.

![MC-Erkennung feinjustieren](../../screenshots/guide/settings-mc-detection.jpg)

- Änderungen gelten nur für **künftige** Erkennungsläufe (neue Scans oder **MC-Erkennung erneut ausführen**). Bereits erkannte und geprüfte Ergebnisse ändern sich nicht.
- Jeder Lauf speichert die verwendeten Werte mit, sodass die Prüfansicht sie vergleichen kann.
- Jede Änderung wird von selbst gespeichert; der Kartenkopf zeigt **Wird gespeichert …** und dann **Gespeichert**. Ein Wert außerhalb des erlaubten Bereichs wird rot markiert und erst gespeichert, wenn er stimmt.
- **Auf Standardwerte zurücksetzen** stellt die mitgelieferten Werte wieder her.

## Neue Aufgaben teilen {#share-default}

*Gespeichert mit Ihrem Konto; nur sichtbar, wenn Ihr Konto teilen darf.* Nach dem Speichern einer eigenen, noch nicht geteilten Aufgabe fragt Examance einmal, ob Sie sie teilen möchten (siehe [Aufgaben teilen](./sharing#ask-after-save)). Hier wählen Sie:

- **Jedes Mal fragen** (Standard): Die Frage erscheint einmal pro Aufgabe.
- **Immer teilen**: Neue Aufgaben werden ohne Nachfrage geteilt. Dafür bestätigen Sie, dass Ihre Aufgaben keine personenbezogenen Daten von Schülerinnen und Schülern enthalten und Sie sie weitergeben dürfen.
- **Nie teilen**: Es wird nicht gefragt; teilen können Sie weiterhin in der Bibliothek.

## MC-Erkennung verbessern (freiwillig) {#donation}

*Wird in diesem Browser gespeichert, standardmäßig aus.* Schalten Sie sie ein, sendet der Browser für jedes Kästchen einer Ankreuzfrage, die Sie **geprüft oder korrigiert** haben, einen kleinen Bildausschnitt an den Server Ihrer Installation: 80 × 48 Pixel, Graustufen, nur das Kästchen und sein Korrekturfeld, kein Fragetext. Dazu kommen Ihre Entscheidung (angekreuzt oder nicht), die ursprüngliche Erkennung und einige Messwerte.

Nie gesendet werden: Namen, Pseudonyme, Prüfungs-, Abgabe- oder Fragen-Kennungen, Zeitstempel. Jedes Kästchen trägt nur eine zufällige Kennung, sodass eine spätere Korrektur die frühere Wertung ersetzt. Zum Beitragen müssen Sie angemeldet sein (das dient nur dem Missbrauchsschutz; Ihr Konto wird nicht mit den Ausschnitten gespeichert).

Ziel ist ein gemeinsamer, besserer Klassifikator, damit auch neue Installationen von Anfang an eine gute Erkennung haben. Schalten Sie die Option aus, endet alles sofort, auch bereits vorbereitete Ausschnitte.

## Sitzungssperre {#session}

Die Sitzung **sperrt sich nach einer Zeit der Inaktivität selbst**; danach sind die Inhalte nur noch mit Ihrem Passwort (oder Passkey) erreichbar. Sperren Sie sie selbst, wenn Sie den Rechner verlassen: Danach bleiben keine entschlüsselten Daten im Speicher.

## Daten löschen {#deletion}

- **Einzelne Schülerinnen und Schüler**: Löschen Sie einen Schülerdatensatz, zum Beispiel bei einem Auskunfts- oder Löschersuchen nach DSGVO. Vor dem Löschen steht ein Auskunftsexport zur Verfügung. Die Statistik der Prüfung bleibt erhalten.
- **Sitzungsdaten bereinigen**: leert alles, was in diesem Browser zwischengespeichert ist.

Diese Löschungen sind endgültig und laufen nicht über den [Papierkorb](./trash).

### Ihre Kontodaten {#account-data}

**Meine Kontodaten herunterladen** speichert alles, was der Server über Ihr Konto speichert, als JSON-Datei: Ihre Kontoangaben, Ihre Prüfungen (ohne Schülerdaten) und das Protokoll Ihrer Aktionen. So sehen Sie, was gespeichert ist, oder nehmen Ihre Daten mit. Schülerdaten gehören nicht dazu: Nur Sie können sie nach dem Entsperren lesen, der Server nicht. Exportieren Sie sie pro Schülerin oder Schüler unter [Daten löschen](#deletion).

### Konto löschen {#delete-account}

**Konto löschen** sendet Ihnen eine E-Mail mit einem Bestätigungslink; gelöscht wird erst, wenn Sie ihn öffnen und bestätigen. Dann wird alles entfernt, was zum Konto auf dem Server gespeichert ist (Prüfungen, Ergebnisse, Anmeldefaktoren), und der Browser, in dem Sie bestätigen, wird geleert. Andere Browser behalten ihre lokale Kopie, die ohne das Konto nicht mehr gelesen werden kann.

Mit **Meine Aufgaben auf dem Server behalten** bleiben Ihre Aufgaben ohne Ihren Namen auf dem Server, sodass sie später geteilt werden können. Administratorinnen und Administratoren können andere Konten mit derselben Option löschen.

## Updates und Wartung {#maintenance}

Vor einem Update oder einem Wartungsfenster erinnert Examance Sie zweimal (meist 5 Minuten und 1 Minute vorher), Ihre Arbeit zu speichern. Mit **Ich habe gespeichert** sieht die Administration, dass Sie bereit sind. Ab der zweiten Erinnerung sind neue Anmeldungen kurz pausiert. Wird die Wartung abgesagt, meldet Examance das ausdrücklich.

Lassen Sie den Tab während der Unterbrechung offen: Gespeichertes ist danach wie gewohnt da, und Änderungen, die in dieser Zeit nicht ankamen, werden automatisch gesendet.

Nach einem Update fasst ein Hinweis „Aktualisiert auf …“ die Änderungen zusammen.
