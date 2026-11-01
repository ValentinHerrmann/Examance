---
marp: true
theme: examance
paginate: true
size: 16:9
header: '![](../screenshots/pitch/examance-logo.png) Examance <em>· Funktionsweise, Datenschutz und Sicherheit</em>'
footer: 'Examance 0.2 (Beta) · Stand Oktober 2026 · Screenshots: echte Oberfläche mit Demodaten · Diagramme: vereinfacht, Details in docs/data_flow_and_security.md'
---

<!-- _class: title -->
<!-- _paginate: false -->

<div class="cols center" style="grid-template-columns: 6fr 7fr">
<div>
<img class="logo" src="../screenshots/pitch/examance-logo.png">
<span class="kicker">Für Informatik-Lehrkräfte, Schulleitung, Datenschutz und IT</span>

# Wie Examance funktioniert – und was es mit Prüfungsdaten macht.

<p class="lead">Ablauf, Architektur, Verschlüsselung, Rollen und offene Punkte: alles, was man für eine kritische Bewertung braucht.</p>
</div>
<figure class="shot"><img src="../screenshots/pitch/06-grading.jpg"><figcaption>Anonyme Korrektur: „Anonymer Schüler #7 von 26“</figcaption></figure>
</div>

---

<span class="kicker">Überblick</span>

# Was Examance ist – und was nicht

<div class="cols" style="margin-top:6px">
<div class="card">
<h3>Ein Werkzeug für Prüfungen auf Papier</h3>
<dl class="facts">
<dt>Version</dt><dd>0.2, Beta – für einen begrenzten, begleiteten Einsatz</dd>
<dt>Lizenz</dt><dd>MIT, Quellcode vollständig einsehbar, selbst betreibbar</dd>
<dt>Frontend</dt><dd>SvelteKit / Svelte 5, läuft komplett im Browser</dd>
<dt>Backend</dt><dd>FastAPI, PostgreSQL, Redis, Docker</dd>
<dt>LaTeX</dt><dd>XeLaTeX im Browser (WebAssembly) oder Tectonic auf dem Server</dd>
<dt>Sprachen</dt><dd>Deutsch und Englisch</dd>
</dl>
</div>
<div class="stack">
<div class="card ok"><h3>Was es tut</h3><p>Aufgabenbibliothek, Klausursatz, Scan-Import mit QR-Zuordnung, anonyme Korrektur, MC-Erkennung mit Prüfansicht, Auswertung, Export.</p></div>
<div class="card warn"><h3>Was es nicht ist</h3><p>Keine Online-Prüfung, kein Schulverwaltungsprogramm, keine KI-Korrektur. Bewertet wird immer durch die Lehrkraft.</p></div>
</div>
</div>

---

<span class="kicker">Ablauf</span>

# Vom Quelltext zur Notenverteilung

<figure class="diagram" style="margin-top:6px"><img src="diagrams/pipeline.svg"></figure>

<p class="small muted" style="margin-top:14px">Beide Wege enden in derselben Notenübersicht und Auswertung; pro Klausur neu wählbar. Scans werden im Browser zerlegt, gelesen und verschlüsselt – pdf.js, <code>zxing-wasm</code> und die MC-Erkennung laufen in Web Workern.</p>

---

<span class="kicker">Erstellen · Bibliothek und Editor</span>

<div class="cols" style="grid-template-columns: 7fr 5fr">
<figure class="shot"><img src="../screenshots/pitch/03-exercise-editor.jpg"><figcaption>LaTeX links, gesetzte Aufgabe rechts; die Punktzahl wird aus dem Text gezählt</figcaption></figure>
<div class="stack">

## LaTeX bleibt LaTeX

<ul class="small">
<li>Eine Quelle für Angabe und Lösung: <code>\LoesungKaro</code>, <code>\LoesungLine</code>, <code>\LoesungLuecke</code> zeigen im Schülerblatt Raster, Linien oder Lücken, im Lösungsblatt den Inhalt.</li>
<li>Jedes <code>\BE</code> ist ein Punkt, <code>\hBE</code> ein halber; die Summe zählt der Editor mit.</li>
<li>Ressourcen pro Aufgabe, TikZ, UML und Struktogramme eingebunden.</li>
<li><strong>Varianten</strong> (Gruppe A/B) und <strong>Versionen</strong>: alte Klausuren bleiben unverändert.</li>
</ul>
</div>
</div>

