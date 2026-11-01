---
marp: true
theme: examance
paginate: true
size: 16:9
header: '![](../screenshots/pitch/examance-logo.png) Examance <em>· examance.valentin-herrmann.com</em>'
footer: 'Examance 0.4 (Beta) · Stand November 2026 · Echte Oberfläche mit Demodaten, keine echten Schülerdaten'
---

<!-- _class: title -->
<!-- _paginate: false -->

<div class="cols center" style="grid-template-columns: 6fr 7fr">
<div>
<img class="logo" src="../screenshots/pitch/examance-logo.png">
<span class="kicker">Rundgang durch die Oberfläche</span>

# Klausuren schreiben, setzen, fair bewerten.

<p class="lead">Aufgabenbibliothek, Klausursatz und Notenbuch in einem – im Browser, mit verschlüsselten Schülerdaten.</p>
</div>
<figure class="shot"><img src="../screenshots/pitch/tour/t-exam-setup.jpg"><figcaption>Fertige Klausur mit Erwartungshorizont</figcaption></figure>
</div>

---

<!-- _class: statement -->

<span class="kicker">Teil 1</span>

# Von der Aufgabe zur druckfertigen Klausur.

<p class="lead">Aufgaben einmal schreiben, in Minuten zur Klausur zusammenstellen, mit dem Kollegium teilen.</p>

---

<!-- _class: shotslide -->

<span class="kicker">Teil 1 · Erstellen</span>

## LaTeX-Aufgabeneditor

<figure><img src="../screenshots/pitch/tour/t-exercise-editor.jpg"><figcaption>Bausteine per Klick, Live-Vorschau; jedes \BE ist ein Punkt, \hBE ein halber – <em>Punktzahl rechnet sich selbst</em></figcaption></figure>

---

<!-- _class: shotslide -->

<span class="kicker">Teil 1 · Erstellen</span>

## Multiple Choice

<figure><img src="../screenshots/pitch/tour/t-mc-editor.jpg"><figcaption>Optionen eintippen, richtige anhaken, Punktabzug wählen – <em>Kreuze werden später automatisch gelesen</em></figcaption></figure>

---

<!-- _class: shotslide -->

<span class="kicker">Teil 1 · Erstellen</span>

## Klausur zusammenstellen

<figure><img src="../screenshots/pitch/tour/t-exam-builder.jpg"><figcaption>Aufgaben und Varianten anhaken – <em>in Minuten statt Stunden</em></figcaption></figure>

---

<!-- _class: shotslide -->

<span class="kicker">Teil 1 · Erstellen</span>

## Fertige Klausur

<figure><img src="../screenshots/pitch/tour/t-exam-setup.jpg"><figcaption>Prüfung und Erwartungshorizont; jeder Haken zeigt, welcher Teil welchen Punkt bringt – <em>sofort druckbar, auch für Papierkorrektur</em></figcaption></figure>

---

<!-- _class: shotslide -->

<span class="kicker">Teil 1 · Erstellen</span>

## Varianten vergleichen

<figure><img src="../screenshots/pitch/tour/t-variant-diff.jpg"><figcaption>Gruppe A und B nebeneinander, Unterschiede markiert – <em>nur die Zahlen ändern sich, der Aufbau bleibt</em></figcaption></figure>

---

<!-- _class: shotslide -->

<span class="kicker">Teil 1 · Erstellen</span>

## Teilen & Vorschläge

<figure><img src="../screenshots/pitch/tour/t-proposal.jpg"><figcaption>Kollegium schlägt Änderungen vor, die Autorin entscheidet – <em>gemeinsamer Aufgabenpool der Fachschaft</em></figcaption></figure>

---

<!-- _class: statement -->

<span class="kicker">Teil 2</span>

# Anonym bewerten, fair vergleichen.

<p class="lead">Auf Papier oder am Bildschirm korrigieren – beide Wege enden in derselben Auswertung.</p>

---

<!-- _class: shotslide -->

<span class="kicker">Teil 2 · Korrigieren und auswerten</span>

## Papierkorrektur

<figure><img src="../screenshots/pitch/tour/t-paper-entry.jpg"><figcaption>Punkte tippen oder aus Excel einfügen – <em>Auswertung auch ohne Scanner</em></figcaption></figure>

---

<!-- _class: shotslide -->

<span class="kicker">Teil 2 · Korrigieren und auswerten</span>

## Anonym korrigieren

<figure><img src="../screenshots/pitch/tour/t-grading.jpg"><figcaption>QR-Aufkleber statt Name; Stempel ergeben die Punkte, die Punktekästchen füllen sich selbst – <em>fair, ohne Halo-Effekt</em></figcaption></figure>

---

<!-- _class: shotslide -->

<span class="kicker">Teil 2 · Korrigieren und auswerten</span>

## MC-Erkennung

<figure><img src="../screenshots/pitch/tour/t-mc-review.jpg"><figcaption>A richtig, D zurückgenommen und neu gekreuzt: 0,5 von 2 Punkten – <em>Sie entscheiden im Zweifel</em></figcaption></figure>

---

<!-- _class: shotslide -->

<span class="kicker">Teil 2 · Korrigieren und auswerten</span>

## Ergebnisse

<figure><img src="../screenshots/pitch/tour/t-results.jpg"><figcaption>Notenspiegel, Schnitt, Grenzfälle – <em>fertig, sobald die Punkte da sind</em></figcaption></figure>

---

<!-- _class: shotslide -->

<span class="kicker">Teil 2 · Korrigieren und auswerten</span>

## Variantenvergleich

<figure><img src="../screenshots/pitch/09b-variant-comparison.jpg"><figcaption>Gruppe B 24 Prozentpunkte schwächer – <em>unfaire Varianten fallen auf</em></figcaption></figure>

---

<!-- _class: center -->

<span class="kicker">Datenschutz</span>

# Schülerdaten sind nur mit Ihrem Schlüssel lesbar.

<div class="cols3" style="margin-top:10px"><div class="card ok"><h3>Ende-zu-Ende verschlüsselt</h3><p class="small" style="margin:0">Namen, Scans, Punkte und Anmerkungen werden im Browser mit AES-256-GCM verschlüsselt, bevor sie gespeichert werden.</p></div><div class="card ok"><h3>Schlüssel bleibt bei Ihnen</h3><p class="small" style="margin:0">Ein zufälliger 256-Bit-Schlüssel, freigeschaltet durch Ihr Passwort (Argon2id) oder Ihren Passkey. Er verlässt Ihr Gerät nie.</p></div><div class="card ok"><h3>Server sieht nur Chiffretext</h3><p class="small" style="margin:0">Auch die Administration kann keine Noten oder Namen lesen; sie verwaltet nur Konten.</p></div><div class="card ok"><h3>Anonym von Anfang an</h3><p class="small" style="margin:0">Bögen tragen ein Pseudonym im QR-Code; Namen erscheinen erst nach der Korrektur, entschlüsselt auf Ihrem Gerät.</p></div><div class="card ok"><h3>Sie wählen den Speicherort</h3><p class="small" style="margin:0">Ergebnisse verschlüsselt auf dem Schulserver oder nur in diesem Browser.</p></div><div class="card ok"><h3>Zwei Faktoren</h3><p class="small" style="margin:0">Anmeldung mit Passwort plus Authenticator-App oder Passkey.</p></div></div>

<p class="lead" style="margin-top:18px">Ausprobieren: <strong>examance.valentin-herrmann.com</strong> · Details zu Technik und Datenschutz in der Informationspräsentation.</p>
