---
marp: true
theme: examance-poster
size: a3
paginate: false
header: '![](../screenshots/pitch/examance-logo.png) Examance <em>· Die Oberfläche im Überblick</em>'
footer: 'Examance 0.2 (Beta) · Stand Oktober 2026 · Alle Screenshots: echte Oberfläche mit Demodaten, keine echten Schülerdaten'
---

<span class="kicker">Rundgang</span>

# So sieht Examance aus.

<p class="lead">Zwölf echte Bildschirme, von der Aufgabe bis zur Auswertung – und was sie Ihnen bringen.</p>

<div class="tour r169">
<figure><img src="../screenshots/pitch/02-library.jpg"><figcaption><b>① Aufgabenbibliothek</b>Alle Aufgaben nach Thema, Klasse und Fach, mit Varianten A/B. <em>Einmal schreiben, jedes Jahr wiederverwenden.</em></figcaption></figure>
<figure><img src="../screenshots/pitch/03-exercise-editor.jpg"><figcaption><b>② LaTeX-Aufgabeneditor</b>Bausteine wie Karopapier, Linien, Lösung per Klick; Live-Vorschau daneben. <em>Druckreifer Satz ohne LaTeX-Kenntnisse.</em></figcaption></figure>
<figure><img src="../screenshots/pitch/03b-mc-editor.jpg"><figcaption><b>③ Multiple-Choice-Editor</b>Frage und Optionen eintippen, richtige anhaken, Punktabzug wählen. <em>Ankreuzfelder werden später automatisch gelesen.</em></figcaption></figure>
<figure><img src="../screenshots/pitch/04-exam-builder.jpg"><figcaption><b>④ Klausur zusammenstellen</b>Aufgaben aus der Bibliothek anhaken, Variante je Klasse, Notenschlüssel. <em>Eine Klausur in Minuten statt Stunden.</em></figcaption></figure>
<figure><img src="../screenshots/pitch/04b-exam-setup.jpg"><figcaption><b>⑤ Fertige Klausur</b>Prüfung und Lösungsblatt als PDF, Punkte automatisch summiert. <em>Direkt drucken – auch wenn Sie auf Papier korrigieren.</em></figcaption></figure>
<figure><img src="../screenshots/pitch/19-shared-library.jpg"><figcaption><b>⑥ Geteilte Aufgaben</b>Aufgaben aus dem Kollegium ansehen, kopieren, Verbesserungen vorschlagen. <em>Die Fachschaft baut gemeinsam einen Pool auf.</em></figcaption></figure>
<figure><img src="../screenshots/pitch/05-scan-import.jpg"><figcaption><b>⑦ Scans einlesen</b>Ein Stapel-PDF; QR-Aufkleber ordnen jede Seite einem Pseudonym zu. <em>Kein Sortieren, keine Namen auf dem Bildschirm.</em></figcaption></figure>
<figure><img src="../screenshots/pitch/06-grading.jpg"><figcaption><b>⑧ Anonym korrigieren</b>Aufgabe für Aufgabe, mit Stempeln und Anmerkungen direkt im Scan. <em>Faire Bewertung ohne Halo-Effekt.</em></figcaption></figure>
<figure><img class="fit" src="../screenshots/pitch/07-mc-review.jpg"><figcaption><b>⑨ MC-Prüfung</b>Erkannte Kreuze werden angezeigt; unsichere Fälle prüfen Sie selbst. <em>Automatik mit Kontrolle durch die Lehrkraft.</em></figcaption></figure>
<figure><img src="../screenshots/pitch/08b-paper-entry.jpg"><figcaption><b>⑩ Papierkorrektur übernehmen</b>Punkte eintippen oder aus Excel einfügen. <em>Alle Auswertungen auch ohne Scanner.</em></figcaption></figure>
<figure><img src="../screenshots/pitch/08-results.jpg"><figcaption><b>⑪ Ergebnisse</b>Notenverteilung, Schnitt, Grenzfälle, Export. <em>Notenspiegel fertig, sobald die Punkte da sind.</em></figcaption></figure>
<figure><img class="fit" src="../screenshots/pitch/09b-variant-comparison.jpg"><figcaption><b>⑫ Variantenvergleich</b>Gruppe B lag 24 Prozentpunkte unter Gruppe A – Examance markiert das. <em>Unfaire Varianten fallen sofort auf.</em></figcaption></figure>
</div>

<div class="cols band" style="grid-template-columns: 8fr 5fr; gap:18px">
<div class="card ok crypto"><span class="algo">AES-256-GCM · Ende-zu-Ende im Browser</span><p style="margin:0">Schülernamen, Scans und Punkte werden <b>im Browser verschlüsselt</b>, bevor sie gespeichert werden. Der Schlüssel wird aus Ihrem Passwort freigeschaltet (Argon2id) und verlässt Ihr Gerät nie – der Server und die Administration sehen nur Chiffretext.</p></div>
<div class="card"><h3>Anmeldung mit 2 Faktoren</h3><p style="margin:0">Passwort plus Authenticator-App oder Passkey. Neue Konten gibt die Schul-Administration frei.</p></div>
</div>
