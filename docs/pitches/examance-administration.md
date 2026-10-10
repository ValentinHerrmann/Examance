---
marp: true
theme: examance
paginate: true
size: 16:9
header: '![](../screenshots/pitch/examance-logo.png) Examance <em>· Für Schulleitung, Datenschutz und IT</em>'
footer: 'Examance 0.2 (Beta) · Stand Oktober 2026 · Alle Screenshots: echte Oberfläche mit Demodaten'
---

<!-- _class: title -->
<!-- _paginate: false -->

<div class="cols center" style="grid-template-columns: 6fr 7fr">
<div>
<img class="logo" src="../screenshots/pitch/examance-logo.png">
<span class="kicker">Für Schulleitung, Datenschutz und IT</span>

# Was Examance mit Prüfungsdaten macht – und was nicht.

<p class="lead">Ein Überblick über Datenflüsse, Verschlüsselung, Rollen und die Punkte, die eine Schule vor dem Einsatz selbst entscheiden muss.</p>
</div>
<figure class="shot"><img src="../screenshots/pitch/14-admin-accounts.jpg"><figcaption>Benutzerverwaltung: Funktionen je Konto ein- und ausschalten</figcaption></figure>
</div>

---

<span class="kicker">Worum es geht</span>

# Ein Werkzeug für schriftliche Prüfungen auf Papier

<p class="lead">Lehrkräfte stellen Klausuren aus einer Aufgabenbibliothek zusammen, lassen sie wie gewohnt schreiben, scannen den Stapel und korrigieren am Bildschirm – ohne dabei die Namen zu sehen.</p>

<div class="steps" style="margin-top:22px">
<div><b>Aufgaben</b><span>Bibliothek je Lehrkraft, optional in der Fachschaft geteilt.</span></div>
<div><b>Klausur</b><span>Druckfertiges PDF mit Notenschlüssel und Lösung.</span></div>
<div><b>Papier</b><span>Schülerinnen und Schüler schreiben wie bisher.</span></div>
<div><b>Scan</b><span>QR-Code mit Pseudonym ordnet die Bögen zu.</span></div>
<div><b>Korrektur</b><span>Anonym, danach Noten und Auswertung.</span></div>
</div>

<div class="cols3" style="margin-top:22px">
<div class="card"><h3>Web-Anwendung</h3><p>Keine Installation auf Schulrechnern; jede Lehrkraft hat ein eigenes Serverkonto.</p></div>
<div class="card"><h3>Offener Quellcode</h3><p>MIT-Lizenz. Die Schule kann den Code prüfen lassen und selbst betreiben.</p></div>
<div class="card"><h3>Beta</h3><p>Version 0.2. Für einen begrenzten, begleiteten Einsatz gedacht, nicht für den flächigen Betrieb.</p></div>
</div>

---

<span class="kicker">Datenfluss</span>

# Verschlüsselt wird im Browser – vor dem Speichern

<div class="flow" style="margin-top:8px">
<div class="box key"><h3>Browser der Lehrkraft</h3>Der Schlüssel entsteht hier aus der Anmeldung und verlässt das Gerät nicht. Scans werden hier gelesen und verschlüsselt.</div>
<div class="arrow">→</div>
<div class="box"><h3>Übertragung</h3>Nur Chiffrat für Schülerdaten, über TLS.</div>
<div class="arrow">→</div>
<div class="box"><h3>Server</h3>Speichert Chiffrat, Kontodaten und die Aufgabenbibliothek. Kann Schülerdaten nicht entschlüsseln.</div>
</div>

<table style="margin-top:20px">
<tr><th>Daten</th><th>Wo</th><th>Für den Server lesbar?</th></tr>
<tr><td>Namen, Schülernummern, Scans, Anmerkungen, Einzelpunkte</td><td>Browser; im Server-Modus zusätzlich auf dem Server</td><td class="y">Nein – AES-256-GCM, Schlüssel nur im Browser</td></tr>
<tr><td>Gesamtpunktzahl je Abgabe (pseudonym)</td><td>Server</td><td class="n">Ja, ohne Namen</td></tr>
<tr><td>Klausurdaten: Titel, Klasse, Fach, Datum, Nachname der Lehrkraft</td><td>Server</td><td class="n">Ja</td></tr>
<tr><td>Aufgaben- und Klausurtexte (LaTeX)</td><td>Server</td><td class="n">Ja</td></tr>
<tr><td>Konto: E-Mail, Rolle, Passwort-Hash, Freischaltungen</td><td>Server</td><td class="n">Ja (Passwort nur als Argon2id-Hash)</td></tr>
</table>

---

<span class="kicker">Speicherort</span>

<div class="cols l">
<div class="stack">

## Zwei Modi, pro Konto festgelegt

<table>
<tr><th></th><th>Hybrid</th><th>Server</th></tr>
<tr><td>Aufgaben, Klausuren</td><td>Server</td><td>Server</td></tr>
<tr><td>Schülerdaten, Scans, Punkte</td><td>nur im Browser</td><td>Server, verschlüsselt</td></tr>
<tr><td>Mehrere Geräte</td><td>nein</td><td>ja</td></tr>
<tr><td>Sicherung</td><td>verschl. Archiv</td><td>serverseitig</td></tr>
</table>