---

<span class="kicker">Erstellen · Multiple Choice und Klausursatz</span>

<div class="cols" style="grid-template-columns: 4fr 4fr 5fr; gap: 24px">
<figure class="shot h460"><img src="../screenshots/pitch/03b-mc-editor.jpg"><figcaption>Strukturierter MC-Editor, ohne LaTeX-Kenntnisse</figcaption></figure>
<figure class="shot h460"><img src="../screenshots/pitch/04-exam-builder.jpg"><figcaption>Aufgaben und Varianten anhaken</figcaption></figure>
<div class="stack">
<ul class="small">
<li>MC: Einfach- oder Mehrfachauswahl, Punktabzug für falsche Kreuze, nie unter null; auf Wunsch zeigt eine Zeile an jeder Aufgabe, wie man ein Kreuz zurücknimmt und neu setzt.</li>
<li>Klausur: Kopf mit Fach, Klasse, Datum, Schullogo; Notenschlüssel linear, Oberstufe oder eigene Grenzen.</li>
<li>Prüfung und Lösungsblatt werden gemeinsam gesetzt, mit QR-Code und Passmarken.</li>
<li>Satz standardmäßig <strong>im Browser</strong>; auf dem Server nur, wenn die Administration es für das Konto erlaubt.</li>
</ul>
</div>
</div>

---

<span class="kicker">Erstellen · Teilen</span>

<div class="cols" style="grid-template-columns: 7fr 5fr">
<figure class="shot"><img src="../screenshots/pitch/21-proposal-review.jpg"><figcaption>Vorschlag eines Kollegen: Diff gegen die aktuelle Version, Übernahme als neue Version oder Variante</figcaption></figure>
<div class="stack">

## Wie Pull Requests, nur für Aufgaben

<ul class="small">
<li>Geteilte Aufgaben sind für alle Konten der Instanz lesbar; wer sie nutzt, arbeitet mit einer <strong>Kopie</strong>, die spätere Änderungen der Quelle einspielen kann.</li>
<li>Verbesserungen gehen als <strong>Vorschlag</strong> zurück; die Autorin entscheidet.</li>
<li>Geteilt werden nur Aufgabentexte und ihre Dateien – nie Klausuren, Scans oder Ergebnisse. Vor dem ersten Teilen ist eine Bestätigung Pflicht; die E-Mail-Adresse wird sichtbar.</li>
<li>Die Administration schaltet Teilen pro Konto ein oder aus.</li>
</ul>
</div>
</div>

---

<span class="kicker">Korrigieren · Scan</span>

<div class="cols" style="grid-template-columns: 3fr 9fr; gap: 28px">
<figure class="shot h420"><img src="../screenshots/pitch/17-scanned-sheet.jpg"><figcaption>Gescannter Bogen (synthetisch)</figcaption></figure>
<div class="stack">

## Ein Stapel, ein PDF, sechsundzwanzig Abgaben

<figure class="shot h300 bottom"><img src="../screenshots/pitch/05-scan-import.jpg"><figcaption>Nach dem Einlesen: jede Abgabe nur mit Pseudonym-Code</figcaption></figure>
<ul class="small">
<li>Der QR-Code trägt Pseudonym, Variante und Ersatzcode – keinen Namen. Unlesbare Codes landen in einer Prüfliste.</li>
<li>Vier Passmarken pro Seite; die Lage der Kästchen stammt aus einem leeren Satz der Klausur. Darüber füllt Examance beim Korrigieren auch die gedruckten Punktekästchen und die Tabelle am Ende aus.</li>
</ul>
</div>
</div>

---

<span class="kicker">Korrigieren · Multiple Choice</span>

