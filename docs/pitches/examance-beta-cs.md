---
marp: true
theme: examance
paginate: true
size: 16:9
header: '![](../screenshots/pitch/examance-logo.png) Examance <em>· Beta-Test Informatik</em>'
footer: 'Examance 0.2 (Beta) · Stand Oktober 2026 · Alle Screenshots: echte Oberfläche mit Demodaten'
---

<!-- _class: title -->
<!-- _paginate: false -->

<div class="cols center" style="grid-template-columns: 6fr 7fr">
<div>
<img class="logo" src="../screenshots/pitch/examance-logo.png">
<span class="kicker">Beta-Test · Fachschaft Informatik</span>

# Prüfungen in LaTeX schreiben, auf Papier schreiben lassen, im Browser korrigieren.

<p class="lead">Wir suchen Informatik-Lehrkräfte, die Examance mit echten Abläufen testen und uns sagen, wo es hakt – technisch wie didaktisch.</p>
</div>
<figure class="shot"><img src="../screenshots/pitch/03-exercise-editor.jpg"><figcaption>Aufgabeneditor: LaTeX-Quelle links, gesetzte Aufgabe rechts</figcaption></figure>
</div>

---

<span class="kicker">Stand der Dinge</span>

# Was Examance heute ist

<div class="cols" style="margin-top:6px">
<div class="card">
<h3>Produkt</h3>
<dl class="facts">
<dt>Version</dt><dd>0.2.1, Beta</dd>
<dt>Lizenz</dt><dd>MIT, Quellcode vollständig einsehbar</dd>
<dt>Frontend</dt><dd>SvelteKit / Svelte 5, läuft komplett im Browser</dd>
<dt>Backend</dt><dd>FastAPI, PostgreSQL, Redis, Docker</dd>
<dt>LaTeX</dt><dd>XeLaTeX im Browser (WebAssembly) oder Tectonic auf dem Server</dd>
<dt>Sprachen</dt><dd>Deutsch und Englisch</dd>
</dl>
</div>
<div class="stack">
<div class="card ok"><h3>Durchgängig nutzbar</h3><p>Bibliothek, Klausursatz, Scan-Import mit QR-Zuordnung, anonyme Korrektur, MC-Erkennung mit Prüfansicht, Auswertung, Export.</p></div>
<div class="card warn"><h3>Wo wir Rückmeldung brauchen</h3><p>Scanner- und Kopiererergebnisse, MC-Erkennung an Grenzfällen, eigene LaTeX-Vorlagen, Bedienung auf dem Tablet.</p></div>
</div>
</div>

---

<span class="kicker">Die Pipeline</span>

# Vom Quelltext zur Notenverteilung

<div class="steps" style="margin-top:14px">
<div><b>Aufgabe</b><span>LaTeX mit <code>Schulaufgabe.sty</code>; jedes <code>\BE</code> ist ein Punkt.</span></div>
<div><b>Satz</b><span>XeLaTeX als WASM im Browser oder Tectonic im Container. Lösung aus derselben Quelle.</span></div>
<div><b>Scan</b><span>pdf.js rendert, <code>zxing-wasm</code> liest QR-Codes, OMR läuft parallel in Web Workern.</span></div>
<div><b>Korrektur</b><span>Annotationen als Ebene auf dem Scan; Punkte werden mit Auswahl und Erkennungsdaten versiegelt.</span></div>
<div><b>Statistik</b><span>Notenschlüssel, Grenzfälle, Aufgabenqualität und Variantenvergleich.</span></div>
</div>

<div class="cols3" style="margin-top:22px">
<div class="card"><h3>Pseudonym im QR-Code</h3><p>Der Code auf dem Bogen trägt Pseudonym, Variante und Ersatzcode – keinen Namen.</p></div>
<div class="card"><h3>Passmarken</h3><p>Vier Marken pro Seite; die Lage der Kästchen stammt aus einem leeren Satz der Klausur.</p></div>
<div class="card"><h3>Alles clientseitig</h3><p>Scans werden im Browser zerlegt, gelesen und verschlüsselt, bevor irgendetwas gespeichert wird.</p></div>
</div>

---

<span class="kicker">Aufgaben schreiben</span>

<div class="cols l">
<div class="stack">

## LaTeX bleibt LaTeX

