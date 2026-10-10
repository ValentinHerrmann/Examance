---
marp: true
theme: examance
paginate: true
size: 16:9
header: '![](../screenshots/pitch/examance-logo.png) Examance <em>· Für Lehrkräfte</em>'
footer: 'Examance 0.2 (Beta) · Stand Oktober 2026 · Alle Screenshots: echte Oberfläche mit Demodaten'
---

<!-- _class: title -->
<!-- _paginate: false -->

<div class="cols center" style="grid-template-columns: 6fr 7fr">
<div>
<img class="logo" src="../screenshots/pitch/examance-logo.png">
<span class="kicker">Für Lehrkräfte</span>

# Gute Aufgaben einmal schreiben. Klausuren in Minuten zusammenstellen.

<p class="lead">Examance ist eine Aufgabenbibliothek mit Klausursatz – und auf Wunsch mehr: anonyme Korrektur am Bildschirm, Notenübersicht und Auswertung über Jahre.</p>
</div>
<figure class="shot"><img src="../screenshots/pitch/04b-exam-setup.jpg"><figcaption>Fertige Klausur mit Lösungsblatt, im Browser gesetzt</figcaption></figure>
</div>

---

<span class="kicker">Zwei Wege</span>

# Sie entscheiden, wie viel Examance übernimmt

<div class="cols" style="margin-top:6px">
<div class="card">
<h3>Erstellen – und auf Papier korrigieren</h3>
<p class="small">Aufgaben sammeln, Klausur setzen, drucken, wie gewohnt mit Rotstift korrigieren. Die Punkte tippen oder aus Excel einfügen – fertig sind Notenübersicht und Auswertung.</p>
<div class="steps four" style="margin-top:10px">
<div><b>Bibliothek</b><span>Aufgaben und Varianten</span></div>
<div><b>Klausur</b><span>PDF mit Lösung</span></div>
<div><b>Papier</b><span>Korrektur wie immer</span></div>
<div><b>Punkte</b><span>Tabelle oder Excel</span></div>
</div>
</div>
<div class="card tint">
<h3>… oder scannen und am Bildschirm korrigieren</h3>
<p class="small">Der Stapel geht durch den Schulkopierer. Examance ordnet die Bögen per QR-Code zu, liest Multiple-Choice-Kreuze und zeigt die Arbeiten ohne Namen.</p>
<div class="steps four" style="margin-top:10px">
<div><b>Scan</b><span>Ein PDF für die Klasse</span></div>
<div><b>Zuordnung</b><span>QR-Code mit Pseudonym</span></div>
<div><b>Korrektur</b><span>Anonym, mit Stempeln</span></div>
<div><b>MC</b><span>Kreuze gelesen</span></div>
</div>
</div>
</div>

<p class="small muted" style="margin-top:16px">Beide Wege enden in derselben Notenübersicht und Auswertung. Sie können pro Klausur neu entscheiden.</p>

---

<span class="kicker">1 · Aufgabenbibliothek</span>

<div class="cols r">
<figure class="shot"><img src="../screenshots/pitch/02-library.jpg"><figcaption>Aufgabe mit zwei Varianten (Gruppe A und B), Filter nach Thema, Klasse und Fach</figcaption></figure>
<div class="stack">

## Ihr Fundus, geordnet

<ul class="small">
<li>Jede Aufgabe einmal anlegen, in jeder späteren Klausur wiederverwenden.</li>
<li><strong>Varianten</strong> derselben Aufgabe (Gruppe A/B) gegen Abschreiben – Punkte und Statistik bleiben vergleichbar.</li>
<li><strong>Versionen</strong>: Änderungen ergeben eine neue Fassung; alte Klausuren bleiben unverändert.</li>
<li>Die Bibliothek zeigt, in welchen Prüfungen eine Aufgabe schon eingesetzt wurde.</li>
<li>Suche über Name, Thema, Klasse, Fach und Aufgabentext.</li>
</ul>
</div>
</div>

---

<span class="kicker">2 · Aufgabeneditor</span>

<div class="cols" style="grid-template-columns: 7fr 5fr">
<figure class="shot"><img src="../screenshots/pitch/03-exercise-editor.jpg"><figcaption>LaTeX links, gesetzte Aufgabe rechts; die Punktzahl wird aus dem Text gezählt</figcaption></figure>
<div class="stack">

