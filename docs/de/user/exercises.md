---
editLink: false
---

# Aufgabenbibliothek

Aufgaben liegen in Ihrer Bibliothek, nicht in einer Prüfung. Sie schreiben jede Aufgabe einmal, verschlagworten sie und verwenden sie in beliebig vielen Prüfungen. Weil jede Prüfung sich merkt, welche Version einer Aufgabe sie verwendet hat, können Sie eine Aufgabe weiter verbessern, ohne die Auswertung vergangener Prüfungen anzutasten.

![Aufgabenbibliothek](../../screenshots/pitch/02-library.jpg)

## Aufgaben finden und ordnen {#library}

Jede Aufgabe ist mit **Jahrgang**, **Fach** und **Thema** verschlagwortet. Die Filter oben grenzen die Bibliothek ein:

- Die Zahlen an den Themen zählen nur, was zu den übrigen Filtern passt; Themen ohne Treffer werden ausgeblendet.
- **Sortieren nach** ordnet die Liste nach Name, letzter Änderung, Punkten, Jahrgang oder Fach. Ihr Browser merkt sich die Wahl.
- Klappen Sie einen Eintrag auf, sehen Sie je Variante, in welchen Prüfungen die Aufgabe verwendet wird. Ein Klick auf eine Prüfung zeigt eine kurze Übersicht, von der aus Sie sie in einem neuen Tab öffnen können.
- **Vorschau** zeigt das zuletzt kompilierte PDF. Gibt es noch keines, fragt Examance, ob es jetzt kompiliert werden soll.

Aufgabennamen sind fast überall in der App anklickbar (auf der Prüfungsseite, beim Korrigieren, in der Auswertung) und öffnen die Aufgabe direkt im Editor.

## Der Editor {#editor}

Jede Aufgabe ist ein LaTeX-Fragment mit einer PDF-Live-Vorschau neben dem Quelltext. Name, Thema, Jahrgang und Fach stehen oben im Kopf des Editors.

- **Strg + F** öffnet die Suche, **Strg + H** Suchen und Ersetzen (auf dem Mac **⌘**).
- **Live-Vorschau PDF** kompiliert die Aufgabe und zeigt Angabe und Lösung.

![Aufgaben-Editor mit Live-Vorschau](../../screenshots/pitch/03-exercise-editor.jpg)

### Bausteine und Fächerpaletten {#snippets}

**LaTeX-Bausteine einfügen** über dem Quelltext bietet fertige Bausteine:

- **Allgemein**: Lösungen, Bewertungseinheiten, Formatierung, Seitenumbrüche.
- **Fächer-Tabs** für Mathematik, Informatik, Physik, Chemie, Biologie sowie Sprachen & Gesellschaft: zum Beispiel Baumdiagramme, Klassendiagramme, Schaltpläne, Strukturformeln oder Kreuzungsschemata.

Die Prüfungsvorlage lädt die Pakete, die diese Bausteine brauchen (etwa `chemfig`, `mhchem` und `circuitikz`), bereits selbst; Sie müssen nichts hinzufügen.

## Punktzahl {#score}

Die Punktzahl einer Aufgabe wird aus den **Bewertungseinheiten** im Quelltext gezählt:

| Befehl | Zählt |
|---|---|
| `\BE` | 1 Punkt |
| `\hBE` | ½ Punkt |
| `\qBE` | ¼ Punkt |
| eine richtige Option einer Multiple-Choice-Frage | 1 Punkt |

![Der Dialog „Punkte & Aufbau“](../../screenshots/guide/exercise-score.jpg)

Setzen Sie eine Bewertungseinheit an die Stelle, an der die Lösung den Punkt verdient: Der Erwartungshorizont zeigt sie als Haken, sodass beim Korrigieren genau zu sehen ist, wo die Punkte liegen.

Die Schaltfläche **Punkte & Aufbau** über dem Quelltext zeigt die aktuelle Punktzahl. Sie öffnet einen Dialog, der erklärt, wie die Punktzahl zustande kommt, und mit dem Sie sie auf einen festen Wert **vorgeben** können, statt zu zählen. Leeren Sie das Feld, um wieder zu zählen.

### Teilaufgaben {#parts}

**Teilaufgabe hinzufügen** gliedert eine Aufgabe in a), b), c). Jede Teilaufgabe erhält auf dem Bogen eine eigene Unterüberschrift und ein eigenes Punktekästchen. Die Teilaufgaben ergeben zusammen die Punktzahl der Aufgabe; auch die Punktzahl einer einzelnen Teilaufgabe lässt sich fest vorgeben (ein leeres Feld zählt die Bewertungseinheiten dieser Teilaufgabe). Bewertet wird weiterhin je Aufgabe, nicht je Teilaufgabe.

### Anforderungsbereiche und Kompetenzen {#requirement-levels}

Sie können einen Anforderungsbereich (AFB) und Kompetenzen für die ganze Aufgabe oder je Teilaufgabe hinterlegen:

- **AFB I**: Reproduktion
- **AFB II**: Reorganisation und Transfer
- **AFB III**: Reflexion und Problemlösen

