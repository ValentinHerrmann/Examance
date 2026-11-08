---
editLink: false
---

# Prüfung erstellen

Eine Prüfung besteht aus einer Auswahl von Aufgaben aus Ihrer Bibliothek, Kopfdaten, einem Notenschlüssel und einigen Layout-Optionen. Examance setzt sie als druckfertiges PDF, dessen Deckblatt ein leeres Feld **QR Code** hat: Jede Schülerin und jeder Schüler klebt dort einen QR-Namensaufkleber ein (siehe [QR-Aufkleber](./students#qr-stickers)), sodass sich die Scans später automatisch und anonym zuordnen lassen.

## Eine neue Prüfung anlegen {#new-exam}

**Neue Prüfung** (auf der Startseite) fragt nur die Kopfdaten ab, legt die Prüfung an und öffnet sie im Schritt **Prüfung** mit der Aufgabenbibliothek. Alles Weitere (Aufgaben, Reihenfolge, MC-Gruppen, Layout, Logo, Pakete, Vorschau) erledigen Sie dort.

### Kopfdaten {#header}

**Fach**, **Klasse**, **Testart**, **Datum** und **Nummer** erscheinen auf dem Deckblatt. Sie sind Prüfungsinhalt und werden deshalb immer auf Deutsch gedruckt, unabhängig von der Sprache der Oberfläche.

Der **Titel** entsteht aus diesen Angaben (zum Beispiel „Kurzarbeit 1 · Informatik 10a · 05.11.2026“) und ändert sich beim Bearbeiten mit. Er ist nur in Examance zu sehen und wird nicht gedruckt. Mit dem Stift daneben setzen Sie einen eigenen Titel: Er ist dann als **eigener Titel** markiert und ändert sich nicht mehr mit den Angaben; ↺ lässt ihn wieder automatisch entstehen.

Die **gedruckte Klasse** (`\Klasse` auf dem Deckblatt) entsteht aus Jahrgangsstufe und Klasse (10 und a ergeben „10a“) und steht als kleine Zeile unter dem Feld **Klasse** („Gedruckt: 10a“). Ein Klick darauf lässt Sie stattdessen etwas anderes drucken, zum Beispiel „Q11 Inf“; das ist dann als eigene Angabe markiert, und ↺ kehrt zu Jahrgangsstufe und Klasse zurück.

**Speichern** und **Änderungen verwerfen** erscheinen erst, wenn Sie etwas geändert haben.

Das optionale **Thema** (zum Beispiel „Rekursion“) ordnet Ihre Prüfungen in der Übersicht, wo Sie danach filtern und suchen können. Es wird nie gedruckt. Die Übersicht lässt sich außerdem nach Datum, Titel, Jahrgang oder Fach sortieren.

Um die Kopfdaten später zu ändern, bearbeiten Sie sie direkt in der Karte **Angaben** der **Übersicht** und wählen **Speichern** (**Änderungen verwerfen** nimmt sie zurück; wer die Seite mit ungespeicherten Änderungen verlässt, wird vorher gefragt). Die Karte enthält nur die Angaben der Prüfung: Titel, Testart, Jahrgang/Klasse, Datum, Dauer, Nummer, Fach, Lehrkraft, Thema und das Aufbewahrungsdatum. Layout-Einstellungen finden Sie auf dem [Reiter Layout](#layout), den Notenschlüssel unter [Ergebnisse](./results#grading-key).

## Die Schritte einer Prüfung {#steps}

Jede Prüfung hat eine Seitenleiste (auf dem Handy: das Menü) mit nummerierten Schritten. Jeder Schritt trägt ein Abzeichen, das zeigt, wo Sie stehen: Zahl der Aufgaben, Schüler oder Scans, korrigiert x/y, offene MC-Prüfungen, geteilte Ergebnisse (rot: die Zahl der Ergebnis-E-Mails, die nicht angekommen sind). Die Schritte 4A–6A (Scans, MC prüfen, digitale Korrektur) und B (Papierkorrektur) sind Alternativen: B nutzen Sie für eine auf Papier korrigierte Klasse ohne Scans; beides brauchen Sie nie. Oben rechts auf jeder Schrittseite, neben Prüfungsname und Schritttitel, führt eine Schaltfläche **Weiter: …** zum nächsten Schritt; Erklärungen liegen hinter den ⓘ-Symbolen.

| Schritt | Was Sie dort tun |
|---|---|
| **Übersicht** | Angaben und Kennzahlen der Prüfung, siehe [unten](#overview) |
| 1 **Prüfung** | Aufgaben, Layout und Vorschau, siehe [Aufgaben zusammenstellen](#assemble) und [Layout-Optionen](#layout) |
| 2 **Schüler** | Die Klassenliste, siehe [Schülerdaten](./students#student-data) |
| 3 **Drucken** | PDFs und QR-Codes erstellen, siehe [Drucken](#print) |
| 4A **Scans** | Die gescannten Bögen einlesen, siehe [Scannen und Zuordnen](./scanning) |
| 5A **MC prüfen** | Multiple-Choice-Erkennungen prüfen, siehe [MC-Erkennungen prüfen](./scanning#mc-verification) |
| 6A **Digitale Korrektur** | Die gescannten Abgaben korrigieren, siehe [Korrigieren](./grading) |
| B **Papierkorrektur** | Statt 4A–6A: Punkte für auf Papier korrigierte Arbeiten eintragen, ohne Scans, siehe [Auf Papier korrigierte Klassen](./grading#paper) |
| 7 **Ergebnisse & Export** | Reiter **Statistik**, **An Schüler senden** und **Archivieren**, siehe [Ergebnisse und Auswertung](./results) |

## Übersicht {#overview}

Die **Übersicht** (erster, nicht nummerierter Eintrag der Seitenleiste) zeigt die Angaben der Prüfung, einige Kennzahlen (Punkte, Durchschnitt, Notenschlüssel) und unten den **Ablauf**: alle Schritte der Reihe nach mit ihrem Abzeichen, jeder ein Link; der Schritt, den Sie am ehesten als Nächstes brauchen, ist hervorgehoben. **Weiter mit: …** (gefolgt vom Namen des Schritts) öffnet diesen Schritt. Die Karte **Angaben** ändert die Kopfdaten direkt. **Sichern / Weitergeben** packt die Prüfung als lesbares ZIP oder als passwortgeschützte Sicherung, die Examance wieder importieren kann, zum Umziehen oder Weitergeben (siehe [Exportieren](#export)); zum Aufbewahren der Ergebnisse für Ihre Unterlagen nutzen Sie stattdessen **Ergebnisse & Export → Archivieren**. Das Menü **⋯** (**Weitere Aktionen**) enthält **Duplizieren**, **Abgaben löschen** und **Löschen** (die Prüfung).


## Aufgaben zusammenstellen {#assemble}

Im Schritt **Prüfung** listet der Reiter **Aufgaben** die Aufgaben der Prüfung. Dort wählen Sie Aufgaben aus der Bibliothek (**Aufgaben hinzufügen**), jeweils mit der gewünschten Variante. Mit **Neue Aufgabe** schreiben Sie direkt dort eine neue; sie wird in Ihrer Bibliothek gespeichert und sofort ausgewählt.

- Mit den Pfeilen ändern Sie die Reihenfolge der Aufgaben.
- Die Gesamtpunktzahl wird laufend neu berechnet.
- Eine lange Aufgabe läuft einfach auf der nächsten Seite weiter; ihre Überschrift bleibt dabei immer mit den ersten Zeilen zusammen.

![Aufgaben für eine Prüfung auswählen](../../screenshots/pitch/04-exam-builder.jpg)

### Seitenumbrüche zwischen Aufgaben {#page-breaks}

Soll eine Aufgabe auf einer neuen Seite beginnen, fügen Sie zwischen zwei Aufgaben **Seitenumbruch einfügen** ein. Der Umbruch gehört zur Aufgabe darunter und wandert beim Verschieben mit. Seitenumbrüche *innerhalb* einer Aufgabe legen Sie in der Aufgabe selbst fest, siehe [Seitenumbrüche](./exercises#page-breaks).

![Aufgabenliste einer Prüfung mit MC-Gruppe, Seitenumbrüchen und Platz für weitere Lösungen](../../screenshots/guide/exam-exercises.jpg)

Ändern Sie Seitenumbrüche, nachdem Sie die Antwortbogen-Vorlage für die MC-Erkennung erstellt haben, erzeugen Sie die Vorlage neu.

### MC-Gruppen {#mc-groups}

Mehrere Ankreuzaufgaben können gemeinsam als **MC-Gruppe** gedruckt werden. Gruppen legen und bearbeiten Sie auf dem Reiter **Aufgaben** (**MC-Gruppen**). Eine Prüfung kann beliebig viele Gruppen beliebiger Größe enthalten; jede Frage gehört zu höchstens einer Gruppe.

Haken Sie im Aufgabendialog auf dem Reiter **MC-Gruppen** die Fragen an und geben Sie der Gruppe einen Titel. **Aufgaben und MC-Gruppe übernehmen** fügt die Gruppe zusammen mit den übrigen Aufgaben hinzu. Für mehrere Gruppen auf einmal klicken Sie nach jeder Gruppe auf **MC-Gruppe zur Prüfung hinzufügen**.

Gruppen betreffen nur das Layout: Korrektur und Statistik bleiben strikt pro Frage.

## Layout-Optionen {#layout}

Layout-Einstellungen liegen auf dem Reiter **Layout** im Schritt **Prüfung**: Infotext, Namenszeile, Hinweis zur Abschneide-Ecke, Korrekturhinweis für Multiple-Choice, [Drucken mit mehreren Blättern](#multi-sheet), Logo und LaTeX-Pakete. Jede Änderung wird von selbst gespeichert; der Kartenkopf zeigt **Speichert…** und dann **Gespeichert**. Änderungen erscheinen im PDF erst, wenn Sie erneut kompilieren.

### Korrektur außerhalb von Examance {#digital-grading}

Wenn Sie die Arbeit nur mit Examance erstellen und auf Papier korrigieren, schalten Sie oben auf dem Reiter **Layout** **In Examance korrigieren** aus. Die Arbeit druckt dann keine Eckmarkierungen, Seitencodes, Schnittlinien oder Aufkleberfelder, und Seite 1 bekommt eine Namenszeile. Alles andere bleibt genau an seinem Platz. Mit **Feld für einen Ergebnis-QR-Code** behält Seite 1 ein Aufkleberfeld, z. B. um Ergebnisse mit DiRueLei zu verschicken. Scannen und personalisierte Exemplare sind für eine solche Arbeit ausgegraut. Die Papier-Korrektur und die Statistik bleiben verfügbar.

### Namenszeile {#name-line}

Mit **Namenszeile neben dem QR-Code-Feld drucken** (beim Anlegen der Prüfung oder auf dem Reiter **Layout**) erhält die Titelseite eine Zeile für den Namen der Schülerin oder des Schülers. Das QR-Code-Feld bleibt an derselben Stelle, Scannen und Zuordnen funktionieren also wie bisher; nur das Initialenfeld im Feld entfällt.

### Abschneide-Ecke {#cut-corner}

Jede Prüfung hält auf jeder Seite die **äußere obere Ecke** frei: auf ungeraden Seiten oben rechts, auf geraden oben links. Auf geraden Seiten ist die Kopfzeile gespiegelt. Im normalen Prüfungs-PDF bleibt die Ecke leer und ist hellgrau getönt. Drucken Sie die QR-Codes [direkt auf die Prüfungsexemplare](./students#printed-copies), trägt die Ecke auf Seite 1 Name und persönlichen Schlüssel, und eine gestrichelte Linie mit zwei kleinen Scheren zeigt, wo Sie sie vor dem Austeilen abschneiden; alle anderen Seiten zeigen dieselbe Linie, so ist der ganze Stapel markiert. Bei beidseitigem und Broschürendruck können Sie auch den ganzen Stapel auf einmal mit der Schneidemaschine schneiden. Alle Prüfungen haben dieses Layout, so findet das Einlesen die Eckmarkierungen immer an denselben Stellen, egal wie die Blätter gedruckt wurden.

Der Text und auf Seite 1 das QR-Feld mit den Hinweisen daneben reichen bis an die Eckmarkierungen. Die Kopfzeile von Seite 1 zeigt das Logo, dann den Titel und darunter in einer Zeile Kurs, Datum, Dauer und Lehrkraft; die anderen Seiten zeigen den Titel und „Seite X“. Die Punktetabelle füllt den Streifen zwischen den unteren Markierungen.

Die Skizze zeigt den nutzbaren Platz auf ungeraden und geraden Seiten: Textbereich, Kopfzeile, Punktetabelle, den Abschnitt mit seiner Toleranz und die Eckmarkierungen. Das [PDF](../../screenshots/guide/cut-corner-layout-de.pdf) ist in Originalgröße auf A4 gezeichnet; Maße auf einem Ausdruck in 100 % sind echte Millimeter.

![Nutzbarer Platz mit Abschneide-Ecke: ungerade Seite (links) und gerade Seite (rechts)](../../screenshots/guide/cut-corner-layout-de.png)

### Wie man ein Kreuz korrigiert {#mc-hint}

**Bei jeder Multiple-Choice-Aufgabe zeigen, wie man ein Kreuz korrigiert** (beim Anlegen der Prüfung oder auf dem Reiter **Layout**) druckt zu Beginn jeder Multiple-Choice-Aufgabe eine kurze Zeile, in der Prüfung und im Erwartungshorizont:

- Kästchen **ankreuzen**, um eine Option zu wählen;
- Kästchen **ganz ausmalen**, um ein Kreuz zurückzunehmen;
- **links neben** ein ausgemaltes Kästchen kreuzen, um es wieder zu wählen.

![Die Korrekturzeile unter der Überschrift der Ankreuzaufgaben](../../screenshots/guide/exam-mc-hint.jpg)

Die MC-Erkennung liest genau diese Markierungen, siehe [MC-Erkennungen prüfen](./scanning#mc-verification). Wenn Sie die Option ein- oder ausschalten, wird die Antwortbogen-Vorlage neu erzeugt; setzen und drucken Sie die Prüfung danach erneut.

### Logo und LaTeX-Pakete {#logo-packages}

Jede Prüfung druckt oben links auf der ersten Seite ein Logo. Auf dem Reiter **Layout** wählen Sie das Logo aus Ihren Einstellungen, kein Logo oder ein Logo nur für diese Prüfung (siehe [Logo auf der Prüfung](./settings#logo)). In der Prüfungsübersicht zeigt jede aufgeklappte Prüfung, welches Logo sie druckt.

Auf demselben Reiter können Sie außerdem LaTeX-Pakete nur für diese Prüfung hinzufügen oder Pakete Ihres Kontos weglassen (siehe [LaTeX-Pakete](./exercises#packages)).

## Mehrere Blätter {#multi-sheet}

Eine Prüfung über mehrere Blätter lässt sich leichter handhaben, wenn jede Seite weiß, wer und was sie ist. Dafür gibt es auf dem Reiter **Layout** eine Option, und die gedruckten Exemplare füllen immer ganze Blätter:

- **Seitencode auf jeder Seite.** Ein kleiner QR-Code (14 mm) oben auf jeder Seite, auf der Seite der Abschneide-Ecke, direkt innerhalb der Eckmarkierung, sagt dem Scanner, welche Seite es ist. Auf [personalisierten Exemplaren](./students#printed-copies) enthält er auch die ID der Person (die kurze Aufkleber-ID oder die Mebis- bzw. Artemis-ID, nie den Namen). Dadurch spielt die Reihenfolge der gescannten Blätter keine Rolle mehr, fehlende Seiten werden gemeldet und lose Blätter finden ihren Schüler. Der Code ist ab 200 ppi zuverlässig lesbar; 300 ppi ist besser. Für neue Prüfungen ist die Option voreingestellt. Ältere Prüfungen behalten ihr Layout, bis Sie sie einschalten; das ändert das Seitenlayout, früher gedruckte Exemplare passen dann nicht mehr.
- **Ganze Blätter.** Jedes gedruckte Exemplar wird auf ganze Blätter aufgefüllt (gerade Seitenzahl bei beidseitigem Druck, Vielfaches von 4 als Broschüre), so dass jedes Exemplar auf einem neuen Blatt beginnt. Die ergänzten Seiten sind [Zusatzseiten](#extra-paper) zum Schreiben. Welches Vielfache gilt, folgt aus der Druckart, die Sie im Schritt Drucken wählen; deshalb lässt die Vorschau im Schritt **Prüfung** diese Seiten weg, der Schritt Drucken zeigt sie. Sie werden wie jede andere Seite gescannt, archiviert und exportiert.

Wie Sie diese Blätter drucken (beidseitig oder als Broschüre, Aufkleber pro Blatt), wählen Sie im [Schritt Drucken](#multi-sheet-print).

### Mehrere Blätter drucken {#multi-sheet-print}

Der Druckplan im Schritt **Drucken** enthält diese Auswahl:

- **Personalisierte Exemplare** oder **Normale Exemplare + Aufkleber**.
- **Wie drucken Sie?** **Beidseitig (A4, zwei Seiten pro Blatt)** oder **Broschüre (gefaltetes A3, vier Seiten pro Blatt)**.
- Bei Broschüren **Wer ordnet die Seiten an?** **Examance (A3-Blätter, jeder Drucker)**: auf A3 drucken, beidseitig, Wenden an der kurzen Kante, in Originalgröße (100 %, „An Seite anpassen“, „Auf Seitengröße skalieren“ und automatisches Zentrieren ausgeschaltet), an der gedruckten Mittellinie falten und heften. Druckt Ihr Drucker die Bögen trotzdem außermittig, hilft **Verschiebung (mm)** darunter: Drucken Sie einmal den **Testbogen**, falten Sie ihn Kante auf Kante, lesen Sie ab, wo der Knick das Lineal kreuzt (rechts der Mitte positiv), und tragen Sie diesen Wert ein. Er wird mit der Prüfung gespeichert, und Examance verschiebt jeden A3-Bogen darum. Oder **Broschürenfunktion meines Druckers**: Personalisierte Exemplare laden Sie dann als ZIP mit einer PDF pro Schüler herunter und drucken sie einzeln.
- **Aufkleber pro Schüler** (nur bei normalen Exemplaren + Aufklebern). Beidseitig: einer für die ganze Prüfung (auf dem Deckblatt) oder einer pro Blatt. Broschüre: einer für die ganze Prüfung, einer pro A3-Blatt oder einer pro A4-Blatt nach dem Schneiden. Aufkleber auf späteren Blättern kommen auf eine sehr hellgraue, unbeschriftete Stelle von 35 × 35 mm oben auf der Seite, auf der Seite abseits der Abschneide-Ecke, über die Kopfzeile. Personalisierte Exemplare brauchen keine zusätzlichen Aufkleber: Jeder Seitencode nennt den Schüler.

**Druckdateien erstellen** setzt, was der Plan druckt (die Lösung nur bei angekreuztem **mit Lösung**; unveränderte Teile werden wiederverwendet) und erstellt den Aufkleberbogen oder die personalisierten Exemplare. Jede Auftragskarte hat danach nur noch den Download und den Haken **gedruckt**.

Vor den personalisierten Exemplaren warnt der Schritt vor Schülern ohne ID (nur ihr Deckblatt trägt den Code; ihre übrigen Seiten werden nach der Reihenfolge zugeordnet) und sperrt die Exemplare, wenn zwei Schüler dieselbe ID haben. Beides beheben Sie auf der Seite [Schüler](./students#student-data).

**Schnittzone bei Broschüren.** Jede Broschürenseite hat 6 mm von der Falz eine gestrichelte Schnittlinie mit sechs Scheren über die ganze Höhe und einen hellgrauen Streifen zwischen Linie und Falz. Bögen, die Examance anordnet, tragen zusätzlich eine dünne durchgezogene Linie genau auf der Falz mit kräftigeren Strichen oben und unten: Schneiden und falten Sie an ihr, statt vom Papierrand aus zu messen, den ein Drucker verschoben haben kann. Dort schreibt niemand, und Sie können die Broschüre an beliebiger Stelle innerhalb dieses 12-mm-Bands entlang der Falz aufschneiden; ein leicht schiefer Schnitt schadet also nicht. Der Text beginnt 8 mm von der Falz. Die Abschneide-Ecke wird wie bisher abgeschnitten.

Wie Sie diese Blätter scannen: [Den Stapel scannen](./scanning#scan).

## Zusatzpapier {#extra-paper}

Manche Schüler brauchen mehr Platz, als die Angabe bietet. Dafür hat der Reiter **Layout** die Gruppe **Schreibplatz**:

- **Papier zum Schreiben**: **Kariert** (5 mm, Standard für neue Prüfungen), **Liniert** (8 mm) oder **Leer**. Es gilt für jeden Schreibplatz: den Rest der letzten Seite, die Zusatzseiten und die Zusatzblätter. Das Muster ist hellgrau, darüber Geschriebenes bleibt gut lesbar.
- **Überschrift** und **Hinweis** des Schreibplatzes (vorbelegt mit „Platz für weitere Lösungen“ und einem kurzen Hinweis, auf Deutsch gedruckt). Sie stehen über dem Feld am Ende und über jeder Zusatzseite; der Hinweis steht in der Zeile der Überschrift.
- <a id="extra-space"></a>**Rest der letzten Seite füllen**: Der Schülerbogen endet mit einem Schreibfeld zwischen einer **Mindesthöhe** und einer **Maximalhöhe** in cm. Es füllt den Rest der letzten Seite. Passt nicht einmal die Mindesthöhe, nimmt es stattdessen eine ganze neue Seite ein. Der Erwartungshorizont enthält es nicht.
- **Zusatzseiten (mindestens)** (0 bis 20): ganze Seiten zum Schreiben nach der Punktetabelle, für Lehrkräfte, die eine kompakte Angabe und freies Papier für die Lösungen bevorzugen. Das ist ein Mindestwert: Das gedruckte Exemplar bekommt weitere, bis es ganze Blätter füllt (siehe [Mehrere Blätter](#multi-sheet)). Sie gehören zu jedem Exemplar wie jede andere Seite: Seitencodes, Aufkleberfelder, personalisierte Exemplare und der Scan behandeln sie als Prüfungsseiten.
**Zusatzblätter auf Vorrat.** Der Schritt **Drucken** zeigt immer die Karte **Zusatzblatt (Vorrat)**. **Druckdateien erstellen** erzeugt dabei auch ein beidseitiges Blatt im Papier der Prüfung; drucken Sie so viele, wie Sie möchten, und bewahren Sie sie für jede Prüfung auf. Das Blatt trägt keinen Prüfungstitel. Sein Code oben sagt nur „Zusatzblatt“; der QR-Aufkleber des Schülers vorne sagt, wem es gehört.

**Loses Papier geht auch.** Ein Schüler kann auch auf ein beliebiges Blatt schreiben, solange sein QR-Aufkleber darauf klebt. In Prüfungen mit Seitencode steht es nach den Prüfungsseiten dieses Schülers, und der Scan meldet es als angehängte Seite.

**Aufkleber für Zusatzpapier.** Der Aufkleberbogen enthält dafür keine Reserve. Nimmt ein Schüler Zusatzpapier, drucken Sie ihm einen neuen Aufkleber; ein Nachdruck ergibt immer denselben Code.

**Zusatzpapier scannen.** Scannen Sie Zusatzblätter mit der Prüfung oder später für sich. Sie stehen immer nach den Prüfungsseiten des Schülers; später gescannte Seiten werden an seinen vorhandenen Scan angehängt, die Korrektur bleibt erhalten. Die Rückseite eines Zusatzblatts hat kein Aufkleberfeld und folgt ihrer Vorderseite: Scannen Sie beide Seiten zusammen.

## Setzen {#typeset}

**Live-Vorschau PDF** setzt die Prüfung und den Erwartungshorizont. Auf breiten Bildschirmen steht die Vorschau neben Aufgaben und Layout; auf kleineren ist sie ein dritter Reiter, **Vorschau**, neben **Aufgaben** und **Layout**. Dabei entsteht ein druckfertiges PDF. Sein Deckblatt hat ein leeres Feld **QR Code** für den QR-Aufkleber der Schülerin oder des Schülers, siehe [QR-Aufkleber](./students#qr-stickers). Examance kompiliert nie von selbst: Nach einer Änderung an der Prüfung bleibt die letzte Vorschau sichtbar und ist als veraltet markiert, bis Sie erneut auf **Live-Vorschau PDF** klicken.

Je nach Ihren Einstellungen und Ihrem Konto wird die Prüfung

- **in Ihrem Browser** gesetzt: Nichts verlässt Ihr Gerät, aber der erste Lauf lädt die LaTeX-Umgebung herunter und dauert länger;
- **auf dem Server** gesetzt: schneller auf schwacher Hardware; der LaTeX-Quelltext wird dabei an den Server gesendet.

Siehe [LaTeX-Kompilierung](./settings#latex). Sieht etwas falsch aus, [melden Sie ein Layoutproblem](./exercises#layout-reports); schlägt das Kompilieren fehl, siehe [Wenn das Kompilieren fehlschlägt](./exercises#compile-errors).

![Kompilierte Prüfung und Lösung](../../screenshots/pitch/04b-exam-setup.jpg)

### Vorschau aus der Übersicht {#preview}

In der Prüfungsübersicht öffnet **Vorschau** in einem aufgeklappten Eintrag das zuletzt kompilierte PDF. Gibt es noch keines, fragt Examance nach, kompiliert die Prüfung und zeigt sie direkt im Fenster an. Die Vorschau bleibt nur bis zum Neuladen der Seite erhalten.

## Drucken {#print}

Der Schritt **Drucken** zeigt links den **Druckplan** und rechts (auf kleineren Bildschirmen darunter) die PDFs. Die Vorschau zeigt nur, was der Plan druckt, und nur, wenn es aktuell ist: bei personalisierten Exemplaren ohne Lösung also nur die personalisierten Exemplare. Ordnet Examance eine Broschüre an, zeigt sie die A3-Bögen genau so, wie sie gedruckt werden. Eine Schaltfläche, **Druckdateien erstellen**, setzt, was der Plan druckt, frischt die Scan-Vorlage für die MC-Erkennung auf und erstellt die PDF mit Aufklebern oder Exemplaren.

Im Druckplan wählen Sie, wie Sie drucken: **Normale Exemplare und ein QR-Aufkleberbogen** oder **Personalisierte Exemplare mit aufgedrucktem QR-Code** (ein Exemplar pro Schüler mit QR-Code, Name und persönlichem Schlüssel, siehe [QR-Aufkleber](./students#qr-stickers) und [aufgedruckte Exemplare](./students#printed-copies)), und ob die **Lösung** mitgedruckt wird. Bei mehreren Blättern enthält der Plan auch, [wie Sie drucken](#multi-sheet-print). **Bereit zum Drucken?** prüft von selbst, ob die Prüfung Aufgaben hat, die Schülerliste gefüllt ist, die PDFs zum aktuellen Stand passen und, bei MC-Aufgaben, die Scan-Vorlage aktuell ist.

Darunter stehen genau die Druckaufträge Ihres Plans (Exemplare und Aufkleberbogen oder die personalisierten Exemplare, dazu die Lösung). Jeder Auftrag funktioniert gleich: sein Kopf hat den Download, darunter stehen seine Optionen (bei Aufklebern: wie viele pro Schüler, schon verbrauchte Etiketten und **Was drucken?**, siehe [QR-Aufkleber](./students#qr-stickers)), und der Haken **gedruckt** schließt ihn ab. Ein erstellter Aufkleberbogen oder die personalisierten Exemplare erscheinen als weiterer Bereich neben Angabe und Lösung. Nur Sie setzen die Haken, und erst, wenn die PDF des Auftrags zum aktuellen Stand existiert: bei Angabe und Lösung die aktuelle Vorschau, bei Aufklebern und personalisierten Exemplaren eine hier erstellte PDF. Ein Haken verschwindet nur, wenn sich ändert, wofür er gesetzt wurde: Inhalt oder Layout bei Angabe und Lösung, die Schülerliste beim Aufkleberbogen, beides bei personalisierten Exemplaren. Das Zeichen des Schritts in der Seitenleiste zeigt, wie viele Aufträge abgehakt sind.

Drucken Sie die Bögen **genau so, wie sie gesetzt wurden**: nicht „An Seite anpassen“, keine Skalierung, kein Beschneiden. Der QR-Aufkleber und die Eckmarken müssen lesbar bleiben, sonst lässt sich der Scan nicht automatisch zuordnen und angekreuzte Kästchen nicht erkennen.

### Gemerkte Layouts {#pinned-layout}

Sobald Sie die Angabe oder die personalisierten Exemplare herunterladen oder als **gedruckt** abhaken, merkt sich Examance das Layout des Antwortbogens: wo die Kästchen, Punktefelder und Eckmarkierungen liegen. Ändern Sie danach eine Aufgabe, das Layout oder kommt ein Update, werden die schon gedruckten Bögen trotzdem richtig gelesen: Beim Einlesen probiert Examance zuerst das zuletzt gemerkte Layout und nimmt, falls es nicht passt, das gemerkte Layout, dessen Kästchen auf dem Scan liegen. Die Liste **Gemerkte Antwortbogen-Layouts** unter den Druckaufträgen zeigt jedes Layout mit Datum; ein Layout einer Fassung, die nie ausgeteilt wurde, können Sie dort entfernen. Haben Sie die Prüfung nach dem Druck geändert, weist der Schritt **Prüfung** darauf hin. Gemerkte Layouts liegen verschlüsselt auf dem Server, damit sie auch in einem anderen Browser gelten.

Nach der Prüfung geht es weiter mit [Scannen und Zuordnen](./scanning).

## Eine Prüfung duplizieren {#duplicate}

**Duplizieren** (in der Prüfungsliste und im Menü **⋯** der **Übersicht** der Prüfung) legt eine neue Prüfung mit denselben Kopfdaten, Aufgaben, MC-Gruppen, demselben Notenschlüssel und denselben Einstellungen an, zum Beispiel für eine Parallelklasse oder das nächste Schuljahr. Schülerdaten, Scans und Ergebnisse werden nie mitkopiert; die Kopie beginnt ohne sie.

## Exportieren {#export}

**Sichern / Weitergeben** an einer Prüfung (im Menü ihrer Karte auf der Startseite oder in der **Übersicht** der Prüfung) lädt sie entweder als lesbares ZIP oder als passwortgeschützte Sicherung herunter, siehe [Ergebnisse exportieren](./results#export) und [Sicherung und Übertragung](./backup#exam-backup).

![Prüfung exportieren](../../screenshots/guide/exam-export.jpg)
