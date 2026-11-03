---
editLink: false
---

# QR-Aufkleber und Ergebnisse für Schüler

Zwei Dinge gehören hier zusammen: **QR-Codes**, als Aufkleber, die Schülerinnen und Schüler auf ihren Prüfungsbogen kleben, oder direkt aufgedruckt, damit Examance weiß, wessen Arbeit es ist, und **persönliche Links**, über die jede Schülerin und jeder Schüler später die korrigierte Prüfung herunterlädt. Beide Schaltflächen finden Sie auf der Prüfungsseite. Die Schüler selbst, mit Mebis- bzw. Artemis-ID und E-Mail-Adresse, pflegen Sie an einer Stelle: auf der Seite **Schüler** der Prüfung.

## Schülerdaten {#student-data}

**Schüler** (in der Seitenleiste der Prüfung oder als Schaltfläche auf der Prüfungsseite) enthält die Klassenliste der Prüfung: Namen, Mebis- bzw. Artemis-ID und E-Mail-Adresse. Alles andere liest nur daraus: die QR-Aufkleber, die bedruckten Prüfungsexemplare und das Teilen der Ergebnisse per E-Mail, Artemis oder Mebis.

- **Klassenliste übernehmen**: **Datei wählen** liest eine Mebis-Bewertungstabelle oder Teilnehmerliste (CSV) oder eine einfache Liste; **Oder Liste einfügen** nimmt getippte oder eingefügte Zeilen (`Nachname, Vorname; ID; Adresse`, eine pro Person); **Aus einem Artemis-Kurs laden** holt die Kursmitglieder. Examance zeigt, was sich ändert (neu, aktualisiert, unverändert), und speichert erst nach **Übernehmen**. Schüler, die schon in der Liste stehen, werden über ihre ID erkannt, sonst über den Namen; dieselbe Liste noch einmal zu übernehmen, ergänzt also nur Adressen.
- Mit **Bearbeiten** korrigieren Sie in einer Zeile Namen oder E-Mail-Adresse. Derselbe Dialog bearbeitet auch mehrere auf einmal: Kreuzen Sie die Zeilen an und wählen Sie in der Leiste über der Tabelle **Bearbeiten** (ihre Schaltflächen sind ausgegraut, bis die Auswahl passt, der Grund steht darunter); Name, Schülernummer, Mebis-ID, Artemis-ID und E-Mail stehen dann in einer Tabelle. Examance nennt vorher mögliche Folgen (etwa ein umbenannter Schüler mit schon eingescannter Arbeit, eine geänderte ID, eine entfernte Adresse, eine doppelt vergebene ID); mit **Trotzdem speichern** speichern Sie trotzdem.
- **Mögliche doppelte Einträge.** Steht eine Person zweimal in der Liste (etwa Aufkleber ohne ID gedruckt, danach die Mebis- oder Artemis-Liste übernommen und dann eingescannt; oder ein Eintrag aus Mebis und einer aus Artemis), schlägt die Seite die Paare vor. **Zusammenführen** behält den Eintrag mit der eingescannten Arbeit, damit QR-Code und Schlüssel gültig bleiben, und übernimmt IDs und Adresse des anderen. Wo beide Einträge einen Wert haben, wählen Sie, welcher bleibt. Vor dem Zusammenführen zeigt Examance den entstehenden Eintrag und ob die Person dann über Mebis, Artemis und E-Mail erreichbar ist; zusammengeführt wird erst, wenn Sie **Ich habe das Ergebnis geprüft** ankreuzen. Sie können auch genau zwei Zeilen ankreuzen und **Zusammenführen** wählen. Der übernommene Eintrag kommt in den Papierkorb.
- **Löschen** sagt, was mitgeht: Ist die Arbeit eingescannt, werden Scan und alle Korrekturen mit gelöscht, und geteilte Links funktionieren nicht mehr. Das müssen Sie ausdrücklich bestätigen; alles landet im Papierkorb und lässt sich dort wiederherstellen.
- Schüler ohne ID bekommen eine feste, aus dem Namen abgeleitete ID.

Die Liste wird **verschlüsselt** bei der Prüfung gespeichert, wie die Ergebnisse (im Hybridmodus nur in diesem Browser). Beim Einscannen wird jede Seite über den QR-Code ihrer Person zugeordnet; Adresse und Name bleiben, wie eingetragen. Wird ein Scan gelöscht, bleibt die Person in der Liste.