## Schreiben mit Werkzeugkasten

<ul class="small">
<li><strong>Bausteine per Klick</strong>: Karopapier, linierte Zeilen, Lücken, Leerraum, Lösungstext, Bilder, Tabellen, Formeln.</li>
<li><strong>Eine Quelle, zwei Blätter</strong>: Schülerblatt mit Raster oder Linien, Lösungsblatt mit dem Erwartungshorizont.</li>
<li><strong>Punkte im Text</strong>: ganze, halbe und Viertelpunkte; die Summe zählt der Editor mit.</li>
<li><strong>Live-Vorschau</strong> von Aufgabe und Lösung, gesetzt im Browser.</li>
<li>Eigene Bilder und Dateien je Aufgabe; TikZ, UML und Struktogramme sind eingebunden.</li>
</ul>
</div>
</div>

---

<span class="kicker">3 · Multiple Choice</span>

<div class="cols l">
<div class="stack">

## Ankreuzaufgaben ohne LaTeX-Kenntnisse

<ul class="small">
<li>Frage eingeben, Optionen hinzufügen, richtige Antworten anhaken.</li>
<li>Einfach- oder Mehrfachauswahl; Punktabzug für falsche Kreuze einstellbar, nie unter null.</li>
<li>Spaltenzahl der Optionen wählbar, damit die Aufgabe auf die Seite passt.</li>
<li>Mehrere Fragen werden in der Klausur zu einem Block zusammengefasst.</li>
<li>Gescannt liest Examance die Kreuze später selbst.</li>
</ul>
</div>
<figure class="shot h460"><img src="../screenshots/pitch/03b-mc-editor.jpg"><figcaption>Strukturierter Editor für Multiple-Choice-Fragen</figcaption></figure>
</div>

---

<span class="kicker">4 · Klausur zusammenstellen</span>

<div class="cols r">
<figure class="shot h460"><img src="../screenshots/pitch/04-exam-builder.jpg"><figcaption>Auswahl aus der Bibliothek; bei Binärzahlen ist Gruppe A gewählt</figcaption></figure>
<div class="stack">

## Ankreuzen statt kopieren

<ul class="small">
<li>Aufgaben aus der Bibliothek anhaken, Variante pro Klasse wählen.</li>
<li>Direkt aus der Auswahl schnell bearbeiten oder Vorschau öffnen.</li>
<li>MC-Fragen zu einem Block gruppieren; eigene Einzelaufgaben ergänzen.</li>
<li>Kopf mit Fach, Klasse, Datum, Dauer und Schullogo.</li>
<li>Notenschlüssel: linear (50 % oder 40 %), Oberstufe oder eigene Grenzen.</li>
</ul>
</div>
</div>

---

<span class="kicker">5 · Druckfertig</span>

<div class="cols l">
<div class="stack">

## Klausur und Lösung aus einem Guss

<ul class="small">
<li>Prüfung und Lösungsblatt werden gemeinsam gesetzt, mit Punktekästen und Punktetabelle.</li>
<li>Satz standardmäßig im Browser: Der Aufgabentext verlässt das Gerät dafür nicht. Optional setzt der Server, wenn die Schule das erlaubt.</li>
<li>QR-Code und Passmarken sind schon drin – falls Sie später doch scannen wollen.</li>
<li>Reihenfolge per Pfeil ändern, Punktsumme läuft mit.</li>
</ul>
</div>
<figure class="shot"><img src="../screenshots/pitch/04b-exam-setup.jpg"><figcaption>Einrichtung einer Klausur: vier Aufgaben, Prüfung und Lösung als PDF</figcaption></figure>
</div>

---

<span class="kicker">6 · Gemeinsam besser</span>

# Aufgaben teilen, übernehmen, verbessern

