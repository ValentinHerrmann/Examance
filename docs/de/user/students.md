---
editLink: false
---

# QR-Aufkleber und Ergebnisse für Schüler

Zwei Dinge gehören hier zusammen: **QR-Aufkleber**, die Schülerinnen und Schüler auf ihren Prüfungsbogen kleben, damit Examance weiß, wessen Arbeit es ist, und **persönliche Links**, über die jede Schülerin und jeder Schüler später die korrigierte Prüfung herunterlädt. Beide Schaltflächen finden Sie auf der Prüfungsseite.

## QR-Aufkleber {#qr-stickers}

Die gedruckte Prüfung hat auf dem Deckblatt ein leeres Feld mit der Beschriftung **QR Code**. Jede Schülerin und jeder Schüler klebt dort einen QR-Namensaufkleber ein. Beim Scannen liest Examance den Aufkleber und ordnet die Seiten automatisch dieser Person zu, siehe [Scannen und Zuordnen](./scanning#import).

**QR-Aufkleber** auf der Prüfungsseite öffnet einen Dialog, der einen A4-Bogen mit **5 × 7 Etiketten** druckt:

1. Wählen Sie, woher die Namen kommen: aus einer **eingefügten Liste** (**Namensliste einfügen**: eine Zeile pro Person, `Nachname, Vorname`, optional gefolgt von Tabulator oder `;` und einer ID, zum Beispiel einer Schülernummer) oder die **Schüler dieser Prüfung**.
2. Ohne ID leitet Examance aus dem Namen eine stabile ID ab. Ein erneuter Druck derselben Liste ergibt deshalb dieselben Aufkleber.
3. Legen Sie die **Aufkleber pro Schüler** fest und wie viele Etiketten **schon benutzt** auf dem ersten Bogen sind, damit ein angebrochener Bogen nicht verschwendet wird.
4. Drucken Sie den Bogen mit 100 % (nicht „An Seite anpassen“) und schneiden Sie die Etiketten aus oder ziehen Sie sie ab.

Aufkleber anderer Programme im Format `Nachname, Vorname_ID` funktionieren ebenfalls. Von Hand oder aus nicht zugeordneten Seiten angelegte Schüler haben keinen Aufkleber.

Alles wird in Ihrem Browser berechnet; kein externer Dienst zeichnet die Codes.

## Persönliche Schlüssel {#personal-keys}

Mit **Persönlichen Schlüssel dazudrucken** trägt der erste Aufkleber jeder Schülerin und jedes Schülers über dem QR-Code einen **Streifen mit Name und Schlüssel**, abgetrennt durch eine gestrichelte Linie. Es wird kein zusätzliches Etikett verbraucht. **Schneiden Sie den Streifen ab und geben Sie ihn der Person, bevor der Aufkleber auf die Arbeit kommt**; sie bewahrt ihn auf. Der QR-Code darunter ordnet die Arbeit auch ohne Streifen zu. Der Schlüssel gehört zum Aufkleber und ist bei jedem erneuten Druck derselbe, es muss also nichts gespeichert werden.

Ein persönlicher Schlüssel wird nur gebraucht, wenn Sie Ergebnis-Links später damit schützen, siehe [Linkschutz](#link-protection). Tragen Schüler bereits einen Aufkleber (von einem früheren Bogen oder einem anderen Programm), wählen Sie **Nur die Schlüsselabschnitte drucken**: Die Schlüssel der Schüler der Prüfung werden als kleine Zettel auf **normales Papier** gedruckt, es werden keine Etiketten verbraucht.

## Korrigierte Prüfungen mit Schülern teilen {#share-results}

Nach der Korrektur gibt **Mit Schülern teilen** auf der Prüfungsseite jeder Schülerin und jedem Schüler das korrigierte PDF, mit Ihren Anmerkungen, der Punktzahl und dem Namen in Rot oben auf jeder Seite.

1. **Schüler auswählen.** Schüler mit einer Korrektur sind vorausgewählt.
2. **Weg wählen.** Derzeit gibt es **Zettel zum Austeilen** (**Weg zu den Schülern**): ein PDF mit einem Zettel pro Person, auf dem ein QR-Code und der Link stehen.
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
| **Link und Code auf eigenem Zettel** | den Link und einen achtstelligen Code (etwa `ABCD-EFGH`), den Sie getrennt austeilen |

Optionen, die nicht zu Ihrer Auswahl passen, sind ausgegraut, und der Dialog nennt den Grund. Schüler ohne QR-Aufkleber können zum Beispiel den Aufkleberschlüssel nicht verwenden; hier hilft **Schlüssel drucken**. Ein Code wird für jede Person neu erzeugt und nie gespeichert: Geht einer verloren, teilen Sie diese Person erneut.

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

Mehr zur Technik steht in der [Sicherheitsbeschreibung (Englisch)](../../data_flow_and_security).