<ul class="small">
<li>Eine Quelle für Angabe und Lösung: <code>\LoesungKaro</code>, <code>\LoesungLine</code>, <code>\LoesungLuecke</code> zeigen im Schülerblatt Raster, Linien oder Lücken, im Lösungsblatt den Inhalt.</li>
<li>MC-Fragen über einen strukturierten Editor; Optionen und Schlüssel stehen im LaTeX selbst.</li>
<li>Ressourcen pro Aufgabe (<code>\includegraphics</code>, <code>\input</code>), TikZ, UML und Struktogramme sind eingebunden.</li>
<li>Varianten (A/B) und Versionen; alte Klausuren bleiben unverändert.</li>
<li>Bibliothek nach Thema, Jahrgang und Fach; optional mit der Fachschaft teilen und Änderungen vorschlagen.</li>
</ul>
</div>
<figure class="shot"><img src="../screenshots/pitch/02-library-dark.jpg"><figcaption>Aufgabenbibliothek, dunkles Farbschema</figcaption></figure>
</div>

---

<span class="kicker">Scan und Erkennung</span>

<div class="cols" style="grid-template-columns: 3fr 9fr; gap: 28px">
<figure class="shot"><img src="../screenshots/pitch/18-scanned-sheet-mc.jpg"><figcaption>Synthetischer Scan, Seite 2</figcaption></figure>
<div class="stack">

## Multiple Choice: Messung plus menschliche Prüfung

<figure class="shot"><img src="../screenshots/pitch/07-mc-review.jpg"><figcaption>Prüfansicht: Scan-Ausschnitt, erkannte Kreuze, Punkte nach aktuellem Schlüssel</figcaption></figure>

<ul class="small">
<li>Zwei Verfahren laufen immer mit: <strong>v4</strong> (Strichform, Standard) und <strong>v2</strong> (Füllgrad); die Prüfansicht zeigt, welches bei Ihren Daten öfter richtig lag.</li>
<li>Zurückgenommene, übermalte und sehr blasse Kreuze werden als unsicher vorgelegt. Zufällige Stichproben wirken dem Selektionsbias entgegen.</li>
<li>Optional: anonymisierte 80×48-Pixel-Ausschnitte einzelner Kästchen spenden, um die Erkennung zu verbessern (standardmäßig aus).</li>
</ul>
</div>
</div>

---

<span class="kicker">Korrektur</span>

<div class="cols r">
<figure class="shot"><img src="../screenshots/pitch/06-grading-dark.jpg"><figcaption>Korrektur im dunklen Farbschema; oben nur Laufnummer und Pseudonym</figcaption></figure>
<div class="stack">

## Blind korrigieren, sauber speichern

<ul class="small">
<li>Die Ansicht kennt nur das Pseudonym. Name und Schülernummer liegen verschlüsselt getrennt und werden erst danach wieder verknüpft.</li>
<li>Stempel setzen Punkte auf die aktive Aufgabe; freie Striche, Linien, Radierer.</li>
<li>Punkte, gewählte MC-Optionen und Erkennungsdaten werden <strong>gemeinsam</strong> verschlüsselt; es gibt keine Klartext-Spalte für Einzelpunkte.</li>
<li>Ungespeicherte Änderungen werden beim Verlassen abgefangen; Schreibvorgänge bei Netzausfall landen in einer Warteschlange.</li>
</ul>
</div>
</div>

---

<span class="kicker">Auswertung</span>

<div class="cols r">
<figure class="shot"><img src="../screenshots/pitch/09-analytics.jpg"><figcaption>Prüfungsübergreifende Analyse (Demodaten aus drei Klausuren)</figcaption></figure>
<div class="stack">

## Daten über die eigenen Aufgaben

<ul class="small">
<li>Ergebnisverteilung über alle Klausuren.</li>
<li><strong>Aufgabenqualität</strong>: welche Fragen über mehrere Termine hinweg schwach ausfallen.</li>
<li><strong>Variantenvergleich</strong>: waren Gruppe A und B gleich schwer?</li>
<li>Diagramme als SVG, PDF und PNG; Ergebnisse als Tabelle.</li>
</ul>
<div class="card tint"><p class="small" style="margin:0">Die Auswertung rechnet im Browser auf den entschlüsselten Daten. Der Server kennt nur die Gesamtpunktzahl je Abgabe.</p></div>
</div>
</div>

---

<span class="kicker">Architektur</span>

# Der Server speichert, was er nicht lesen kann

<div class="flow" style="margin-top:10px">
<div class="box key"><h3>Faktoren</h3>Passwort, Passkey (PRF) oder Wiederherstellungscode → <strong>Argon2id</strong> (t=3, 64 MB, p=4) + HKDF → je ein Schlüssel-Verschlüsselungsschlüssel</div>
<div class="arrow">→</div>
<div class="box key"><h3>Datenschlüssel</h3>Zufällige 32 Byte, pro Faktor einmal verpackt. Der Server hält nur die Verpackungen.</div>
<div class="arrow">→</div>
<div class="box key"><h3>Sitzungsschlüssel</h3>HKDF-SHA-256 aus Datenschlüssel und Sitzungs-Nonce; lebt nur im Tab.</div>
<div class="arrow">→</div>
<div class="box"><h3>Datensätze</h3><strong>AES-256-GCM</strong>, frischer 12-Byte-IV pro Vorgang; Server und IndexedDB sehen nur Chiffrat.</div>
</div>

