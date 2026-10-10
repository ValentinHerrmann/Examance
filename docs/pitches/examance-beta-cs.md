---
marp: true
paginate: true
size: 16:9
theme: default
style: |
  :root { --ink:#f8fafc; --navy:#0f172a; --slate:#1e293b; --cyan:#38bdf8; --muted:#94a3b8; --line:#334155; --coral:#fb7185; }
  section { background: var(--navy); color: var(--ink); font-family: "Segoe UI", sans-serif; padding: 58px 72px; }
  section::after { color: var(--muted); font-size: 15px; }
  h1 { font-size: 2.9em; letter-spacing: -0.04em; line-height: .98; margin: 0 0 20px; color: var(--ink); }
  h2 { font-size: 2em; letter-spacing: -0.035em; line-height: 1; color: var(--ink); margin: 0 0 24px; }
  h3 { color: var(--cyan); font-size: 1em; text-transform: uppercase; letter-spacing: .12em; }
  p, li { font-size: .8em; line-height: 1.35; }
  strong { color: var(--cyan); }
  .eyebrow { color: var(--cyan); text-transform: uppercase; letter-spacing: .16em; font-size: .55em; font-weight: 700; }
  .deck { color: var(--muted); font-size: 1em; max-width: 730px; }
  .grid { display:grid; grid-template-columns: 1fr 1fr; gap: 34px; align-items:center; }
  .three { display:grid; grid-template-columns: repeat(3,1fr); gap: 18px; }
  .metric { border-top: 2px solid var(--cyan); padding-top: 13px; }
  .metric b { display:block; color:var(--ink); font-size:1.15em; margin-bottom:6px; }
  .metric span { color:var(--muted); font-size:.72em; }
  .panel { background:var(--slate); border:1px solid var(--line); border-radius:18px; padding:22px; }
  .flow { display:grid; grid-template-columns: repeat(5,1fr); gap:10px; align-items:stretch; }
  .step { background:var(--slate); border:1px solid var(--line); border-radius:14px; padding:16px 12px; min-height:120px; }
  .step b { color:var(--cyan); display:block; font-size:1.15em; margin-bottom:15px; }
  .step span { color:var(--muted); font-size:.65em; line-height:1.25; }
  .label { color:var(--muted); text-transform:uppercase; letter-spacing:.12em; font-size:.5em; margin: 8px 0 12px; }
  .legacy { border:1px solid var(--coral); padding:6px 9px; color:#fecdd3; border-radius:999px; font-size:.5em; letter-spacing:.08em; text-transform:uppercase; display:inline-block; }
  .concept { color:#bae6fd; border:1px solid var(--cyan); padding:6px 9px; border-radius:999px; font-size:.5em; letter-spacing:.08em; text-transform:uppercase; display:inline-block; }
  img { max-width:100%; max-height:470px; object-fit:contain; border-radius:14px; border:1px solid var(--line); }
  figure { margin:0; }
  figcaption { color:var(--muted); font-size:.48em; margin-top:8px; }
  .big-number { color:var(--cyan); font-size:5em; font-weight:800; line-height:.8; }
  table { font-size:.62em; width:100%; border-collapse:collapse; }
  th, td { padding:11px 13px; border-bottom:1px solid var(--line); text-align:left; }
  th { color:var(--cyan); }
  .quote { font-size:1.5em; line-height:1.12; max-width:900px; border-left:4px solid var(--cyan); padding-left:24px; }
---

<!-- _class: lead -->

<div class="eyebrow">Examance / Fachbereich Informatik</div>

# Vom Arbeitsblatt<br>zu belastbaren Daten.

<p class="deck">Ein Bewertungsworkflow für Lehrkräfte, die LaTeX, Varianten, QR-Codes und faire Korrektur nicht in fünf Insellösungen zusammensetzen wollen.</p>

<div style="margin-top:70px"><span class="concept">VISUELLES KONZEPT / AKTUELLER UI-CAPTURE FOLGT</span></div>

---

<div class="eyebrow">01 / Der Engpass</div>

# Gute Aufgaben.<br><span style="color:var(--cyan)">Schlechter Nachlauf.</span>

<div class="grid">
<div>
<p class="quote">Die eigentliche Informatik steckt in der Aufgabe. Die Zeit verschwindet danach: Varianten pflegen, Punkte übertragen, Scans sortieren, Unsicherheiten prüfen.</p>
</div>
<div class="three" style="grid-template-columns:1fr">
<div class="metric"><b>Varianten</b><span>A/B/C-Versionen bleiben vergleichbar.</span></div>
<div class="metric"><b>Korrektur</b><span>Identität bleibt beim Markieren aus dem Blick.</span></div>
<div class="metric"><b>Auswertung</b><span>Fragen werden zur Rückmeldung für den Unterricht.</span></div>
</div>
</div>

---

<div class="eyebrow">02 / Die Pipeline</div>

# Ein durchgehender<br>technischer Ablauf.

<div class="flow" style="margin-top:55px">
<div class="step"><b>01</b><span>Übung in LaTeX schreiben und taggen</span></div>
<div class="step"><b>02</b><span>Varianten wählen, QR-Heft erzeugen</span></div>
<div class="step"><b>03</b><span>Stapel scannen, QR-Codes auflösen</span></div>
<div class="step"><b>04</b><span>Antworten pseudonym korrigieren</span></div>
<div class="step"><b>05</b><span>Ergebnisse fachlich auswerten</span></div>
</div>

<p class="label" style="margin-top:42px">Ein Workflow. Unterschiedliche Speicherorte für Ergebnisse: hybrid oder all-server.</p>

---

<div class="eyebrow">03 / Authoring</div>

<div class="grid">
<div>
<h2>LaTeX ist kein Sonderfall.</h2>
<p>Übungen bleiben als strukturierte Bausteine wiederverwendbar. Fach, Jahrgang, Thema, Punkte, Version und Variante sind Teil des Arbeitsprozesses.</p>
<div class="panel"><strong>Was getestet werden soll</strong><br><span style="color:var(--muted);font-size:.72em">Vorlagen, Ressourcen, Punktelogik, Variantenwechsel und der Umgang mit bestehenden Arbeitsblättern.</span></div>
</div>
<figure>
<img src="../screenshots/pitch/03-exercise-editor.png">
<figcaption><span class="legacy">ALTE UI / LEGACY CAPTURE</span> Editoransicht: visueller Beleg, vor externer Nutzung aktualisieren.</figcaption>
</figure>
</div>

---

<div class="eyebrow">04 / Varianten</div>

# Gleiche Kompetenz.<br><span style="color:var(--cyan)">Andere Oberfläche.</span>

<div class="grid">
<figure>
<img src="../screenshots/pitch/04-exercise-library.png">
<figcaption><span class="legacy">ALTE UI / LEGACY CAPTURE</span> Bibliotheksansicht: aktueller Capture wird nachgeliefert.</figcaption>
</figure>
<div>
<div class="three" style="grid-template-columns:1fr">
<div class="metric"><b>Versionen</b><span>Änderungen bleiben nachvollziehbar.</span></div>
<div class="metric"><b>Varianten</b><span>Unterschiedliche Formulierungen bleiben einer Aufgabe zugeordnet.</span></div>
<div class="metric"><b>Tags</b><span>Die nächste Klausur beginnt nicht bei null.</span></div>
</div>
</div>
</div>

---

<div class="eyebrow">05 / QR + Druck</div>

# Papier bleibt Papier.<br>Der Kontext wird maschinenlesbar.

<div class="grid">
<div class="big-number">QR</div>
<div>
<p>Examance erzeugt ein druckfertiges Heft mit eindeutigen Codes. So kann der Scan später wieder an Exam, Variante und Platz zugeordnet werden.</p>
<figure>
<img src="../screenshots/pitch/05-exam-creation.png">
<figcaption><span class="legacy">ALTE UI / LEGACY CAPTURE</span> Exam-Aufbau: aktuelle QR-Vorschau separat erfassen.</figcaption>
</figure>
</div>
</div>

---

<div class="eyebrow">06 / Scan</div>

# Der Stapel wird<br>ein Datensatz.

<div class="grid">
<figure><img src="../screenshots/pitch/placeholder-scan.svg"><figcaption><span class="concept">CONCEPT / NOT A SCREENSHOT</span> Scan-Import und QR-Splitting als Konzeptdarstellung.</figcaption></figure>
<div class="panel"><h3>Zu prüfen</h3><p>Scannerauflösung, schiefe Seiten, fehlende QR-Codes, gemischte Varianten, große Stapel und Offline-Verhalten.</p><p><strong>Kein Produkt-Capture:</strong> Diese Darstellung wird durch einen echten Scan-Import mit synthetischen Daten ersetzt.</p></div>
</div>

---

<div class="eyebrow">07 / Korrektur</div>

# Erst die Antwort.<br><span style="color:var(--cyan)">Dann die Zuordnung.</span>

<div class="grid">
<div>
<p class="quote">Während der Korrektur sieht die Lehrkraft die Antwort und den Bewertungsmaßstab, nicht den Namen.</p>
<p style="color:var(--muted)">Das ist pseudonyme, identity-hidden Korrektur für diesen Arbeitsschritt — keine Behauptung, dass der gesamte Prozess anonym ist.</p>
</div>
<figure><img src="../screenshots/pitch/placeholder-grading.svg"><figcaption><span class="concept">CONCEPT / NOT A SCREENSHOT</span> Grading-Ansicht, ersetzt durch einen echten Capture.</figcaption></figure>
</div>

---

<div class="eyebrow">08 / OMR</div>

# Automatik mit<br>menschlicher Kontrolle.

<div class="grid">
<figure><img src="../screenshots/pitch/placeholder-omr.svg"><figcaption><span class="concept">CONCEPT / NOT A SCREENSHOT</span> Unsichere Markierungen werden bestätigt, nicht blind übernommen.</figcaption></figure>
<div>
<p>MC/SC-Aufgaben können automatisch gelesen werden. Die interessanten Testfälle liegen am Rand: schwache Markierungen, Korrekturen, mehrere Kreuze, schlechte Scans.</p>
<div class="panel"><strong>Feedbackschleife</strong><br><span style="color:var(--muted);font-size:.72em">Welche Unsicherheit braucht Aufmerksamkeit? Welche Korrektur ist schnell genug?</span></div>
</div>
</div>

---

<div class="eyebrow">09 / Ergebnisse</div>

# Aus Korrekturen<br>werden Fragen für den Unterricht.

<div class="grid">
<div>
<figure><img src="../screenshots/pitch/placeholder-analytics.svg"><figcaption><span class="concept">CONCEPT / NOT A SCREENSHOT</span> Beispielansicht mit ausdrücklich markierten Demo-Daten.</figcaption></figure>
</div>
<div class="three" style="grid-template-columns:1fr">
<div class="metric"><b>Verteilung</b><span>Wo liegt die Klasse?</span></div>
<div class="metric"><b>Aufgabe</b><span>Welche Frage trennt Verständnis von Zufall?</span></div>
<div class="metric"><b>Variante</b><span>Bleiben Gruppen vergleichbar?</span></div>
</div>
</div>

---

<div class="eyebrow">10 / Architektur</div>

# Der Browser ist<br>Teil des Vertrauensmodells.

<div class="flow" style="grid-template-columns:repeat(4,1fr); margin-top:40px">
<div class="step"><b>Browser</b><span>Schlüssel wird entsperrt; sensible Payloads werden clientseitig verschlüsselt.</span></div>
<div class="step"><b>Server</b><span>Exams und Übungen liegen dort; Ergebnisse je nach Kontomodus.</span></div>
<div class="step"><b>Hybrid</b><span>Ergebnisse bleiben in diesem Browser, verschlüsselt in IndexedDB.</span></div>
<div class="step"><b>All-server</b><span>Ergebnisse liegen verschlüsselt auf dem Server.</span></div>
</div>
<p class="label" style="margin-top:42px">Pseudonymisierung während der Korrektur ist nicht dasselbe wie Anonymität. Institutionelle Rechtsprüfung bleibt erforderlich.</p>

---

<div class="eyebrow">11 / Pilotfragen</div>

# Was wir von<br>Informatiklehrkräften lernen wollen.

<div class="three" style="margin-top:50px">
<div class="panel"><h3>Hardware</h3><p>Welche Scanner und Auflösungen stehen wirklich zur Verfügung?</p></div>
<div class="panel"><h3>Edge cases</h3><p>Welche Markierungen, QR-Fehler und Layouts brechen den Ablauf?</p></div>
<div class="panel"><h3>Unterricht</h3><p>Welche Auswertung hilft bei der nächsten Stunde wirklich?</p></div>
</div>
<p class="deck" style="margin-top:45px">Für einen realistischen Pilot werden ein echter Prüfungsablauf, synthetische oder freigegebene Beispieldaten und konkretes Feedback zu Korrektur, OMR und LaTeX benötigt.</p>
