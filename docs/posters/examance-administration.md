---
marp: true
theme: examance-poster
size: a3
paginate: false
header: '![](../screenshots/pitch/examance-logo.png) Examance <em>· Für Schulleitung, Datenschutz und IT</em>'
footer: 'Examance 0.2 (Beta) · Stand Oktober 2026 · Alle Screenshots: echte Oberfläche mit Demodaten'
---

<span class="kicker">Für Schulleitung, Datenschutz und IT</span>

# Prüfungsdaten, die der Server nicht lesen kann.

<p class="lead">Examance unterstützt Lehrkräfte bei Papierklausuren: Aufgaben sammeln und teilen, Klausuren setzen, auf Papier oder anonym am Bildschirm korrigieren, auswerten. Schülerdaten werden im Browser verschlüsselt, bevor sie gespeichert werden.</p>

<div class="band">

## Was wo liegt

<table>
<tr><th>Daten</th><th>Für den Server lesbar?</th></tr>
<tr><td>Namen, Schülernummern, Scans, Anmerkungen, Einzelpunkte</td><td class="y">Nein – AES-256-GCM, Schlüssel nur im Browser</td></tr>
<tr><td>Gesamtpunktzahl je Abgabe</td><td class="n">Ja, pseudonym, ohne Namen</td></tr>
<tr><td>Klausurdaten (Titel, Klasse, Fach, Datum, Nachname der Lehrkraft), Aufgabentexte</td><td class="n">Ja</td></tr>
<tr><td>Konto: E-Mail, Rolle, Freischaltungen</td><td class="n">Ja (Passwort nur als Hash)</td></tr>
</table>
</div>

<div class="band">

## Funktionen und ihre Steuerung

<div class="feat">
<div class="card"><span class="tag blue">Lehrkräfte</span><h3>Erstellen & Setzen</h3><p>Aufgabenbibliothek, Klausur als PDF. Satz im Browser; Server-Satz pro Konto freischaltbar.</p></div>
<div class="card"><span class="tag blue">Lehrkräfte</span><h3>Korrigieren & Auswerten</h3><p>Punkte von Hand oder anonym am Scan; Noten, Grenzfälle, Vergleiche über Klassen.</p></div>
<div class="card"><span class="tag teal">Steuerbar</span><h3>Aufgaben teilen</h3><p>Pro Konto an/aus. Pflichtbestätigung „keine Schülerdaten“. Nie Klausuren oder Ergebnisse.</p></div>
<div class="card"><span class="tag teal">Steuerbar</span><h3>Speicherort</h3><p>Ergebnisse nur im Browser (Hybrid) oder verschlüsselt auf dem Server – pro Konto erlaubt.</p></div>
<div class="card"><span class="tag green">Konten</span><h3>Zugang</h3><p>Einladung oder Antrag mit Freigabe; Schul-Domains automatisch. Zwei Anmeldefaktoren Pflicht.</p></div>
<div class="card"><span class="tag green">Admin</span><h3>Keine Hintertür</h3><p>Admin-Konten sehen keine Unterrichtsdaten; ein Passwort-Reset öffnet keine Daten.</p></div>
</div>
</div>

<div class="band cols" style="grid-template-columns: 6fr 5fr; gap: 18px">
<figure class="shot h260"><img src="../screenshots/pitch/14-admin-accounts.jpg"><figcaption>Benutzerverwaltung: Funktionen je Konto</figcaption></figure>
<figure class="shot h260"><img src="../screenshots/pitch/20-share-confirm.jpg"><figcaption>Bestätigung vor dem Teilen einer Aufgabe</figcaption></figure>
</div>

<div class="band cols" style="gap:18px">
<div class="card warn"><h3>Vor dem Einsatz</h3><ul>
<li>Rechtsgrundlage und Aufbewahrungsfrist bestätigen</li>
<li>Betriebsmodell wählen, ggf. AV-Vertrag</li>
<li>DSFA und Verzeichnis abschließen (Vorlagen liegen bei)</li>
<li>Regel für private Endgeräte festlegen</li>
</ul></div>
<div class="card tint"><h3>Vorschlag</h3><p>Ein begrenzter Pilot in einer Fachschaft, zuerst mit erfundenen Daten, mit paralleler Datenschutzprüfung. Offener Quellcode (MIT), selbst betreibbar. Examance ist in der Beta-Phase.</p></div>
</div>