<div class="cols" style="grid-template-columns: 3fr 9fr; gap: 28px">
<figure class="shot"><img src="../screenshots/pitch/18-scanned-sheet-mc.jpg"><figcaption>Synthetischer Scan: Korrekturzeile, Kreuz zurückgenommen und neu gesetzt</figcaption></figure>
<div class="stack">

## Messung plus menschliche Prüfung

<figure class="shot h300"><img src="../screenshots/pitch/07-mc-review.jpg"><figcaption>Prüfansicht: Scan-Ausschnitt, erkannte Kreuze, Punkte nach aktuellem Schlüssel</figcaption></figure>

<ul class="small">
<li>Zwei Verfahren laufen mit: <strong>v4</strong> (Strichform, Standard) und <strong>v2</strong> (Füllgrad); die Prüfansicht zeigt, welches bei Ihren Daten öfter richtig lag.</li>
<li>Ausmalen nimmt ein Kreuz zurück, ein Kreuz links daneben wählt es neu; die Erkennung liest genau diese Zeichen.</li>
<li>Übermalte und blasse Kreuze werden als unsicher vorgelegt; Stichproben auch bei sicheren Erkennungen.</li>
</ul>
</div>
</div>

---

<span class="kicker">Korrigieren · Pseudonymisierung</span>

# Erst die Antwort. Dann der Name.

<figure class="diagram" style="margin-top:2px"><img src="diagrams/pseudonym.svg"></figure>

---

<span class="kicker">Auswerten</span>

<div class="cols" style="grid-template-columns: 5fr 7fr">
<div class="stack">

## Auch ohne Scanner, im Browser gerechnet

<figure class="shot h300"><img src="../screenshots/pitch/08b-paper-entry.jpg"><figcaption>Auf Papier korrigiert: Punkte aus Excel eingefügt</figcaption></figure>
<ul class="small">
<li>Notenspiegel, Grenzfälle, Aufgabenqualität über Jahre.</li>
<li><strong>Variantenvergleich</strong>: ab 15 Prozentpunkten Differenz markiert.</li>
<li>Klassenstatistik erst ab fünf Abgaben (k-Anonymität).</li>
</ul>
</div>
<figure class="shot"><img src="../screenshots/pitch/09b-variant-comparison.jpg"><figcaption>Variantenvergleich aus den Demodaten: Gruppe B fiel 24 Prozentpunkte schwächer aus</figcaption></figure>
</div>

---

<!-- _class: statement -->

<span class="kicker">Teil 2</span>

# Datenschutz und Sicherheit im Detail

<p class="lead">Grundsatz: Der Server speichert Schülerdaten nur in einer Form, die er selbst nicht lesen kann. Die folgenden Folien zeigen, wie das umgesetzt ist – und wo die Grenzen liegen.</p>

---

<span class="kicker">Datenklassen</span>

# Was der Server sieht – und was nicht

<figure class="diagram" style="margin-top:6px"><img src="diagrams/what-server-sees.svg"></figure>

<p class="small muted" style="margin-top:12px">Pseudonym heißt nicht anonym: Wer den Schlüssel hat, kann zuordnen. Die DSGVO gilt deshalb vollständig, auch für die pseudonyme Gesamtpunktzahl.</p>

---

<span class="kicker">Verschlüsselung</span>

# Zufälliger Datenschlüssel, je Faktor verpackt

<figure class="diagram"><img src="diagrams/key-hierarchy.svg"></figure>

---

<span class="kicker">Verschlüsselung · Eigenschaften</span>

# Warum die Hierarchie so aussieht