Sie stehen im Quelltext (als `\AFB{…}` und `\Kompetenz{…}`), erscheinen nur im Erwartungshorizont und reisen mit der Aufgabe in Varianten, Kopien und Archive.

### Seitenumbrüche {#page-breaks}

Examance hält Zusammengehöriges automatisch zusammen:

- Überschrift, Einleitung und Bilder einer Aufgabe bleiben mit der Teilaufgabe a) auf einer Seite;
- eine Teilaufgabe wird nicht getrennt, solange sie auf eine Seite passt;
- ein Bild bleibt beim Text danach.

Umbrochen wird zwischen den Teilaufgaben. Wo das nicht passt, erzwingt `\Seitenumbruch` (in der Palette **Allgemein**) an dieser Stelle eine neue Seite. Seitenumbrüche *zwischen Aufgaben* legen Sie auf der Prüfungsseite fest, siehe [Prüfung erstellen](./exams#page-breaks).

## Varianten und Versionen {#variants}

- **Varianten** sind gleichwertige Fassungen derselben Aufgabe, zum Beispiel für die Gruppen A und B. Sie teilen sich Korrektur und Statistik, sodass Sie sie später vergleichen können ([Variantenfairness](./results#variant-fairness)); sie erschweren aber das Abschreiben.
- **Versionen** halten die Korrekturgeschichte fest. Beim Speichern einer überarbeiteten Aufgabe entsteht eine neue Version; Prüfungen, die die alte Version verwendet haben, behalten sie, sodass ihre Auswertung gültig bleibt.
- **Duplizieren** legt eine eigene, nicht geteilte Kopie der ganzen Gruppe an: die aktuelle Version jeder Variante samt Dateien. So starten Sie eine ähnliche Aufgabe, ohne das Original zu verändern.

## Multiple Choice {#multiple-choice}

Eine Aufgabe kann **Freitext**, **Single Choice** oder **Multiple Choice** sein. Ankreuzaufgaben speichern ihre Optionen, die richtigen Antworten und einen optionalen **Punktabzug** je falsch angekreuzter Option (0 bedeutet keine Minuspunkte; eine Aufgabe fällt nie unter null Punkte).

- Bis zu 26 Optionen pro Frage.
- **Spalten der Antwortoptionen** legt fest, in wie vielen Spalten (1–10) die Optionen gedruckt werden.
- **LaTeX-Code** öffnet den erzeugten LaTeX-Code zum Bearbeiten, wenn der strukturierte Editor nicht ausreicht. Die Optionen und der Lösungsschlüssel werden immer aus diesem LaTeX gelesen.

Angekreuzte Kästchen werden beim Einlesen der Scans automatisch erkannt, siehe [MC-Prüfung](./scanning#mc-verification).

Mehrere Ankreuzaufgaben lassen sich auf der Prüfungsseite zu einer **MC-Gruppe** zusammenfassen. Das ist reine Layout-Information für den Ausdruck, siehe [MC-Gruppen](./exams#mc-groups).

![Multiple-Choice-Editor](../../screenshots/pitch/03b-mc-editor.jpg)

## Bilder und Dateien {#files}

Hängen Sie die Dateien an, die Ihr Quelltext einbindet, zum Beispiel Abbildungen für `\includegraphics`. PNG, JPEG und PDF funktionieren; **SVG wird nicht unterstützt**, wandeln Sie es vorher in PDF um.

Eine fehlende Grafik bricht den Lauf nicht ab: Das PDF wird trotzdem erzeugt, und die fehlende Datei wird gemeldet. Prüfen Sie die Vorschau, bevor Sie drucken.

## LaTeX-Pakete {#packages}

Pakete stammen aus drei Quellen, und Examance lädt jedes Paket nur einmal:

1. **Die Vorlage** lädt bereits einen breiten Satz, darunter TikZ-Bibliotheken wie `arrows.meta`, `automata` und `positioning`. **Einstellungen → LaTeX-Pakete** listet sie auf.
2. **Ihr Konto**: Im selben Abschnitt der Einstellungen fügen Sie Pakete und TikZ-Bibliotheken für alle Prüfungen hinzu und geben Vorlagenpaketen Optionen mit (zum Beispiel `dvipsnames` für `xcolor`).
3. **Eine einzelne Aufgabe**: **Pakete dieser Aufgabe** im Editor speichert eine `\usepackage`-Zeile am Anfang des Quelltexts, sodass das Paket mit der Aufgabe reist. Solche Zeilen dürfen Sie auch von Hand schreiben.

Unter **Prüfung bearbeiten** passen Sie die Pakete einer einzelnen Prüfung an oder lassen für sie Pakete Ihres Kontos weg.

Optionen werden zusammengeführt, sodass keine Optionskonflikte entstehen. Setzen zwei Aufgaben dieselbe Option unterschiedlich, zeigt **Ergebnis** den Konflikt und welcher Wert gilt.

Nicht unterstützt sind:

- `inputenc` und `fontenc` (sie funktionieren nur mit pdfLaTeX; Examance verwendet XeLaTeX),
- `paralist` (verträgt sich nicht mit `enumitem`; `enumerate` wird ebenfalls durch `enumitem` ersetzt),
- Optionen für `geometry`, `hyperref` und `eso-pic`, auf die sich Seitenlayout und Antwortbogen-Erkennung stützen.

Eigene Pakete können Sie als `.sty`-Datei hochladen und an die Aufgabe anhängen.

## Wenn das Kompilieren fehlschlägt {#compile-errors}

Lässt sich das PDF nicht erzeugen, nennt die Fehlermeldung wo möglich die **Aufgabe** und ihre **Zeile** im Aufgaben-Editor. Darunter stehen:

- die **wahrscheinliche Ursache**, wo Examance sie erkennt (ein unbekannter Befehl, ein fehlendes `$`, unausgeglichene Klammern, …);
- **Vollständiges LaTeX-Log**, um das ganze Protokoll zu lesen, zu kopieren oder herunterzuladen;
- **Prompt für KI-Chat erstellen** (siehe unten).

![Ein Kompilierfehler mit wahrscheinlicher Ursache](../../screenshots/guide/exercise-compile-error.jpg)

## Hilfe aus einem KI-Chat {#ai-prompts}

Examance sendet nie selbst etwas an einen KI-Dienst. Es bereitet einen Prompt vor, den Sie in einen KI-Chat Ihrer Wahl kopieren:

- **Nach einem Kompilierfehler** erklärt **Prompt für KI-Chat erstellen** dem Chat, wie Examance das Dokument aufbaut, welche Vorlagenbefehle es gibt und was der Compiler gemeldet hat. Den Code der betroffenen Aufgabe enthält der Prompt nur, wenn Sie das Häkchen dafür setzen. Schülerdaten sind nie enthalten.
- **Beim Schreiben** öffnet **KI-Prompt erstellen** in der Kopfzeile des Code-Editors einen Dialog. Beschreiben Sie, was die KI tun soll (eine Variante mit anderen Zahlen, eine zusätzliche Teilaufgabe, eine neue Aufgabe zu einem Thema, …). Der Prompt enthält die Vorlagenbefehle, die verfügbaren Pakete, die Namen der angehängten Dateien und, solange das Häkchen gesetzt ist, den aktuellen Code der Aufgabe. Fügen Sie den LaTeX-Code aus der Antwort wieder in den Editor ein.

![Prompt für einen KI-Chat vorbereiten](../../screenshots/guide/exercise-ai-prompt.jpg)

## Ein Layoutproblem melden {#layout-reports}

Sieht ein PDF falsch aus oder lässt es sich nicht kompilieren, obwohl der Code in Ordnung scheint, nutzen Sie **LaTeX-Layoutproblem melden** direkt unter der PDF-Vorschau (im Aufgaben-Editor oder auf der Prüfungsseite):

1. Beschreiben Sie kurz, was falsch ist und wie es aussehen sollte.
2. Mit Ihrer Einwilligung werden LaTeX-Code, PDFs und Dateien **unverschlüsselt** an die Administration Ihrer Installation gesendet.
3. Ein eigenes, freiwilliges Häkchen legt fest, ob die Meldung **ohne Ihren Namen** als öffentliches GitHub-Issue veröffentlicht werden darf.

Ist das Problem gelöst, erhalten Sie eine E-Mail, gegebenenfalls mit einer Notiz.

## Export und Import (ZIP) {#export}

- **Exportieren (ZIP)** an einer Aufgabengruppe lädt ihre aktuellen Aufgaben als lesbares LaTeX herunter: je Aufgabe ein Ordner mit `exercise.tex` und ihren Dateien, ein Dokument mit allen Aufgaben der Gruppe und eine `manifest.json` mit den Metadaten. Optional kommen die mitgelieferten LaTeX-Dateien (`.sty`) und die kompilierten PDFs (Angabe und Lösung) dazu; das Kompilieren vieler Aufgaben kann einige Minuten dauern.
- **Bibliothek exportieren** lädt alle Ihre eigenen Aufgabengruppen samt Dateien und den mitgelieferten LaTeX-Dateien als eine ZIP herunter, ohne PDFs. Den Ordner können Sie bei Overleaf hochladen oder lokal mit XeLaTeX kompilieren (siehe die enthaltene `README.txt`).

Beide ZIPs lassen sich mit **Importieren** (Arbeitsbereich-Menü, Startseite oder Aufgabenbibliothek) wieder einlesen, auch in einer anderen Examance-Installation. Aufgaben, Varianten und Dateien werden angelegt; bereits vorhandene, unveränderte Aufgaben werden übersprungen, und die Varianten einer Gruppe bleiben zusammen.

Um auch Prüfungen und Ergebnisse zu sichern, nutzen Sie stattdessen eine [Arbeitsbereich-Sicherung](./backup).

## Mit Kolleginnen und Kollegen teilen {#sharing}

Wenn Ihre Installation es erlaubt, können Sie Aufgaben mit allen Konten der Installation teilen, Aufgaben anderer übernehmen und Verbesserungen zurückvorschlagen. Siehe [Aufgaben teilen](./sharing).
