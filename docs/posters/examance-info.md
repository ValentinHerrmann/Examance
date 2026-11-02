---
marp: true
theme: examance-poster
size: a3
paginate: false
header: '![](../screenshots/pitch/examance-logo.png) Examance <em>· Funktionsweise, Datenschutz und Sicherheit</em>'
footer: 'Examance 0.4 (Beta) · Stand November 2026 · Screenshots: echte Oberfläche mit Demodaten · Details: docs/data_flow_and_security.md · examance.valentin-herrmann.com'
---

<span class="kicker">Teil 1 · Was Examance tut und wie</span>

# Klausuren in LaTeX setzen, auf Papier schreiben, anonym bewerten.

<p class="lead">Aufgabenbibliothek, Klausursatz und Notenbuch in einem – eine Web-Anwendung unter MIT-Lizenz (Beta 0.4). Korrigiert wird auf Papier oder anonym am Bildschirm; Schülerdaten verschlüsselt der Browser, bevor sie gespeichert werden.</p>

<figure class="diagram" style="margin-top:14px"><img src="../pitches/diagrams/pipeline.svg"></figure>

<div class="band">

## Funktionen

<div class="feat">
<div class="card"><span class="tag blue">Erstellen</span><h3>Bibliothek und Editor</h3><p>LaTeX mit Bausteinen per Klick und Live-Vorschau; Punkte im Text, Varianten A/B und Versionen.</p></div>
<div class="card"><span class="tag blue">Erstellen</span><h3>Klausur setzen</h3><p>Aufgaben anhaken, Notenschlüssel wählen – Prüfung und Lösung als PDF, im Browser gesetzt.</p></div>
<div class="card"><span class="tag teal">Gemeinsam</span><h3>Teilen und Vorschläge</h3><p>Nur Aufgabentexte, nie Schülerdaten. Kopien übernehmen, Verbesserungen vorschlagen, die Autorin entscheidet.</p></div>
<div class="card"><span class="tag amber">Korrigieren</span><h3>Papier oder Scan</h3><p>Punkte eintippen oder aus Excel einfügen – oder ein Scan-PDF: QR-Zuordnung, Stempel je Aufgabe oder Teilaufgabe, Punktekästchen füllen sich selbst, MC-Erkennung mit Prüfansicht.</p></div>
<div class="card"><span class="tag green">Auswerten</span><h3>Statistik im Browser</h3><p>Notenspiegel, Grenzfälle, Aufgabenqualität, Variantenvergleich; Klassenstatistik erst ab fünf Abgaben.</p></div>
<div class="card"><span class="tag red">Betrieb</span><h3>Offen und selbst betreibbar</h3><p>SvelteKit im Browser; FastAPI, PostgreSQL, Redis in Docker. LaTeX als WASM oder mit Tectonic.</p></div>
</div>
</div>

<div class="cols band" style="gap:18px; grid-template-columns: 1fr 1fr">
<figure class="shot"><img style="height:200px; object-fit:cover; object-position:top left" src="../screenshots/pitch/03-exercise-editor.jpg"><figcaption>Aufgabeneditor: LaTeX links, gesetzte Aufgabe rechts</figcaption></figure>
<figure class="shot"><img style="height:200px; object-fit:cover; object-position:top left" src="../screenshots/pitch/06-grading.jpg"><figcaption>Anonyme Korrektur: nur Laufnummer und Pseudonym</figcaption></figure>
<figure class="shot"><img style="height:200px; object-fit:cover; object-position:top left" src="../screenshots/pitch/07-mc-review.jpg"><figcaption>MC-Erkennung: Scan-Ausschnitt, erkannte Kreuze, Ihre Entscheidung</figcaption></figure>
<figure class="shot"><img style="height:200px; object-fit:cover; object-position:top left" src="../screenshots/pitch/09b-variant-comparison.jpg"><figcaption>Variantenvergleich: Gruppe B 24 Prozentpunkte schwächer</figcaption></figure>
</div>

---

<span class="kicker">Teil 2 · Datenschutz und Sicherheit</span>

# Der Server speichert, was er nicht lesen kann.

<figure class="diagram" style="margin-top:10px"><img src="../pitches/diagrams/what-server-sees.svg"></figure>

<div class="band">

## Schlüsselhierarchie

<figure class="diagram"><img src="../pitches/diagrams/key-hierarchy.svg"></figure>
</div>

<div class="cols band" style="gap:16px; grid-template-columns: 1fr 1fr 1fr">
<div class="card"><h3>Anmeldung</h3><p>Passkey allein oder zwei von drei Faktoren: Passwort, Authenticator-App, Passkey. Erst nach dem ersten Faktor erfährt man, welche fehlen. Sperre nach Fehlversuchen pro Konto.</p></div>
<div class="card"><h3>Speicherort pro Konto</h3><p><strong>Server-Modus:</strong> Ergebnisse als Chiffrat auf dem Server, mehrere Geräte. <strong>Hybrid:</strong> Ergebnisse nur in diesem Browser. Wechsel = geprüfter Umzug der Ergebnisse.</p></div>
<div class="card"><h3>Administration</h3><p>Gibt Konten frei und schaltet pro Konto Server-Ergebnisse, Server-LaTeX und Teilen. Hat keinen Zugriff auf Klausuren, Aufgaben oder Ergebnisse.</p></div>
</div>

<div class="cols band" style="gap:16px">
<div class="card warn"><h3>Offen gesagt</h3><p>Sitzungsschlüssel versiegelt in <code>sessionStorage</code>, solange der Tab entsperrt ist (Skript auf derselben Origin kann ihn nutzen) · LaTeX, Klausurmetadaten und Gesamtpunktzahl lesbar auf dem Server · TOTP nicht Zero-Knowledge · pseudonym ist nicht anonym.</p></div>
<div class="card tint"><h3>Vor einem Einsatz</h3><p>Rechtsgrundlage, Aufbewahrungsfrist, Betriebsmodell (selbst, Dienstleister, privat), DSFA und Verzeichnis, Regel für private Geräte. Vorlagen liegen bei – Arbeitsvorlagen, keine Rechtsberatung. Vorschlag: erst ein begrenzter Pilot.</p></div>
</div>