<div class="cols3" style="margin-top:8px">
<div class="card"><h3>Passwort-Reset ohne Datenverlust</h3><p>Der Wiederherstellungscode packt denselben Datenschlüssel neu; nichts wird neu verschlüsselt.</p></div>
<div class="card"><h3>Kein stiller Austausch</h3><p>Jede Verpackung ist an Konto, Faktor und Schlüsselgeneration gebunden; der Browser merkt sich einen Fingerabdruck des Satzes und lehnt einen fremden ab.</p></div>
<div class="card"><h3>Admin ist keine Hintertür</h3><p>Ein Admin-Reset des Passworts macht dessen Verpackung ungültig; ohne Wiederherstellungscode bleiben die Daten verschlossen.</p></div>
<div class="card"><h3>Gesperrter Tab ist leer</h3><p>Bei Sperre oder 60 Minuten Inaktivität werden Schlüssel gelöscht; im Server-Modus auch der lokale Zwischenspeicher.</p></div>
<div class="card"><h3>Ein Ausweichverfahren</h3><p>Fehlt Argon2 als WebAssembly, greift PBKDF2-HMAC-SHA-256 mit 600 000 Iterationen (OWASP 2024).</p></div>
<div class="card"><h3>Standardbausteine</h3><p>Web Crypto API für AES-GCM und HKDF, Zufall aus <code>crypto.getRandomValues</code>, <code>py_webauthn</code> für Passkeys.</p></div>
</div>

---

<span class="kicker">Anmeldung</span>

# Zwei Faktoren, und erst danach Auskunft

<figure class="diagram"><img src="diagrams/sign-in.svg"></figure>

---

<span class="kicker">Anmeldung · Details</span>

<div class="cols l">
<div class="stack">

## Was Angreifer nicht bekommen

<ul class="small">
<li>Ohne zweiten Faktor erreicht ein Konto nichts außer der Einrichtung.</li>
<li>TOTP öffnet keine Daten: Das Geheimnis liegt serverseitig, sechs Ziffern tragen keine Entropie. Jeder Code gilt nur einmal.</li>
<li>Kein Endpunkt verrät, welche Faktoren eine Adresse hat.</li>
<li>Refresh-Tokens rotieren; die Wiederverwendung eines alten gilt als Diebstahl und beendet alle Sitzungen.</li>
<li>Sperre nach Fehlversuchen pro Konto, mit Obergrenze gegen Aussperren durch Dritte.</li>
<li>Protokoll sicherheitsrelevanter Aktionen, IP-Adressen nur als Hash.</li>
</ul>
</div>
<div class="stack">
<figure class="shot"><img src="../screenshots/pitch/12-signin-second-factor.jpg"><figcaption>Erste Anmeldung: der zweite Faktor ist Pflicht</figcaption></figure>
</div>
</div>

---

<span class="kicker">Speicherort</span>

# Zwei Modi, pro Konto festgelegt

<figure class="diagram" style="margin-top:4px"><img src="diagrams/storage-modes.svg"></figure>

<p class="small muted" style="margin-top:10px"><strong>Hinweis Hybrid:</strong> Die Daten liegen auf dem Gerät der Lehrkraft; Landesrecht kann private Endgeräte einschränken (in Bayern ausdrücklich geregelt). Der Modus wird bei der ersten Anmeldung gewählt.</p>

---

<span class="kicker">Rollen</span>

# Was die Administration kann – und was nicht

<figure class="diagram" style="margin-top:4px"><img src="diagrams/roles.svg"></figure>

<p class="small muted" style="margin-top:12px">Das ist Absicht: Wer den Server betreibt, soll Prüfungsdaten nicht einsehen können – auch nicht bei einem Einbruch in den Server.</p>

---

<span class="kicker">Konten</span>

<div class="cols l">
<div class="stack">

## Wer ein Konto bekommt, entscheidet die Schule

<ul class="small">
<li><strong>Einladung</strong> durch die Administration, oder</li>
<li><strong>Registrierung</strong>: E-Mail bestätigen, Passwort wählen, dann Freigabe durch die Administration.</li>
<li>Adressen von hinterlegten Schul-Domains werden nach der E-Mail-Bestätigung automatisch freigeschaltet.</li>
<li>Unbestätigte und nicht freigegebene Anträge werden nach einer Frist automatisch gelöscht.</li>
<li>Pro Konto schaltbar: Ergebnisse auf dem Server, LaTeX-Satz auf dem Server, Aufgaben teilen.</li>
</ul>
</div>
<figure class="shot"><img src="../screenshots/pitch/15-admin-approvals.jpg"><figcaption>Freigaben: zwei Registrierungen warten, Funktionen vorab wählbar</figcaption></figure>
</div>