<div class="cols" style="grid-template-columns: 5fr 7fr; margin-top:4px">
<div class="stack">
<figure class="shot h300"><img src="../screenshots/pitch/19-shared-library.jpg"><figcaption>„Von anderen geteilt“: Aufgaben der Kollegin, mit Absender</figcaption></figure>
<ul class="small">
<li>Teilen ist freiwillig, pro Aufgabe oder für alle; die Schule kann es abschalten.</li>
<li>Wer übernimmt, erhält eine eigene Kopie und kann spätere Änderungen der Quelle einspielen.</li>
</ul>
</div>
<div class="stack">
<figure class="shot"><img src="../screenshots/pitch/21-proposal-review.jpg"><figcaption>Ein Kollege schlägt eine Verbesserung vor; die Autorin sieht den Unterschied und entscheidet</figcaption></figure>
</div>
</div>

---

<span class="kicker">Weg A · Auf Papier korrigiert</span>

<div class="cols r">
<figure class="shot"><img src="../screenshots/pitch/08b-paper-entry.jpg"><figcaption>Punkte einer Stegreifaufgabe, aus einer Excel-Tabelle eingefügt</figcaption></figure>
<div class="stack">

## Rotstift bleibt erlaubt

<ul class="small">
<li>Punkte aufgabenweise (eine Aufgabe, alle Schüler) oder schülerweise eintragen.</li>
<li>Oder eine bestehende Tabelle aus Excel einfügen – Namen und Schülerliste werden mit angelegt.</li>
<li>Danach stehen Notenübersicht, Grenzfälle und Auswertung genauso zur Verfügung wie nach einem Scan.</li>
</ul>
</div>
</div>

---

<span class="kicker">Weg B · Scannen</span>

# Ein Stapel, ein PDF, sechsundzwanzig Abgaben

<div class="cols" style="grid-template-columns: 3fr 9fr; gap: 28px">
<figure class="shot h420"><img src="../screenshots/pitch/17-scanned-sheet.jpg"><figcaption>Gescannter Bogen (synthetisch)</figcaption></figure>
<div class="stack">
<figure class="shot h340 bottom"><img src="../screenshots/pitch/05-scan-import.jpg"><figcaption>Nach dem Einlesen: jede Abgabe nur mit Pseudonym-Code</figcaption></figure>
<p class="small">Der QR-Code verweist auf ein <strong>Pseudonym</strong>, nicht auf einen Namen. Unlesbare Codes landen in einer Prüfliste. Jede Seite wird sofort im Browser verschlüsselt.</p>
</div>
</div>

---

<span class="kicker">Weg B · Korrigieren</span>

<div class="cols r">
<figure class="shot"><img src="../screenshots/pitch/06-grading.jpg"><figcaption>„Anonymer Schüler #7 von 26“ – der Name ist während der Korrektur nicht sichtbar</figcaption></figure>
<div class="stack">

## Erst die Antwort. Dann der Name.

<ul class="small">
<li>Stempel für ganze, halbe und Viertelpunkte, „Falsch“, „Fehlt“, Folgefehler.</li>
<li>Anmerkungen liegen als Ebene über dem Scan; das Original bleibt unverändert.</li>
<li>Note und Abstand zur nächsten Notengrenze stehen daneben.</li>
<li>Mit Maus, Stift oder Tablet.</li>
</ul>
</div>
</div>

---

<span class="kicker">Weg B · Multiple Choice</span>

<div class="cols" style="grid-template-columns: 8fr 4fr">
<figure class="shot"><img src="../screenshots/pitch/07-mc-review.jpg"><figcaption>Prüfansicht einer erkannten MC-Antwort mit Scan-Ausschnitt</figcaption></figure>
<div class="stack">

## Kreuze werden gelesen. Sie entscheiden.

<div class="card"><p>Erkannte Kreuze werden mit dem Lösungsschlüssel verrechnet.</p></div>
<div class="card"><p>Blasse, übermalte oder zurückgenommene Kreuze werden zur Bestätigung vorgelegt.</p></div>
<div class="card"><p>Auch sichere Erkennungen lassen sich stichprobenartig prüfen.</p></div>
</div>
</div>

---

<span class="kicker">Auswertung</span>

<div class="cols r">
<figure class="shot"><img src="../screenshots/pitch/08-results.jpg"><figcaption>Notenübersicht der 10b (26 Abgaben, Demodaten)</figcaption></figure>
<div class="stack">

## Was die Klasse kann – und was nicht

