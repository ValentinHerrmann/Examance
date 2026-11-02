---
marp: true
theme: examance-poster
size: a3
paginate: false
header: '![](../screenshots/pitch/examance-logo.png) Examance <em>· examance.valentin-herrmann.com</em>'
footer: 'Examance 0.4 (Beta) · Stand November 2026 · Echte Oberfläche mit Demodaten, keine echten Schülerdaten'
---

<!-- _class: tour -->

<span class="kicker">Teil 1 · Erstellen</span>

# Von der Aufgabe zur druckfertigen Klausur.

<div class="mcols"><div class="mcol" style="width:487px"><figure><img src="../screenshots/pitch/tour/t-exercise-editor.jpg"><figcaption><b>LaTeX-Aufgabeneditor</b> · Bausteine per Klick, Live-Vorschau; jedes \BE ist ein Punkt, \hBE ein halber – <em>Punktzahl rechnet sich selbst</em></figcaption></figure><figure><img src="../screenshots/pitch/tour/t-exam-setup.jpg"><figcaption><b>Fertige Klausur</b> · Prüfung und Erwartungshorizont; jeder Haken zeigt, welcher Teil welchen Punkt bringt – <em>sofort druckbar, auch für Papierkorrektur</em></figcaption></figure><figure><img src="../screenshots/pitch/tour/t-proposal.jpg"><figcaption><b>Teilen & Vorschläge</b> · Kollegium schlägt Änderungen vor, die Autorin entscheidet – <em>gemeinsamer Aufgabenpool der Fachschaft</em></figcaption></figure></div><div class="mcol" style="width:562px"><figure><img src="../screenshots/pitch/tour/t-mc-editor.jpg"><figcaption><b>Multiple Choice</b> · Optionen eintippen, richtige anhaken, Punktabzug wählen – <em>Kreuze werden später automatisch gelesen</em></figcaption></figure><figure><img src="../screenshots/pitch/tour/t-exam-builder.jpg"><figcaption><b>Klausur zusammenstellen</b> · Aufgaben und Varianten anhaken – <em>in Minuten statt Stunden</em></figcaption></figure><figure><img src="../screenshots/pitch/tour/t-variant-diff.jpg"><figcaption><b>Varianten vergleichen</b> · Gruppe A und B nebeneinander, Unterschiede markiert – <em>nur die Zahlen ändern sich, der Aufbau bleibt</em></figcaption></figure></div></div>

---

<!-- _class: tour -->

<span class="kicker">Teil 2 · Korrigieren und auswerten</span>

# Anonym bewerten, fair vergleichen.

<div class="jrow"><figure style="flex:1.585 1 0"><img src="../screenshots/pitch/tour/t-grading.jpg"><figcaption><b>Anonym korrigieren</b> · QR-Aufkleber statt Name; Stempel ergeben die Punkte, die Punktekästchen füllen sich selbst – <em>fair, ohne Halo-Effekt</em></figcaption></figure><figure style="flex:1.235 1 0"><img src="../screenshots/pitch/tour/t-paper-entry.jpg"><figcaption><b>Papierkorrektur</b> · Punkte tippen oder aus Excel einfügen – <em>Auswertung auch ohne Scanner</em></figcaption></figure></div>
<div class="jrow"><figure style="flex:1.497 1 0"><img src="../screenshots/pitch/tour/t-results.jpg"><figcaption><b>Ergebnisse</b> · Notenspiegel, Schnitt, Grenzfälle – <em>fertig, sobald die Punkte da sind</em></figcaption></figure><figure style="flex:1.733 1 0"><img src="../screenshots/pitch/09b-variant-comparison.jpg"><figcaption><b>Variantenvergleich</b> · Gruppe B 24 Prozentpunkte schwächer – <em>unfaire Varianten fallen auf</em></figcaption></figure></div>
<div class="jrow"><figure style="flex:1.186 1 0"><img src="../screenshots/pitch/tour/t-mc-review.jpg"><figcaption><b>MC-Erkennung</b> · A richtig, D zurückgenommen und neu gekreuzt: 0,5 von 2 Punkten – <em>Sie entscheiden im Zweifel</em></figcaption></figure><div class="card ok privacy" style="flex:0.9814984120213308 1 0"><div class="algo">AES-256-GCM</div><ul><li><b>Ende-zu-Ende verschlüsselt</b> Namen, Scans, Punkte und Anmerkungen werden im Browser mit AES-256-GCM verschlüsselt, bevor sie gespeichert werden.</li><li><b>Schlüssel bleibt bei Ihnen</b> Ein zufälliger 256-Bit-Schlüssel, freigeschaltet durch Ihr Passwort (Argon2id) oder Ihren Passkey. Er verlässt Ihr Gerät nie.</li><li><b>Server sieht nur Chiffretext</b> Auch die Administration kann keine Noten oder Namen lesen; sie verwaltet nur Konten.</li><li><b>Anonym von Anfang an</b> Bögen tragen ein Pseudonym im QR-Code; Namen erscheinen erst nach der Korrektur, entschlüsselt auf Ihrem Gerät.</li><li><b>Sie wählen den Speicherort</b> Ergebnisse verschlüsselt auf dem Schulserver oder nur in diesem Browser.</li><li><b>Zwei Faktoren</b> Anmeldung mit Passwort plus Authenticator-App oder Passkey.</li></ul><p class="url">examance.valentin-herrmann.com</p></div></div>