---

<span class="kicker">Betrieb</span>

# Architektur einer Instanz

<figure class="diagram" style="margin-top:4px"><img src="diagrams/deployment.svg"></figure>

<p class="small muted" style="margin-top:12px">PostgreSQL und Redis veröffentlichen keine Ports; nur die API ist gebunden, TLS endet am Reverse Proxy. Ein täglicher Aufbewahrungslauf löscht abgelaufene Daten; die Fristen sind konfigurierbar.</p>

---

<span class="kicker">Betrieb</span>

# Drei Betriebsmodelle, drei Verantwortungslagen

<table style="margin-top:8px">
<tr><th>Modell</th><th>Verantwortlich für Schülerdaten</th><th>Was es braucht</th></tr>
<tr><td><strong>A · Schule betreibt selbst</strong><br><span class="xs muted">Backend als Docker-Container, Frontend statisch</span></td><td>Die Schule</td><td>Kein Auftragsverarbeitungsvertrag; Verzeichnis, DSFA und Information der Betroffenen durch die Schule</td></tr>
<tr><td><strong>B · Dienstleister betreibt für Schulen</strong></td><td>Die Schule</td><td>Vertrag zur Auftragsverarbeitung (Vorlage liegt bei), Unterauftragnehmer offenlegen</td></tr>
<tr><td><strong>C · Private Instanz für Lehrkräfte</strong><br><span class="xs muted">so läuft die aktuelle Beta-Instanz</span></td><td>Lehrkraft bzw. ihre Schule</td><td>Klärung mit der Schule, bevor echte Schülerdaten verarbeitet werden</td></tr>
</table>

<div class="card tint" style="margin-top:18px"><p class="small" style="margin:0">Wird das Frontend über einen CDN-Anbieter mit Sitz in den USA ausgeliefert, ist das eine Drittlandübermittlung von Zugriffsdaten. Beim Selbstbetrieb in der EU entfällt sie.</p></div>

---

<span class="kicker">Offen gesagt</span>

# Bekannte Grenzen und Kompromisse

<div class="cols" style="margin-top:0; gap: 24px">
<div class="stack">
<div class="card"><h3>Schlüssel im Tab</h3><p>Damit F5 nicht neu fragt, liegt der Sitzungsschlüssel in <code>sessionStorage</code>, versiegelt mit einem nicht exportierbaren Schlüssel je Tab; Skript auf derselben Origin kann ihn trotzdem nutzen, solange der Tab entsperrt ist.</p></div>
<div class="card"><h3>Klartext auf dem Server</h3><p>LaTeX-Quelltexte samt Aufgabendateien (Tectonic braucht sie), Klausurmetadaten und die Gesamtpunktzahl je Abgabe.</p></div>
<div class="card"><h3>Löschen mit Frist</h3><p>Vom Server gelöschte Ergebnisse bleiben 7 Tage (einstellbar) verschlüsselt wiederherstellbar, bevor der Server sie endgültig entfernt.</p></div>
</div>
<div class="stack">
<div class="card"><h3>TOTP nicht Zero-Knowledge</h3><p>Der Server muss den Code berechnen; die Geheimnisse liegen mit einem Serverschlüssel verschlüsselt.</p></div>
<div class="card"><h3>Hybrid heißt: ein Browser</h3><p>Ergebnisse liegen nur dort. Sicherung über ein verschlüsseltes Archiv.</p></div>
<div class="card"><h3>Lokaler LaTeX-Satz</h3><p>Der erste Lauf lädt die Engine nach. In Einzelfällen setzt die WASM-Engine Inhalte unvollständig, die auf dem Server korrekt erscheinen – Ursache offen.</p></div>
</div>
</div>

---

<span class="kicker">Unterlagen</span>

# Was bereits dokumentiert ist

