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

<p class="lead">Examance unterstützt Lehrkräfte bei Papierklausuren: setzen, scannen, anonym korrigieren, auswerten. Schülerdaten werden im Browser verschlüsselt, bevor sie gespeichert werden.</p>

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

<div class="band cols" style="grid-template-columns: 6fr 5fr; gap: 24px">
<figure class="shot"><img src="../screenshots/pitch/14-admin-accounts.jpg"><figcaption>Benutzerverwaltung: Funktionen je Konto</figcaption></figure>
<div class="stack">
<div class="card"><h3>Die Administration kann</h3><p>Konten freigeben und einladen, Schul-Domains hinterlegen, pro Konto Server-Ergebnisse, Server-LaTeX und Teilen erlauben.</p></div>
<div class="card ok"><h3>Sie kann nicht</h3><p>Klausuren, Ergebnisse oder Schülerdaten von Lehrkräften öffnen – auch nicht in der Datenbank oder nach einem Passwort-Reset.</p></div>
</div>
</div>

<div class="band cols" style="gap:24px">
<div>

## Sicherheit

<div class="card"><ul>
<li>Zwei Anmeldefaktoren sind Pflicht; Passkeys möglich</li>
<li>Zwei Speichermodi: Ergebnisse nur im Browser oder verschlüsselt auf dem Server</li>
<li>Auskunft und Löschung je Schülerin und Schüler (Art. 15/17)</li>
<li>Offener Quellcode (MIT), selbst betreibbar</li>
</ul></div>
</div>
<div>

## Vor dem Einsatz

<div class="card warn"><ul>
<li>Rechtsgrundlage und Aufbewahrungsfrist bestätigen</li>
<li>Betriebsmodell wählen, ggf. AV-Vertrag</li>
<li>DSFA und Verzeichnis abschließen (Vorlagen liegen bei)</li>
<li>Regel für private Endgeräte festlegen</li>
</ul></div>
</div>
</div>

<div class="card tint" style="margin-top:24px"><p style="margin:0"><strong>Vorschlag:</strong> ein begrenzter Pilot in einer Fachschaft, zuerst mit erfundenen Daten, mit paralleler Datenschutzprüfung. Examance ist in der Beta-Phase.</p></div>