<div class="cols3" style="margin-top:22px">
<div class="card"><h3>Passwort-Reset ohne Datenverlust</h3><p>Der Wiederherstellungscode packt denselben Datenschlüssel neu; nichts wird neu verschlüsselt.</p></div>
<div class="card"><h3>Kein stiller Austausch</h3><p>Der Browser merkt sich einen Fingerabdruck der Schlüsselverpackungen und lehnt einen fremden Satz ab.</p></div>
<div class="card"><h3>Admin ist keine Hintertür</h3><p>Ein Admin-Reset des Passworts öffnet keine Daten; ohne Code bleiben sie verschlossen.</p></div>
</div>

---

<span class="kicker">Anmeldung</span>

<div class="cols l">
<div class="stack">

## Zwei von drei Faktoren

<ul class="small">
<li>Passwort, Authenticator-App (TOTP) und Passkey. Ein Passkey genügt allein, weil jede Zeremonie Nutzerverifikation verlangt.</li>
<li>TOTP öffnet keine Daten: das Geheimnis liegt serverseitig, sechs Ziffern tragen keine Entropie.</li>
<li>Kein Endpunkt verrät, welche Faktoren eine Adresse hat.</li>
<li>Refresh-Tokens rotieren; die Wiederverwendung eines alten gilt als Diebstahl und beendet alle Sitzungen.</li>
<li>Sperre nach Fehlversuchen pro Konto, mit Obergrenze gegen Aussperren durch Dritte.</li>
</ul>
</div>
<figure class="shot"><img src="../screenshots/pitch/11-security.jpg"><figcaption>Einstellungen → Anmeldung & Sicherheit</figcaption></figure>
</div>

---

<!-- _class: center -->

<span class="kicker">Offen gesagt</span>

# Bekannte Grenzen

<div class="cols" style="margin-top:6px">
<div class="stack">
<div class="card"><h3>Schlüssel im Tab</h3><p>Damit F5 nicht erneut nach dem Passwort fragt, liegt der Sitzungsschlüssel in <code>sessionStorage</code>. Skript auf derselben Origin kann ihn lesen, solange der Tab entsperrt ist.</p></div>
<div class="card"><h3>Klartext auf dem Server</h3><p>LaTeX-Quelltexte (Tectonic braucht sie), Klausurmetadaten und die Gesamtpunktzahl je Abgabe.</p></div>
</div>
<div class="stack">
<div class="card"><h3>Hybrid heißt: ein Browser</h3><p>Ergebnisse liegen nur dort. Sicherung über ein verschlüsseltes <code>.bgproj</code>-Archiv.</p></div>
<div class="card"><h3>Lokaler LaTeX-Satz</h3><p>Der erste Lauf lädt die Engine nach. In Einzelfällen setzt die WASM-Engine Inhalte unvollständig, die auf dem Server korrekt erscheinen – Ursache offen.</p></div>
</div>
</div>

---

<!-- _class: center -->

<span class="kicker">Mitmachen</span>

# So läuft der Beta-Test

<div class="steps four" style="margin-top:10px">
<div><b>Konto</b><span>Einladung durch die Administration, Anmeldung mit zwei Faktoren, Speicherort wählen.</span></div>
<div><b>Probelauf</b><span>Eine kleine Klausur mit erfundenen Daten: setzen, ausdrucken, ausfüllen, scannen.</span></div>
<div><b>Echter Einsatz</b><span>Eine Kurzarbeit vollständig über Examance – parallel zur gewohnten Korrektur, wenn gewünscht.</span></div>
<div><b>Rückmeldung</b><span>Was hat Zeit gespart, was nicht, wo war die Erkennung falsch? Am besten mit Scan-Beispiel.</span></div>
</div>

<div class="cols" style="margin-top:22px">
<div class="card tint"><h3>Besonders hilfreich</h3><p>Grenzfälle bei QR und MC, eigene Makros und Vorlagen, Tablet mit Stift, Kopierer mit wenig Auflösung, große Stapel.</p></div>
<div class="card"><h3>Wohin damit</h3><p>Als Issue im Repository oder direkt an den Betreiber (Kontakt im Impressum der App). Fehler mit Version aus der Fußzeile melden.</p></div>
</div>