<div class="cols3" style="margin-top:8px">
<div class="card"><h3>Datenfluss & Sicherheit</h3><p>Schlüsselableitung, Verschlüsselung, Sitzungen, Anmeldefaktoren, bekannte Kompromisse.</p></div>
<div class="card"><h3>DSGVO-Prüfung</h3><p>Technische Bewertung gegen DSGVO, BDSG und bayerisches Schulrecht, mit Befunden und Stand.</p></div>
<div class="card"><h3>DSFA-Vorlage</h3><p>Datenschutz-Folgenabschätzung nach Art. 35, vorbereitet zum Ausfüllen.</p></div>
<div class="card"><h3>Verzeichnis (Art. 30)</h3><p>Vorlage für das Verzeichnis von Verarbeitungstätigkeiten.</p></div>
<div class="card"><h3>AV-Vertrag</h3><p>Vorlage für die Auftragsverarbeitung (Modell B).</p></div>
<div class="card"><h3>Vorfallsplan</h3><p>Checkliste für den Fall einer Datenpanne, mit Meldewegen.</p></div>
</div>

<div class="card warn" style="margin-top:18px"><p class="small" style="margin:0">Diese Unterlagen sind <strong>Arbeitsvorlagen aus der Entwicklung</strong>. Sie ersetzen weder die Prüfung durch die oder den Datenschutzbeauftragten noch eine Rechtsberatung. Alles liegt im Repository unter <code>docs/</code>.</p></div>

---

<!-- _class: center -->

<span class="kicker">Vor einem Einsatz</span>

# Was die Schule entscheiden muss

<div class="cols" style="margin-top:8px">
<div class="card">
<ul class="small">
<li>Rechtsgrundlage bestätigen (in Bayern Art. 85 BayEUG mit BaySchO)</li>
<li>Aufbewahrungsfrist für Prüfungsarbeiten festlegen</li>
<li>Betriebsmodell wählen, ggf. AV-Vertrag schließen</li>
<li>DSFA abschließen und das Verzeichnis ergänzen</li>
</ul>
</div>
<div class="card">
<ul class="small">
<li>Regel für private Endgeräte, besonders für den Hybrid-Modus</li>
<li>Welche Funktionen freigeschaltet werden (Server-Ergebnisse, Teilen)</li>
<li>Ansprechperson und Supportweg für Lehrkräfte</li>
<li>Information der Schülerinnen, Schüler und Eltern</li>
</ul>
</div>
</div>

<div class="card tint" style="margin-top:18px"><p class="small" style="margin:0">Für Auskunft und Löschung nach Art. 15 und 17 DSGVO gibt es in der App eine eigene Ansicht je Schülerin und Schüler. Ergebnisse lassen sich als Tabelle und als verschlüsseltes Archiv exportieren; Lehrkräfte können ihr Konto selbst löschen.</p></div>

---

<!-- _class: center -->

<span class="kicker">Vorschlag</span>

# Erst ein begrenzter Pilot

<div class="steps four" style="margin-top:10px">
<div><b>Rahmen</b><span>Eine Fachschaft, ein Halbjahr, wenige freiwillige Lehrkräfte.</span></div>
<div><b>Probelauf</b><span>Zuerst mit erfundenen Daten: setzen, ausdrucken, ausfüllen, scannen.</span></div>
<div><b>Echter Einsatz</b><span>Eine Kurzarbeit vollständig über Examance – parallel zur gewohnten Korrektur, wenn gewünscht.</span></div>
<div><b>Bilanz</b><span>Zeitaufwand, Fehler bei Scan und Erkennung, Akzeptanz, offene Rechtsfragen.</span></div>
</div>

<div class="cols" style="margin-top:22px">
<div class="card tint"><h3>Besonders hilfreiche Rückmeldung</h3><p>Grenzfälle bei QR und MC, eigene Makros und Vorlagen, Tablet mit Stift, Kopierer mit wenig Auflösung, große Stapel.</p></div>
<div class="card"><h3>Ansehen statt glauben</h3><p>Der komplette Ablauf lässt sich mit erfundenen Daten vorführen, einschließlich Benutzerverwaltung. Fehler als Issue im Repository oder an den Betreiber, mit Version aus der Fußzeile.</p></div>
</div>