<ul class="small">
<li>Durchschnitt, Median, Streuung, Bestehensquote.</li>
<li>Noten- und Prozentverteilung mit Vergleichskurve.</li>
<li><strong>Grenzfälle</strong>: wer knapp unter oder über einer Notengrenze liegt – ein Klick öffnet die Arbeit.</li>
<li>Export als Tabelle und Diagramm (SVG, PDF, PNG).</li>
</ul>
</div>
</div>

---

<span class="kicker">Über Klausuren hinweg</span>

<div class="cols l">
<div class="stack">

## Waren Gruppe A und B gleich schwer?

<p class="small">Die 10a schrieb Gruppe B, die 10b Gruppe A derselben Aufgabe. Examance vergleicht die Ergebnisse und markiert Unterschiede ab 15 Prozentpunkten.</p>
<ul class="small">
<li>Welche Aufgaben fallen über Jahre hinweg schwach aus?</li>
<li>Welche Variante war unbeabsichtigt schwerer?</li>
<li>Wo lohnt sich Wiederholung im Unterricht?</li>
</ul>
</div>
<figure class="shot"><img src="../screenshots/pitch/09b-variant-comparison.jpg"><figcaption>Gruppe B fiel 24 Prozentpunkte schwächer aus – ein Hinweis, die Variante zu überarbeiten</figcaption></figure>
</div>

---

<!-- _class: center -->

<span class="kicker">Datenschutz in einfachen Worten</span>

# Was der Server sieht – und was nicht

<div class="cols" style="margin-top:8px">
<div class="card">
<h3>Liegt lesbar auf dem Server</h3>
<ul class="small">
<li>Aufgaben- und Klausurtexte (für Bibliothek und Satz)</li>
<li>Klausurdaten: Titel, Klasse, Fach, Datum, Ihr Nachname</li>
<li>Gesamtpunktzahl je Abgabe, ohne Namen</li>
<li>Ihre E-Mail-Adresse und Ihre Anmeldedaten</li>
</ul>
</div>
<div class="card ok">
<h3>Nur mit Ihrem Schlüssel lesbar</h3>
<ul class="small">
<li>Namen und Nummern der Schülerinnen und Schüler</li>
<li>Scans, Anmerkungen und Punkte je Aufgabe</li>
<li>Der Schlüssel entsteht im Browser und verlässt ihn nicht – auch die Administration kann diese Daten nicht öffnen.</li>
</ul>
</div>
</div>

<div class="card tint" style="margin-top:18px"><p class="small" style="margin:0">Im <strong>Hybrid-Modus</strong> verlassen Schülerdaten, Scans und Punkte den Browser gar nicht; im Server-Modus liegen sie dort nur verschlüsselt. Geteilt werden nur Aufgaben – nie Schülerdaten, und erst nach Ihrer ausdrücklichen Bestätigung. Angemeldet wird immer mit zwei Faktoren.</p></div>

---

<!-- _class: center -->

<span class="kicker">Einstieg</span>

# Was Sie brauchen

<div class="cols3" style="margin-top:12px">
<div class="card"><h3>Ein Konto</h3><p>Per Einladung der Administration oder selbst beantragt; Konten mit Schuladresse können automatisch freigeschaltet werden.</p></div>
<div class="card"><h3>Einen zweiten Faktor</h3><p>Authenticator-App oder Passkey (Fingerabdruck, Gesichtserkennung, Geräte-PIN) und einen Wiederherstellungscode auf Papier.</p></div>
<div class="card"><h3>Einen Browser</h3><p>Ein aktueller Desktop-Browser oder ein Tablet. Ein Kopierer, der in ein PDF scannt, nur wenn Sie am Bildschirm korrigieren möchten.</p></div>
</div>

<div class="card warn" style="margin-top:22px">
<h3>Examance ist in der Beta-Phase</h3>
<p class="small" style="margin:0">Beginnen Sie mit der Bibliothek und einer Probeklausur. Im Hybrid-Modus liegen Ergebnisse nur in diesem Browser – sichern Sie sie über das verschlüsselte Archiv. Ein Handbuch ist in die App eingebaut (Fragezeichen oben rechts).</p>
</div>
