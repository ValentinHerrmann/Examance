---
marp: true
theme: examance-poster
size: a3
paginate: false
header: '![](../screenshots/pitch/examance-logo.png) Examance <em>· Beta-Test Informatik</em>'
footer: 'Examance 0.2 (Beta) · MIT-Lizenz · Stand Oktober 2026 · Alle Screenshots: echte Oberfläche mit Demodaten'
---

<span class="kicker">Beta-Test · Fachschaft Informatik</span>

# Klausuren in LaTeX. Korrektur im Browser. Schlüssel beim Nutzer.

<p class="lead">Wir suchen Informatik-Lehrkräfte, die Examance mit einer echten Kurzarbeit durchspielen und uns sagen, wo es hakt.</p>

<div class="cols" style="grid-template-columns: 7fr 5fr; gap: 24px; margin-top: 20px">
<figure class="shot h340"><img src="../screenshots/pitch/03-exercise-editor.jpg"><figcaption>Aufgabeneditor: LaTeX links, gesetzte Aufgabe rechts</figcaption></figure>
<figure class="shot h340"><img src="../screenshots/pitch/18-scanned-sheet-mc.jpg" style="object-position: center 44%"><figcaption>Gescannter Bogen (synthetisch), MC-Teil</figcaption></figure>
</div>

<div class="band">

## Pipeline

<div class="steps">
<div><b>LaTeX</b><span><code>Schulaufgabe.sty</code>, jedes <code>\BE</code> ein Punkt</span></div>
<div><b>Satz</b><span>XeLaTeX als WASM oder Tectonic</span></div>
<div><b>Scan</b><span>pdf.js, zxing-wasm, OMR in Web Workern</span></div>
<div><b>Korrektur</b><span>Pseudonym statt Name, Ebenen auf dem Scan</span></div>
<div><b>Statistik</b><span>Grenzfälle, Aufgabenqualität, Varianten</span></div>
</div>
</div>

<div class="band cols" style="gap:24px">
<div>

## Kryptografie

<div class="card"><ul>
<li>Zufälliger Datenschlüssel, je Faktor verpackt mit <strong>Argon2id</strong> + HKDF</li>
<li>Datensätze mit <strong>AES-256-GCM</strong>, frischer IV pro Vorgang</li>
<li>Anmeldung: zwei von drei Faktoren (Passwort, TOTP, Passkey mit PRF)</li>
<li>Admin-Reset öffnet keine Daten; nur der Wiederherstellungscode</li>
</ul></div>
</div>
<div>

## Offen gesagt

<div class="card"><ul>
<li>Sitzungsschlüssel liegt im Tab (<code>sessionStorage</code>)</li>
<li>LaTeX-Quelltext, Klausurmetadaten und Gesamtpunkte sind serverseitig Klartext</li>
<li>MC-Erkennung ist eine Messung; unsichere Kreuze legt sie zur Prüfung vor</li>
<li>Lokaler WASM-Satz: seltene Abweichungen gegenüber dem Server</li>
</ul></div>
</div>
</div>

<div class="band">

## Mitmachen

<div class="steps four">
<div><b>Konto</b><span>Einladung, zwei Faktoren, Speicherort wählen</span></div>
<div><b>Probelauf</b><span>Kleine Klausur mit erfundenen Daten</span></div>
<div><b>Echter Einsatz</b><span>Eine Kurzarbeit komplett durchspielen</span></div>
<div><b>Rückmeldung</b><span>Issue im Repository oder an den Betreiber</span></div>
</div>
</div>