## QR-Aufkleber {#qr-stickers}

Die gedruckte Prüfung hat auf dem Deckblatt ein leeres Feld mit der Beschriftung **QR Code**. Jede Schülerin und jeder Schüler klebt dort einen QR-Namensaufkleber ein. Beim Scannen liest Examance den Aufkleber und ordnet die Seiten automatisch dieser Person zu, siehe [Scannen und Zuordnen](./scanning#import).

**QR-Codes drucken** auf der Prüfungsseite öffnet einen Dialog. Mit **Aufkleberbogen** druckt er einen A4-Bogen mit **5 × 7 Etiketten**:

1. Die Aufkleber entstehen für die Schüler auf der Seite [Schüler](#student-data); legen Sie sie zuerst dort an. Ein erneuter Druck ergibt dieselben Aufkleber.
2. Legen Sie die **Aufkleber pro Schüler** fest und wie viele Etiketten **schon benutzt** auf dem ersten Bogen sind, damit ein angebrochener Bogen nicht verschwendet wird.
3. Drucken Sie den Bogen mit 100 % (nicht „An Seite anpassen“) und schneiden Sie die Etiketten aus oder ziehen Sie sie ab.

Aufkleber anderer Programme im Format `Nachname, Vorname_ID` funktionieren ebenfalls. Von Hand oder aus nicht zugeordneten Seiten angelegte Schüler haben keinen Aufkleber.

Alles wird in Ihrem Browser berechnet; kein externer Dienst zeichnet die Codes.

## QR-Codes direkt auf den Prüfungsexemplaren {#printed-copies}

Statt Aufklebern kann Examance den QR-Code jedes Schülers **direkt auf sein eigenes Prüfungsexemplar** drucken. Mit **Direkt auf die Prüfungsexemplare drucken** im selben Dialog erhalten Sie ein PDF mit einem Exemplar pro Schüler, in der Reihenfolge der Liste:

- Der QR-Code steht im QR-Feld auf dem Deckblatt, genau dort, wo sonst der Aufkleber hinkommt; das Scannen funktioniert also wie mit Aufklebern. Ersatzexemplare aus dem normalen Prüfungs-PDF behalten Beschriftung und Initialenfeld des Felds, so dass eine Schülerin oder ein Schüler, die ein neues Blatt braucht, stattdessen einen Aufkleber bekommt.
- Die **obere rechte Ecke von Seite 1** trägt jenseits einer gestrichelten Diagonale mit kleiner Schere **Name und persönlichen Schlüssel**. **Schneiden Sie die Ecke vor dem Austeilen** an der Linie ab. Den ganzen Stapel dürfen Sie auf einmal mit der Schneidemaschine schneiden. Der Schüler erkennt daran sein Exemplar und behält die Ecke; mit dem Schlüssel öffnet er später sein [geteiltes Ergebnis](#share-results).
- Rund um die Linie ist freier Platz, ein ungenauer Schnitt trifft also weder den Namen noch die Prüfung.
- Schneiden Sie die Ecken **vor dem Einscannen** ab. Examance speichert jede Seite genau so, wie sie gescannt wurde, und deckt nichts ab: Bei einer nicht abgeschnittenen Ecke ist der Name beim Korrigieren und in Exporten zu sehen.

Jede Prüfung hält diese Ecke auf jeder Seite frei ([Layout](./exams#cut-corner)): auf ungeraden Seiten oben rechts, auf geraden oben links, also die Ecke, die ein Schnitt durch einen beidseitig oder als Broschüre gedruckten Stapel abtrennt. Im normalen Prüfungs-PDF bleibt sie leer und hellgrau.

**Drucken und Schneiden:** Drucken Sie die Exemplare **beidseitig mit Wenden an der langen Kante** oder als Broschüre. Jede Seite zeigt die gestrichelte Schnittlinie an ihrer äußeren Ecke, so dass Sie den ganzen Stapel auf einmal mit der Schneidemaschine entlang der Linie auf dem obersten Blatt schneiden können. Ein Exemplar mit ungerader Seitenzahl bekommt eine leere Seite, sodass jedes Exemplar auf einem neuen Blatt beginnt. Drucken Sie in Originalgröße, ohne „An Seite anpassen“.

## Persönliche Schlüssel {#personal-keys}

Mit **Persönlichen Schlüssel dazudrucken** trägt der erste Aufkleber jeder Schülerin und jedes Schülers über dem QR-Code einen **Streifen mit Name und Schlüssel**, abgetrennt durch eine gestrichelte Linie. Es wird kein zusätzliches Etikett verbraucht. **Schneiden Sie den Streifen ab und geben Sie ihn der Person, bevor der Aufkleber auf die Arbeit kommt**; sie bewahrt ihn auf. Der QR-Code darunter ordnet die Arbeit auch ohne Streifen zu. Der Schlüssel gehört zum Aufkleber und ist bei jedem erneuten Druck derselbe, es muss also nichts gespeichert werden.

Ein persönlicher Schlüssel wird nur gebraucht, wenn Sie Ergebnis-Links später damit schützen, siehe [Linkschutz](#link-protection). Tragen Schüler bereits einen Aufkleber (von einem früheren Bogen oder einem anderen Programm), wählen Sie **Nur die Schlüsselabschnitte drucken**: Die Schlüssel der Schüler der Prüfung werden als kleine Zettel auf **normales Papier** gedruckt, es werden keine Etiketten verbraucht.

## Korrigierte Prüfungen mit Schülern teilen {#share-results}

Nach der Korrektur gibt **Mit Schülern teilen** auf der Prüfungsseite jeder Schülerin und jedem Schüler das korrigierte PDF, mit Ihren Anmerkungen, der Punktzahl und dem Namen in Rot oben auf jeder Seite.

1. **Schüler auswählen.** Schüler mit einer Korrektur sind vorausgewählt.
2. **Weg wählen** (**Weg zu den Schülern**):
   - **Zettel zum Austeilen**: ein PDF mit einem Zettel pro Person, auf dem ein QR-Code und der Link stehen.
   - **Per E-Mail**, siehe [Per E-Mail verschicken](#email).
   - **Über Artemis**, siehe [Mebis und Artemis](#artemis).
   - **Rückmeldedateien für Mebis (Download)**: eine ZIP-Datei mit der korrigierten Arbeit jedes Schülers als PDF zum Hochladen in der Mebis-Aufgabe, siehe [Mebis und Artemis](#lms).

   Ein Weg, der nicht verfügbar ist, wird ausgegraut und darunter begründet: Ihre Administration hat das Versenden für Ihr Konto nicht freigeschaltet, oder für E-Mail ist kein Mailserver eingerichtet.
3. **Schutz der Links wählen**, siehe [unten](#link-protection).
4. **Gültigkeit wählen** („Gültig für“): 7, 14, 30 oder 90 Tage (standardmäßig 30).
5. Optional **Musterlösung mitschicken** ankreuzen: Die Schüler sehen dann auf derselben Seite auch die Musterlösung der Prüfung. Sie wird einmal für alle kompiliert. Bei Prüfungen, deren Aufgaben ohne Code importiert wurden, ist das nicht möglich.
6. **Teilen und Zettel erstellen** bereitet die korrigierten PDFs in Ihrem Browser vor, lädt sie verschlüsselt hoch und lädt das Zettel-PDF herunter. Drucken Sie es und schneiden Sie die Zettel auseinander.

Teilen Sie eine Person **erneut**, entsteht ein neuer Link; der alte funktioniert nicht mehr. So ersetzen Sie einen verlorenen Zettel oder eine korrigierte Bewertung.

::: tip Hybrid-Modus
Liegen Ihre Ergebnisse nur in diesem Browser, ist das Teilen die einzige Ausnahme: Die korrigierten PDFs werden **verschlüsselt** auf den Server hochgeladen, damit die Schüler sie abrufen können. Der Dialog weist darauf hin. Nur wer den Link hat, kann sie öffnen.
:::

## Linkschutz {#link-protection}

Schon der Link schützt das PDF: Ohne ihn kann es niemand abrufen. Sie können einen zweiten Faktor hinzufügen, falls ein Link weitergegeben wird oder andere einen Zettel sehen.

| Schutz | Die Schülerin oder der Schüler braucht |
|---|---|
| **Nur der Link** | den Link oder den QR-Code auf dem Zettel |
| **Link und Schlüssel vom QR-Aufkleber** | den Link und den persönlichen Schlüssel von ihrem oder seinem Aufkleberbogen, siehe [Persönliche Schlüssel](#personal-keys) |
| **Link und Code auf eigenem Zettel** | den Link und einen achtstelligen Code (etwa `ABCD-EFGH`) auf einem Zettel, den Sie getrennt austeilen |

Der Code auf dem eigenen Zettel **ist der persönliche Schlüssel** der Person, derselbe wie beim QR-Aufkleber bzw. auf dem Prüfungsexemplar. Die Code-Zettel ersetzen also auch einen verlorenen Schlüssel. Nur wer keinen Aufkleber hat, bekommt einen neu erzeugten Code.

Optionen, die nicht zu Ihrer Auswahl passen, sind ausgegraut, und der Dialog nennt den Grund. Schüler ohne QR-Aufkleber können zum Beispiel den Aufkleberschlüssel nicht verwenden; hier hilft **Schlüssel drucken**.

**Schlüssel in der Nachricht.** Bei E-Mail und Artemis können Sie **Schlüssel bzw. Code in die Nachricht schreiben** ankreuzen. Der Link öffnet sich dann ohne Zettel oder Aufkleber, was Schülern hilft, die ihren Schlüssel verloren haben. Das ist weniger sicher: Wer die Nachricht lesen kann (Mailanbieter, Artemis, jemand mit Zugriff auf das Postfach), kann die Arbeit öffnen. Standardmäßig ist es aus.

**Sprache.** E-Mails und Artemis-Nachrichten an die Schüler sind deutsch, außer Sie wählen unter **Sprache der Nachricht** Englisch.

## Per E-Mail verschicken {#email}

Jede Schülerin und jeder Schüler bekommt eine E-Mail mit dem Link. Dafür brauchen die Schüler der Prüfung eine E-Mail-Adresse:

- Tragen Sie sie auf der Seite [Schüler](#student-data) ein: aus einer Mebis-Liste, einem Artemis-Kurs oder einer eingefügten Liste, oder einzeln mit **Bearbeiten**. Unter **Per E-Mail** zeigt der Teilen-Dialog, wie viele Schüler eine Adresse haben, und verlinkt dorthin.
- Die Schülerliste im Teilen-Dialog zeigt die Mebis-/Artemis-ID und die E-Mail-Adresse jeder Person; ein leeres Feld heißt, dass keine bekannt ist.

Weil die E-Mail über den Examance-Server geht, darf ein per E-Mail verschickter Link die Arbeit nie allein öffnen: Es gibt nur **Schlüssel vom QR-Aufkleber** und **Code auf eigenem Zettel** (außer Sie schreiben den Schlüssel selbst in die Nachricht, siehe [Linkschutz](#link-protection)). Mit Codes werden am Ende die Code-Zettel heruntergeladen; teilen Sie sie im Unterricht aus.

## Mebis und Artemis {#lms}

Examance arbeitet mit Mebis und Artemis so zusammen wie DiRueLei.

**Mebis** hat keine direkte Verbindung; Sie tauschen Dateien aus:

1. Laden Sie in der Mebis-Aufgabe die **Bewertungstabelle** herunter (oder exportieren Sie die Teilnehmerliste als CSV). Sie enthält die Mebis-Kennungen und E-Mail-Adressen der Schüler.
2. Übernehmen Sie diese Datei auf der Seite [Schüler](#student-data) und drucken Sie die [QR-Aufkleber](#qr-stickers) oder Exemplare: Die Mebis-Kennung steckt dann in jedem Code.
3. Wählen Sie nach der Korrektur unter **Mit Schülern teilen** den Weg **Rückmeldedateien für Mebis (Download)**, oder kreuzen Sie im [Export](./results#export) **Mebis-Rückmeldedateien (ZIP)** an. Beide Wege liefern eine `…_mebis_feedback.zip`. Laden Sie sie in der Mebis-Aufgabe unter **Mehrere Feedbackdateien in einer ZIP-Datei hochladen** hoch. Jeder Schüler sieht seine korrigierte Arbeit dann als Feedback.

Schüler, deren Aufkleber keine Mebis-Kennung trägt, stehen in den Hinweisen des Exports.

### Artemis {#artemis}

**Artemis** wird über den Examance-Server angebunden, der nur an freigegebene Artemis-Adressen weiterleitet (zum Beispiel `artemis.tum.de`):

- **Kurs-ID**: die Zahl in der Kurs-Adresse (`…/courses/123`).
- **Artemis-Token**: der Wert des Cookies `jwt` aus Ihrem angemeldeten Artemis (Entwicklerwerkzeuge des Browsers → Speicher → Cookies). Er wird nur für diesen Vorgang verwendet und nirgends gespeichert.

Damit können Sie **die Kursmitglieder auf der Seite [Schüler](#student-data) laden** (jeder QR-Code trägt dann die Artemis-Nutzerkennung) und später **Ergebnisse über Artemis verschicken**: Jede Person bekommt eine Direktnachricht von Ihnen, entweder

- mit dem **Link** (geschützt durch Aufkleber-Schlüssel oder Code wie bei E-Mail; die Arbeit bleibt verschlüsselt, läuft ab und lässt sich widerrufen), oder
- mit der **korrigierten Arbeit als PDF**: Dann geht das PDF unverschlüsselt an Artemis und bleibt dort gespeichert; Ablauf und Widerruf gelten dafür nicht.

### Vorschau vor dem Versand {#delivery-preview}

Bevor etwas per E-Mail oder Artemis verschickt wird, zeigt eine **Vorschau** jede Person mit Empfänger (Adresse oder Artemis-Nutzer) und was sie bekommt, nennt übersprungene Schüler mit Grund und sagt, welche Daten verwendet werden, wohin sie gehen und wo sie gespeichert sind. Erst nach Ihrer Bestätigung wird gesendet. Während des Versands zeigt der Dialog den Fortschritt (zum Beispiel „20 von 25 E-Mails verschickt“) mit einem Balken; lassen Sie den Tab offen, bis alles fertig ist.

## Was Schüler sehen {#student-view}

Schüler scannen den QR-Code oder geben den Link ein (eine Adresse, die mit `/result#` beginnt). Es öffnet sich eine Seite, die nach dem Schlüssel oder Code fragt, falls der Schutz einen braucht (Feld **Schlüssel**, dann **Öffnen**). Danach wird die korrigierte Arbeit, und falls mitgeschickt die Musterlösung, **im Browser angezeigt, nur zum Ansehen**: Es gibt keinen Download-Knopf. Das verhindert beiläufiges Herunterladen, aber nicht entschlossene Schüler, die weiterhin Bildschirmfotos machen können. Ein falscher Schlüssel wird einfach als falsch gemeldet.

Eine Anmeldung oder ein Konto ist nicht nötig. Das PDF wird nur im Browser der Schülerin oder des Schülers entschlüsselt.

## Links widerrufen und Ablauf {#revoke}

Der Teilen-Dialog listet die **aktiven Links** auf. Mit **Widerrufen** beenden Sie einen Link, mit **Alle Links widerrufen** alle auf einmal; widerrufene Links funktionieren sofort nicht mehr, und ihre Daten werden gelöscht.

Links enden auch von selbst:

- wenn ihre Gültigkeit (7 bis 90 Tage) abgelaufen ist: abgelaufene Links werden gelöscht;
- wenn Sie die Prüfung oder die Schülerin oder den Schüler löschen;
- sie werden nie zusammen mit einer Prüfung aus dem [Papierkorb](./trash) wiederhergestellt.

## Datenschutz {#privacy}

- Das PDF wird **in Ihrem Browser verschlüsselt**, bevor es hochgeladen wird. Der Schlüssel steckt im Link, und der Teil nach dem `#` wird nie an den Server gesendet. Der Server speichert nur Chiffrat und kann kein Ergebnis lesen, auch keine Namen.
- Mit einem zweiten Faktor öffnet ein weitergegebener Link allein das PDF nicht.
- Schüler melden sich nicht an; der Server erfährt nur, dass ein Link geöffnet wurde. Er begrenzt die Versuche pro Adresse und beantwortet jeden unbekannten, abgelaufenen oder widerrufenen Link gleich.
- Behandeln Sie einen Zettel wie die korrigierte Arbeit selbst: Geben Sie ihn der Schülerin oder dem Schüler persönlich.
- **E-Mail und Artemis**: Adresse oder Artemis-Kennung, Link und Artemis-Token laufen nur zum Zustellen über den Examance-Server; gespeichert oder protokolliert werden sie dort nicht. Nur die PDF-Option für Artemis verschickt ein lesbares Ergebnis, und die Vorschau sagt das.

Mehr zur Technik steht in der [Sicherheitsbeschreibung (Englisch)](../../data_flow_and_security).