<div class="card warn"><p class="small" style="margin:0"><strong>Hinweis Hybrid:</strong> Die Daten liegen dann auf dem Gerät der Lehrkraft. Landesrecht kann die Verarbeitung auf privaten Endgeräten einschränken (in Bayern z. B. ausdrücklich geregelt).</p></div>
</div>
<div class="stack">
<figure class="shot"><img src="../screenshots/pitch/13-storage-choice.jpg"><figcaption>Bei der ersten Anmeldung muss der Modus gewählt werden</figcaption></figure>
<p class="small">Die Administration legt pro Konto fest, ob der Server-Modus erlaubt ist. Wird er entzogen, verschiebt die App die Ergebnisse beim nächsten Öffnen in den Browser; ein Wechsel wird geprüft, bevor die alte Kopie gelöscht wird.</p>
</div>
</div>

---

<span class="kicker">Rollen</span>

# Was die Administration kann – und was nicht

<div class="cols" style="margin-top:6px">
<div class="card">
<h3>Kann</h3>
<ul class="small">
<li>Registrierungen freigeben oder ablehnen, Personen einladen</li>
<li>Domains festlegen, deren Adressen automatisch freigeschaltet werden</li>
<li>Pro Konto: Ergebnisse auf dem Server, LaTeX auf dem Server, Aufgaben teilen</li>
<li>Konten löschen; Rollen werden auf dem Server per Kommandozeile geändert</li>
</ul>
</div>
<div class="card ok">
<h3>Kann nicht</h3>
<ul class="small">
<li>Klausuren, Aufgaben oder Ergebnisse von Lehrkräften öffnen – Admin-Konten haben gar keinen Zugriff auf Unterrichtsdaten</li>
<li>Verschlüsselte Schülerdaten lesen, auch nicht direkt in der Datenbank</li>
<li>Nach einem Passwort-Reset die Daten einer Lehrkraft wiederherstellen; dafür gibt es nur ihren persönlichen Wiederherstellungscode</li>
</ul>
</div>
</div>

<p class="small muted" style="margin-top:16px">Das ist Absicht: Wer den Server betreibt, soll Prüfungsdaten nicht einsehen können – auch nicht bei einem Einbruch in den Server.</p>

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
</ul>
</div>
<figure class="shot"><img src="../screenshots/pitch/15-admin-approvals.jpg"><figcaption>Freigaben: zwei Registrierungen warten, Funktionen vorab wählbar</figcaption></figure>
</div>

---

<span class="kicker">Anmeldung</span>

<div class="cols" style="grid-template-columns: 7fr 5fr">
<div class="stack">

## Ein Passwort allein reicht nicht

<ul class="small">
<li>Zwei von drei Faktoren: Passwort, Authenticator-App, Passkey. Ein Passkey mit Geräte-PIN oder Biometrie genügt allein.</li>
<li>Ohne zweiten Faktor erreicht ein Konto nichts außer der Einrichtung.</li>
<li>Sperre nach Fehlversuchen pro Konto, zeitlich begrenzt.</li>
<li>Sitzungen laufen nach Inaktivität ab; ein gesperrter Tab enthält keine lesbaren Daten.</li>
<li>Protokoll sicherheitsrelevanter Aktionen, IP-Adressen nur als Hash.</li>
</ul>
</div>
<figure class="shot"><img src="../screenshots/pitch/12-signin-second-factor.jpg"><figcaption>Erste Anmeldung: der zweite Faktor ist Pflicht</figcaption></figure>
</div>

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

<div class="card warn" style="margin-top:18px"><p class="small" style="margin:0">Diese Unterlagen sind <strong>Arbeitsvorlagen aus der Entwicklung</strong>. Sie ersetzen weder die Prüfung durch die oder den Datenschutzbeauftragten noch eine Rechtsberatung.</p></div>

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

<div class="card tint" style="margin-top:18px"><p class="small" style="margin:0">Für Auskunft und Löschung nach Art. 15 und 17 DSGVO gibt es in der App eine eigene Ansicht je Schülerin und Schüler. Ein täglicher Aufbewahrungslauf löscht abgelaufene Daten auf dem Server; die Fristen sind konfigurierbar und stehen in der Datenschutzerklärung der Instanz.</p></div>

---

<!-- _class: center -->

<span class="kicker">Vorschlag</span>

# Erst ein begrenzter Pilot

<div class="steps four" style="margin-top:10px">
<div><b>Rahmen</b><span>Eine Fachschaft, ein Halbjahr, wenige freiwillige Lehrkräfte.</span></div>
<div><b>Probelauf</b><span>Zuerst mit erfundenen Daten, dann eine echte Kurzarbeit.</span></div>
<div><b>Begleitung</b><span>Datenschutzprüfung parallel; Rückfragen an einen festen Kontakt.</span></div>
<div><b>Bilanz</b><span>Zeitaufwand, Fehler bei Scan und Erkennung, Akzeptanz, offene Rechtsfragen.</span></div>
</div>

<div class="cols" style="margin-top:22px">
<div class="card ok"><h3>Ausstieg jederzeit</h3><p>Ergebnisse lassen sich als Tabelle und als verschlüsseltes Archiv exportieren; Lehrkräfte können ihr Konto selbst löschen.</p></div>
<div class="card"><h3>Ansehen statt glauben</h3><p>Der komplette Ablauf lässt sich mit einer Probeklausur und erfundenen Daten vorführen, einschließlich Benutzerverwaltung.</p></div>
</div>
