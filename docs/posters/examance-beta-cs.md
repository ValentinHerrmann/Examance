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

<p class="lead">Wir suchen Informatik-Lehrkräfte, die Examance mit einer echten Kurzarbeit durchspielen – vom Aufgabeneditor bis zur Variantenstatistik – und uns sagen, wo es hakt.</p>

<div class="cols" style="grid-template-columns: 7fr 5fr; gap: 18px; margin-top: 14px">
<figure class="shot h260"><img src="../screenshots/pitch/03-exercise-editor.jpg"><figcaption>LaTeX-Editor mit Live-Satz (XeLaTeX als WebAssembly)</figcaption></figure>
<figure class="shot h260"><img src="../screenshots/pitch/18-scanned-sheet-mc.jpg" style="object-position: center 44%"><figcaption>Synthetischer Scan: QR-Pseudonym, Passmarken, MC-Kreuze</figcaption></figure>
</div>

<div class="band">

## Pipeline und Testfelder

<div class="feat">
<div class="card"><span class="tag blue">Authoring</span><h3>Editor & Bibliothek</h3><p>Lösungs-Makros, Ressourcen, TikZ/UML, Varianten und Versionen, MC-Editor mit Punktabzug.</p></div>
<div class="card"><span class="tag teal">Kollaboration</span><h3>Teilen & Vorschläge</h3><p>Kopie statt Link, Resync mit Merge-Editor, Vorschläge mit Diff – wie Pull Requests für Aufgaben.</p></div>
<div class="card"><span class="tag amber">Erkennung</span><h3>QR & OMR</h3><p>Zwei Verfahren (Strichform, Füllgrad) laufen mit; Unsicheres wird vorgelegt, Stichproben gegen Bias.</p></div>
<div class="card"><span class="tag blue">Korrektur</span><h3>Bildschirm oder Papier</h3><p>Stempel auf dem Scan – oder Punkte aus Excel einfügen. Beides speist dieselbe Statistik.</p></div>
<div class="card"><span class="tag green">Krypto</span><h3>Zero-Knowledge-Speicher</h3><p>Argon2id → verpackter Datenschlüssel → HKDF → AES-256-GCM. Der Server hält nur Chiffrat.</p></div>
<div class="card"><span class="tag red">Offen</span><h3>Bekannte Grenzen</h3><p>Schlüssel im Tab, LaTeX und Gesamtpunkte im Klartext, seltene Abweichungen im WASM-Satz.</p></div>
</div>
</div>

<div class="band cols" style="gap:18px">
<figure class="shot h240"><img src="../screenshots/pitch/21-proposal-review.jpg"><figcaption>Vorschlag eines Kollegen mit Diff</figcaption></figure>
<figure class="shot h240"><img src="../screenshots/pitch/09b-variant-comparison.jpg"><figcaption>Variantenvergleich: Gruppe B 24 Punkte schwächer</figcaption></figure>
</div>

<div class="band">

## Mitmachen

<div class="steps four">
<div><b>Konto</b><span>Einladung, zwei Faktoren, Speicherort</span></div>
<div><b>Probelauf</b><span>Klausur mit erfundenen Daten</span></div>
<div><b>Echter Einsatz</b><span>Eine Kurzarbeit komplett</span></div>
<div><b>Rückmeldung</b><span>Issue oder direkt an den Betreiber</span></div>
</div>
</div>
